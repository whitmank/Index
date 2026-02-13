import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Author: Claude Code
// File recovery utility - finds files by content hash when paths change

/**
 * Calculate SHA-256 hash of a file
 * @private
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha256');
    hash.update(content);
    return hash.digest('hex');
  } catch (error) {
    return null;
  }
}

/**
 * Search for a file by content hash in a directory
 * Recursively searches subdirectories up to 2 levels deep
 * @param {string} contentHash - SHA-256 hash to search for
 * @param {string} searchPath - Directory to search in
 * @returns {Promise<string|null>} File path if found, null otherwise
 */
export async function findFileByContentHash(contentHash, searchPath) {
  if (!contentHash || !searchPath) {
    return null;
  }

  try {
    // Start with the immediate directory
    const candidates = await searchDirectory(searchPath, contentHash, 0);
    if (candidates.length > 0) {
      // Return the first match (most recently modified)
      return candidates[0];
    }

    // If not found, try parent directory
    const parentPath = path.dirname(searchPath);
    if (parentPath !== searchPath) {
      const parentCandidates = await searchDirectory(parentPath, contentHash, 0);
      if (parentCandidates.length > 0) {
        return parentCandidates[0];
      }
    }

    return null;
  } catch (error) {
    console.error('[FileRecovery] Error finding file by hash:', error.message);
    return null;
  }
}

/**
 * Recursively search directory for file with matching hash
 * @private
 */
async function searchDirectory(dirPath, targetHash, depth) {
  const candidates = [];

  if (!fs.existsSync(dirPath) || depth > 2) {
    return candidates;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      // Skip hidden files and system directories
      if (entry.name.startsWith('.')) {
        continue;
      }

      try {
        if (entry.isFile()) {
          const fileHash = hashFile(fullPath);
          if (fileHash === targetHash) {
            candidates.push({
              path: fullPath,
              mtime: fs.statSync(fullPath).mtimeMs,
            });
          }
        } else if (entry.isDirectory() && depth < 1) {
          // Only recurse one level deep
          const subCandidates = await searchDirectory(fullPath, targetHash, depth + 1);
          candidates.push(...subCandidates);
        }
      } catch (error) {
        // Skip files we can't read
        continue;
      }
    }
  } catch (error) {
    console.error('[FileRecovery] Error searching directory:', error.message);
  }

  // Sort by modification time (newest first)
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates.map(c => c.path);
}

/**
 * Verify and repair object sources
 * Updates sources for files that have moved/been renamed
 * @param {Array} objects - Array of object records
 * @returns {Promise<Array>} Objects with repaired sources
 */
export async function verifyAndRepairSources(objects) {
  if (!Array.isArray(objects)) {
    return objects;
  }

  const repaired = [];

  for (const obj of objects) {
    // Ensure source_metadata.exists is updated
    if (!obj.source) {
      // No source, doesn't exist
      if (!obj.source_metadata) obj.source_metadata = {};
      obj.source_metadata.exists = false;
      repaired.push(obj);
      continue;
    }

    if (!obj.source_metadata?.content_hash) {
      // No hash, can't do recovery, just check if exists
      if (!obj.source_metadata) obj.source_metadata = {};
      obj.source_metadata.exists = fs.existsSync(obj.source);
      repaired.push(obj);
      continue;
    }

    // Check if source still exists
    if (fs.existsSync(obj.source)) {
      // File still exists at original path
      obj.source_metadata.exists = true;
      repaired.push(obj);
      continue;
    }

    // File not found, try to recover by content hash
    const searchPath = path.dirname(obj.source);
    const recoveredPath = await findFileByContentHash(
      obj.source_metadata.content_hash,
      searchPath
    );

    if (recoveredPath) {
      console.log(`[FileRecovery] Recovered file for "${obj.name}": ${obj.source} → ${recoveredPath}`);
      obj.source = recoveredPath;
      obj.source_metadata.exists = true;
    } else {
      // Could not recover
      console.warn(`[FileRecovery] Could not recover file for "${obj.name}": ${obj.source}`);
      obj.source_metadata.exists = false;
    }

    repaired.push(obj);
  }

  return repaired;
}

