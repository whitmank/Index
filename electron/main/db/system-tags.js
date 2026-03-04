// Author: Claude Code (Anthropic)
// Shared system tag utilities - prevents duplicate implementations

/**
 * Find or create a system tag with given type and name
 * Handles null values properly and returns the tag ID
 * @param {Surreal} db - Database connection
 * @param {string} type - System tag type (e.g., 'media_type', 'file_extension')
 * @param {string|null} name - Tag name/value (can be null)
 * @returns {Promise<string|null>} Tag ID or null if error
 */
export async function findOrCreateSystemTag(db, type, name) {
  try {
    // Query for existing system tag with this type and name
    // Handle null values properly in SQL query
    const nameClause = name === null ? 'name IS NULL' : `name = '${name}'`;
    const result = await db.query(
      `SELECT * FROM tag_definitions WHERE type = '${type}' AND ${nameClause} AND system = true`
    );

    if (result[0] && result[0].length > 0) {
      // Tag exists
      const existingTag = result[0][0];
      const tagId = (existingTag.id && existingTag.id.id) || existingTag.id;
      return tagId;
    }

    // Create new system tag
    const newTag = await db.create('tag_definitions', {
      name,
      type,
      system: true,
      created_at: new Date().toISOString(),
    });

    const createdTag = Array.isArray(newTag) ? newTag[0] : newTag;
    const tagId = (createdTag.id && createdTag.id.id) || createdTag.id;
    return tagId;
  } catch (error) {
    console.error('[SystemTags] Error finding/creating system tag:', error);
    return null;
  }
}
