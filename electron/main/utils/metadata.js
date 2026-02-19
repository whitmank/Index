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
      metadata.content_hash = 'sha256:' + hash.digest('hex');
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

/**
 * Extract media type category from file source
 * Maps MIME types and extensions to semantic media type categories
 * @param {string} source - File path or URL
 * @returns {string|null} Media type: 'image'|'document'|'book'|'video'|'audio'|'spreadsheet'|'presentation'|'archive'|'code'|'other'|null
 */
export function extractMediaType(source) {
  if (!source || typeof source !== 'string') {
    return null;
  }

  // Get extension
  let ext = '';
  if (source.startsWith('http://') || source.startsWith('https://')) {
    // For URLs, extract from pathname
    const pathname = new URL(source).pathname;
    ext = path.extname(pathname).toLowerCase();
  } else {
    // For file paths
    ext = path.extname(source).toLowerCase();
  }

  // Get MIME type and map to category
  const mimeType = getMimeType(ext);

  // Extension-based categorization (fallback and explicit mappings)
  switch (ext) {
    // Image formats
    case '.jpg':
    case '.jpeg':
    case '.png':
    case '.gif':
    case '.webp':
    case '.svg':
    case '.bmp':
    case '.ico':
    case '.tiff':
      return 'image';

    // Document formats
    case '.pdf':
    case '.doc':
    case '.docx':
    case '.txt':
    case '.md':
    case '.rtf':
    case '.odt':
    case '.pages':
      return 'document';

    // Book formats
    case '.epub':
    case '.mobi':
    case '.azw':
    case '.azw3':
    case '.ibooks':
      return 'book';

    // Video formats
    case '.mp4':
    case '.mkv':
    case '.mov':
    case '.avi':
    case '.flv':
    case '.wmv':
    case '.webm':
    case '.m4v':
    case '.mpg':
    case '.mpeg':
    case '.3gp':
      return 'video';

    // Audio formats
    case '.mp3':
    case '.wav':
    case '.aac':
    case '.flac':
    case '.m4a':
    case '.ogg':
    case '.wma':
    case '.alac':
    case '.opus':
      return 'audio';

    // Spreadsheet formats
    case '.xlsx':
    case '.xls':
    case '.csv':
    case '.ods':
    case '.numbers':
      return 'spreadsheet';

    // Presentation formats
    case '.pptx':
    case '.ppt':
    case '.odp':
    case '.keynote':
    case '.key':
      return 'presentation';

    // Archive formats
    case '.zip':
    case '.tar':
    case '.gz':
    case '.rar':
    case '.7z':
    case '.bz2':
    case '.xz':
    case '.iso':
      return 'archive';

    // Code formats
    case '.js':
    case '.jsx':
    case '.ts':
    case '.tsx':
    case '.py':
    case '.java':
    case '.cpp':
    case '.c':
    case '.h':
    case '.go':
    case '.rs':
    case '.rb':
    case '.php':
    case '.swift':
    case '.kotlin':
    case '.scala':
    case '.sh':
    case '.bash':
    case '.json':
    case '.xml':
    case '.yaml':
    case '.yml':
    case '.sql':
    case '.html':
    case '.css':
    case '.scss':
    case '.less':
      return 'code';

    default:
      // If no extension matched, try MIME type-based categorization
      if (mimeType) {
        if (mimeType.startsWith('image/')) {
          return 'image';
        } else if (mimeType.startsWith('video/')) {
          return 'video';
        } else if (mimeType.startsWith('audio/')) {
          return 'audio';
        } else if (mimeType.includes('spreadsheet') || mimeType.includes('sheet')) {
          return 'spreadsheet';
        } else if (mimeType.includes('presentation')) {
          return 'presentation';
        } else if (mimeType.includes('archive') || mimeType.includes('compress')) {
          return 'archive';
        } else if (mimeType.startsWith('text/') || mimeType.includes('document') || mimeType.includes('word')) {
          return 'document';
        }
      }
      return 'other';
  }
}

/**
 * Extract file extension from source (without the dot)
 * @param {string} source - File path or URL
 * @returns {string|null} Extension (e.g. 'pdf', 'jpg', 'md') or null
 */
export function extractFileExtension(source) {
  if (!source || typeof source !== 'string') {
    return null;
  }

  let ext = '';
  if (source.startsWith('http://') || source.startsWith('https://')) {
    // For URLs, extract from pathname
    const pathname = new URL(source).pathname;
    ext = path.extname(pathname).toLowerCase();
  } else {
    // For file paths
    ext = path.extname(source).toLowerCase();
  }

  // Remove the leading dot and return, or null if no extension
  if (ext && ext.length > 1) {
    return ext.slice(1);
  }

  return null;
}
