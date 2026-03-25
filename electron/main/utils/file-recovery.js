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
 * @param {string} contentHash - SHA-256 hash to search for (format: "sha256:abc123..." or "abc123...")
 * @param {string} searchPath - Directory to search in
 * @returns {Promise<string|null>} File path if found, null otherwise
 */
export async function findFileByContentHash(contentHash, searchPath) {
  if (!contentHash || !searchPath) {
    return null;
  }

  // Normalize hash: extract hex from "sha256:abc123..." format if present
  const targetHash = contentHash.startsWith('sha256:') ? contentHash.slice(7) : contentHash;

  try {
    // Start with the immediate directory
    const candidates = await searchDirectory(searchPath, targetHash, 0);
    if (candidates.length > 0) {
      // Return the first match (most recently modified)
      return candidates[0];
    }

    // If not found, try parent directory
    const parentPath = path.dirname(searchPath);
    if (parentPath !== searchPath) {
      const parentCandidates = await searchDirectory(parentPath, targetHash, 0);
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
    // If no sources array, object is metadata-only or has no sources
    if (!obj.sources || obj.sources.length === 0) {
      repaired.push(obj);
      continue;
    }

    // Repair each local source in the array
    let repairedObj = { ...obj };
    repairedObj.sources = [];

    for (const source of obj.sources) {
      // Remote sources (URLs) don't need repair
      if (!source.uri || source.uri.startsWith('http://') || source.uri.startsWith('https://')) {
        repairedObj.sources.push(source);
        continue;
      }

      // Local file source
      if (!source.uri.startsWith('file://')) {
        // Legacy format without file:// scheme
        repairedObj.sources.push(source);
        continue;
      }

      const filePath = source.uri.replace(/^file:\/\//, '');

      // Check if source still exists
      if (fs.existsSync(filePath)) {
        // File still exists at original path
        repairedObj.sources.push(source);
        continue;
      }

      // File not found, try to recover by content hash if available
      const searchPath = path.dirname(filePath);
      const recoveredPath = await findFileByContentHash(
        source.content_hash,
        searchPath
      );

      if (recoveredPath) {
        console.log(`[FileRecovery] Recovered file for "${obj.name}": ${source.uri} → file://${recoveredPath}`);
        repairedObj.sources.push({
          ...source,
          uri: `file://${recoveredPath}`,
        });
      } else {
        // Could not recover, keep original source
        console.warn(`[FileRecovery] Could not recover file for "${obj.name}": ${source.uri}`);
        repairedObj.sources.push(source);
      }
    }

    repaired.push(repairedObj);
  }

  return repaired;
}

