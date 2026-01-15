import { useState, useEffect } from 'react'
import { useElectron } from '../../hooks/useElectron'
import './AddFilesModal.css'

function AddFilesModal({ isOpen, onClose, onSuccess, initialPath = '', collection = null }) {
  const [path, setPath] = useState('')
  const [isIndexing, setIsIndexing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [isTagging, setIsTagging] = useState(false)

  // Get Electron API methods
  const { isElectron, selectDirectory } = useElectron()

  // Set path when initialPath changes (e.g., from paste event)
  useEffect(() => {
    if (initialPath) {
      setPath(initialPath)
    }
  }, [initialPath])

  // Handle browse button click (Electron only)
  const handleBrowse = async () => {
    if (!selectDirectory) {
      return
    }

    try {
      const selectedPath = await selectDirectory()
      if (selectedPath) {
        setPath(selectedPath)
      }
    } catch (err) {
      console.error('Error selecting directory:', err)
      setError('Failed to open directory picker')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!path.trim()) {
      setError('Please enter a file or folder path')
      return
    }

    // Clean the path: trim whitespace and remove surrounding quotes
    const cleanPath = path.trim().replace(/^["']|["']$/g, '')

    if (!cleanPath) {
      setError('Please enter a valid file or folder path')
      return
    }

    setIsIndexing(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: cleanPath })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to index files')
      }

      setResult(data)
      setPath('')

      // If we're adding to a collection, apply tags to newly indexed files
      if (collection && data.nodeIds && data.nodeIds.length > 0) {
        setIsTagging(true)
        try {
          // Apply each tag to each node
          const tagPromises = []
          for (const nodeId of data.nodeIds) {
            for (const tagName of collection.tags) {
              tagPromises.push(
                fetch('/api/tags', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    tag_name: tagName,
                    node_id: nodeId
                  })
                })
              )
            }
          }
          await Promise.all(tagPromises)
          console.log(`✅ Applied ${collection.tags.length} tag(s) to ${data.nodeIds.length} file(s)`)
        } catch (tagError) {
          console.error('Failed to apply tags:', tagError)
          // Don't fail the whole operation if tagging fails
        } finally {
          setIsTagging(false)
        }
      }

      // Call success callback to refresh nodes list
      if (onSuccess) {
        onSuccess()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setIsIndexing(false)
    }
  }

  const handleClose = () => {
    setPath('')
    setResult(null)
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📁 {collection ? `Add Files to "${collection.name}"` : 'Add Files to Index'}</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="path-input">File or Folder Path:</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                id="path-input"
                type="text"
                className="path-input"
                placeholder="/Users/karter/Documents/MyFolder"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                disabled={isIndexing}
                autoFocus
                style={{ flex: 1 }}
              />
              {isElectron && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleBrowse}
                  disabled={isIndexing}
                  style={{ minWidth: '90px' }}
                >
                  📁 Browse...
                </button>
              )}
            </div>
            <p className="input-hint">
              {isElectron ? (
                <>Click "Browse..." to select a folder, or enter the path manually.</>
              ) : (
                <>Enter the full path to a file or folder you want to index.</>
              )}
              <br />
              Example: <code>/Users/username/Documents</code>
              {collection && (
                <>
                  <br />
                  <br />
                  <strong>Files will be tagged with:</strong> {collection.tags.join(', ')}
                </>
              )}
            </p>
          </div>

          {error && (
            <div className="message message-error">
              ❌ {error}
            </div>
          )}

          {isIndexing && (
            <div className="message message-loading">
              <div className="spinner"></div>
              <span>Indexing files...</span>
            </div>
          )}

          {isTagging && (
            <div className="message message-loading">
              <div className="spinner"></div>
              <span>Adding tags to files...</span>
            </div>
          )}

          {result && (
            <div className="message message-success">
              <h3>✅ Indexing Complete</h3>
              <div className="result-stats">
                <div className="stat">
                  <span className="stat-label">New files indexed:</span>
                  <span className="stat-value">{result.indexed}</span>
                </div>
                {result.duplicates > 0 && (
                  <div className="stat">
                    <span className="stat-label">Duplicates found:</span>
                    <span className="stat-value">{result.duplicates}</span>
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="stat">
                    <span className="stat-label">Skipped:</span>
                    <span className="stat-value">{result.skipped}</span>
                  </div>
                )}
                {result.errors > 0 && (
                  <div className="stat">
                    <span className="stat-label">Errors:</span>
                    <span className="stat-value stat-error">{result.errors}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
            >
              {result ? 'Close' : 'Cancel'}
            </button>
            {!result && (
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isIndexing || isTagging || !path.trim()}
              >
                {isIndexing ? 'Indexing...' : isTagging ? 'Adding Tags...' : collection ? `Add to ${collection.name}` : 'Index Files'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default AddFilesModal
