import { useOutletContext } from 'react-router-dom'
import './TagsView.css'

function TagsView() {
  const {
    getAllTags,
    getFileIconColor
  } = useOutletContext()

  const allTags = getAllTags()

  return (
    <div className="content-area">
      {/* Tags View */}
      <div className="file-list-container">
        {allTags.length === 0 ? (
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
              {allTags.map((tag, index) => (
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
        <span className="footer-text">{allTags.length} tags</span>
      </div>
    </div>
  )
}

export default TagsView
