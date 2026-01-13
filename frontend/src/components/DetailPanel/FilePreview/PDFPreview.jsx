import { useState } from 'react'

/**
 * PDF preview component using iframe
 * @param {Object} node - File node object
 */
function PDFPreview({ node }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  const handleLoad = () => {
    setLoading(false)
  }

  const handleError = () => {
    setLoading(false)
    setError(true)
  }

  if (error) {
    return (
      <div className="preview-error">
        <p>Failed to load PDF</p>
        <a
          href={`/api/files/${node.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-link"
        >
          Open in new tab
        </a>
      </div>
    )
  }

  return (
    <div className="preview-pdf">
      {loading && <div className="preview-loading">Loading PDF...</div>}
      <iframe
        src={`/api/files/${node.id}`}
        title={node.name}
        onLoad={handleLoad}
        onError={handleError}
        style={{ display: loading ? 'none' : 'block' }}
      />
    </div>
  )
}

export default PDFPreview
