// Author: Claude Code
// Core object creation and lookup logic — shared between IPC handlers and the capture system

import { persistToIndex } from './persistence.js';
import { findOrCreateSystemTag } from './system-tags.js';
import { extractMediaTypeFromSource, extractFileType, cleanUri, determineOrigin } from '../utils/metadata-extractor.js';
import { getDeviceOrigin } from '../config/device.js';

/**
 * Create a new object in the database.
 *
 * Accepts an optional `mediaTypeHint` (e.g. an og:type value from the web) that
 * overrides URI-based media_type detection when provided.
 *
 * @param {object} db - SurrealDB instance
 * @param {object} objectData
 * @param {string} objectData.name
 * @param {string} [objectData.description]
 * @param {Array<{uri: string, origin?: string, added_at?: string}>} [objectData.sources]
 * @param {string|null} [objectData.mediaTypeHint] - og:type or other hint; stored verbatim as media_type tag
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

  const result = await db.create('objects', objectRecord);
  const newObject = Array.isArray(result) ? result[0] : result;
  const objectId = (newObject.id && newObject.id.id) || newObject.id;

  await assignSystemTagsFromSources(db, objectId, sources, objectData.mediaTypeHint || null);
  await persistToIndex(db);

  return { object: newObject, objectId };
}

/**
 * Find an existing object whose sources array contains the given URI.
 * Returns the object record, or null if not found.
 *
 * @param {object} db - SurrealDB instance
 * @param {string} uri - URI to search for
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
 * - media_type: object-level, from first source (or mediaTypeHint if provided)
 * - file_type: per-source, unique extensions
 * - origin: per-source, unique device origins
 *
 * @param {object} db - SurrealDB instance
 * @param {string} objectId
 * @param {Array} sources - Processed sources array
 * @param {string|null} [mediaTypeHint] - Override for media_type value
 */
export async function assignSystemTagsFromSources(db, objectId, sources, mediaTypeHint = null) {
  try {
    if (!sources || sources.length === 0) return;

    // 1. media_type — object-level; use hint if provided, else derive from first source URI
    const mediaType = mediaTypeHint || extractMediaTypeFromSource(sources[0].uri);
    const mediaTypeTagId = await findOrCreateSystemTag(db, 'media_type', mediaType);
    if (mediaTypeTagId) {
      const existing = await db.query(
        `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${mediaTypeTagId}'`
      );
      if (!existing[0] || existing[0].length === 0) {
        await db.create('tag_assignments', { object_id: objectId, tag_id: mediaTypeTagId });
      }
    }

    // 2. file_type — per-source, unique extensions
    const uniqueFileTypes = new Set(sources.map(s => extractFileType(s.uri)).filter(Boolean));
    for (const fileType of uniqueFileTypes) {
      const tagId = await findOrCreateSystemTag(db, 'file_type', fileType);
      if (tagId) {
        const existing = await db.query(
          `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
        );
        if (!existing[0] || existing[0].length === 0) {
          await db.create('tag_assignments', { object_id: objectId, tag_id: tagId });
        }
      }
    }

    // 3. origin — per-source, unique device origins
    const uniqueOrigins = new Set(sources.map(s => s.origin).filter(Boolean));
    for (const origin of uniqueOrigins) {
      const tagId = await findOrCreateSystemTag(db, 'origin', origin);
      if (tagId) {
        const existing = await db.query(
          `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
        );
        if (!existing[0] || existing[0].length === 0) {
          await db.create('tag_assignments', { object_id: objectId, tag_id: tagId });
        }
      }
    }
  } catch (error) {
    console.error('[ObjectService] Error assigning system tags:', error);
  }
}
