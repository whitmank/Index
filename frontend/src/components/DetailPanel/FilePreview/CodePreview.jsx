import { useState, useEffect } from 'react'

/**
 * Code preview component for text and code files
 * @param {Object} node - File node object
 */
function CodePreview({ node }) {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const fetchContent = async () => {
      try {
        setLoading(true)
        setError(false)
        const response = await fetch(`/api/files/${node.id}`)
        if (!response.ok) throw new Error('Failed to fetch file')
        const text = await response.text()
        setContent(text)
      } catch (err) {
        console.error('Error fetching code:', err)
        setError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchContent()
  }, [node.id])

  if (loading) {
    return <div className="preview-loading">Loading file content...</div>
  }

  if (error) {
    return (
      <div className="preview-error">
        <p>Failed to load file content</p>
        <a
          href={`/api/files/${node.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="preview-link"
        >
          Download file
        </a>
      </div>
    )
  }

  return (
    <div className="preview-code">
      <div className="code-header">
        <span className="code-filename">{node.name}</span>
        <span className="code-lines">{content.split('\n').length} lines</span>
      </div>
      <pre className="code-content">
        <code>{content}</code>
      </pre>
    </div>
  )
}

export default CodePreview
