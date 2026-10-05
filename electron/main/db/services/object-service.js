// Author: Claude Code
// Core object creation and lookup logic — shared between IPC handlers and the capture system.
// v0.4: uses scheduleExport (async, non-blocking) instead of persistToIndex.
// v0.4.1: tag assignments use RELATE edges (tagged table) instead of tag_assignments join table.

import { scheduleExport } from '../export.js';
import { findOrCreateSystemTag } from './system-tags.js';
import { extractMediaTypeFromSource, extractFileType, cleanUri, determineOrigin } from '../../utils/metadata-extractor.js';
import { getDeviceOrigin } from '../../config/device.js';

/**
 * Create a new object in the database.
 *
 * @param {object} db - SurrealDB instance
 * @param {object} objectData
 * @param {string} objectData.name
 * @param {string} [objectData.description]
 * @param {Array<{uri: string, origin?: string, added_at?: string}>} [objectData.sources]
 * @param {string|null} [objectData.mediaTypeHint] - og:type or other hint
 * @param {boolean} [objectData.container] - UI affordance: is this a navigable container?
 * @param {object|null} [objectData.query] - { all, any, none } tag ID arrays for containers
 * @returns {Promise<{object: object, objectId: string}>}
 */
export async function createObjectCore(db, objectData) {
  const rawSources = objectData.sources || [];
  const now = new Date().toISOString();
  const deviceOrigin = await getDeviceOrigin();

  const sources = rawSources.map(src => ({
    uri: cleanUri(src.uri),
    origin: determineOrigin(src.uri, src.origin || deviceOrigin || 'unknown'),
    fileType: extractFileType(src.uri),
    added_at: src.added_at || now,
  }));

  const objectRecord = {
    name: objectData.name,
    label: objectData.label || null,
    description: objectData.description || null,
    sources,
    created_at: now,
    updated_at: now,
  };

  // Pass through container/query fields if present
  if (objectData.container !== undefined) objectRecord.container = objectData.container;
  if (objectData.query !== undefined) objectRecord.query = objectData.query;

  const result = await db.create('objects', objectRecord);
  const newObject = Array.isArray(result) ? result[0] : result;
  const objectId = newObject.id?.toString?.() ?? newObject.id;

  // Only assign system tags for non-container objects with sources
  if (!objectData.container && sources.length > 0) {
    await assignSystemTagsFromSources(db, objectId, sources, objectData.mediaTypeHint || null);
  }
  scheduleExport(db);

  return { object: newObject, objectId };
}

/**
 * Find an existing object whose sources array contains the given URI.
 * @param {object} db
 * @param {string} uri
 * @returns {Promise<object|null>}
 */
export async function findObjectByUri(db, uri) {
  const result = await db.query('SELECT * FROM objects');
  const allObjects = (Array.isArray(result) && result.length > 0) ? result[0] : [];

  const normalizedUri = cleanUri(uri);
  for (const obj of allObjects) {
    const sources = obj.sources || [];
    if (sources.some(s => cleanUri(s.uri) === normalizedUri)) {
      return obj;
    }
  }
  return null;
}

/**
 * Assign system tags derived from a sources array.
 * Uses RELATE edges (tagged table) instead of tag_assignments join table.
 * - medium: object-level, from first source (or mediaTypeHint if provided)
 * - file: per-source, unique extensions
 * - origin: per-source, unique device origins
 *
 * @param {object} db
 * @param {string} objectId
 * @param {Array} sources
 * @param {string|null} [mediaTypeHint]
 */
export async function assignSystemTagsFromSources(db, objectId, sources, mediaTypeHint = null) {
  try {
    if (!sources || sources.length === 0) return;

    // 1. kind — semantic form (medium/signal-type detection not yet implemented)
    const mediaType = mediaTypeHint || extractMediaTypeFromSource(sources[0].uri);
    const mediaTypeTagId = await findOrCreateSystemTag(db, 'kind', mediaType);
    if (mediaTypeTagId) {
      const existing = await db.query(
        `SELECT * FROM tagged WHERE in = ${objectId} AND out = ${mediaTypeTagId}`
      );
      if (!existing[0] || existing[0].length === 0) {
        await db.query(`RELATE ${objectId}->tagged->${mediaTypeTagId}`);
      }
    }

    // 2. file — per unique extension
    const uniqueFileTypes = new Set(sources.map(s => extractFileType(s.uri)).filter(Boolean));
    for (const fileType of uniqueFileTypes) {
      const tagId = await findOrCreateSystemTag(db, 'file', fileType);
      if (tagId) {
        const existing = await db.query(
          `SELECT * FROM tagged WHERE in = ${objectId} AND out = ${tagId}`
        );
        if (!existing[0] || existing[0].length === 0) {
          await db.query(`RELATE ${objectId}->tagged->${tagId}`);
        }
      }
    }

    // 3. origin — per unique device origin
    const uniqueOrigins = new Set(sources.map(s => s.origin).filter(Boolean));
    for (const origin of uniqueOrigins) {
      const tagId = await findOrCreateSystemTag(db, 'origin', origin);
      if (tagId) {
        const existing = await db.query(
          `SELECT * FROM tagged WHERE in = ${objectId} AND out = ${tagId}`
        );
        if (!existing[0] || existing[0].length === 0) {
          await db.query(`RELATE ${objectId}->tagged->${tagId}`);
        }
      }
    }
  } catch (error) {
    console.error('[ObjectService] Error assigning system tags:', error);
  }
}
