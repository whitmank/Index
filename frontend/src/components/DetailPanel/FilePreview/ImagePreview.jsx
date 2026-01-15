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
    return null
  }

  return (
    <img
      src={`/api/files/${node.id}`}
      alt={node.name}
      onLoad={handleLoad}
      onError={handleError}
      style={{ opacity: loading ? 0 : 1, transition: 'opacity 0.15s' }}
    />
  )
}

export default ImagePreview
