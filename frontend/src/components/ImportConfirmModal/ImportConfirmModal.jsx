import { useState, useEffect } from 'react'
import './ImportConfirmModal.css'

function ImportConfirmModal({ isOpen, paths, onConfirm, onCancel }) {
  const [tags, setTags] = useState('')
  const [collections, setCollections] = useState([])
  const [selectedCollection, setSelectedCollection] = useState('')
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')

  // Load collections on mount
  useEffect(() => {
    if (isOpen) {
      loadCollections()
      setIsCreatingNew(false)
      setNewCollectionName('')
    }
  }, [isOpen])

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/collections')
      const data = await response.json()
      setCollections(data)
    } catch (err) {
      console.error('Failed to load collections:', err)
    }
  }

  const handleConfirm = () => {
    const tagList = tags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    onConfirm({
      paths,
      tags: tagList,
      collectionId: isCreatingNew ? null : (selectedCollection || null),
      newCollectionName: isCreatingNew ? newCollectionName.trim() : null
    })
  }

  const handleCancel = () => {
    setTags('')
    setSelectedCollection('')
    setIsCreatingNew(false)
    setNewCollectionName('')
    onCancel()
  }

  const handleCollectionChange = (e) => {
    const value = e.target.value
    if (value === '__new__') {
      setIsCreatingNew(true)
      setSelectedCollection('')
    } else {
      setIsCreatingNew(false)
      setSelectedCollection(value)
    }
  }

  // Get display info for a path
  const getPathInfo = (path) => {
    const parts = path.split('/')
    const name = parts[parts.length - 1] || path
    const isDirectory = !name.includes('.') || name.startsWith('.')
    return { name, isDirectory }
  }

  if (!isOpen || !paths || paths.length === 0) return null

  return (
    <div className="import-modal-overlay" onClick={handleCancel}>
      <div className="import-modal" onClick={(e) => e.stopPropagation()}>
        <div className="import-modal-header">
          <h2>Import {paths.length} {paths.length === 1 ? 'item' : 'items'}</h2>
          <button className="import-modal-close" onClick={handleCancel}>×</button>
        </div>

        <div className="import-modal-body">
          {/* Preview Grid */}
          <div className="import-preview-grid">
            {paths.map((path, index) => {
              const { name, isDirectory } = getPathInfo(path)
              return (
                <div key={index} className="import-preview-item">
                  <div className="import-preview-icon">
                    {isDirectory ? (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/>
                      </svg>
                    )}
                  </div>
                  <div className="import-preview-label">
                    <span className="import-preview-type">{isDirectory ? 'Folder' : 'File'}</span>
                    <span className="import-preview-name">{name}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Options */}
          <div className="import-options">
            <div className="import-option">
              <label>Add to Collection</label>
              <select
                value={isCreatingNew ? '__new__' : selectedCollection}
                onChange={handleCollectionChange}
              >
                <option value="">None</option>
                {collections.map((col) => (
                  <option key={col.id} value={col.id}>{col.name}</option>
                ))}
                <option value="__new__">+ Create new collection...</option>
              </select>
              {isCreatingNew && (
                <input
                  type="text"
                  placeholder="New collection name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  autoFocus
                />
              )}
              {selectedCollection && collections.find(c => c.id === selectedCollection)?.tags?.length > 0 && (
                <span className="import-option-hint">
                  Will apply tags: {collections.find(c => c.id === selectedCollection).tags.join(', ')}
                </span>
              )}
            </div>

            <div className="import-option">
              <label>Additional Tags</label>
              <input
                type="text"
                placeholder="tag1, tag2, tag3"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
              />
              <span className="import-option-hint">Optional extra tags (comma-separated)</span>
            </div>
          </div>
        </div>

        <div className="import-modal-footer">
          <button className="import-btn import-btn-cancel" onClick={handleCancel}>
            Cancel
          </button>
          <button className="import-btn import-btn-confirm" onClick={handleConfirm}>
            Import
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportConfirmModal
