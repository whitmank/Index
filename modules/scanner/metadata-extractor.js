const fs = require('fs').promises;
const path = require('path');
const mime = require('mime-types');

/**
 * Extract metadata from a file
 *
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<object>} - Metadata object
 */
async function extractMetadata(filePath) {
  try {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';

    return {
      name: path.basename(filePath),
      size: stats.size,
      type: mimeType,
      source_path: filePath,
      timestamp_created: stats.birthtime.toISOString(),
      timestamp_modified: stats.mtime.toISOString(),
      metadata: {
        extension: extension,
        is_directory: stats.isDirectory(),
        is_file: stats.isFile(),
        is_symlink: stats.isSymbolicLink(),
        permissions: stats.mode,
        uid: stats.uid,
        gid: stats.gid
      }
    };
  } catch (error) {
    throw new Error(`Failed to extract metadata from ${filePath}: ${error.message}`);
  }
}

module.exports = {
  extractMetadata
};
