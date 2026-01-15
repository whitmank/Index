const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const dbService = require('./db-service');

// Default configuration (used when run standalone)
const DEFAULT_CONFIG = {
  PORT: 3000,
  DB_HOST: '127.0.0.1',
  DB_PORT: 8000,
  DB_USER: 'root',
  DB_PASS: 'root',
  DB_PATH: path.join(__dirname, '..', '..', '..', 'data', 'database.db'),
  SURREAL_BINARY: 'surreal' // Use system PATH by default
};

/**
 * Factory function to create and configure the server
 * @param {Object} config - Configuration object
 * @param {number} config.PORT - Express server port
 * @param {string} config.DB_HOST - SurrealDB host
 * @param {number} config.DB_PORT - SurrealDB port
 * @param {string} config.DB_USER - Database user
 * @param {string} config.DB_PASS - Database password
 * @param {string} config.DB_PATH - Database file path
 * @param {string} config.SURREAL_BINARY - Path to surreal binary
 * @returns {Object} Server control object with start, stop, app properties
 */
function createServer(config = {}) {
  // Merge provided config with defaults
  const {
    PORT,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASS,
    DB_PATH,
    SURREAL_BINARY
  } = { ...DEFAULT_CONFIG, ...config };

  // Initialize Express app
  const app = express();
  app.use(express.json());

  // Enable CORS for development (frontend runs on separate port)
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Store the SurrealDB process reference
  let dbProcess = null;
  let server = null;

  /**
   * Starts the SurrealDB instance as a child process
   * - Creates data directory if it doesn't exist
   * - Spawns surreal process with file-based storage
   * - Sets up logging for DB output
   */
  function startDatabase() {
    return new Promise((resolve, reject) => {
      console.log('🚀 Starting SurrealDB...');

      // Ensure data directory exists
      const dataDir = path.dirname(DB_PATH);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory:', dataDir);
      }

      // Spawn SurrealDB process
      dbProcess = spawn(SURREAL_BINARY, [
        'start',
        '--bind', `${DB_HOST}:${DB_PORT}`,
        '--user', DB_USER,
        '--pass', DB_PASS,
        `file://${DB_PATH}`
      ]);

    // Handle DB process output
    dbProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[SurrealDB]: ${output.trim()}`);

      // Resolve when DB is ready
      if (output.includes('Started web server')) {
        console.log('✅ SurrealDB is ready!');
        resolve();
      }
    });

    dbProcess.stderr.on('data', (data) => {
      console.error(`[SurrealDB Error]: ${data.toString().trim()}`);
    });

    dbProcess.on('error', (error) => {
      console.error('❌ Failed to start SurrealDB:', error.message);
      reject(error);
    });

    dbProcess.on('close', (code) => {
      console.log(`⚠️  SurrealDB process exited with code ${code}`);
      dbProcess = null;
    });

    // Timeout if DB doesn't start in 10 seconds
    setTimeout(() => {
      if (dbProcess && !dbProcess.killed) {
        reject(new Error('SurrealDB failed to start within timeout'));
      }
    }, 10000);
  });
}

/**
 * Gracefully stops the SurrealDB instance
 * - Sends SIGTERM signal for clean shutdown
 * - Waits for process to exit
 */
function stopDatabase() {
  return new Promise((resolve) => {
    if (!dbProcess) {
      console.log('ℹ️  No database process to stop');
      resolve();
      return;
    }

    console.log('🛑 Stopping SurrealDB...');

    dbProcess.on('close', () => {
      console.log('✅ SurrealDB stopped cleanly');
      dbProcess = null;
      resolve();
    });

    // Send termination signal
    dbProcess.kill('SIGTERM');

    // Force kill if not stopped in 5 seconds
    setTimeout(() => {
      if (dbProcess && !dbProcess.killed) {
        console.log('⚠️  Force killing SurrealDB process');
        dbProcess.kill('SIGKILL');
        resolve();
      }
    }, 5000);
  });
}

// API Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    database: dbProcess ? 'running' : 'stopped',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    database: {
      running: dbProcess !== null,
      host: DB_HOST,
      port: DB_PORT,
      path: DB_PATH
    }
  });
});

// CRUD API Endpoints
app.get('/api/records', async (req, res) => {
  try {
    const records = await dbService.getAllRecords();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/records', async (req, res) => {
  try {
    const record = await dbService.createRecord(req.body);
    res.status(201).json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/records/:id', async (req, res) => {
  try {
    console.log('PUT request for ID:', req.params.id);
    const record = await dbService.updateRecord(req.params.id, req.body);
    res.json(record);
  } catch (error) {
    console.error('PUT error:', error);
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/records/:id', async (req, res) => {
  try {
    console.log('DELETE request for ID:', req.params.id);
    const result = await dbService.deleteRecord(req.params.id);
    res.json(result);
  } catch (error) {
    console.error('DELETE error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// NODES API ENDPOINTS
// ============================================

app.get('/api/nodes', async (req, res) => {
  try {
    const nodes = await dbService.getAllNodes();
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nodes/:id', async (req, res) => {
  try {
    const node = await dbService.getNodeById(req.params.id);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }
    res.json(node);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/nodes', async (req, res) => {
  try {
    // Check for duplicates by content hash
    if (req.body.content_hash) {
      const existing = await dbService.getNodeByContentHash(req.body.content_hash);
      if (existing) {
        return res.status(409).json({
          error: 'Duplicate content detected',
          existing_node: existing
        });
      }
    }

    // Check for duplicates by source path
    if (req.body.source_path) {
      const existing = await dbService.getNodeBySourcePath(req.body.source_path);
      if (existing) {
        // Update existing node instead of creating duplicate
        const updated = await dbService.updateNode(existing.id, req.body);
        return res.status(200).json({
          message: 'Node updated (already existed)',
          node: updated
        });
      }
    }

    const node = await dbService.createNode(req.body);
    res.status(201).json(node);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/nodes/:id', async (req, res) => {
  try {
    const node = await dbService.updateNode(req.params.id, req.body);
    res.json(node);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/nodes/:id', async (req, res) => {
  try {
    const result = await dbService.deleteNode(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LINKS API ENDPOINTS
// ============================================

app.get('/api/links', async (req, res) => {
  try {
    const links = await dbService.getAllLinks();
    res.json(links);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/links', async (req, res) => {
  try {
    const link = await dbService.createLink(req.body);
    res.status(201).json(link);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/links/:id', async (req, res) => {
  try {
    const link = await dbService.updateLink(req.params.id, req.body);
    res.json(link);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/links/:id', async (req, res) => {
  try {
    const result = await dbService.deleteLink(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// TAGS API ENDPOINTS
// ============================================

app.get('/api/tags', async (req, res) => {
  try {
    const tags = await dbService.getAllTags();
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/nodes/:id/tags', async (req, res) => {
  try {
    const tags = await dbService.getTagsForNode(req.params.id);
    res.json(tags);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/tags', async (req, res) => {
  try {
    const tag = await dbService.createTag(req.body);
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/tags/:id', async (req, res) => {
  try {
    const result = await dbService.deleteTag(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// COLLECTIONS API ENDPOINTS
// ============================================

app.get('/api/collections', async (req, res) => {
  try {
    const collections = await dbService.getAllCollections();
    res.json(collections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:id', async (req, res) => {
  try {
    const collection = await dbService.getCollectionById(req.params.id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    res.json(collection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/collections/:id/nodes', async (req, res) => {
  try {
    const collection = await dbService.getCollectionById(req.params.id);
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }
    const nodes = await dbService.getNodesByCollectionTags(collection.tags);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/collections', async (req, res) => {
  try {
    // Validate that tags array is not empty
    if (!req.body.tags || req.body.tags.length === 0) {
      return res.status(400).json({ error: 'Collections must have at least one tag' });
    }
    const collection = await dbService.createCollection(req.body);
    res.status(201).json(collection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/collections/:id', async (req, res) => {
  try {
    // Validate that tags array is not empty
    if (!req.body.tags || req.body.tags.length === 0) {
      return res.status(400).json({ error: 'Collections must have at least one tag' });
    }
    const collection = await dbService.updateCollection(req.params.id, req.body);
    res.json(collection);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/collections/:id', async (req, res) => {
  try {
    const result = await dbService.deleteCollection(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FS-INDEXER ENDPOINT
// ============================================

app.post('/api/index', async (req, res) => {
  try {
    const { path: targetPath } = req.body;

    if (!targetPath) {
      return res.status(400).json({ error: 'path is required' });
    }

    // Import the fs-indexer service
    const fsIndexer = require('../fs-indexer');

    // Run the indexing operation
    console.log(`\n📥 Indexing request received for: ${targetPath}`);
    const result = await fsIndexer.indexPath(targetPath);

    res.json(result);
  } catch (error) {
    console.error('Indexing error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// QUERY ENDPOINTS (Filtered Queries)
// ============================================

app.get('/api/query/nodes/by-date', async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) {
      return res.status(400).json({ error: 'start and end query params required' });
    }
    const nodes = await dbService.getNodesByDateRange(start, end);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/query/nodes/by-type', async (req, res) => {
  try {
    const { type } = req.query;
    if (!type) {
      return res.status(400).json({ error: 'type query param required' });
    }
    const nodes = await dbService.getNodesByType(type);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/query/nodes/by-location', async (req, res) => {
  try {
    const { path } = req.query;
    if (!path) {
      return res.status(400).json({ error: 'path query param required' });
    }
    const nodes = await dbService.getNodesByLocation(path);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// FILE SERVING ENDPOINT
// ============================================

// Serve image files for thumbnails and previews
app.get('/api/files/:id', async (req, res) => {
  try {
    const node = await dbService.getNodeById(req.params.id);
    if (!node) {
      return res.status(404).json({ error: 'Node not found' });
    }

    // Check if file exists
    if (!fs.existsSync(node.source_path)) {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    // Set appropriate content type
    res.setHeader('Content-Type', node.type || 'application/octet-stream');

    // Stream the file
    const fileStream = fs.createReadStream(node.source_path);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Note: Frontend is served separately by Vite during development
// This catch-all route is commented out to prevent interfering with API routes
// app.use((req, res) => {
//   res.sendFile(path.join(frontendPath, 'index.html'));
// });

  // Start the application
  async function start() {
    try {
      // Start SurrealDB first
      await startDatabase();

      // Connect to the database
      await dbService.connect();

      // Then start Express server
      server = app.listen(PORT, () => {
        console.log(`\n🌐 Express server running on http://localhost:${PORT}`);
        console.log(`📊 SurrealDB running on http://${DB_HOST}:${DB_PORT}`);
        console.log(`\nAPI Endpoints:`);
        console.log(`  - GET    http://localhost:${PORT}/health`);
        console.log(`  - GET    http://localhost:${PORT}/api/status`);
        console.log(`\n  Records (legacy):`);
        console.log(`  - GET    http://localhost:${PORT}/api/records`);
        console.log(`  - POST   http://localhost:${PORT}/api/records`);
        console.log(`  - PUT    http://localhost:${PORT}/api/records/:id`);
        console.log(`  - DELETE http://localhost:${PORT}/api/records/:id`);
        console.log(`\n  Nodes:`);
        console.log(`  - GET    http://localhost:${PORT}/api/nodes`);
        console.log(`  - GET    http://localhost:${PORT}/api/nodes/:id`);
        console.log(`  - POST   http://localhost:${PORT}/api/nodes`);
        console.log(`  - PUT    http://localhost:${PORT}/api/nodes/:id`);
        console.log(`  - DELETE http://localhost:${PORT}/api/nodes/:id`);
        console.log(`\n  Links:`);
        console.log(`  - GET    http://localhost:${PORT}/api/links`);
        console.log(`  - POST   http://localhost:${PORT}/api/links`);
        console.log(`  - PUT    http://localhost:${PORT}/api/links/:id`);
        console.log(`  - DELETE http://localhost:${PORT}/api/links/:id`);
        console.log(`\n  Tags:`);
        console.log(`  - GET    http://localhost:${PORT}/api/tags`);
        console.log(`  - GET    http://localhost:${PORT}/api/nodes/:id/tags`);
        console.log(`  - POST   http://localhost:${PORT}/api/tags`);
        console.log(`  - DELETE http://localhost:${PORT}/api/tags/:id`);
        console.log(`\n  Collections:`);
        console.log(`  - GET    http://localhost:${PORT}/api/collections`);
        console.log(`  - GET    http://localhost:${PORT}/api/collections/:id`);
        console.log(`  - GET    http://localhost:${PORT}/api/collections/:id/nodes`);
        console.log(`  - POST   http://localhost:${PORT}/api/collections`);
        console.log(`  - PUT    http://localhost:${PORT}/api/collections/:id`);
        console.log(`  - DELETE http://localhost:${PORT}/api/collections/:id`);
        console.log(`\n  FS-Indexer:`);
        console.log(`  - POST   http://localhost:${PORT}/api/index`);
        console.log(`\n  Queries:`);
        console.log(`  - GET    http://localhost:${PORT}/api/query/nodes/by-date?start=...&end=...`);
        console.log(`  - GET    http://localhost:${PORT}/api/query/nodes/by-type?type=...`);
        console.log(`  - GET    http://localhost:${PORT}/api/query/nodes/by-location?path=...`);
        console.log(`\n💾 Data persisting to: ${DB_PATH}\n`);
      });

      return server;
    } catch (error) {
      console.error('❌ Failed to start application:', error);
      throw error;
    }
  }

  // Stop the application
  async function stop() {
    console.log('\n📋 Shutting down gracefully...');

    // Close Express server
    if (server) {
      await new Promise((resolve) => {
        server.close(() => {
          console.log('✅ Express server stopped');
          resolve();
        });
      });
    }

    // Disconnect from database
    await dbService.disconnect();

    // Stop SurrealDB
    await stopDatabase();
  }

  // Return control object
  return {
    start,
    stop,
    app,
    getPort: () => PORT,
    getDbPort: () => DB_PORT
  };
}

// Export factory function
module.exports = createServer;

// Backward compatibility: Run directly if this is the main module
if (require.main === module) {
  // Graceful shutdown handlers
  const serverInstance = createServer();

  process.on('SIGTERM', async () => {
    await serverInstance.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    await serverInstance.stop();
    process.exit(0);
  });

  // Start the application
  serverInstance.start().catch((error) => {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  });
}
