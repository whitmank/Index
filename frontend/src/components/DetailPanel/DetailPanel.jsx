import './DetailPanel.css'
import { formatBytes, formatDate } from '../../utils/formatters'
import CollapsibleSection from './sections/CollapsibleSection'
import TagsSection from './sections/TagsSection'
import FilePreview from './FilePreview/FilePreview'

function DetailPanel({
  node,
  tags,
  links,
  nodes,
  tagInput,
  setTagInput,
  noteInput,
  setNoteInput,
  linkForm,
  setLinkForm,
  onClose,
  onAddTag,
  onDeleteTag,
  onSaveNote,
  onCreateLink,
  onDeleteNode,
  getNodeById,
  getNodeLinks
}) {
  // Empty state when no node selected
  if (!node) {
    return (
      <aside className="details-panel">
        <div className="panel-header">
          <h3>Details</h3>
        </div>
        <div className="panel-content">
          <div className="empty-panel">
            <p>Select a file to view details</p>
          </div>
        </div>
      </aside>
    )
  }

  return (
    <aside className="details-panel">
      <div className="panel-header">
        <h3>Node Details</h3>
        <button onClick={onClose} className="btn-close">×</button>
      </div>

      <div className="panel-content">
        {/* Preview */}
        <CollapsibleSection id="preview" title="Preview" icon="🖼️" defaultOpen={true}>
          <FilePreview node={node} />
        </CollapsibleSection>

        {/* Basic Info */}
        <CollapsibleSection id="info" title="Information" icon="📄" defaultOpen={true}>
          <div className="info-group-content">
          <div className="info-item">
            <label>Name:</label>
            <span>{node.name}</span>
          </div>
          <div className="info-item">
            <label>Size:</label>
            <span>{formatBytes(node.size)}</span>
          </div>
          <div className="info-item">
            <label>Type:</label>
            <span>{node.type}</span>
          </div>
          <div className="info-item">
            <label>Path:</label>
            <span className="path-text">{node.source_path}</span>
          </div>
          <div className="info-item">
            <label>Created:</label>
            <span>{formatDate(node.timestamp_created)}</span>
          </div>
          <div className="info-item">
            <label>Modified:</label>
            <span>{formatDate(node.timestamp_modified)}</span>
          </div>
          <div className="info-item">
            <label>Hash:</label>
            <span className="hash-text">{node.content_hash?.substring(0, 20)}...</span>
          </div>
          </div>
        </CollapsibleSection>

        {/* Tags */}
        <CollapsibleSection id="tags" title="Tags" icon="🏷️" defaultOpen={true}>
          <TagsSection
            tags={tags[node.id]}
            tagInput={tagInput}
            setTagInput={setTagInput}
            onAddTag={onAddTag}
            onDeleteTag={onDeleteTag}
          />
        </CollapsibleSection>

        {/* Notes */}
        <CollapsibleSection id="notes" title="Notes" icon="📝" defaultOpen={false}>
          <textarea
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Add notes or annotations..."
            className="note-textarea"
            rows="4"
          />
          <button onClick={onSaveNote} className="btn-save-note">
            Save Note
          </button>
        </CollapsibleSection>

        {/* Links */}
        <CollapsibleSection id="links" title={`Links (${getNodeLinks(node.id).length})`} icon="🔗" defaultOpen={false}>
          <div className="links-list">
            {getNodeLinks(node.id).map(link => {
              const isSource = link.source_node === node.id
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
          <form onSubmit={onCreateLink} className="link-form">
            <select
              value={linkForm.targetNode}
              onChange={(e) => setLinkForm({ ...linkForm, targetNode: e.target.value })}
              required
            >
              <option value="">Select node...</option>
              {nodes
                .filter(n => n.id !== node.id)
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
        </CollapsibleSection>

        {/* Actions */}
        <CollapsibleSection id="actions" title="Actions" icon="⚙️" defaultOpen={false}>
          <div className="panel-actions-content">
          <button
            onClick={() => onDeleteNode(node.id)}
            className="btn-delete-node"
          >
            Delete Node
          </button>
          </div>
        </CollapsibleSection>
      </div>
    </aside>
  )
}

export default DetailPanel
