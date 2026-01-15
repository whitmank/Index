import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import './Layout.css'
import DetailPanel from '../DetailPanel/DetailPanel'
import ContextMenu from '../ContextMenu/ContextMenu'
import ColorPickerModal from '../ColorPickerModal/ColorPickerModal'
import ImportConfirmModal from '../ImportConfirmModal/ImportConfirmModal'
import { useElectron } from '../../hooks/useElectron'

function Layout() {
  const location = useLocation()
  const { selectPaths } = useElectron()

  // State management
  const [connected, setConnected] = useState(true)
  const [nodes, setNodes] = useState([])
  const [tags, setTags] = useState({}) // Map of nodeId -> tags array
  const [links, setLinks] = useState([])
  const [selectedNodeIds, setSelectedNodeIds] = useState([]) // For multi-row selection
  const [lastSelectedIndex, setLastSelectedIndex] = useState(null) // For shift-click range
  const [detailsNode, setDetailsNode] = useState(null) // For details panel
  const [tagInput, setTagInput] = useState('') // Tag input field
  const [linkForm, setLinkForm] = useState({ targetNode: '', type: 'semantic', strength: 0.5 })
  const [noteInput, setNoteInput] = useState('') // Note input field
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')
  const [isIndexing, setIsIndexing] = useState(false)
  const [pendingImportPaths, setPendingImportPaths] = useState([])
  const [pinnedCollections, setPinnedCollections] = useState([])
  const [sidebarContextMenu, setSidebarContextMenu] = useState(null) // { x, y, collection }
  const [colorPickerModal, setColorPickerModal] = useState(null) // { collection }

  // Load all data on component mount
  useEffect(() => {
    loadNodes()
    loadLinks()
    loadPinnedCollections()
  }, [])

  // Listen for changes to pinned collections
  useEffect(() => {
    const handlePinnedChanged = () => {
      loadPinnedCollections()
    }

    window.addEventListener('pinnedCollectionsChanged', handlePinnedChanged)
    return () => window.removeEventListener('pinnedCollectionsChanged', handlePinnedChanged)
  }, [])

  const loadPinnedCollections = () => {
    const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')
    setPinnedCollections(pinned)
  }

  const handleSidebarItemRightClick = (e, collection) => {
    e.preventDefault()
    setSidebarContextMenu({
      x: e.clientX,
      y: e.clientY,
      collection
    })
  }

  const handleUnpinCollection = (collection) => {
    const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')
    const filtered = pinned.filter(p => p.id !== collection.id)
    localStorage.setItem('pinnedCollections', JSON.stringify(filtered))
    window.dispatchEvent(new CustomEvent('pinnedCollectionsChanged'))
  }

  const handleChangeColor = async (collection, newColor) => {
    try {
      // Fetch full collection data first (in case we only have partial data from localStorage)
      const response = await fetch(`/api/collections/${collection.id}`)
      const fullCollection = await response.json()

      // Update collection color via API
      await fetch(`/api/collections/${collection.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fullCollection.name,
          tags: fullCollection.tags || [],
          color: newColor
        })
      })

      // Update pinned collections
      const pinned = JSON.parse(localStorage.getItem('pinnedCollections') || '[]')
      const updated = pinned.map(p =>
        p.id === collection.id ? { ...p, color: newColor } : p
      )
      localStorage.setItem('pinnedCollections', JSON.stringify(updated))
      window.dispatchEvent(new CustomEvent('pinnedCollectionsChanged'))
    } catch (error) {
      console.error('Failed to update collection color:', error)
    }
  }

  // Load all tags for all nodes on mount
  useEffect(() => {
    nodes.forEach(node => {
      loadNodeTags(node.id)
    })
  }, [nodes])

  // Load details node's data when opened
  useEffect(() => {
    if (detailsNode) {
      loadNodeTags(detailsNode.id)
      setNoteInput(detailsNode.metadata?.notes || '')
    }
  }, [detailsNode])

  // Delete key handler for selected nodes
  useEffect(() => {
    const handleKeyDown = async (e) => {
      // Don't trigger if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      // Delete / Backspace: Delete selected files
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.length > 0) {
        e.preventDefault()

        // Confirm deletion
        const count = selectedNodeIds.length
        const message = count === 1
          ? 'Are you sure you want to delete this file? This cannot be undone.'
          : `Are you sure you want to delete ${count} files? This cannot be undone.`

        if (!confirm(message)) return

        // Delete all selected nodes
        try {
          await Promise.all(selectedNodeIds.map(nodeId =>
            fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
          ))
          await loadNodes()
          setSelectedNodeIds([])
          setLastSelectedIndex(null)
          handleCloseDetails()
        } catch (error) {
          console.error('Failed to delete nodes:', error)
          alert('Failed to delete some files')
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedNodeIds])

  // Paste-to-import: Directly index pasted file paths
  useEffect(() => {
    const handlePaste = async (e) => {
      // Don't trigger if user is pasting into an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      // Get pasted text and strip any leading/trailing quotes or whitespace
      const rawText = e.clipboardData.getData('text').trim()
      const pastedText = rawText.replace(/^[^\w/~\\]+|[^\w/~\\]+$/g, '')

      // Check if it looks like a file path
      const isFilePath =
        pastedText.startsWith('/') ||                    // Unix/Mac absolute path
        pastedText.startsWith('~/') ||                   // Unix/Mac home path
        /^[A-Za-z]:\\/.test(pastedText) ||              // Windows path (C:\)
        /^[A-Za-z]:\//.test(pastedText)                 // Windows path (C:/)

      if (isFilePath) {
        e.preventDefault()
        // Show confirmation modal with pasted path
        setPendingImportPaths([pastedText])
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [])

  // Auto-hide scrollbars when not scrolling
  useEffect(() => {
    const timer = setTimeout(() => {
      const setupScrollListener = (selector) => {
        const element = document.querySelector(selector)
        if (element) {
          let timeout
          const handler = () => {
            element.classList.add('is-scrolling')
            clearTimeout(timeout)
            timeout = setTimeout(() => {
              element.classList.remove('is-scrolling')
            }, 1000)
          }
          element.addEventListener('scroll', handler, { passive: true })
          return () => {
            element.removeEventListener('scroll', handler)
            clearTimeout(timeout)
          }
        }
        return () => {}
      }

      const cleanup1 = setupScrollListener('.sidebar')
      const cleanup2 = setupScrollListener('.file-list-container')
      const cleanup3 = setupScrollListener('.panel-content')

      window._scrollCleanup = () => {
        cleanup1()
        cleanup2()
        cleanup3()
      }
    }, 100)

    return () => {
      clearTimeout(timer)
      if (window._scrollCleanup) {
        window._scrollCleanup()
        delete window._scrollCleanup
      }
    }
  }, [detailsNode, location.pathname])

  // Fetch all nodes from the backend
  const loadNodes = async () => {
    try {
      const response = await fetch('/api/nodes')
      const data = await response.json()
      setNodes(data)
    } catch (error) {
      console.error('Failed to load nodes:', error)
    }
  }

  // Fetch tags for a specific node
  const loadNodeTags = async (nodeId) => {
    try {
      const response = await fetch(`/api/nodes/${nodeId}/tags`)
      const data = await response.json()
      setTags(prev => ({ ...prev, [nodeId]: data }))
    } catch (error) {
      console.error('Failed to load tags:', error)
    }
  }

  // Fetch all links
  const loadLinks = async () => {
    try {
      const response = await fetch('/api/links')
      const data = await response.json()
      setLinks(data)
    } catch (error) {
      console.error('Failed to load links:', error)
    }
  }

  // Index a single path (file or directory)
  const indexPath = async (path) => {
    const cleanPath = path.trim().replace(/^["']|["']$/g, '')
    if (!cleanPath) return null

    const response = await fetch('/api/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: cleanPath })
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || 'Failed to index files')
    }

    return response.json()
  }

  // Handle Add Files button - open native file picker then show confirm modal
  const handleAddFiles = async () => {
    if (!selectPaths) return

    try {
      const paths = await selectPaths()
      if (!paths || paths.length === 0) return

      // Show confirmation modal with selected paths
      setPendingImportPaths(paths)
    } catch (err) {
      console.error('Error selecting files:', err)
    }
  }

  // Handle import confirmation from modal
  const handleImportConfirm = async ({ paths, tags, collectionId, newCollectionName }) => {
    setPendingImportPaths([])
    setIsIndexing(true)

    try {
      let targetCollectionId = collectionId

      // Create new collection if requested
      if (newCollectionName) {
        try {
          const response = await fetch('/api/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newCollectionName,
              tags: tags // Use the additional tags as the collection's tags
            })
          })
          const newCollection = await response.json()
          targetCollectionId = newCollection.id
        } catch (err) {
          console.error('Failed to create collection:', err)
        }
      }

      const allNodeIds = []

      // Index all selected paths
      for (const path of paths) {
        try {
          const result = await indexPath(path)
          if (result?.nodeIds) {
            allNodeIds.push(...result.nodeIds)
          }
        } catch (err) {
          console.error(`Failed to index ${path}:`, err)
        }
      }

      // Apply tags to all indexed nodes
      if (tags.length > 0 && allNodeIds.length > 0) {
        for (const nodeId of allNodeIds) {
          for (const tagName of tags) {
            try {
              await fetch('/api/tags', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tag_name: tagName, node_id: nodeId })
              })
            } catch (err) {
              console.error(`Failed to add tag ${tagName}:`, err)
            }
          }
        }
      }

      // If collection specified, add tags from that collection too
      if (targetCollectionId && allNodeIds.length > 0 && !newCollectionName) {
        try {
          const response = await fetch(`/api/collections/${targetCollectionId}`)
          const collection = await response.json()
          if (collection.tags) {
            for (const nodeId of allNodeIds) {
              for (const tagName of collection.tags) {
                await fetch('/api/tags', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ tag_name: tagName, node_id: nodeId })
                })
              }
            }
          }
        } catch (err) {
          console.error('Failed to apply collection tags:', err)
        }
      }

      await loadNodes()
    } catch (err) {
      console.error('Error importing files:', err)
    } finally {
      setIsIndexing(false)
    }
  }

  // Handle import cancel
  const handleImportCancel = () => {
    setPendingImportPaths([])
  }

  // Handler functions
  const handleConnect = () => {
    setConnected(!connected)
    if (!connected) {
      loadNodes()
      loadLinks()
    }
  }

  const handleCloseDetails = () => {
    setDetailsNode(null)
    setTagInput('')
    setNoteInput('')
    setLinkForm({ targetNode: '', type: 'semantic', strength: 0.5 })
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleAddTag = async (e) => {
    e.preventDefault()
    if (!tagInput.trim() || !detailsNode) return

    try {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag_name: tagInput.trim(),
          node_id: detailsNode.id
        })
      })
      setTagInput('')
      await loadNodeTags(detailsNode.id)
    } catch (error) {
      console.error('Failed to add tag:', error)
    }
  }

  const handleDeleteTag = async (tagId) => {
    if (!confirm('Delete this tag?')) return

    try {
      await fetch(`/api/tags/${tagId}`, { method: 'DELETE' })
      await loadNodeTags(detailsNode.id)
    } catch (error) {
      console.error('Failed to delete tag:', error)
    }
  }

  const handleSaveNote = async () => {
    if (!detailsNode) return

    try {
      await fetch(`/api/nodes/${detailsNode.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...detailsNode,
          metadata: {
            ...detailsNode.metadata,
            notes: noteInput
          }
        })
      })
      alert('Note saved successfully!')
      await loadNodes()
    } catch (error) {
      console.error('Failed to save note:', error)
      alert('Failed to save note')
    }
  }

  const handleCreateLink = async (e) => {
    e.preventDefault()
    if (!linkForm.targetNode || !detailsNode) return

    try {
      await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_node: detailsNode.id,
          target_node: linkForm.targetNode,
          link_type: linkForm.type,
          strength: parseFloat(linkForm.strength)
        })
      })
      setLinkForm({ targetNode: '', type: 'semantic', strength: 0.5 })
      await loadLinks()
    } catch (error) {
      console.error('Failed to create link:', error)
    }
  }

  const handleDeleteNode = async (nodeId) => {
    if (!confirm('Are you sure you want to delete this node? This cannot be undone.')) return

    try {
      await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
      await loadNodes()
      handleCloseDetails()
    } catch (error) {
      console.error('Failed to delete node:', error)
    }
  }

  const getNodeById = (nodeId) => {
    return nodes.find(n => n.id === nodeId)
  }

  const getNodeLinks = (nodeId) => {
    return links.filter(link =>
      link.source_node === nodeId || link.target_node === nodeId
    )
  }

  const getFileIconColor = (node, index) => {
    const colors = ['#FF6B82', '#FFB84D', '#4DFF88', '#4D9FFF', '#B84DFF', '#FF4D9F', '#4DFFFF', '#FFFF4D', '#FF884D']
    return colors[index % colors.length]
  }

  const getAllTags = () => {
    const tagMap = new Map()
    Object.entries(tags).forEach(([nodeId, nodeTags]) => {
      nodeTags.forEach(tag => {
        if (tagMap.has(tag.tag_name)) {
          tagMap.get(tag.tag_name).count++
          tagMap.get(tag.tag_name).nodeIds.push(nodeId)
        } else {
          tagMap.set(tag.tag_name, {
            name: tag.tag_name,
            count: 1,
            nodeIds: [nodeId],
            id: tag.id
          })
        }
      })
    })
    return Array.from(tagMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  const filteredAndSortedNodes = nodes
    .filter(node => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return node.name.toLowerCase().includes(query) ||
             node.type?.toLowerCase().includes(query) ||
             tags[node.id]?.some(tag => tag.tag_name.toLowerCase().includes(query))
    })
    .sort((a, b) => {
      let aVal, bVal
      switch (sortField) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'size':
          aVal = a.size
          bVal = b.size
          break
        case 'type':
          aVal = a.type || ''
          bVal = b.type || ''
          break
        case 'modified':
          aVal = new Date(a.timestamp_modified)
          bVal = new Date(b.timestamp_modified)
          break
        default:
          return 0
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

  // Cmd+A / Ctrl+A: Select all files
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger if user is typing in an input field
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return
      }

      // Cmd+A / Ctrl+A: Select all files
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault()
        const allNodeIds = filteredAndSortedNodes.map(node => node.id)
        setSelectedNodeIds(allNodeIds)
        setDetailsNode(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [filteredAndSortedNodes])

  // Row click handler with multi-select support
  const handleRowClick = (node, index, event) => {
    const isCmdOrCtrl = event.metaKey || event.ctrlKey
    const isShift = event.shiftKey

    if (isCmdOrCtrl) {
      // Cmd/Ctrl + Click: Toggle selection
      setSelectedNodeIds(prev => {
        if (prev.includes(node.id)) {
          // Deselect
          return prev.filter(id => id !== node.id)
        } else {
          // Add to selection
          return [...prev, node.id]
        }
      })
      setLastSelectedIndex(index)
      // Close details panel when multiple are selected
      if (selectedNodeIds.length > 0) {
        setDetailsNode(null)
      }
    } else if (isShift && lastSelectedIndex !== null) {
      // Shift + Click: Select range
      const start = Math.min(lastSelectedIndex, index)
      const end = Math.max(lastSelectedIndex, index)
      const rangeIds = filteredAndSortedNodes.slice(start, end + 1).map(n => n.id)
      setSelectedNodeIds(rangeIds)
      setDetailsNode(null) // Close details panel for range selection
    } else {
      // Normal click: Select only this node
      setSelectedNodeIds([node.id])
      setLastSelectedIndex(index)
      setDetailsNode(node)
    }
  }

  return (
    <>
      <div className="app">
        <main className="main">
          {/* Toolbar */}
          <div className="toolbar">
            {/* Navigation */}
            <nav className="toolbar-nav">
              <Link
                to="/directory"
                className={`toolbar-nav-item ${location.pathname === '/directory' ? 'active' : ''}`}
              >
                <span className="toolbar-nav-icon">
                  <img src="/dodecahedron.svg" alt="" className="toolbar-nav-icon-svg" />
                </span>
                <span className="toolbar-nav-label">ALL FILES</span>
              </Link>

              <Link
                to="/tags"
                className={`toolbar-nav-item ${location.pathname === '/tags' ? 'active' : ''}`}
              >
                <span className="toolbar-nav-icon">🏷️</span>
                <span className="toolbar-nav-label">TAGS</span>
              </Link>

              <Link
                to="/collections"
                className={`toolbar-nav-item ${location.pathname === '/collections' ? 'active' : ''}`}
              >
                <span className="toolbar-nav-icon">📁</span>
                <span className="toolbar-nav-label">COLLECTIONS</span>
              </Link>

              <Link
                to="/dev"
                className={`toolbar-nav-item ${location.pathname === '/dev' ? 'active' : ''}`}
              >
                <span className="toolbar-nav-icon">🛠️</span>
                <span className="toolbar-nav-label">DEV</span>
              </Link>
            </nav>

            {/* Search */}
            <div className="toolbar-search-wrapper">
              <span className="toolbar-search-icon">🔍</span>
              <input
                type="text"
                className="toolbar-search"
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Add Files Button */}
            <button
              className="toolbar-add-button"
              onClick={handleAddFiles}
              disabled={isIndexing}
              title="Add files to index"
            >
              {isIndexing ? 'Adding...' : '+ Add Files'}
            </button>
          </div>

          {/* Sidebar - Pinned Collections */}
          <aside className="sidebar">
            {pinnedCollections.length > 0 && (
              <div className="sidebar-section">
                {pinnedCollections.map((collection) => (
                  <Link
                    key={collection.id}
                    to={`/collections/${collection.id}`}
                    className={`sidebar-pinned-item ${location.pathname === `/collections/${collection.id}` ? 'active' : ''}`}
                    onContextMenu={(e) => handleSidebarItemRightClick(e, collection)}
                  >
                    <div
                      className="sidebar-pinned-icon"
                      style={{ backgroundColor: collection.color || '#4D9FFF' }}
                    >
                      📁
                    </div>
                    <span className="sidebar-pinned-label">{collection.name}</span>
                  </Link>
                ))}
              </div>
            )}
          </aside>

          {/* Route content renders here */}
          <Outlet context={{
            nodes,
            tags,
            links,
            selectedNodeIds,
            setSelectedNodeIds,
            setDetailsNode,
            searchQuery,
            sortField,
            sortDirection,
            filteredAndSortedNodes,
            handleRowClick,
            handleSort,
            getFileIconColor,
            getAllTags
          }} />

          {/* Details Panel */}
          <DetailPanel
            node={detailsNode}
            tags={tags}
            tagInput={tagInput}
            setTagInput={setTagInput}
            onClose={handleCloseDetails}
            onAddTag={handleAddTag}
            onDeleteTag={handleDeleteTag}
          />
        </main>
      </div>

      {sidebarContextMenu && (
        <ContextMenu
          x={sidebarContextMenu.x}
          y={sidebarContextMenu.y}
          items={[
            {
              icon: '📌',
              label: 'Unpin from Sidebar',
              onClick: () => handleUnpinCollection(sidebarContextMenu.collection)
            },
            {
              separator: true
            },
            {
              icon: '🎨',
              label: 'Change Color...',
              onClick: () => {
                setColorPickerModal({ collection: sidebarContextMenu.collection })
              }
            }
          ]}
          onClose={() => setSidebarContextMenu(null)}
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

      <ImportConfirmModal
        isOpen={pendingImportPaths.length > 0}
        paths={pendingImportPaths}
        onConfirm={handleImportConfirm}
        onCancel={handleImportCancel}
      />
    </>
  )
}

export default Layout
