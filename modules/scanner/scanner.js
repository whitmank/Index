const fs = require('fs').promises;
const path = require('path');
const { calculateFileHash } = require('./hash-service');
const { extractMetadata } = require('./metadata-extractor');

// Load configuration
const config = require('./config.json');

// Parse command-line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const targetDir = args.find(arg => !arg.startsWith('--')) || config.targetDirectory;

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
 * Check if file should be excluded based on filters
 */
function shouldExclude(filePath) {
  const relativePath = path.relative(targetDir, filePath);

  for (const pattern of config.filters.excludePatterns) {
    const regex = new RegExp(pattern);
    if (regex.test(relativePath) || regex.test(filePath)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if file passes size filters
 */
function passesSizeFilter(size) {
  if (config.filters.minSize && size < config.filters.minSize) {
    return false;
  }
  if (config.filters.maxSize && size > config.filters.maxSize) {
    return false;
  }
  return true;
}

/**
 * Send node data to API
 */
async function createNodeViaAPI(nodeData) {
  if (isDryRun) {
    console.log('[DRY RUN] Would create node:', JSON.stringify(nodeData, null, 2));
    return { success: true, dryRun: true };
  }

  try {
    const response = await fetch(config.apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(nodeData)
    });

    if (!response.ok) {
      const error = await response.json();

      // Handle duplicate detection (409 Conflict)
      if (response.status === 409) {
        console.log(`  ⚠️  Duplicate detected: ${nodeData.name}`);
        return { success: true, duplicate: true, existing: error.existing_node };
      }

      throw new Error(`API error (${response.status}): ${error.error}`);
    }

    const result = await response.json();
    return { success: true, node: result };
  } catch (error) {
    console.error(`  ❌ Failed to create node: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Process a single file
 */
async function processFile(filePath, stats) {
  try {
    console.log(`\n📄 Processing: ${filePath}`);

    // Check size filter
    if (!passesSizeFilter(stats.size)) {
      console.log(`  ⏭️  Skipped (size filter): ${stats.size} bytes`);
      return { skipped: true, reason: 'size_filter' };
    }

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

    if (result.success) {
      if (result.duplicate) {
        console.log('  ✅ Node already exists (duplicate)');
      } else {
        console.log('  ✅ Node created successfully');
      }
      return { success: true, ...result };
    } else {
      console.log(`  ❌ Failed to create node`);
      return { success: false, error: result.error };
    }

  } catch (error) {
    console.error(`  ❌ Error processing file: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Recursively scan directory
 */
async function scanDirectory(dirPath, stats = { total: 0, processed: 0, duplicates: 0, skipped: 0, errors: 0 }) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Check exclusion filters
      if (shouldExclude(fullPath)) {
        console.log(`⏭️  Excluded: ${fullPath}`);
        stats.skipped++;
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        console.log(`\n📁 Entering directory: ${fullPath}`);
        await scanDirectory(fullPath, stats);

      } else if (entry.isFile()) {
        stats.total++;
        const fileStats = await fs.stat(fullPath);
        const result = await processFile(fullPath, fileStats);

        if (result.success) {
          if (result.duplicate) {
            stats.duplicates++;
          } else {
            stats.processed++;
          }
        } else if (result.skipped) {
          stats.skipped++;
        } else {
          stats.errors++;
        }

        // Progress update
        if (stats.total % config.options.progressInterval === 0) {
          console.log(`\n📊 Progress: ${stats.processed} new, ${stats.duplicates} duplicates, ${stats.skipped} skipped, ${stats.errors} errors`);
        }

      } else if (entry.isSymbolicLink() && config.options.followSymlinks) {
        console.log(`🔗 Following symlink: ${fullPath}`);
        const realPath = await fs.realpath(fullPath);
        const symlinkStats = await fs.stat(realPath);

        if (symlinkStats.isDirectory()) {
          await scanDirectory(realPath, stats);
        } else if (symlinkStats.isFile()) {
          stats.total++;
          const result = await processFile(realPath, symlinkStats);
          if (result.success) {
            if (result.duplicate) stats.duplicates++;
            else stats.processed++;
          } else if (result.skipped) {
            stats.skipped++;
          } else {
            stats.errors++;
          }
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
 * Main scanner entry point
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('📂 FILE SCANNER - Personal Information System');
  console.log('='.repeat(60));
  console.log(`\nTarget directory: ${targetDir}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`API endpoint: ${config.apiEndpoint}`);

  try {
    // Wait for database to be ready
    await waitForDatabaseReady();

    // Verify target directory exists
    console.log('\n🔍 Verifying target directory...');
    const dirStats = await fs.stat(targetDir);
    if (!dirStats.isDirectory()) {
      throw new Error(`Target path is not a directory: ${targetDir}`);
    }
    console.log('✅ Target directory verified');

    // Start scanning
    console.log('\n🚀 Starting scan...\n');
    const startTime = Date.now();

    const stats = await scanDirectory(targetDir);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Final report
    console.log('\n' + '='.repeat(60));
    console.log('📊 SCAN COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total files found:      ${stats.total}`);
    console.log(`New nodes created:      ${stats.processed}`);
    console.log(`Duplicates detected:    ${stats.duplicates}`);
    console.log(`Skipped:                ${stats.skipped}`);
    console.log(`Errors:                 ${stats.errors}`);
    console.log(`Time elapsed:           ${elapsed}s`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Run scanner
main();
