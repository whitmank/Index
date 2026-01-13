const crypto = require('crypto');
const fs = require('fs');

/**
 * Calculate SHA-256 hash of a file using streaming
 * Efficient for both small and large files
 *
 * @param {string} filePath - Absolute path to file
 * @returns {Promise<string>} - Hash in format "sha256:abc123..."
 */
async function calculateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);

    stream.on('data', (chunk) => {
      hash.update(chunk);
    });

    stream.on('end', () => {
      const digest = hash.digest('hex');
      resolve(`sha256:${digest}`);
    });

    stream.on('error', (error) => {
      reject(new Error(`Failed to hash file ${filePath}: ${error.message}`));
    });
  });
}

module.exports = {
  calculateFileHash
};
