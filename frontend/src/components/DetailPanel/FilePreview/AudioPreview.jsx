import { useState } from 'react'

/**
 * Audio preview component using HTML5 audio element
 * @param {Object} node - File node object
 */
function AudioPreview({ node }) {
  const [error, setError] = useState(false)

  const handleError = () => {
    setError(true)
  }

  if (error) {
    return (
      <div className="preview-error">
        <p>Failed to load audio</p>
        <a
          href={`/api/files/${node.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-link"
        >
          Download audio
        </a>
      </div>
    )
  }

  return (
    <div className="preview-audio">
      <div className="audio-info">
        <p className="audio-name">{node.name}</p>
      </div>
      <audio
        src={`/api/files/${node.id}`}
        controls
        onError={handleError}
      >
        Your browser does not support the audio tag.
      </audio>
    </div>
  )
}

export default AudioPreview
