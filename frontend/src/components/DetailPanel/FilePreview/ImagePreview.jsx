import { useState } from 'react'

/**
 * Image preview component with loading and error states
 * @param {Object} node - File node object
 */
function ImagePreview({ node }) {
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
        <p>Failed to load image</p>
      </div>
    )
  }

  return (
    <div className="preview-image">
      {loading && <div className="preview-loading">Loading image...</div>}
      <img
        src={`/api/files/${node.id}`}
        alt={node.name}
        onLoad={handleLoad}
        onError={handleError}
        style={{ display: loading ? 'none' : 'block' }}
      />
    </div>
  )
}

export default ImagePreview
