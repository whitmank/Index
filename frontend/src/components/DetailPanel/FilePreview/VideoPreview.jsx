import { useState } from 'react'

/**
 * Video preview component using HTML5 video element
 * @param {Object} node - File node object
 */
function VideoPreview({ node }) {
  const [error, setError] = useState(false)

  const handleError = () => {
    setError(true)
  }

  if (error) {
    return (
      <div className="preview-error">
        <p>Failed to load video</p>
        <a
          href={`/api/files/${node.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-link"
        >
          Download video
        </a>
      </div>
    )
  }

  return (
    <div className="preview-video">
      <video
        src={`/api/files/${node.id}`}
        controls
        onError={handleError}
      >
        Your browser does not support the video tag.
      </video>
    </div>
  )
}

export default VideoPreview
