// Author: Claude Code
// System tag repair logic — ensures all objects have their derived system tags.
// Tags are applied as RELATE edges on the tagged table.

import { extractMediaTypeFromSource, extractFileType } from '../utils/metadata-extractor.js';
import { findOrCreateSystemTag } from './services/system-tags.js';

/**
 * Repair missing system tags for a single object.
 * @private
 */
async function repairObjectSystemTags(db, object) {
  try {
    const objectId = object.id?.toString?.() ?? object.id;

    // Skip spaces — they don't get system tags
    if (object.space) return { objectId, repaired: [] };

    const sources = object.sources || [];
    const legacySource = !sources.length ? (object.source_local || object.source_remote) : null;

    if (!sources.length && !legacySource) {
      return { objectId, repaired: [] };
    }

    // Get current tags for this object via tagged edges
    const edgesResult = await db.query(`SELECT out FROM tagged WHERE in = ${objectId}`);
    const assignedTagIds = (edgesResult[0] || []).map(r => r.out?.toString?.() ?? r.out);

    let assignedTags = [];
    if (assignedTagIds.length > 0) {
      const inClause = `[${assignedTagIds.join(', ')}]`;
      const fullTagsResult = await db.query(`SELECT * FROM ${inClause}`);
      assignedTags = fullTagsResult[0] || [];
    }

    const currentSystemTagTypes = new Set(
      assignedTags.filter(t => t.system === true && t.type).map(t => t.type)
    );

    const expectedTypes = sources.length
      ? ['medium', 'file', 'origin']
      : ['medium', 'file_extension'];

    const missingTypes = expectedTypes.filter(type => !currentSystemTagTypes.has(type));
    if (missingTypes.length === 0) return { objectId, repaired: [] };

    const repaired = [];

    for (const type of missingTypes) {
      let value = null;

      if (sources.length) {
        if (type === 'medium') value = extractMediaTypeFromSource(sources[0].uri);
        else if (type === 'file') value = extractFileType(sources[0].uri);
        else if (type === 'origin') value = sources[0].origin;
      } else {
        if (type === 'medium') value = extractMediaTypeFromSource(legacySource);
        else if (type === 'file_extension') value = extractFileType(legacySource);
      }

      const tagId = await findOrCreateSystemTag(db, type, value);
      if (tagId) {
        const existing = await db.query(`SELECT * FROM tagged WHERE in = ${objectId} AND out = ${tagId}`);
        if (!existing[0] || existing[0].length === 0) {
          await db.query(`RELATE ${objectId}->tagged->${tagId}`);
          repaired.push({ type, value: value || null });
        }
      }
    }

    return { objectId, repaired };
  } catch (error) {
    console.error('[Repair] Error repairing object system tags:', error);
    return { objectId: object.id?.toString?.() ?? object.id, repaired: [] };
  }
}

/**
 * Repair missing system tags for all objects.
 * Called during database hydration to ensure consistency.
 * @param {Surreal} db
 */
export async function repairMissingSystemTagsForAllObjects(db) {
  try {
    const objectsResult = await db.query('SELECT * FROM objects');
    const allObjects = (Array.isArray(objectsResult) && objectsResult.length > 0)
      ? objectsResult[0]
      : [];

    if (allObjects.length === 0) return;

    let totalRepaired = 0;

    for (const object of allObjects) {
      const result = await repairObjectSystemTags(db, object);
      totalRepaired += result.repaired.length;
    }

    if (totalRepaired > 0) {
      console.log(`[Repair] Restored ${totalRepaired} missing system tag(s)`);
    }
  } catch (error) {
    console.error('[Repair] Error during system tag repair:', error);
    // Non-critical — continue with database startup
  }
}
