import './DetailPanel.css'
import FilePreview from './FilePreview/FilePreview'

function DetailPanel({
  node,
  tags,
  tagInput,
  setTagInput,
  onClose,
  onAddTag,
  onDeleteTag
}) {
  if (!node) {
    return (
      <aside className="detail-panel empty">
        <p>Select a file to view details</p>
      </aside>
    )
  }

  const nodeTags = tags[node.id] || []

  return (
    <aside className="detail-panel">
      <button onClick={onClose} className="detail-close">×</button>

      <div className="detail-preview">
        <FilePreview node={node} />
      </div>

      <div className="detail-info">
        <h2 className="detail-name">{node.name}</h2>
        <p className="detail-path">{node.source_path}</p>
      </div>

      <div className="detail-tags">
        {nodeTags.map(tag => (
          <span key={tag.id} className="detail-tag">
            {tag.tag_name}
            <button
              className="detail-tag-remove"
              onClick={() => onDeleteTag(tag.id)}
            >
              ×
            </button>
          </span>
        ))}
        <form onSubmit={onAddTag} className="detail-tag-form">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            placeholder="+ Add tag"
            className="detail-tag-input"
          />
        </form>
      </div>
    </aside>
  )
}

export default DetailPanel
