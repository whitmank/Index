import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import './Layout.css'
import DetailPanel from '../DetailPanel/DetailPanel'

function Layout() {
  const location = useLocation()

  // State management
  const [connected, setConnected] = useState(true)
  const [nodes, setNodes] = useState([])
  const [tags, setTags] = useState({}) // Map of nodeId -> tags array
  const [links, setLinks] = useState([])
  const [selectedNodeId, setSelectedNodeId] = useState(null) // For row selection
  const [detailsNode, setDetailsNode] = useState(null) // For details panel
  const [tagInput, setTagInput] = useState('') // Tag input field
  const [linkForm, setLinkForm] = useState({ targetNode: '', type: 'semantic', strength: 0.5 })
  const [noteInput, setNoteInput] = useState('') // Note input field
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState('name')
  const [sortDirection, setSortDirection] = useState('asc')

  // Load all data on component mount
  useEffect(() => {
    loadNodes()
    loadLinks()
  }, [])

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

  // Auto-hide scrollbars when not scrolling
  useEffect(() => {
    // Setup listeners for all scrollable containers with delay to ensure DOM is ready
    const timer = setTimeout(() => {
      const setupScrollListener = (selector) => {
        const element = document.querySelector(selector)
        if (element) {
          console.log('Setting up scroll listener for:', selector, element)
          let timeout
          const handler = () => {
            console.log('Scroll detected on:', selector)
            element.classList.add('is-scrolling')
            clearTimeout(timeout)
            timeout = setTimeout(() => {
              console.log('Removing is-scrolling from:', selector)
              element.classList.remove('is-scrolling')
            }, 1000) // Hide after 1 second of no scrolling
          }
          element.addEventListener('scroll', handler, { passive: true })
          return () => {
            element.removeEventListener('scroll', handler)
            clearTimeout(timeout)
          }
        } else {
          console.warn('Could not find element:', selector)
        }
        return () => {}
      }

      const cleanup1 = setupScrollListener('.sidebar')
      const cleanup2 = setupScrollListener('.file-list-container')
      const cleanup3 = setupScrollListener('.panel-content')

      // Store cleanup functions
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
  }, [detailsNode, location.pathname]) // Re-run when route or detail panel changes

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

  // Handler functions
  const handleConnect = () => {
    setConnected(!connected)
    if (!connected) {
      loadNodes()
      loadLinks()
    }
  }

  const handleRowClick = (node) => {
    setSelectedNodeId(node.id)
    setDetailsNode(node)
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

  return (
    <>
      <div className="frame"></div>
      <div className="app">
        <main className="main">
          {/* Toolbar */}
          <div className="toolbar">
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
          </div>

          {/* Sidebar */}
          <aside className="sidebar">
            <div className="sidebar-section">
              <Link
                to="/directory"
                className={`sidebar-item ${location.pathname === '/directory' ? 'active' : ''}`}
              >
                <span className="sidebar-icon">
                  <img src="/dodecahedron.svg" alt="" className="sidebar-icon-svg" />
                </span>
                <span className="sidebar-label">ALL FILES</span>
              </Link>

              <Link
                to="/tags"
                className={`sidebar-item ${location.pathname === '/tags' ? 'active' : ''}`}
              >
                <span className="sidebar-icon">🏷️</span>
                <span className="sidebar-label">TAGS</span>
              </Link>

              <Link
                to="/dev"
                className={`sidebar-item ${location.pathname === '/dev' ? 'active' : ''}`}
              >
                <span className="sidebar-icon">🛠️</span>
                <span className="sidebar-label">DEV</span>
              </Link>
            </div>
          </aside>

          {/* Route content renders here */}
          <Outlet context={{
            nodes,
            tags,
            links,
            selectedNodeId,
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
            links={links}
            nodes={nodes}
            tagInput={tagInput}
            setTagInput={setTagInput}
            noteInput={noteInput}
            setNoteInput={setNoteInput}
            linkForm={linkForm}
            setLinkForm={setLinkForm}
            onClose={handleCloseDetails}
            onAddTag={handleAddTag}
            onDeleteTag={handleDeleteTag}
            onSaveNote={handleSaveNote}
            onCreateLink={handleCreateLink}
            onDeleteNode={handleDeleteNode}
            getNodeById={getNodeById}
            getNodeLinks={getNodeLinks}
          />
        </main>
      </div>
    </>
  )
}

export default Layout
