const { Surreal } = require('surrealdb');

// Database connection configuration
const DB_CONFIG = {
  host: '127.0.0.1',
  port: 8000,
  namespace: 'test',
  database: 'test',
  user: 'root',
  pass: 'root'
};

// Create a single database instance
const db = new Surreal();

/**
 * Initialize connection to SurrealDB
 * This should be called after the DB process has started
 */
async function connect() {
  try {
    await db.connect(`http://${DB_CONFIG.host}:${DB_CONFIG.port}/rpc`);
    await db.signin({
      username: DB_CONFIG.user,
      password: DB_CONFIG.pass
    });
    await db.use({
      namespace: DB_CONFIG.namespace,
      database: DB_CONFIG.database
    });
    console.log('✅ Connected to SurrealDB');
    return true;
  } catch (error) {
    console.error('❌ Failed to connect to SurrealDB:', error);
    throw error;
  }
}

/**
 * Disconnect from SurrealDB
 */
async function disconnect() {
  try {
    await db.close();
    console.log('✅ Disconnected from SurrealDB');
  } catch (error) {
    console.error('❌ Error disconnecting from SurrealDB:', error);
  }
}

/**
 * Get all records from the 'records' table
 */
async function getAllRecords() {
  try {
    const result = await db.query('SELECT * FROM records ORDER BY name');
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching records:', error);
    throw error;
  }
}

/**
 * Create a new record
 */
async function createRecord(data) {
  try {
    const result = await db.create('records', {
      name: data.name,
      value: data.value,
      created_at: new Date().toISOString()
    });
    // Ensure consistent format - result might be an array or object
    return Array.isArray(result) ? result[0] : result;
  } catch (error) {
    console.error('Error creating record:', error);
    throw error;
  }
}

/**
 * Update an existing record
 */
async function updateRecord(id, data) {
  try {
    console.log('Updating record:', id, 'with data:', data);

    // Try using query instead
    const updateQuery = `UPDATE ${id} SET name = $name, value = $value, updated_at = $updated_at`;
    const result = await db.query(updateQuery, {
      name: data.name,
      value: data.value,
      updated_at: new Date().toISOString()
    });
    console.log('Update result:', result);

    // Return the updated record
    return result[0]?.[0] || null;
  } catch (error) {
    console.error('Error updating record:', error);
    throw error;
  }
}

/**
 * Delete a record
 */
async function deleteRecord(id) {
  try {
    console.log('Deleting record:', id);
    // Use query for delete as well
    const deleteQuery = `DELETE ${id}`;
    const result = await db.query(deleteQuery);
    console.log('Delete result:', result);
    return { success: true, id };
  } catch (error) {
    console.error('Error deleting record:', error);
    throw error;
  }
}

/**
 * ============================================
 * NODES CRUD OPERATIONS
 * ============================================
 */

/**
 * Get all nodes from the 'nodes' table
 */
async function getAllNodes() {
  try {
    const result = await db.query('SELECT * FROM nodes ORDER BY timestamp_created DESC');
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching nodes:', error);
    throw error;
  }
}

/**
 * Get a single node by ID
 */
async function getNodeById(id) {
  try {
    const result = await db.query(`SELECT * FROM ${id}`);
    return result[0]?.[0] || null;
  } catch (error) {
    console.error('Error fetching node:', error);
    throw error;
  }
}

/**
 * Get node by content hash (for duplicate detection)
 */
async function getNodeByContentHash(contentHash) {
  try {
    const result = await db.query(
      'SELECT * FROM nodes WHERE content_hash = $hash LIMIT 1',
      { hash: contentHash }
    );
    return result[0]?.[0] || null;
  } catch (error) {
    console.error('Error fetching node by hash:', error);
    throw error;
  }
}

/**
 * Get node by source path
 */
async function getNodeBySourcePath(sourcePath) {
  try {
    const result = await db.query(
      'SELECT * FROM nodes WHERE source_path = $path LIMIT 1',
      { path: sourcePath }
    );
    return result[0]?.[0] || null;
  } catch (error) {
    console.error('Error fetching node by path:', error);
    throw error;
  }
}

/**
 * Create a new node
 */
async function createNode(data) {
  try {
    const result = await db.create('nodes', {
      content_hash: data.content_hash,
      name: data.name,
      size: data.size,
      type: data.type,
      source_path: data.source_path,
      timestamp_created: data.timestamp_created || new Date().toISOString(),
      timestamp_modified: data.timestamp_modified || new Date().toISOString(),
      metadata: data.metadata || {}
    });
    return Array.isArray(result) ? result[0] : result;
  } catch (error) {
    console.error('Error creating node:', error);
    throw error;
  }
}

/**
 * Update an existing node
 */
async function updateNode(id, data) {
  try {
    console.log('Updating node:', id, 'with data:', data);

    const updateQuery = `
      UPDATE ${id} SET
        content_hash = $content_hash,
        name = $name,
        size = $size,
        type = $type,
        source_path = $source_path,
        timestamp_modified = $timestamp_modified,
        metadata = $metadata
    `;
    const result = await db.query(updateQuery, {
      content_hash: data.content_hash,
      name: data.name,
      size: data.size,
      type: data.type,
      source_path: data.source_path,
      timestamp_modified: new Date().toISOString(),
      metadata: data.metadata || {}
    });
    console.log('Update result:', result);

    return result[0]?.[0] || null;
  } catch (error) {
    console.error('Error updating node:', error);
    throw error;
  }
}

