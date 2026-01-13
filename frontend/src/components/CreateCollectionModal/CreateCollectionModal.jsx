import { useState } from 'react'
import './CreateCollectionModal.css'

function CreateCollectionModal({ isOpen, onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState([])
  const [color, setColor] = useState('#FF6B82')
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState(null)

  const handleAddTag = (e) => {
    e.preventDefault()
    const trimmedTag = tagInput.trim()

    if (!trimmedTag) return

    // Check if tag already exists
    if (tags.includes(trimmedTag)) {
      setError('Tag already added')
      return
    }

    setTags([...tags, trimmedTag])
    setTagInput('')
    setError(null)
  }

  const handleRemoveTag = (tagToRemove) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!name.trim()) {
      setError('Please enter a collection name')
      return
    }

    if (tags.length === 0) {
      setError('Please add at least one tag')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const response = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          tags: tags,
          color: color
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create collection')
      }

      // Reset form
      setName('')
      setTags([])
      setTagInput('')
      setColor('#FF6B82')

      // Call success callback to refresh collections list
      if (onSuccess) {
        onSuccess()
      }

      // Close modal
      handleClose()
    } catch (err) {
      setError(err.message)
    } finally {
      setIsCreating(false)
    }
  }

  const handleClose = () => {
    setName('')
    setTags([])
    setTagInput('')
    setColor('#FF6B82')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  const colorOptions = [
    '#FF6B82', '#FFB84D', '#4DFF88', '#4D9FFF',
    '#B84DFF', '#FF4D9F', '#4DFFFF', '#FFFF4D', '#FF884D'
  ]

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>📁 Create New Collection</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label htmlFor="collection-name">Collection Name:</label>
            <input
              id="collection-name"
              type="text"
              className="text-input"
              placeholder="My Collection"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating}
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="tag-input">Tags:</label>
            <div className="tag-input-wrapper">
              <input
                id="tag-input"
                type="text"
                className="text-input"
                placeholder="Add a tag..."
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddTag(e)
                  }
                }}
                disabled={isCreating}
              />
              <button
                type="button"
                className="btn-add-tag"
                onClick={handleAddTag}
                disabled={isCreating || !tagInput.trim()}
              >
                Add
              </button>
            </div>
            <p className="input-hint">
              Files with ALL of these tags will appear in this collection
            </p>
          </div>

          {tags.length > 0 && (
            <div className="tags-list">
              {tags.map((tag, index) => (
                <span key={index} className="tag-chip">
                  {tag}
                  <button
                    type="button"
                    className="tag-remove"
                    onClick={() => handleRemoveTag(tag)}
                    disabled={isCreating}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="form-group">
            <label>Color:</label>
            <div className="color-picker">
              {colorOptions.map((colorOption) => (
                <button
                  key={colorOption}
                  type="button"
                  className={`color-option ${color === colorOption ? 'selected' : ''}`}
                  style={{ backgroundColor: colorOption }}
                  onClick={() => setColor(colorOption)}
                  disabled={isCreating}
                />
              ))}
            </div>
          </div>

          {error && (
            <div className="message message-error">
              ❌ {error}
            </div>
          )}

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleClose}
              disabled={isCreating}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isCreating || !name.trim() || tags.length === 0}
            >
              {isCreating ? 'Creating...' : 'Create Collection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateCollectionModal
