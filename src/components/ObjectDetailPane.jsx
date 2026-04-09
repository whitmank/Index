// Author: Claude Sonnet 4.6
// ObjectDetailPane — inline detail pane shown to the right of the list view.
// Adapted from _archive/ObjectDetailSidebar.jsx: removed overlay positioning,
// resize handle, open/close animation, graph label field, delete button, and undo.
// Parent mounts/unmounts this component by controlling objectId.

import { useEffect, useRef, useState, useMemo } from 'react';
import { useIndexStore, HOME_SPACE_ID } from '../store/index';
import TagAssignmentSection from './TagAssignmentSection';
import SpaceRulesSection from './SpaceRulesSection';
import TypeSchemaSection from './TypeSchemaSection';
import './ObjectDetailPane.css';

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'ico', 'pdf']);

function filePathFromUri(uri) {
  if (!uri || !uri.startsWith('file://')) return null;
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function formatFullDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function getSourceSubtitle(object) {
  const source = object.sources?.[0];
  if (!source) return null;
  const { uri, fileType } = source;
  const parts = [];
  if (fileType) parts.push(fileType.toUpperCase());
  if (uri) {
    try {
      if (uri.startsWith('file://')) {
        const filename = uri.split('/').pop();
        parts.push(filename);
      } else {
        const host = new URL(uri).hostname.replace(/^www\./, '');
        parts.push(host);
      }
    } catch {
      // uri not parseable
    }
  }
  return parts.join(' · ') || null;
}

export default function ObjectDetailPane({ objectId, editNameOnMount = false }) {
  const objects       = useIndexStore(s => s.objects);
  const tagTypes      = useIndexStore(s => s.tagTypes);
  const typedEdges    = useIndexStore(s => s.typedEdges);
  const objectTags    = useIndexStore(s => s.objectTags);
  const loadTagsForObject = useIndexStore(s => s.loadTagsForObject);
  const foundObject = objects.find(obj => obj.id === objectId);

  // Cache last found object so pane doesn't blank on transient re-renders
  const cachedObjectRef = useRef(foundObject);
  if (foundObject) cachedObjectRef.current = foundObject;
  const object = foundObject || cachedObjectRef.current;

  const titleInputRef = useRef(null);
  const addSourceCardRef = useRef(null);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(object?.name || '');
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [isDraggingSource, setIsDraggingSource] = useState(false);
  const [sources, setSources] = useState(object?.sources || []);
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const [isPinned, setIsPinned] = useState(false);
  const [thumb, setThumb] = useState(null);

  // Sync sources when object changes; enter edit mode if requested
  useEffect(() => {
    if (object) {
      setSources(object.sources || []);
      setTitleValue(object.name || '');
      setIsEditingTitle(editNameOnMount);
      setIsAddingSource(false);
    }
  }, [object?.id]);

  // Load thumbnail for local image objects
  useEffect(() => {
    setThumb(null);
    const source = object?.sources?.[0];
    if (!source) return;
    const fileType = source.fileType ?? null;
    if (!IMAGE_TYPES.has(fileType)) return;
    const filePath = filePathFromUri(source.uri);
    if (!filePath) return;
    window.electronAPI?.fs?.thumbnail(filePath, 144).then(dataUrl => {
      if (dataUrl) setThumb(dataUrl);
    });
  }, [object?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (object?.id && !object.system) loadTagsForObject(object.id);
  }, [object?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check pin state whenever the object changes
  useEffect(() => {
    if (!object?.id || object.system) return;
    window.electronAPI.db.isContainedBy(HOME_SPACE_ID, object.id).then(result => {
      if (result.success) setIsPinned(result.data);
    });
  }, [object?.id]);

  const handleTogglePin = async () => {
    if (!object?.id) return;
    if (isPinned) {
      await window.electronAPI.db.removeContains(HOME_SPACE_ID, object.id);
      setIsPinned(false);
    } else {
      await window.electronAPI.db.addContains(HOME_SPACE_ID, object.id);
      setIsPinned(true);
    }
  };

  useEffect(() => {
    window.electronAPI?.device?.getOrigin().then(origin => {
      setDeviceOrigin(origin || 'unknown');
    });
  }, []);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Add-source card drag/drop/paste handlers
  useEffect(() => {
    if (!isAddingSource || !addSourceCardRef.current) return;
    const card = addSourceCardRef.current;
    card.focus();

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingSource(true); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); if (e.target === card) setIsDraggingSource(false); };

    const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingSource(false);
      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const filePath = window.electronAPI.fs.getPathForFile(file);
        await addSourceToObject(`file://${filePath}`);
      }
    };

    const handlePaste = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const text = e.clipboardData?.getData('text');
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        await addSourceToObject(text);
      } else if (e.clipboardData?.files.length > 0) {
        const file = e.clipboardData.files[0];
        const filePath = window.electronAPI.fs.getPathForFile(file);
        await addSourceToObject(`file://${filePath}`);
      }
    };

    card.addEventListener('dragenter', handleDragEnter);
    card.addEventListener('dragover', handleDragOver);
    card.addEventListener('dragleave', handleDragLeave);
    card.addEventListener('drop', handleDrop);
    card.addEventListener('paste', handlePaste);

    return () => {
      card.removeEventListener('dragenter', handleDragEnter);
      card.removeEventListener('dragover', handleDragOver);
      card.removeEventListener('dragleave', handleDragLeave);
      card.removeEventListener('drop', handleDrop);
      card.removeEventListener('paste', handlePaste);
    };
  }, [isAddingSource]);

  const handleSaveTitleEdit = async () => {
    const trimmed = titleValue.trim();
    if (trimmed && trimmed !== object.name) {
      await window.electronAPI.db.updateObject(object.id, { name: trimmed });
    } else {
      setTitleValue(object.name);
    }
    setIsEditingTitle(false);
  };

  const handleCancelTitleEdit = () => {
    setTitleValue(object.name);
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveTitleEdit();
    else if (e.key === 'Escape') handleCancelTitleEdit();
  };

  const addSourceToObject = async (uri) => {
    try {
      const newSource = { uri, origin: deviceOrigin || 'unknown', added_at: new Date().toISOString() };
      const updatedSources = [...sources, newSource];
      setSources(updatedSources);
      await window.electronAPI.db.updateObject(object.id, { sources: updatedSources });
      setIsAddingSource(false);
    } catch (error) {
      console.error('Error adding source:', error);
    }
  };

  const handleBrowseFile = async () => {
    try {
      const result = await window.electronAPI.fs.pickFile();
      if (result.success && result.filePath) {
        await addSourceToObject(`file://${result.filePath}`);
      }
    } catch (error) {
      console.error('Error picking file:', error);
    }
  };

  const handleDeleteSource = async (index) => {
    try {
      const newSources = sources.filter((_, i) => i !== index);
      setSources(newSources);
      await window.electronAPI.db.updateObject(object.id, { sources: newSources });
    } catch (error) {
      console.error('Error deleting source:', error);
    }
  };

  const handleDragStart = (index) => {
    setDragIndex(index);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (index !== dragIndex) setOverIndex(index);
  };

  const handleDragEnd = async () => {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      const reordered = [...sources];
      const [moved] = reordered.splice(dragIndex, 1);
      reordered.splice(overIndex, 0, moved);
      setSources(reordered);
      await window.electronAPI.db.updateObject(object.id, { sources: reordered });
    }
    setDragIndex(null);
    setOverIndex(null);
  };

  if (!object) return null;

  const isSpace = object.space === true;
  const typeBadge = isSpace ? '○' : '●';

  const sharedHeader = (
    <div className="detail-pane-header">
      {!object.system && (
        <button
          className={`detail-pane-pin-btn${isPinned ? ' pinned' : ''}`}
          onClick={handleTogglePin}
          title={isPinned ? 'Unpin from ~' : 'Pin to ~'}
        >
          ◈
        </button>
      )}
      <div className={`detail-pane-type-badge${isSpace ? ' is-space' : ''}${thumb ? ' has-thumb' : ''}`}>
        {thumb
          ? <img className="detail-pane-thumb" src={thumb} alt="" />
          : typeBadge
        }
      </div>
      {isEditingTitle ? (
        <input
          ref={titleInputRef}
          type="text"
          value={titleValue}
          onChange={(e) => setTitleValue(e.target.value)}
          onBlur={handleSaveTitleEdit}
          onKeyDown={handleTitleKeyDown}
          className="detail-pane-title-input"
        />
      ) : (
        <h2 className="detail-pane-title" onClick={() => setIsEditingTitle(true)}>
          {object.name || 'Untitled'}
        </h2>
      )}
    </div>
  );

  const typeType   = tagTypes.find(t => (t.name ?? '').toLowerCase() === 'type');
  const objectTagList = objectTags[objectId] || [];
  const typeTag    = typeType
    ? objectTagList.find(tag => tag.name && typedEdges.some(e => e.in === tag.id && e.out === typeType.id))
    : null;

  const sharedInfo = object.system ? null : (
    <div className="detail-info-block">
      <div className="detail-added-row">
        <span className="detail-added-label">Type</span>
        <TypeField objectId={object.id} />
      </div>
      <div className="detail-added-row">
        <span className="detail-added-label">Added</span>
        <span className="detail-added-value">{formatFullDate(object.created_at)}</span>
      </div>
    </div>
  );

  if (isSpace) {
    return (
      <aside className="object-detail-pane">
        {sharedHeader}
        <div className="detail-pane-content">
          {sharedInfo}
          <div className="sidebar-section">
            <div className="sidebar-section-title">Rules</div>
            <SpaceRulesSection spaceId={object.id} query={object.query || {}} />
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="object-detail-pane">
      {sharedHeader}
      <div className="detail-pane-content">
        {sharedInfo}

        {typeTag?.schema?.length > 0 && (
          <TypeSchemaSection objectId={objectId} typeTag={typeTag} />
        )}

        {/* Sources section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">
            Sources
            {!isAddingSource && (
              <button className="sidebar-section-add-btn" onClick={() => setIsAddingSource(true)} title="Add source">
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor"/>
                  <line x1="8" y1="4.5" x2="8" y2="11.5" stroke="currentColor" strokeLinecap="round"/>
                  <line x1="4.5" y1="8" x2="11.5" y2="8" stroke="currentColor" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>
          <div className="sources-list">
            {sources.map((source, index) => (
              <div
                key={index}
                className={`source-item-wrapper${dragIndex === index ? ' dragging' : ''}${overIndex === index ? ' drag-over' : ''}`}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
              >
                <span className="source-drag-handle" title="Drag to reorder">⠿</span>
                <button
                  className="source-item"
                  onClick={() => source.uri && window.electronAPI?.openSource?.(source.uri)}
                >
                  {source.uri && (() => {
                    try {
                      const label = source.uri.startsWith('file://')
                        ? source.uri.split('/').pop()
                        : new URL(source.uri).hostname.replace(/^www\./, '');
                      return <>
                        <span className="source-item-uri source-item-uri-short">{label}</span>
                        <span className="source-item-uri source-item-uri-full">{source.uri}</span>
                      </>;
                    } catch { return null; }
                  })()}
                </button>
                <button
                  className="source-item-delete"
                  onClick={() => handleDeleteSource(index)}
                  title="Remove source"
                >
                  ×
                </button>
              </div>
            ))}

            {isAddingSource && (
              <div
                ref={addSourceCardRef}
                className={`source-add-card ${isDraggingSource ? 'dragging' : ''}`}
                tabIndex={0}
              >
                <div className="source-add-placeholder">Drop file or paste URL here</div>
                <button className="source-add-browse-btn" onClick={handleBrowseFile}>
                  Browse file
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Tags section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Tags</div>
          <TagAssignmentSection objectId={object.id} excludeTypeIds={typeTag?.schema || []} />
        </div>
      </div>
    </aside>
  );
}

// ── TypeField ─────────────────────────────────────────────────────────────────
// Renders the TYPE system tag for an object using the exact same badge + edit
// form pattern as TagAssignmentSection's system tag groups.

function TypeField({ objectId }) {
  const tagTypes      = useIndexStore(s => s.tagTypes);
  const typedEdges    = useIndexStore(s => s.typedEdges);
  const objectTags    = useIndexStore(s => s.objectTags);
  const loadTagsForObject = useIndexStore(s => s.loadTagsForObject);
  const createTag     = useIndexStore(s => s.createTag);
  const assignTag     = useIndexStore(s => s.assignTag);
  const unassignTag   = useIndexStore(s => s.unassignTag);

  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState('');
  const inputRef                = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const typeType     = tagTypes.find(t => (t.name ?? '').toLowerCase() === 'type');
  const assignedTags = objectTags[objectId] || [];
  const typeTag      = typeType
    ? assignedTags.find(tag => tag.name && typedEdges.some(e => e.in === tag.id && e.out === typeType.id))
    : null;

  const cancelEdit = () => { setEditing(false); setDraft(''); };

  const handleSave = async () => {
    const name = draft.trim();
    cancelEdit();
    if (!name || name === typeTag?.name) return;
    try {
      const newTag = await createTag({ name, system: true, typeId: typeType?.id });
      if (!newTag?.id) return;
      await assignTag(objectId, newTag.id);
      if (typeTag) await unassignTag(objectId, typeTag.id);
      await loadTagsForObject(objectId);
    } catch (err) {
      console.error('[TypeField] save failed:', err);
    }
  };

  const handleUnassign = async () => {
    if (!typeTag) return;
    try {
      await unassignTag(objectId, typeTag.id);
      await loadTagsForObject(objectId);
    } catch (err) {
      console.error('[TypeField] unassign failed:', err);
    }
  };

  if (editing) {
    return (
      <form className="system-tag-edit-form" onSubmit={e => { e.preventDefault(); handleSave(); }}>
        <input
          ref={inputRef}
          className="system-tag-edit-input"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
          placeholder="Enter value…"
        />
        <button type="submit" className="system-tag-edit-save">✓</button>
        <button type="button" className="system-tag-edit-cancel" onClick={cancelEdit}>✕</button>
      </form>
    );
  }

  if (typeTag) {
    return (
      <div className="tag-badge" style={{ backgroundColor: typeTag.color || '#666' }}>
        <span
          className="tag-badge-name editable"
          onClick={() => { setDraft(typeTag.name || ''); setEditing(true); }}
        >
          {typeTag.name || '(empty)'}
        </span>
        <button className="tag-badge-remove" onClick={handleUnassign}>×</button>
      </div>
    );
  }

  return (
    <span
      className="detail-added-value"
      style={{ cursor: 'text', fontStyle: 'italic' }}
      onClick={() => { setDraft(''); setEditing(true); }}
    >
      —
    </span>
  );
}
