/**
 * Formats a byte size into a human-readable string
 * @param {number} bytes - The size in bytes
 * @returns {string} - Formatted size string (e.g., "1.5 MB")
 */
export function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

/**
 * Formats an ISO date string into a readable format
 * @param {string} isoString - The ISO 8601 date string
 * @returns {string} - Formatted date and time
 */
export function formatDate(isoString) {
  const date = new Date(isoString)
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
}

/**
 * Formats a date as a relative time (e.g., "2 hours ago")
 * @param {string} isoString - The ISO 8601 date string
 * @returns {string} - Relative time string
 */
export function formatRelativeTime(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`
  if (diffHour < 24) return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`
  if (diffDay < 7) return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`
  if (diffDay < 30) return `${Math.floor(diffDay / 7)} week${Math.floor(diffDay / 7) !== 1 ? 's' : ''} ago`
  if (diffDay < 365) return `${Math.floor(diffDay / 30)} month${Math.floor(diffDay / 30) !== 1 ? 's' : ''} ago`
  return `${Math.floor(diffDay / 365)} year${Math.floor(diffDay / 365) !== 1 ? 's' : ''} ago`
}