/**
 * Delete a node
 */
async function deleteNode(id) {
  try {
    console.log('Deleting node:', id);
    const deleteQuery = `DELETE ${id}`;
    await db.query(deleteQuery);
    console.log('Delete result: success');
    return { success: true, id };
  } catch (error) {
    console.error('Error deleting node:', error);
    throw error;
  }
}

/**
 * ============================================
 * LINKS CRUD OPERATIONS
 * ============================================
 */

/**
 * Get all links
 */
async function getAllLinks() {
  try {
    const result = await db.query('SELECT * FROM links ORDER BY timestamp_created DESC');
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching links:', error);
    throw error;
  }
}

/**
 * Create a new link
 */
async function createLink(data) {
  try {
    const result = await db.create('links', {
      source_node: data.source_node,
      target_node: data.target_node,
      type: data.type || 'semantic',
      strength: data.strength || null,
      timestamp_created: data.timestamp_created || new Date().toISOString(),
      timestamp_modified: data.timestamp_modified || new Date().toISOString(),
      metadata: data.metadata || {}
    });
    return Array.isArray(result) ? result[0] : result;
  } catch (error) {
    console.error('Error creating link:', error);
    throw error;
  }
}

/**
 * Update an existing link
 */
async function updateLink(id, data) {
  try {
    const updateQuery = `
      UPDATE ${id} SET
        source_node = $source_node,
        target_node = $target_node,
        type = $type,
        strength = $strength,
        timestamp_modified = $timestamp_modified,
        metadata = $metadata
    `;
    const result = await db.query(updateQuery, {
      source_node: data.source_node,
      target_node: data.target_node,
      type: data.type,
      strength: data.strength,
      timestamp_modified: new Date().toISOString(),
      metadata: data.metadata || {}
    });
    return result[0]?.[0] || null;
  } catch (error) {
    console.error('Error updating link:', error);
    throw error;
  }
}

/**
 * Delete a link
 */
async function deleteLink(id) {
  try {
    const deleteQuery = `DELETE ${id}`;
    await db.query(deleteQuery);
    return { success: true, id };
  } catch (error) {
    console.error('Error deleting link:', error);
    throw error;
  }
}

/**
 * ============================================
 * TAGS CRUD OPERATIONS
 * ============================================
 */

/**
 * Get all tags
 */
async function getAllTags() {
  try {
    const result = await db.query('SELECT * FROM tags ORDER BY tag_name');
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching tags:', error);
    throw error;
  }
}

/**
 * Get tags for a specific node
 */
async function getTagsForNode(nodeId) {
  try {
    const result = await db.query(
      'SELECT * FROM tags WHERE node_id = $nodeId',
      { nodeId }
    );
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching tags for node:', error);
    throw error;
  }
}

/**
 * Create a new tag
 */
async function createTag(data) {
  try {
    const result = await db.create('tags', {
      tag_name: data.tag_name,
      node_id: data.node_id,
      timestamp_created: data.timestamp_created || new Date().toISOString()
    });
    return Array.isArray(result) ? result[0] : result;
  } catch (error) {
    console.error('Error creating tag:', error);
    throw error;
  }
}

/**
 * Delete a tag
 */
async function deleteTag(id) {
  try {
    const deleteQuery = `DELETE ${id}`;
    await db.query(deleteQuery);
    return { success: true, id };
  } catch (error) {
    console.error('Error deleting tag:', error);
    throw error;
  }
}

/**
 * ============================================
 * QUERY METHODS (Filtered Queries)
 * ============================================
 */

/**
 * Filter nodes by date range
 */
async function getNodesByDateRange(startDate, endDate) {
  try {
    const result = await db.query(`
      SELECT * FROM nodes
      WHERE timestamp_created >= $start AND timestamp_created <= $end
      ORDER BY timestamp_created DESC
    `, { start: startDate, end: endDate });
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching nodes by date:', error);
    throw error;
  }
}

/**
 * Filter nodes by type (MIME type)
 */
async function getNodesByType(type) {
  try {
    const result = await db.query(
      'SELECT * FROM nodes WHERE type CONTAINS $type ORDER BY timestamp_created DESC',
      { type }
    );
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching nodes by type:', error);
    throw error;
  }
}

/**
 * Filter nodes by location (path prefix)
 */
async function getNodesByLocation(pathPrefix) {
  try {
    const result = await db.query(
      'SELECT * FROM nodes WHERE source_path CONTAINS $prefix ORDER BY source_path',
      { prefix: pathPrefix }
    );
    return result[0] || [];
  } catch (error) {
    console.error('Error fetching nodes by location:', error);
    throw error;
  }
}

module.exports = {
  connect,
  disconnect,
  getAllRecords,
  createRecord,
  updateRecord,
  deleteRecord,
  // Nodes
  getAllNodes,
  getNodeById,
  getNodeByContentHash,
  getNodeBySourcePath,
  createNode,
  updateNode,
  deleteNode,
  // Links
  getAllLinks,
  createLink,
  updateLink,
  deleteLink,
  // Tags
  getAllTags,
  getTagsForNode,
  createTag,
  deleteTag,
  // Queries
  getNodesByDateRange,
  getNodesByType,
  getNodesByLocation
};
