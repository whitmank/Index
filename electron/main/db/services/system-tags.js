// Author: Claude Code
// Shared system tag utilities.
// Tag type membership is expressed via typed edges (tag_definitions→typed→tag_types).
// tag_definitions records carry no type field.

/**
 * Find or create a system tag linked to the given type via a typed edge.
 * @param {Surreal} db
 * @param {string} type  - Tag type name (e.g. 'medium', 'file', 'origin')
 * @param {string|null} name
 * @returns {Promise<string|null>} Tag ID string or null on error
 */
export async function findOrCreateSystemTag(db, type, name) {
  try {
    const typeId = `tag_types:${type}`;
    const trimmedName = name === null ? null : name.trim();
    const nameClause = trimmedName === null
      ? 'name IS NULL'
      : `string::lowercase(name) = string::lowercase('${trimmedName.replace(/'/g, "\\'")}')`;


    // Find existing system tag of this type via typed edge
    const result = await db.query(
      `SELECT * FROM tag_definitions WHERE ${nameClause} AND system = true
       AND id INSIDE (SELECT VALUE in FROM typed WHERE out = ${typeId})`
    );

    if (result[0] && result[0].length > 0) {
      const existing = result[0][0];
      return existing.id?.toString?.() ?? existing.id;
    }

    // Create new system tag (no type field — type is expressed via edge)
    const newTag = await db.create('tag_definitions', {
      name: trimmedName,
      system: true,
      created_at: new Date().toISOString(),
    });

    const created = Array.isArray(newTag) ? newTag[0] : newTag;
    const tagId = created.id?.toString?.() ?? created.id;

    // Wire typed edge
    await db.query(`RELATE ${tagId}->typed->${typeId}`);

    return tagId;
  } catch (error) {
    console.error('[SystemTags] Error finding/creating system tag:', error);
    return null;
  }
}
