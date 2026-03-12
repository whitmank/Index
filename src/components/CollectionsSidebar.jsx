// Author: Claude Code
// CollectionsSidebar — v0.4. Updated to use useIndexStore.

import React, { useState, useEffect } from 'react';
import { useIndexStore } from '../store/index';
import { useHistoryStore } from '../store/history';
import './CollectionsSidebar.css';

function TagSelector({ label, selectedTags, onTagsChange, availableTags, maxTags = Infinity }) {
  const [expanded, setExpanded] = useState(false);

  const findTagById = (tagId) => availableTags.find(t => t.id === tagId);

  return (
    <div className="tag-selector">
      <label>{label}</label>
      <div className="tag-selector-display" onClick={() => setExpanded(!expanded)}>
        {selectedTags.length === 0 ? (
          <span className="placeholder">Select tags...</span>
        ) : (
          <div className="selected-tags">
            {selectedTags.map(tagId => {
              const tag = findTagById(tagId);
              return (
                <span key={tagId} className="tag-badge">
                  {tag?.name}
                  <button type="button" onClick={(e) => { e.stopPropagation(); onTagsChange(selectedTags.filter(t => t !== tagId)); }}>×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {expanded && (
        <div className="tag-selector-menu">
          {availableTags.map(tag => {
            const tagId = tag.id;
            const isSelected = selectedTags.includes(tagId);
            return (
              <button
                key={tagId}
                type="button"
                className={`tag-option ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  if (isSelected) onTagsChange(selectedTags.filter(t => t !== tagId));
                  else if (selectedTags.length < maxTags) onTagsChange([...selectedTags, tagId]);
                }}
              >
                <span className="tag-color" style={{ backgroundColor: tag.color || '#999' }} />
                {tag.name}
                {isSelected && <span className="checkmark">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CollectionEditor({ isOpen, onClose, onSave, collectionToEdit, availableTags }) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState({ all: [], any: [], none: [] });
  const [error, setError] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (collectionToEdit) {
      setName(collectionToEdit.name || '');
      setQuery(collectionToEdit.query || { all: [], any: [], none: [] });
    } else {
      setName('');
      setQuery({ all: [], any: [], none: [] });
    }
    setError(null);
    setWarnings([]);
  }, [collectionToEdit, isOpen]);

  const handleSave = async () => {
    setError(null);
    setWarnings([]);

    if (!name.trim()) { setError('Collection name is required'); return; }
    if (!query.all?.length && !query.any?.length && !query.none?.length) {
      setError('Collection must have at least one rule (all, any, or none)');
      return;
    }

    setSaving(true);
    try {
      const result = await onSave({ name: name.trim(), query });
      if (result.warnings) setWarnings(result.warnings);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="collection-editor-overlay" onClick={onClose}>
      <div className="collection-editor-modal" onClick={e => e.stopPropagation()}>
        <h3>{collectionToEdit ? 'Edit Collection' : 'New Collection'}</h3>
        <div className="editor-form">
          <div className="form-group">
            <label>Collection Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Active Research" autoFocus />
          </div>
          <div className="query-builder">
            <h4>Query Rules</h4>
            <p className="query-help">Objects must match these criteria:</p>
            <TagSelector label="Has ALL of these tags (AND)" selectedTags={query.all} onTagsChange={tags => setQuery({ ...query, all: tags })} availableTags={availableTags} />
            <TagSelector label="Has ANY of these tags (OR)" selectedTags={query.any} onTagsChange={tags => setQuery({ ...query, any: tags })} availableTags={availableTags} />
            <TagSelector label="Has NONE of these tags (NOT)" selectedTags={query.none} onTagsChange={tags => setQuery({ ...query, none: tags })} availableTags={availableTags} />
          </div>
          {error && <div className="error-message">{error}</div>}
          {warnings.length > 0 && (
            <div className="warnings-message">
              <strong>Warnings:</strong>
              <ul>{warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
            </div>
          )}
          <div className="editor-actions">
            <button type="button" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="button" onClick={handleSave} disabled={saving || !name.trim()} className="primary">
              {saving ? 'Saving...' : 'Save Collection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CollectionsSidebar() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [collectionToEdit, setCollectionToEdit] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem('collectionsCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isResizing, setIsResizing] = useState(false);

  const collections = useIndexStore(state => state.getAllCollections());
  const activeCollectionId = useIndexStore(state => state.activeCollectionId);
  const toggleCollection = useIndexStore(state => state.toggleCollection);
  const createCollection = useIndexStore(state => state.createCollection);
  const updateCollection = useIndexStore(state => state.updateCollection);
  const deleteCollection = useIndexStore(state => state.deleteCollection);
  const reorderCollections = useIndexStore(state => state.reorderCollections);
  const tags = useIndexStore(state => state.tags);

  const handleCollapseToggle = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('collectionsCollapsed', JSON.stringify(newState));
    window.dispatchEvent(new Event('collectionsCollapsedChange'));
  };

  const handleResizeStart = (e) => { e.preventDefault(); setIsResizing(true); };

  useEffect(() => {
    if (!isResizing) return;
    const handleMouseMove = (e) => {
      const newWidth = Math.max(160, Math.min(e.clientX, 500));
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      window.dispatchEvent(new Event('sidebarWidthChange'));
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem('sidebarWidth', sidebarWidth.toString());
    window.dispatchEvent(new Event('sidebarWidthChange'));
  }, [sidebarWidth]);

  const handleDeleteCollection = async (collectionId) => {
    const push = useHistoryStore.getState().push;
    const toDelete = collections.find(c => c.id === collectionId);

    if (toDelete) {
      push({
        description: `Delete collection "${toDelete.name}"`,
        undo: async () => {
          await createCollection({ name: toDelete.name, query: toDelete.query });
        },
      });
    }

    await deleteCollection(collectionId);
    setDeleteConfirm(null);
  };

  const handleDragStart = (e, index) => {
    if (collections[index].system) { e.preventDefault(); return; }
    e.stopPropagation();
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/x-collection-drag', 'true');
  };

  const handleDrop = async (e, dropIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverIndex(null);
    if (draggedIndex === null || draggedIndex === dropIndex) { setDraggedIndex(null); return; }
    if (collections[dropIndex].system) { setDraggedIndex(null); return; }

    const newCollections = [...collections];
    const [draggedItem] = newCollections.splice(draggedIndex, 1);
    newCollections.splice(dropIndex, 0, draggedItem);

    const regularCollections = newCollections.filter(c => !c.system);
    try { await reorderCollections(regularCollections); } catch (err) { console.error('Error reordering:', err); }
    setDraggedIndex(null);
  };

  return (
    <aside
      className={`collections-sidebar ${isCollapsed ? 'collapsed' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{ width: isCollapsed ? '60px' : `${sidebarWidth}px` }}
    >
      <div className="collections-header"><h3>Collections</h3></div>
      <button type="button" className="btn-collapse-side" onClick={handleCollapseToggle} title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {isCollapsed ? '▶' : '◀'}
      </button>

      {!isCollapsed && (
        <div className="collections-list">
          {collections.map((collection, index) => {
            const collectionId = collection.id;
            const isActive = activeCollectionId === collectionId || (!activeCollectionId && collection.system);
            const isSystem = collection.system;
            const isDeleting = deleteConfirm === collectionId;
            const isDragged = draggedIndex === index;
            const isDragOver = dragOverIndex === index;

            return (
              <div
                key={collectionId}
                className={`collection-item ${isActive ? 'active' : ''} ${isDragged ? 'dragging' : ''} ${isDragOver ? 'drag-over' : ''}`}
                draggable={!isSystem}
                onDragStart={e => handleDragStart(e, index)}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; setDragOverIndex(index); }}
                onDragLeave={e => { e.stopPropagation(); setDragOverIndex(null); }}
                onDrop={e => handleDrop(e, index)}
              >
                <button type="button" className="collection-label" onClick={() => toggleCollection(collectionId)}>
                  <span className="collection-icon">{isActive ? '✓' : ' '}</span>
                  <span className="collection-name">{collection.name}</span>
                </button>

                {!isSystem && (
                  <div className="collection-actions">
                    <button type="button" className="btn-edit" onClick={() => { setCollectionToEdit(collection); setEditorOpen(true); }} title="Edit collection">✎</button>
                    <button
                      type="button"
                      className={`btn-delete ${isDeleting ? 'confirm' : ''}`}
                      onClick={() => { if (isDeleting) handleDeleteCollection(collectionId); else setDeleteConfirm(collectionId); }}
                      title={isDeleting ? 'Click to confirm delete' : 'Delete collection'}
                    >
                      {isDeleting ? '⟳' : '✕'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          <button type="button" className="btn-add-bottom" onClick={() => { setCollectionToEdit(null); setEditorOpen(true); }}>+</button>
        </div>
      )}

      {!isCollapsed && (
        <CollectionEditor
          isOpen={editorOpen}
          onClose={() => { setEditorOpen(false); setCollectionToEdit(null); }}
          onSave={collectionToEdit ? (data) => updateCollection(collectionToEdit.id, data) : createCollection}
          collectionToEdit={collectionToEdit}
          availableTags={tags}
        />
      )}
      <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
    </aside>
  );
}
