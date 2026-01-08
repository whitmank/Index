import { useState, useEffect } from 'react'
import './App.css'

function App() {
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
  const [viewMode, setViewMode] = useState('list') // list, icons, columns, gallery
  const [activeView, setActiveView] = useState('files') // files, tags

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

  const handleRowClick = (nodeId) => {
    setSelectedNodeId(nodeId)
  }

  const handleRowDoubleClick = (node) => {
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
      // Update node with note in metadata
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
      await loadNodes()
      // Update details node to reflect changes
      setDetailsNode(prev => ({
        ...prev,
        metadata: { ...prev.metadata, notes: noteInput }
      }))
    } catch (error) {
      console.error('Failed to save note:', error)
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
          type: linkForm.type,
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
    if (!confirm('Delete this node? This will also delete all associated tags and links.')) return

    try {
      await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
      await loadNodes()
      if (detailsNode?.id === nodeId) {
        handleCloseDetails()
      }
      if (selectedNodeId === nodeId) {
        setSelectedNodeId(null)
      }
    } catch (error) {
      console.error('Failed to delete node:', error)
    }
  }

  const formatBytes = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (isoString) => {
    const date = new Date(isoString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  }

  const getNodeById = (nodeId) => {
    return nodes.find(n => n.id === nodeId)
  }

  // Get links related to selected node
  const getNodeLinks = (nodeId) => {
    return links.filter(link =>
      link.source_node === nodeId || link.target_node === nodeId
    )
  }

  const getFileIconColor = (node, index) => {
    // Generate consistent colors based on file name or use index
    const colors = ['#FF6B82', '#FFB84D', '#4DFF88', '#4D9FFF', '#B84DFF', '#FF4D9F', '#4DFFFF', '#FFFF4D', '#FF884D']
    return colors[index % colors.length]
  }

  // Get all unique tags with counts
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

  // Filter and sort nodes
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
    <div className="app">
      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-left">
          <button className="nav-btn">‹</button>
          <button className="nav-btn">›</button>
        </div>
        <div className="toolbar-center">
          <button className={`view-btn ${viewMode === 'icons' ? 'active' : ''}`} onClick={() => setViewMode('icons')} title="Icons">⊞</button>
          <button className={`view-btn ${viewMode === 'list' ? 'active' : ''}`} onClick={() => setViewMode('list')} title="List">☰</button>
          <button className={`view-btn ${viewMode === 'columns' ? 'active' : ''}`} onClick={() => setViewMode('columns')} title="Columns">|||</button>
          <button className={`view-btn ${viewMode === 'gallery' ? 'active' : ''}`} onClick={() => setViewMode('gallery')} title="Gallery">⊡</button>
        </div>
        <div className="toolbar-right">
          <input
            type="text"
            className="search-input"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <main className="main">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="sidebar-section">
            <div
              className={`sidebar-item ${activeView === 'files' ? 'active' : ''}`}
              onClick={() => setActiveView('files')}
            >
              <span className="sidebar-icon">
                <img src="/dodecahedron.svg" alt="" className="sidebar-icon-svg" />
              </span>
              <span className="sidebar-label">All Files</span>
            </div>
            <div
              className={`sidebar-item ${activeView === 'tags' ? 'active' : ''}`}
              onClick={() => setActiveView('tags')}
            >
              <span className="sidebar-icon">🏷️</span>
              <span className="sidebar-label">Tags</span>
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <div className="content-area">
          {activeView === 'files' ? (
            <>
              {/* File List Table */}
              <div className="file-list-container">
                {filteredAndSortedNodes.length === 0 ? (
                  <p className="empty">No files found. {searchQuery ? 'Try a different search.' : 'Run the scanner to add files.'}</p>
                ) : (
                  <table className="file-list">
                    <thead>
                      <tr>
                        <th className="col-name sortable" onClick={() => handleSort('name')}>
                          Name
                          {sortField === 'name' && (
                            <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </th>
                        <th className="col-modified sortable" onClick={() => handleSort('modified')}>
                          Date Modified
                          {sortField === 'modified' && (
                            <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </th>
                        <th className="col-size sortable" onClick={() => handleSort('size')}>
                          Size
                          {sortField === 'size' && (
                            <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </th>
                        <th className="col-type sortable" onClick={() => handleSort('type')}>
                          Kind
                          {sortField === 'type' && (
                            <span className="sort-indicator">{sortDirection === 'asc' ? ' ▲' : ' ▼'}</span>
                          )}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedNodes.map((node, index) => (
                        <tr
                          key={node.id}
                          className={selectedNodeId === node.id ? 'selected' : ''}
                          onClick={() => handleRowClick(node.id)}
                          onDoubleClick={() => handleRowDoubleClick(node)}
                        >
                          <td className="col-name">
                            <div className="name-cell">
                              <div
                                className="file-icon-square"
                                style={{backgroundColor: getFileIconColor(node, index)}}
                              >
                                {node.type?.startsWith('image/') && (
                                  <img src={`/api/files/${node.id}`} alt="" className="file-icon-image" />
                                )}
                              </div>
                              <span className="file-name">{node.name}</span>
                            </div>
                          </td>
                          <td className="col-modified">{formatDate(node.timestamp_modified)}</td>
                          <td className="col-size">{formatBytes(node.size)}</td>
                          <td className="col-type">{node.type?.includes('/') ? node.type.split('/')[1].toUpperCase() + ' image' : 'Document'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="footer">
                <span className="footer-text">{filteredAndSortedNodes.length} items</span>
              </div>
            </>
          ) : (
            <>
              {/* Tags View */}
              <div className="file-list-container">
                {getAllTags().length === 0 ? (
                  <p className="empty">No tags yet. Add tags to your files to organize them.</p>
                ) : (
                  <table className="file-list">
                    <thead>
                      <tr>
                        <th className="col-tag-name">Tag Name</th>
                        <th className="col-tag-count">Files</th>
                      </tr>
                    </thead>
                    <tbody>
                      {getAllTags().map((tag, index) => (
                        <tr key={tag.name}>
                          <td className="col-tag-name">
                            <div className="name-cell">
                              <span className="tag-dot" style={{backgroundColor: getFileIconColor(null, index)}}></span>
                              <span className="file-name">{tag.name}</span>
                            </div>
                          </td>
                          <td className="col-tag-count">{tag.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer */}
              <div className="footer">
                <span className="footer-text">{getAllTags().length} tags</span>
              </div>
            </>
          )}
        </div>

        {/* Details Panel */}
        {detailsNode && (
          <aside className="details-panel">
            <div className="panel-header">
              <h3>Node Details</h3>
              <button onClick={handleCloseDetails} className="btn-close">×</button>
            </div>

            <div className="panel-content">
              {/* Preview */}
              {detailsNode.type?.startsWith('image/') && (
                <div className="preview-image">
                  <img src={`/api/files/${detailsNode.id}`} alt={detailsNode.name} />
                </div>
              )}

              {/* Basic Info */}
              <div className="info-group">
                <h4>Information</h4>
                <div className="info-item">
                  <label>Name:</label>
                  <span>{detailsNode.name}</span>
                </div>
                <div className="info-item">
                  <label>Size:</label>
                  <span>{formatBytes(detailsNode.size)}</span>
                </div>
                <div className="info-item">
                  <label>Type:</label>
                  <span>{detailsNode.type}</span>
                </div>
                <div className="info-item">
                  <label>Path:</label>
                  <span className="path-text">{detailsNode.source_path}</span>
                </div>
                <div className="info-item">
                  <label>Created:</label>
                  <span>{formatDate(detailsNode.timestamp_created)}</span>
                </div>
                <div className="info-item">
                  <label>Modified:</label>
                  <span>{formatDate(detailsNode.timestamp_modified)}</span>
                </div>
                <div className="info-item">
                  <label>Hash:</label>
                  <span className="hash-text">{detailsNode.content_hash?.substring(0, 20)}...</span>
                </div>
              </div>

              {/* Tags */}
              <div className="info-group">
                <h4>Tags</h4>
                <div className="tags-list">
                  {tags[detailsNode.id]?.map(tag => (
                    <div key={tag.id} className="tag-chip">
                      {tag.tag_name}
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="tag-delete"
                        title="Remove tag"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <form onSubmit={handleAddTag} className="tag-form">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add tag..."
                    className="tag-input"
                  />
                  <button type="submit" className="btn-add-tag">Add</button>
                </form>
              </div>

              {/* Notes */}
              <div className="info-group">
                <h4>Notes</h4>
                <textarea
                  value={noteInput}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="Add notes or annotations..."
                  className="note-textarea"
                  rows="4"
                />
                <button onClick={handleSaveNote} className="btn-save-note">
                  Save Note
                </button>
              </div>

              {/* Links */}
              <div className="info-group">
                <h4>Links ({getNodeLinks(detailsNode.id).length})</h4>
                <div className="links-list">
                  {getNodeLinks(detailsNode.id).map(link => {
                    const isSource = link.source_node === detailsNode.id
                    const relatedNodeId = isSource ? link.target_node : link.source_node
                    const relatedNode = getNodeById(relatedNodeId)
                    return (
                      <div key={link.id} className="link-item">
                        <span className="link-direction">{isSource ? '→' : '←'}</span>
                        <span className="link-type">{link.type}</span>
                        <span className="link-target">{relatedNode?.name || relatedNodeId}</span>
                        {link.strength && (
                          <span className="link-strength">{(link.strength * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <form onSubmit={handleCreateLink} className="link-form">
                  <select
                    value={linkForm.targetNode}
                    onChange={(e) => setLinkForm({ ...linkForm, targetNode: e.target.value })}
                    required
                  >
                    <option value="">Select node...</option>
                    {nodes
                      .filter(n => n.id !== detailsNode.id)
                      .map(n => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))
                    }
                  </select>
                  <select
                    value={linkForm.type}
                    onChange={(e) => setLinkForm({ ...linkForm, type: e.target.value })}
                  >
                    <option value="derivative">Derivative</option>
                    <option value="temporal">Temporal</option>
                    <option value="semantic">Semantic</option>
                    <option value="spatial">Spatial</option>
                    <option value="project">Project</option>
                  </select>
                  <input
                    type="number"
                    value={linkForm.strength}
                    onChange={(e) => setLinkForm({ ...linkForm, strength: e.target.value })}
                    min="0"
                    max="1"
                    step="0.1"
                    placeholder="Strength"
                  />
                  <button type="submit" className="btn-create-link">Link</button>
                </form>
              </div>

              {/* Actions */}
              <div className="panel-actions">
                <button
                  onClick={() => handleDeleteNode(detailsNode.id)}
                  className="btn-delete-node"
                >
                  Delete Node
                </button>
              </div>
            </div>
          </aside>
        )}
      </main>
    </div>
  )
}

export default App
