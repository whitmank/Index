import { useOutletContext } from 'react-router-dom'
import './FilesView.css'
import { formatBytes, formatDate } from '../../utils/formatters'

function FilesView() {
  const {
    filteredAndSortedNodes,
    selectedNodeId,
    tags,
    sortField,
    sortDirection,
    handleRowClick,
    handleSort,
    getFileIconColor
  } = useOutletContext()

  return (
    <div className="content-area">
      {/* File List Table */}
      <div className="file-list-container">
        {filteredAndSortedNodes.length === 0 ? (
          <p className="empty">No files found. Try a different search or run the scanner to add files.</p>
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
                  onClick={() => handleRowClick(node)}
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
    </div>
  )
}

export default FilesView
