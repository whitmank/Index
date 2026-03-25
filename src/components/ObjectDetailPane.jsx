// Author: Claude Sonnet 4.6
// ObjectDetailPane — inline detail pane shown to the right of the list view.
// Adapted from _archive/ObjectDetailSidebar.jsx: removed overlay positioning,
// resize handle, open/close animation, graph label field, delete button, and undo.
// Parent mounts/unmounts this component by controlling objectId.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore, HOME_SPACE_ID } from '../store/index';
import TagAssignmentSection from './TagAssignmentSection';
import './ObjectDetailPane.css';

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
  const objects = useIndexStore(state => state.objects);
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

  // Sync sources when object changes; enter edit mode if requested
  useEffect(() => {
    if (object) {
      setSources(object.sources || []);
      setTitleValue(object.name || '');
      setIsEditingTitle(editNameOnMount);
      setIsAddingSource(false);
    }
  }, [object?.id]);

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
  const subtitle = isSpace ? null : getSourceSubtitle(object);
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
      <div className={`detail-pane-type-badge${isSpace ? ' is-space' : ''}`}>
        {typeBadge}
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
      {subtitle && <p className="detail-pane-subtitle">{subtitle}</p>}
    </div>
  );

  const sharedInfo = object.system ? null : (
    <div className="sidebar-section">
      <div className="sidebar-section-title">Information</div>
      <div className="detail-info-grid">
        <span className="detail-info-label">Created</span>
        <span className="detail-info-value">{formatFullDate(object.created_at)}</span>
        <span className="detail-info-label">Modified</span>
        <span className="detail-info-value">{formatFullDate(object.updated_at)}</span>
      </div>
    </div>
  );

  if (isSpace) {
    const query = object.query || {};
    const hasRules = query.all?.length || query.any?.length || query.none?.length;

    return (
      <aside className="object-detail-pane">
        {sharedHeader}
        <div className="detail-pane-content">
          {sharedInfo}
          <div className="sidebar-section">
            <div className="sidebar-section-title">Rules</div>
            {hasRules ? (
              <div className="space-rules">
                {query.all?.length > 0 && <div className="space-rule-row"><span className="space-rule-label">All of</span><span className="space-rule-tags">{query.all.join(', ')}</span></div>}
                {query.any?.length > 0 && <div className="space-rule-row"><span className="space-rule-label">Any of</span><span className="space-rule-tags">{query.any.join(', ')}</span></div>}
                {query.none?.length > 0 && <div className="space-rule-row"><span className="space-rule-label">None of</span><span className="space-rule-tags">{query.none.join(', ')}</span></div>}
              </div>
            ) : (
              <p className="space-rules-empty">No rules defined. Objects are added manually.</p>
            )}
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

        {/* Sources section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Sources</div>
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
                  title={source.uri}
                >
                  {source.uri}
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

            {!isAddingSource && (
              <button className="source-add-btn" onClick={() => setIsAddingSource(true)}>
                + Add source
              </button>
            )}
          </div>
        </div>

        {/* Tags section */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Tags</div>
          <TagAssignmentSection objectId={object.id} />
        </div>
      </div>
    </aside>
  );
}
