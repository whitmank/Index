import { useState, useEffect } from 'react'
import { useParams, useNavigate, useOutletContext } from 'react-router-dom'
import FileListTable from '../../components/FileListTable/FileListTable'
import './CollectionDetailView.css'

function CollectionDetailView() {
  const { collectionId } = useParams()
  const navigate = useNavigate()
  const {
    selectedNodeIds,
    setSelectedNodeIds,
    setDetailsNode,
    sortField,
    sortDirection,
    handleSort,
    getFileIconColor
  } = useOutletContext()

  const [collection, setCollection] = useState(null)
  const [nodes, setNodes] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadCollectionAndNodes()
  }, [collectionId])

  const loadCollectionAndNodes = async () => {
    try {
      setLoading(true)

      // Fetch collection details
      const collectionRes = await fetch(`/api/collections/${collectionId}`)
      const collectionData = await collectionRes.json()
      setCollection(collectionData)

      // Fetch nodes in this collection
      const nodesRes = await fetch(`/api/collections/${collectionId}/nodes`)
      const nodesData = await nodesRes.json()
      setNodes(nodesData)

      setLoading(false)
    } catch (error) {
      console.error('Failed to load collection:', error)
      setLoading(false)
    }
  }

  const handleRowClick = (node, index, event) => {
    const isCmdOrCtrl = event.metaKey || event.ctrlKey
    const isShift = event.shiftKey

    if (isCmdOrCtrl) {
      // Cmd/Ctrl + Click: Toggle selection
      setSelectedNodeIds(prev => {
        if (prev.includes(node.id)) {
          return prev.filter(id => id !== node.id)
        } else {
          return [...prev, node.id]
        }
      })
      // Close details panel when multiple are selected
      if (selectedNodeIds.length > 0) {
        setDetailsNode(null)
      }
    } else if (isShift) {
      // Shift click: Range selection (simplified for now)
      setSelectedNodeIds([node.id])
      setDetailsNode(null)
    } else {
      // Normal click: Select only this node and show details
      setSelectedNodeIds([node.id])
      setDetailsNode(node)
    }
  }

  if (loading) {
    return (
      <div className="content-area">
        <div className="collection-detail-loading">
          Loading collection...
        </div>
      </div>
    )
  }

  if (!collection) {
    return (
      <div className="content-area">
        <div className="collection-detail-error">
          Collection not found
        </div>
      </div>
    )
  }

  return (
    <div className="collection-detail-wrapper">
      {/* Breadcrumb / Header */}
      <div className="collection-header">
        <button className="back-button" onClick={() => navigate('/collections')}>
          ← Back to Collections
        </button>
        <h2 className="collection-title">{collection.name}</h2>
        <div className="collection-tags">
          {collection.tags.map((tag, index) => (
            <span key={index} className="collection-tag">{tag}</span>
          ))}
        </div>
      </div>

      {/* File List */}
      <FileListTable
        nodes={nodes}
        selectedNodeIds={selectedNodeIds}
        sortField={sortField}
        sortDirection={sortDirection}
        handleRowClick={handleRowClick}
        handleSort={handleSort}
        getFileIconColor={getFileIconColor}
        emptyMessage="No files in this collection yet. Add tags to files to include them."
      />
    </div>
  )
}

export default CollectionDetailView
