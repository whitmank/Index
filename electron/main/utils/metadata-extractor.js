// Author: Claude Code
// Metadata extraction from source URIs.
// Derives system tag values: kind (object-level), file (per-source), origin (per-source).

/**
 * Extract signal format from URI for use as a kind system tag.
 * Determined from the first source only; applies to the whole object.
 * @param {string} uri - Source URI (file://, https://, etc.)
 * @param {string|null} [mediaTypeHint] - Optional override (e.g. og:type). Used verbatim when provided.
 * @returns {string|null} - Kind value (e.g. 'document', 'image', 'video'), or null
 */
export function extractMediaTypeFromSource(uri, mediaTypeHint = null) {
  if (mediaTypeHint) return mediaTypeHint;

  const fileType = extractFileType(uri);
  if (!fileType) return null;

  const mediaTypeMap = {
    // Documents
    'pdf': 'document',
    'doc': 'document',
    'docx': 'document',
    'txt': 'document',
    'md': 'document',
    'rst': 'document',
    'odt': 'document',

    // Images
    'jpg': 'image',
    'jpeg': 'image',
    'png': 'image',
    'gif': 'image',
    'svg': 'image',
    'webp': 'image',
    'ico': 'image',
    'bmp': 'image',

    // Video
    'mp4': 'video',
    'mkv': 'video',
    'mov': 'video',
    'avi': 'video',
    'webm': 'video',
    'flv': 'video',
    'm4v': 'video',

    // Audio
    'mp3': 'audio',
    'wav': 'audio',
    'flac': 'audio',
    'm4a': 'audio',
    'aac': 'audio',
    'ogg': 'audio',
    'wma': 'audio',

    // Spreadsheet
    'xls': 'spreadsheet',
    'xlsx': 'spreadsheet',
    'csv': 'spreadsheet',
    'ods': 'spreadsheet',

    // Presentation
    'ppt': 'presentation',
    'pptx': 'presentation',
    'odp': 'presentation',
  };

  return mediaTypeMap[fileType] || null;
}

/**
 * Extract per-source metadata from URI.
 * Returns file extension and origin for system tag assignment.
 * @param {string} uri - Source URI (file://, https://, etc.)
 * @param {string} origin - Device identifier ("My Laptop", "Web", etc.)
 * @returns {{fileType: string|null, origin: string}} - Per-source metadata
 */
export function extractMetadataFromSource(uri, origin) {
  return {
    fileType: extractFileType(uri),
    origin: origin,
  };
}

/**
 * Extract file type from URI for display
 * Returns 'url' for web links, file extension for local files, 'unknown' as fallback
 * @param {string} uri - Source URI
 * @returns {string} - File type (e.g., 'pdf', 'jpg', 'url', 'unknown')
 */
export function extractFileType(uri) {
  if (!uri || typeof uri !== 'string') return 'unknown';

  // Web URLs get 'url' type
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return 'url';
  }

  // Extract file extension from local files
  // Remove query params and fragments first
  const path = uri.split('?')[0].split('#')[0];

  // Extract extension
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : 'unknown';
}

/**
 * Extract URI scheme from source
 * Useful for logging/debugging, though scheme is implicit in origin
 * @param {string} uri - Source URI
 * @returns {string|null} - URI scheme (file, https, smb, etc.), or null if not found
 */
export function extractScheme(uri) {
  if (!uri || typeof uri !== 'string') return null;

  const match = uri.match(/^([a-z][a-z0-9+.-]*):\/\//i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Determine origin for a source URI
 * Web URLs get 'Web' origin, local files get device origin
 * @param {string} uri - Source URI
 * @param {string} deviceOrigin - Current device identifier (used for local files)
 * @returns {string} - Origin value (e.g., 'Web', 'My Laptop', 'nas')
 */
export function determineOrigin(uri, deviceOrigin = 'unknown') {
  if (!uri || typeof uri !== 'string') {
    return deviceOrigin;
  }

  // Web URLs always get 'Web' origin (capitalized)
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    return 'Web';
  }

  // Local files get device origin
  return deviceOrigin;
}


/**
 * Validate URI format
 * @param {string} uri - Source URI to validate
 * @returns {boolean} - True if URI looks valid
 */
export function isValidUri(uri) {
  if (!uri || typeof uri !== 'string') return false;

  // Must have a scheme
  if (!extractScheme(uri)) return false;

  // Must have something after scheme
  if (uri.length < 10) return false; // Minimum: file:///x

  return true;
}

/**
 * Clean and normalize URI
 * Removes trailing slashes, normalizes separators, etc.
 * @param {string} uri - Raw URI
 * @returns {string} - Cleaned URI
 */
export function cleanUri(uri) {
  if (!uri || typeof uri !== 'string') return uri;

  // Trim whitespace
  let cleaned = uri.trim();

  // Normalize file:// URIs (ensure consistent path separators)
  if (cleaned.startsWith('file://')) {
    // file:// URIs should use forward slashes
    cleaned = cleaned.replace(/\\/g, '/');
  }

  // Remove trailing slash for consistency (except for root paths)
  if (cleaned.length > 1 && cleaned.endsWith('/') && !cleaned.match(/^file:\/\/\/$/)) {
    cleaned = cleaned.slice(0, -1);
  }

  return cleaned;
}
