// Author: Claude Code (Anthropic)
// System tag repair logic - ensures all objects have their system tags

import { extractMediaType, extractFileExtension } from '../utils/metadata.js';
import { findOrCreateSystemTag } from './system-tags.js';

/**
 * Repair missing system tags for a single object
 * @private
 */
async function repairObjectSystemTags(db, object) {
  try {
    const objectId = (object.id && object.id.id) || object.id;
    const source = object.source_local || object.source_remote;

    if (!source) {
      return { objectId, repaired: [] };
    }

    // Get current tags for this object
    const tagsResult = await db.query(
      `SELECT tag_id FROM tag_assignments WHERE object_id = '${objectId}'`
    );
    const assignedTagIds = (tagsResult[0] || []).map(a => a.tag_id);

    // Fetch the actual tags to check which types are assigned
    let assignedTags = [];
    if (assignedTagIds.length > 0) {
      const inClause = `[${assignedTagIds.map(id => `tag_definitions:${id}`).join(', ')}]`;
      const fullTagsResult = await db.query(`SELECT * FROM ${inClause}`);
      assignedTags = fullTagsResult[0] || [];
    }

    const currentSystemTagTypes = new Set(
      assignedTags
        .filter((t) => t.system === true && t.type)
        .map((t) => t.type)
    );

    const expectedTypes = ['media_type', 'file_extension'];
    const missingTypes = expectedTypes.filter((type) => !currentSystemTagTypes.has(type));

    if (missingTypes.length === 0) {
      return { objectId, repaired: [] };
    }

    const repaired = [];

    // Regenerate missing system tags
    for (const type of missingTypes) {
      let value = null;
      if (type === 'media_type') {
        value = extractMediaType(source);
      } else if (type === 'file_extension') {
        value = extractFileExtension(source);
      }

      // Find or create the system tag
      const tagId = await findOrCreateSystemTag(db, type, value);
      if (tagId) {
        // Check if assignment already exists
        const existingResult = await db.query(
          `SELECT * FROM tag_assignments WHERE object_id = '${objectId}' AND tag_id = '${tagId}'`
        );
        if (!existingResult[0] || existingResult[0].length === 0) {
          await db.create('tag_assignments', {
            object_id: objectId,
            tag_id: tagId,
          });
          repaired.push({ type, value: value || null });
        }
      }
    }

    return { objectId, repaired };
  } catch (error) {
    console.error('[Repair] Error repairing object system tags:', error);
    return { objectId: (object.id && object.id.id) || object.id, repaired: [] };
  }
}

/**
 * Repair missing system tags for all objects
 * Called during database hydration to ensure consistency
 * @param {Surreal} db - Database connection
 */
export async function repairMissingSystemTagsForAllObjects(db) {
  try {
    console.log('[Repair] Starting system tag repair for all objects...');

    // Get all objects
    const objectsResult = await db.query('SELECT * FROM objects');
    const allObjects = (Array.isArray(objectsResult) && objectsResult.length > 0)
      ? objectsResult[0]
      : [];

    if (allObjects.length === 0) {
      console.log('[Repair] No objects to repair');
      return;
    }

    console.log(`[Repair] Checking ${allObjects.length} objects...`);

    let totalRepaired = 0;
    const results = [];

    // Repair each object
    for (const object of allObjects) {
      const result = await repairObjectSystemTags(db, object);
      results.push(result);
      totalRepaired += result.repaired.length;

      if (result.repaired.length > 0) {
        console.log(
          `[Repair] Restored ${result.repaired.length} tag(s) for object ${result.objectId}:`,
          result.repaired.map((r) => `${r.type}:${r.value || '(empty)'}`).join(', ')
        );
      }
    }

    console.log(`[Repair] Completed: repaired ${totalRepaired} total tag(s) across ${allObjects.length} objects`);
  } catch (error) {
    console.error('[Repair] Error during system tag repair:', error);
    // Don't throw - repair is non-critical, continue with database startup
  }
}
