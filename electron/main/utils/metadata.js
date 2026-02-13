import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Author: Claude Code
// Metadata derivation utility - extracts file metadata from source

/**
 * Clean URI by removing extraneous quotation marks
 * Handles single quotes, double quotes, and backticks
 * @param {string} source - File path or URL, possibly with quotes
 * @returns {string} Cleaned source
 */
export function cleanURI(source) {
  if (!source || typeof source !== 'string') {
    return source;
  }

  let cleaned = source.trim();

  // Remove matching quotes from start and end
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith('`') && cleaned.endsWith('`'))) {
    cleaned = cleaned.slice(1, -1);
  }

  return cleaned;
}

/**
 * Derive metadata from a file source
 * Handles both local files and URLs
 * @param {string} source - File path or URL
 * @returns {Promise<Object>} Source metadata
 */
export async function deriveSourceMetadata(source) {
  // Clean source first
  const cleanedSource = cleanURI(source);

  if (!cleanedSource) {
    return {
      exists: false,
      type: null,
      size: null,
      content_hash: null,
      timestamp_accessed: new Date().toISOString(),
    };
  }

  // Check if it's a URL
  if (cleanedSource.startsWith('http://') || cleanedSource.startsWith('https://')) {
    return deriveUrlMetadata(cleanedSource);
  }

  // Otherwise treat as file path
  return deriveFileMetadata(cleanedSource);
}

/**
 * Derive metadata from a local file
 * @private
 */
function deriveFileMetadata(filePath) {
  const metadata = {
    timestamp_accessed: new Date().toISOString(),
  };

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      metadata.exists = false;
      metadata.type = null;
      metadata.size = null;
      metadata.content_hash = null;
      return metadata;
    }

    metadata.exists = true;

    // Get file stats
    const stats = fs.statSync(filePath);
    metadata.size = stats.size;

    // Get MIME type from extension
    const ext = path.extname(filePath).toLowerCase();
    metadata.type = getMimeType(ext);

    // Calculate content hash
    try {
      const content = fs.readFileSync(filePath);
      const hash = crypto.createHash('sha256');
      hash.update(content);
      metadata.content_hash = hash.digest('hex');
    } catch (error) {
      console.warn('[Metadata] Could not hash file:', error.message);
      metadata.content_hash = null;
    }

    return metadata;
  } catch (error) {
    console.error('[Metadata] Error deriving file metadata:', error.message);
    return {
      exists: false,
      type: null,
      size: null,
      content_hash: null,
      timestamp_accessed: new Date().toISOString(),
    };
  }
}

/**
 * Derive metadata from a URL
 * @private
 */
async function deriveUrlMetadata(url) {
  const metadata = {
    exists: null, // Can't determine without fetching
    type: null,
    size: null,
    content_hash: null,
    timestamp_accessed: new Date().toISOString(),
  };

  try {
    const response = await fetch(url, { method: 'HEAD' });
    metadata.exists = response.ok;

    // Try to get content type from headers
    const contentType = response.headers.get('content-type');
    if (contentType) {
      metadata.type = contentType.split(';')[0];
    }

    // Try to get content length
    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      metadata.size = parseInt(contentLength, 10);
    }
  } catch (error) {
    console.warn('[Metadata] Could not fetch URL metadata:', error.message);
  }

  return metadata;
}

/**
 * Get MIME type from file extension
 * @private
 */
function getMimeType(ext) {
  const mimeTypes = {
    // Images
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    // Documents
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.txt': 'text/plain',
    // Video
    '.mp4': 'video/mp4',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    // Audio
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    // Code
    '.js': 'text/javascript',
    '.json': 'application/json',
  };

  return mimeTypes[ext] || null;
}
