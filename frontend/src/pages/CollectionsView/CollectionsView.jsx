import { useState, useEffect } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import FileListTable from '../../components/FileListTable/FileListTable'
import CreateCollectionModal from '../../components/CreateCollectionModal/CreateCollectionModal'
import ContextMenu from '../../components/ContextMenu/ContextMenu'
import ColorPickerModal from '../../components/ColorPickerModal/ColorPickerModal'
import './CollectionsView.css'

function CollectionsView() {
  const navigate = useNavigate()
  const {
    sortField,
    sortDirection,
    handleSort,
    getFileIconColor
  } = useOutletContext()

  const [collections, setCollections] = useState([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([])
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState(null) // { x, y, collection }
  const [colorPickerModal, setColorPickerModal] = useState(null) // { collection }

  // Load collections on mount
  useEffect(() => {
    loadCollections()
  }, [])

  const loadCollections = async () => {
    try {
      const response = await fetch('/api/collections')
      const data = await response.json()
      setCollections(data)
    } catch (error) {
      console.error('Failed to load collections:', error)
    }
  }

  // Transform collections to look like nodes for the table
  const collectionNodes = collections.map((collection, index) => ({
    id: collection.id,
    name: collection.name,
    size: 0, // Will show tag count instead
    type: 'collection',
    timestamp_modified: collection.timestamp_created,
    metadata: {
      tags: collection.tags,
      color: collection.color
    }
  }))

  // Override row click to navigate to collection view
  const handleCollectionClick = (collection, index, event) => {
    const isCmdOrCtrl = event.metaKey || event.ctrlKey
    const isShift = event.shiftKey

    if (isCmdOrCtrl || isShift) {
      // Multi-select logic (for future delete/batch operations)
      // For now, just select
      setSelectedCollectionIds(prev => {
        if (prev.includes(collection.id)) {
          return prev.filter(id => id !== collection.id)
        } else {
          return [...prev, collection.id]
        }
      })
    } else {
      // Normal click: navigate to collection
      navigate(`/collections/${collection.id}`)
    }
  }

  // Handle right-click on collection row
  const handleCollectionRightClick = (collection, index, event) => {
    event.preventDefault()

    // Find the original collection object (not the transformed node)
    const originalCollection = collections.find(c => c.id === collection.id)

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      collection: originalCollection
    })
  }

  const handlePinCollection = (collection) => {
    // Get current pinned collections from localStorage
    const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')

    // Check if already pinned
    if (!pinned.find(p => p.id === collection.id)) {
      pinned.push({
        id: collection.id,
        name: collection.name,
        color: collection.color
      })
      localStorage.setItem('pinnedCollections', JSON.stringify(pinned))

      // Dispatch custom event to notify Layout
      window.dispatchEvent(new CustomEvent('pinnedCollectionsChanged'))
    }
  }

  const handleUnpinCollection = (collection) => {
    const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')
    const filtered = pinned.filter(p => p.id !== collection.id)
    localStorage.setItem('pinnedCollections', JSON.stringify(filtered))

    // Dispatch custom event to notify Layout
    window.dispatchEvent(new CustomEvent('pinnedCollectionsChanged'))
  }

  const isPinned = (collection) => {
    const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')
    return pinned.some(p => p.id === collection.id)
  }

  const handleChangeColor = async (collection, newColor) => {
    try {
      // Update collection color via API
      await fetch(`/api/collections/${collection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: collection.name,
          tags: collection.tags,
          color: newColor
        })
      })

      // Reload collections
      await loadCollections()

      // Update pinned collections if this collection is pinned
      if (isPinned(collection)) {
        const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')
        const updated = pinned.map(p =>
          p.id === collection.id ? { ...p, color: newColor } : p
        )
        localStorage.setItem('pinnedCollections', JSON.stringify(updated))
        window.dispatchEvent(new CustomEvent('pinnedCollectionsChanged'))
      }
    } catch (error) {
      console.error('Failed to update collection color:', error)
    }
  }

  return (
    <>
      <div className="collections-view-wrapper">
        <div className="collections-toolbar">
          <button
            className="btn-create-collection"
            onClick={() => setIsCreateModalOpen(true)}
          >
            + New Collection
          </button>
        </div>

        <FileListTable
          nodes={collectionNodes}
          selectedNodeIds={selectedCollectionIds}
          sortField={sortField}
          sortDirection={sortDirection}
          handleRowClick={handleCollectionClick}
          handleRowRightClick={handleCollectionRightClick}
          handleSort={handleSort}
          getFileIconColor={getFileIconColor}
          emptyMessage="No collections yet. Create a collection to organize your files."
        />
      </div>

      <CreateCollectionModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={loadCollections}
      />

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            {
              icon: isPinned(contextMenu.collection) ? '📌' : '📍',
              label: isPinned(contextMenu.collection) ? 'Unpin from Sidebar' : 'Pin to Sidebar',
              onClick: () => {
                if (isPinned(contextMenu.collection)) {
                  handleUnpinCollection(contextMenu.collection)
                } else {
                  handlePinCollection(contextMenu.collection)
                }
              }
            },
            {
              separator: true
            },
            {
              icon: '🎨',
              label: 'Change Color...',
              onClick: () => {
                setColorPickerModal({ collection: contextMenu.collection })
              }
            }
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}

      {colorPickerModal && (
        <ColorPickerModal
          isOpen={true}
          currentColor={colorPickerModal.collection.color || '#4D9FFF'}
          title={`Change Color: ${colorPickerModal.collection.name}`}
          onColorSelect={(newColor) => handleChangeColor(colorPickerModal.collection, newColor)}
          onClose={() => setColorPickerModal(null)}
        />
      )}
    </>
  )
}

export default CollectionsView
