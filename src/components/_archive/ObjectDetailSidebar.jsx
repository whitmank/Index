// Author: Claude Code
// ObjectDetailSidebar — v0.4.
// Updated: imports from useIndexStore; deleteObject undo uses LIVE SELECT (no manual loadObjects).

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';
import { useHistoryStore } from '../store/history';
import TagAssignmentSection from './TagAssignmentSection';
import './ObjectDetailSidebar.css';

const normalizeId = (id) => id;

export default function ObjectDetailSidebar({ objectId, isOpen, onClose }) {
  const objects = useIndexStore(state => state.objects);
  const foundObject = objects.find(obj => normalizeId(obj.id) === normalizeId(objectId));

  const cachedObjectRef = useRef(foundObject);
  if (foundObject) cachedObjectRef.current = foundObject;

  const object = foundObject || cachedObjectRef.current;

  const sidebarRef = useRef(null);
  const titleInputRef = useRef(null);
  const addSourceCardRef = useRef(null);
  const deleteObject = useIndexStore(state => state.deleteObject);
  const addObject = useIndexStore(state => state.addObject);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(object?.name || '');
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelValue, setLabelValue] = useState(object?.label || '');
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [isDraggingSource, setIsDraggingSource] = useState(false);
  const [sources, setSources] = useState(object?.sources || []);

  useEffect(() => {
    if (isOpen) {
      setAnimatingOut(false);
      setVisible(true);
    } else if (visible) {
      setAnimatingOut(true);
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  useEffect(() => {
    window.electronAPI?.device?.getOrigin().then(origin => {
      setDeviceOrigin(origin || 'unknown');
    });
  }, []);

  useEffect(() => {
    if (object) setSources(object.sources || []);
  }, [object?.id]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

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

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const newWidth = Math.max(180, Math.min(window.innerWidth - e.clientX, 500));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      window.dispatchEvent(new Event('rightSidebarWidthChange'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    window.dispatchEvent(new Event('rightSidebarWidthChange'));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (isEditingTitle) { e.stopPropagation(); handleCancelTitleEdit(); }
        else { onClose(); }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isEditingTitle]);

  const handleDelete = async () => {
    if (window.confirm(`Delete object "${object.name}"?`)) {
      const id = normalizeId(object.id);
      const push = useHistoryStore.getState().push;

      const snapshot = { name: object.name, sources };
      const tagsResult = await window.electronAPI.db.getTagsForObject(id);
      const userTagIds = (tagsResult.data || [])
        .filter(t => !t.system)
        .map(t => t.id);

      push({
        description: `Delete "${object.name}"`,
        undo: async () => {
          // Recreate — LIVE SELECT pushes the restored object to the store
          const created = await addObject(snapshot);
          const newId = created?.id;
          if (newId) {
            for (const tagId of userTagIds) {
              await window.electronAPI.db.assignTag(newId, tagId);
            }
          }
        },
      });

      await deleteObject(id);
      onClose();
    }
  };

  const handleSaveTitleEdit = async () => {
    const trimmedTitle = titleValue.trim();
    if (trimmedTitle && trimmedTitle !== object.name) {
      await window.electronAPI.db.updateObject(normalizeId(object.id), { name: trimmedTitle });
    } else {
      setTitleValue(object.name);
    }
    setIsEditingTitle(false);
  };

  const handleCancelTitleEdit = () => {
    setTitleValue(object.name);
    setIsEditingTitle(false);
  };

  const handleSaveLabelEdit = async () => {
    const trimmed = labelValue.trim();
    await window.electronAPI.db.updateObject(normalizeId(object.id), { label: trimmed || null });
    setIsEditingLabel(false);
  };

  const handleCancelLabelEdit = () => {
    setLabelValue(object.label || '');
    setIsEditingLabel(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') handleSaveTitleEdit();
    else if (e.key === 'Escape') handleCancelTitleEdit();
  };

  const addSourceToObject = async (uri) => {
    try {
      const id = normalizeId(object.id);
      const newSource = { uri, origin: deviceOrigin || 'unknown', added_at: new Date().toISOString() };
      const updatedSources = [...sources, newSource];
      setSources(updatedSources);
      await window.electronAPI.db.updateObject(id, { sources: updatedSources });
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
      const id = normalizeId(object.id);
      const newSources = sources.filter((_, i) => i !== index);
      setSources(newSources);
      await window.electronAPI.db.updateObject(id, { sources: newSources });
    } catch (error) {
      console.error('Error deleting source:', error);
    }
  };

  if (!visible) return null;

  return (
    <div className="sidebar-overlay">
      <aside
        ref={sidebarRef}
        className={`object-detail-sidebar ${animatingOut ? 'closing' : ''} ${isResizing ? 'resizing' : ''}`}
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="sidebar-header">
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleSaveTitleEdit}
              onKeyDown={handleTitleKeyDown}
              className="sidebar-title-input"
            />
          ) : (
            <h2 className="sidebar-title" onClick={() => setIsEditingTitle(true)}>
              {object.name}
            </h2>
          )}
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close sidebar">✕</button>
        </div>

        <div className="sidebar-label-row">
          {isEditingLabel ? (
            <input
              type="text"
              value={labelValue}
              onChange={(e) => setLabelValue(e.target.value)}
              onBlur={handleSaveLabelEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveLabelEdit();
                else if (e.key === 'Escape') handleCancelLabelEdit();
              }}
              className="sidebar-label-input"
              placeholder="Short display label for graph…"
              maxLength={40}
              autoFocus
            />
          ) : (
            <span
              className={`sidebar-label-display ${object.label ? '' : 'placeholder'}`}
              onClick={() => { setLabelValue(object.label || ''); setIsEditingLabel(true); }}
            >
              {object.label || 'Add graph label…'}
            </span>
          )}
        </div>

        <div className="sidebar-content">
          {(sources && sources.length > 0) || isAddingSource ? (
            <div className="sidebar-section">
              <div className="sidebar-section-title">SOURCE</div>
              <div className="sources-list">
                {sources?.map((source, index) => (
                  <div key={index} className="source-item-wrapper">
                    <button
                      className="source-item"
                      onClick={() => source.uri && window.electronAPI?.openSource?.(source.uri)}
                      title={`Open source: ${source.uri}`}
                    >
                      {source.origin} [{source.fileType || 'unknown'}]
                    </button>
                    <button
                      className="source-item-delete"
                      onClick={() => handleDeleteSource(index)}
                      title="Remove this source"
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
                      📁 Browse file
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
          ) : null}

          <TagAssignmentSection objectId={normalizeId(object.id)} />

          <div className="sidebar-section sidebar-section-delete">
            <button className="delete-btn" onClick={handleDelete}>Delete</button>
          </div>
        </div>
        <div className="sidebar-resize-handle" onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }} />
      </aside>
    </div>
  );
}
