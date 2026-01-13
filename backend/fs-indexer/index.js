const fs = require('fs').promises;
const path = require('path');
const { calculateFileHash } = require('./hash-service');
const { extractMetadata } = require('./metadata-extractor');

// Load configuration
const config = require('./config.json');

// System files to skip (OS metadata, not user content)
const SYSTEM_FILES = [
  '.DS_Store',      // macOS folder metadata
  'Thumbs.db',      // Windows thumbnail cache
  'desktop.ini',    // Windows folder settings
  '.localized'      // macOS localization metadata
];

/**
 * Check if database server is ready
 */
async function waitForDatabaseReady() {
  const maxAttempts = 30;
  const delayMs = 1000;

  console.log('Waiting for database to be ready...');

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch('http://localhost:3000/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok' && data.database === 'running') {
          console.log('✅ Database is ready!');
          return true;
        }
      }
    } catch (error) {
      // Ignore connection errors, retry
    }

    console.log(`  Attempt ${attempt}/${maxAttempts}...`);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  throw new Error('Database did not become ready within timeout period');
}

/**
 * Send node data to API
 */
async function createNodeViaAPI(nodeData) {
  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nodeData)
    });

    const result = await response.json();

    // Handle different response statuses
    if (response.status === 201) {
      // New node created
      return { status: 201, success: true, node: result };
    } else if (response.status === 409) {
      // Duplicate detected by content hash
      console.log(`  ⚠️  Duplicate detected: ${nodeData.name}`);
      return { status: 409, duplicate: true, existing: result.existing_node };
    } else if (response.status === 200) {
      // Node updated (duplicate by path)
      console.log(`  ⚠️  Node already existed: ${nodeData.name}`);
      return { status: 200, duplicate: true, node: result.node };
    } else {
      throw new Error(`API error (${response.status}): ${result.error}`);
    }
  } catch (error) {
    console.error(`  ❌ Failed to create node: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process a single file
 */
async function processFile(filePath, fileStats) {
  try {
    console.log(`\n📄 Processing: ${filePath}`);

    // Extract metadata
    console.log('  📊 Extracting metadata...');
    const metadata = await extractMetadata(filePath);

    // Calculate hash
    console.log('  🔐 Calculating SHA-256 hash...');
    const contentHash = await calculateFileHash(filePath);
    console.log(`  Hash: ${contentHash.substring(0, 20)}...`);

    // Prepare node data
    const nodeData = {
      ...metadata,
      content_hash: contentHash
    };

    // Send to API
    console.log('  📤 Sending to database...');
    const result = await createNodeViaAPI(nodeData);

    if (result.success || result.duplicate) {
      if (result.duplicate) {
        console.log('  ✅ Node already exists (duplicate)');
        return { duplicate: true, node: result.node || result.existing };
      } else {
        console.log('  ✅ Node created successfully');
        return { success: true, node: result.node };
      }
    } else {
      console.log(`  ❌ Failed to create node`);
      return { error: true };
    }

  } catch (error) {
    console.error(`  ❌ Error processing file: ${error.message}`);
    return { error: true };
  }
}

/**
 * Recursively scan directory
 */
async function scanDirectory(dirPath, stats) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Silently ignore system files (don't count them at all)
      if (SYSTEM_FILES.includes(entry.name)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        console.log(`\n📁 Entering directory: ${fullPath}`);
        await scanDirectory(fullPath, stats);

      } else if (entry.isFile()) {
        const fileStats = await fs.stat(fullPath);
        const result = await processFile(fullPath, fileStats);

        if (result.success) {
          stats.indexed++;
          if (result.node && result.node.id) {
            stats.nodeIds.push(result.node.id);
          }
        } else if (result.duplicate) {
          stats.duplicates++;
        } else if (result.error) {
          stats.errors++;
        }

        // Progress update
        const total = stats.indexed + stats.duplicates + stats.errors;
        if (total % config.options.progressInterval === 0) {
          console.log(`\n📊 Progress: ${stats.indexed} indexed, ${stats.duplicates} duplicates, ${stats.errors} errors`);
        }
      }
    }

    return stats;

  } catch (error) {
    console.error(`❌ Error scanning directory ${dirPath}: ${error.message}`);
    stats.errors++;
    return stats;
  }
}

/**
 * Index a file or directory path
 * @param {string} targetPath - Path to file or directory to index
 * @returns {Promise<Object>} Statistics object with indexed, skipped, errors, duplicates counts
 */
async function indexPath(targetPath) {
  console.log('\n' + '='.repeat(60));
  console.log('📂 FS-INDEXER SERVICE');
  console.log('='.repeat(60));
  console.log(`\nTarget path: ${targetPath}`);
  console.log(`API endpoint: ${config.apiEndpoint}`);

  const stats = {
    indexed: 0,
    skipped: 0,
    errors: 0,
    duplicates: 0,
    nodeIds: []  // Track IDs of newly indexed nodes
  };

  try {
    // Wait for database to be ready
    await waitForDatabaseReady();

    // Check if path exists
    console.log('\n🔍 Verifying target path...');
    const pathStats = await fs.stat(targetPath);
    console.log('✅ Target path verified');

    // Start indexing
    console.log('\n🚀 Starting indexing...\n');
    const startTime = Date.now();

    if (pathStats.isFile()) {
      // Silently ignore system files
      const fileName = path.basename(targetPath);
      if (!SYSTEM_FILES.includes(fileName)) {
        // Process single file
        const result = await processFile(targetPath, pathStats);
        if (result.success) {
          stats.indexed++;
          if (result.node && result.node.id) {
            stats.nodeIds.push(result.node.id);
          }
        } else if (result.duplicate) {
          stats.duplicates++;
        } else if (result.error) {
          stats.errors++;
        }
      }
    } else if (pathStats.isDirectory()) {
      // Process directory recursively
      await scanDirectory(targetPath, stats);
    } else {
      throw new Error(`Path is neither a file nor a directory: ${targetPath}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Final report
    console.log('\n' + '='.repeat(60));
    console.log('📊 INDEXING COMPLETE');
    console.log('='.repeat(60));
    console.log(`New nodes indexed:      ${stats.indexed}`);
    console.log(`Duplicates detected:    ${stats.duplicates}`);
    console.log(`Skipped:                ${stats.skipped}`);
    console.log(`Errors:                 ${stats.errors}`);
    console.log(`Time elapsed:           ${elapsed}s`);
    console.log('='.repeat(60) + '\n');

    return stats;

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    throw error;
  }
}

// Export service API
module.exports = {
  indexPath
};
