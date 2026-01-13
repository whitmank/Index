import './FileListTable.css'
import { formatBytes, formatDate } from '../../utils/formatters'

function FileListTable({
  nodes,
  selectedNodeIds,
  sortField,
  sortDirection,
  handleRowClick,
  handleRowRightClick,
  handleSort,
  getFileIconColor,
  emptyMessage = 'No files found. Try a different search or run the scanner to add files.'
}) {
  return (
    <div className="content-area">
      {/* File List Table */}
      <div className="file-list-container">
        {nodes.length === 0 ? (
          <p className="empty">{emptyMessage}</p>
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
              {nodes.map((node, index) => (
                <tr
                  key={node.id}
                  className={selectedNodeIds.includes(node.id) ? 'selected' : ''}
                  onClick={(e) => handleRowClick(node, index, e)}
                  onContextMenu={(e) => handleRowRightClick && handleRowRightClick(node, index, e)}
                >
                  <td className="col-name">
                    <div className="name-cell">
                      <div
                        className="file-icon-square"
                        style={{backgroundColor: node.metadata?.color || getFileIconColor(node, index)}}
                      >
                        {node.type === 'collection' ? (
                          <span className="collection-icon">📁</span>
                        ) : node.type?.startsWith('image/') ? (
                          <img src={`/api/files/${node.id}`} alt="" className="file-icon-image" />
                        ) : null}
                      </div>
                      <span className="file-name">{node.name}</span>
                    </div>
                  </td>
                  <td className="col-modified">{formatDate(node.timestamp_modified)}</td>
                  <td className="col-size">
                    {node.type === 'collection'
                      ? `${node.metadata?.tags?.length || 0} tags`
                      : formatBytes(node.size)
                    }
                  </td>
                  <td className="col-type">
                    {node.type === 'collection'
                      ? 'Collection'
                      : node.type?.includes('/')
                        ? node.type.split('/')[1].toUpperCase() + ' image'
                        : 'Document'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer */}
      <div className="footer">
        <span className="footer-text">
          {nodes.length} items
          {selectedNodeIds.length > 0 && ` · ${selectedNodeIds.length} selected`}
        </span>
      </div>
    </div>
  )
}

export default FileListTable
