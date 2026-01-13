/**
 * Detects the preview type for a given file node
 * @param {Object} node - The file node object with type and name properties
 * @returns {string} - Preview type: 'image', 'pdf', 'video', 'audio', 'code', or 'none'
 */
export function getPreviewType(node) {
  if (!node?.type) return 'none'

  const mimeType = node.type.toLowerCase()
  const fileName = node.name.toLowerCase()

  // Image files
  if (mimeType.startsWith('image/')) {
    return 'image'
  }

  // PDF files
  if (mimeType === 'application/pdf') {
    return 'pdf'
  }

  // Video files
  if (mimeType.startsWith('video/')) {
    return 'video'
  }

  // Audio files
  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }

  // Code files (by extension and mime type)
  const codeExtensions = [
    'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h',
    'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt',
    'html', 'css', 'scss', 'sass', 'less', 'json', 'xml',
    'yaml', 'yml', 'md', 'markdown', 'txt', 'sh', 'bash',
    'zsh', 'fish', 'sql', 'r', 'lua', 'vim', 'conf', 'ini',
    'toml', 'makefile', 'dockerfile', 'gitignore'
  ]

  const ext = fileName.split('.').pop()
  if (codeExtensions.includes(ext)) {
    return 'code'
  }

  if (mimeType.startsWith('text/')) {
    return 'code'
  }

  return 'none'
}

/**
 * Checks if a file node has preview support
 * @param {Object} node - The file node object
 * @returns {boolean} - True if preview is supported
 */
export function isPreviewSupported(node) {
  return getPreviewType(node) !== 'none'
}

/**
 * Gets a friendly name for the preview type
 * @param {string} previewType - The preview type
 * @returns {string} - Human-readable name
 */
export function getPreviewTypeName(previewType) {
  const names = {
    image: 'Image',
    pdf: 'PDF Document',
    video: 'Video',
    audio: 'Audio',
    code: 'Code/Text',
    none: 'No Preview Available'
  }
  return names[previewType] || 'Unknown'
}
