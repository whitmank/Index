import React, { useState, useEffect } from 'react';
import { useCollectionsStore } from '../store/collections';
import { useTagsStore } from '../store/tags';
import './CollectionsSidebar.css';

// Author: Claude Code
// Collections sidebar component - displays saved queries and allows filtering

/**
 * Tag selector for query builder (ALL/ANY/NONE)
 */
function TagSelector({ label, selectedTags, onTagsChange, availableTags, maxTags = Infinity }) {
  const [expanded, setExpanded] = useState(false);

  // Find tag by ID - simple direct comparison
  const findTagById = (tagId) => availableTags.find((t) => t.id === tagId);

  return (
    <div className="tag-selector">
      <label>{label}</label>
      <div className="tag-selector-display" onClick={() => setExpanded(!expanded)}>
        {selectedTags.length === 0 ? (
          <span className="placeholder">Select tags...</span>
        ) : (
          <div className="selected-tags">
            {selectedTags.map((tagId) => {
              const tag = findTagById(tagId);
              return (
                <span key={tagId} className="tag-badge">
                  {tag?.name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagsChange(selectedTags.filter((t) => t !== tagId));
                    }}
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {expanded && (
        <div className="tag-selector-menu">
          {availableTags.map((tag) => {
            // Extract plain string ID from RecordId object or string
            let tagId = tag.id;
            if (typeof tagId === 'object' && tagId.id) {
              tagId = tagId.id;
            } else if (typeof tagId === 'string' && tagId.includes(':')) {
              tagId = tagId.split(':')[1];
            }

            const isSelected = selectedTags.includes(tagId);

            return (
              <button
                key={tagId}
                type="button"
                className={`tag-option ${isSelected ? 'selected' : ''}`}
                onClick={() => {
                  if (isSelected) {
                    onTagsChange(selectedTags.filter((t) => t !== tagId));
                  } else if (selectedTags.length < maxTags) {
                    onTagsChange([...selectedTags, tagId]);
                  }
                }}
              >
                <span
                  className="tag-color"
                  style={{ backgroundColor: tag.color || '#999' }}
                />
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

/**
 * Collection editor modal for create/edit
 */
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

    if (!name.trim()) {
      setError('Collection name is required');
      return;
    }

    if (
      (!query.all || query.all.length === 0) &&
      (!query.any || query.any.length === 0) &&
      (!query.none || query.none.length === 0)
    ) {
      setError('Collection must have at least one rule (all, any, or none)');
      return;
    }

    setSaving(true);
    try {
      const result = await onSave({
        name: name.trim(),
        query,
      });

      if (result.warnings) {
        setWarnings(result.warnings);
      }

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
      <div className="collection-editor-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{collectionToEdit ? 'Edit Collection' : 'New Collection'}</h3>

        <div className="editor-form">
          <div className="form-group">
            <label>Collection Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Active Research"
              autoFocus
            />
          </div>

          <div className="query-builder">
            <h4>Query Rules</h4>
            <p className="query-help">Objects must match these criteria:</p>

            <TagSelector
              label="Has ALL of these tags (AND)"
              selectedTags={query.all}
              onTagsChange={(tags) => setQuery({ ...query, all: tags })}
              availableTags={availableTags}
            />

            <TagSelector
              label="Has ANY of these tags (OR)"
              selectedTags={query.any}
              onTagsChange={(tags) => setQuery({ ...query, any: tags })}
              availableTags={availableTags}
            />

            <TagSelector
              label="Has NONE of these tags (NOT)"
              selectedTags={query.none}
              onTagsChange={(tags) => setQuery({ ...query, none: tags })}
              availableTags={availableTags}
            />
          </div>

          {error && <div className="error-message">{error}</div>}
          {warnings.length > 0 && (
            <div className="warnings-message">
              <strong>Warnings:</strong>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="editor-actions">
            <button type="button" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="primary"
            >
              {saving ? 'Saving...' : 'Save Collection'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Main collections sidebar component
 */
export default function CollectionsSidebar() {
  const [editorOpen, setEditorOpen] = useState(false);
  const [collectionToEdit, setCollectionToEdit] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const collections = useCollectionsStore((state) => state.getAllCollections());
  const activeCollectionId = useCollectionsStore((state) => state.activeCollectionId);
  const toggleCollection = useCollectionsStore((state) => state.toggleCollection);
  const createCollection = useCollectionsStore((state) => state.createCollection);
  const updateCollection = useCollectionsStore((state) => state.updateCollection);
  const deleteCollection = useCollectionsStore((state) => state.deleteCollection);
  const loadCollections = useCollectionsStore((state) => state.loadCollections);

  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.loadTags);

  useEffect(() => {
    loadCollections();
    loadTags();
  }, [loadCollections, loadTags]);

  const handleCreateCollection = async (data) => {
    return await createCollection(data);
  };

  const handleUpdateCollection = async (data) => {
    return await updateCollection(collectionToEdit.id, data);
  };

  const handleDeleteCollection = async (collectionId) => {
    await deleteCollection(collectionId);
    setDeleteConfirm(null);
  };

  const handleEditClick = (collection) => {
    setCollectionToEdit(collection);
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setCollectionToEdit(null);
  };

  return (
    <aside className="collections-sidebar">
      <div className="collections-header">
        <h3>Collections</h3>
        <button
          type="button"
          className="btn-add"
          onClick={() => {
            setCollectionToEdit(null);
            setEditorOpen(true);
          }}
          title="Create new collection"
        >
          +
        </button>
      </div>

      <div className="collections-list">
        {collections.map((collection) => {
          const collectionId = collection.id;
          const isActive = activeCollectionId === collectionId;
          const isSystem = collection.system;
          const isDeleting = deleteConfirm === collectionId;

          return (
            <div key={collectionId} className={`collection-item ${isActive ? 'active' : ''}`}>
              <button
                type="button"
                className="collection-label"
                onClick={() => toggleCollection(collectionId)}
                title={`${isActive ? 'Deactivate' : 'Activate'} collection`}
              >
                <span className="collection-icon">{isActive ? '✓' : ' '}</span>
                <span className="collection-name">{collection.name}</span>
              </button>

              {!isSystem && (
                <div className="collection-actions">
                  <button
                    type="button"
                    className="btn-edit"
                    onClick={() => handleEditClick(collection)}
                    title="Edit collection"
                  >
                    ✎
                  </button>
                  <button
                    type="button"
                    className={`btn-delete ${isDeleting ? 'confirm' : ''}`}
                    onClick={() => {
                      if (isDeleting) {
                        handleDeleteCollection(collectionId);
                      } else {
                        setDeleteConfirm(collectionId);
                      }
                    }}
                    title={isDeleting ? 'Click to confirm delete' : 'Delete collection'}
                  >
                    {isDeleting ? '⟳' : '✕'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <CollectionEditor
        isOpen={editorOpen}
        onClose={handleCloseEditor}
        onSave={collectionToEdit ? handleUpdateCollection : handleCreateCollection}
        collectionToEdit={collectionToEdit}
        availableTags={tags}
      />
    </aside>
  );
}
