import { useEffect, useRef, useState } from 'react';
import { useObjectsStore } from '../store/objects';
import { useHistoryStore } from '../store/history';
import TagAssignmentSection from './TagAssignmentSection';
import './ObjectDetailSidebar.css';

/**
 * ObjectDetailSidebar - Displays detailed information about a selected graph node
 *
 * Author: Claude Code (Anthropic)
 */

// Helper to normalize object ID (handles both string and {id} formats)
const normalizeId = (id) => (typeof id === 'string' ? id : id?.id);

export default function ObjectDetailSidebar({ objectId, isOpen, onClose }) {
  // Fetch object directly from store by ID, bypassing parent prop dependency
  const objects = useObjectsStore((state) => state.objects);
  const foundObject = objects.find((obj) => normalizeId(obj.id) === normalizeId(objectId));

  // Cache the last valid object to persist through reload gaps
  const cachedObjectRef = useRef(foundObject);
  if (foundObject) {
    cachedObjectRef.current = foundObject;
  }

  // Use cached object to prevent unmounting during transient gaps
  const object = foundObject || cachedObjectRef.current;

  // All hooks must be initialized first (before any early returns)
  const sidebarRef = useRef(null);
  const titleInputRef = useRef(null);
  const addSourceCardRef = useRef(null);
  const deleteObject = useObjectsStore((state) => state.deleteObject);
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

  // Drive mount/unmount and animation from isOpen prop (mirrors SettingsModal)
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

  const handleClose = () => onClose();

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Load device origin on mount
  useEffect(() => {
    window.electronAPI?.device?.getOrigin().then(origin => {
      setDeviceOrigin(origin || 'unknown');
    });
  }, []);

  // Sync local sources when object prop changes
  useEffect(() => {
    if (object) {
      setSources(object.sources || []);
    }
  }, [object?.id]);

  // Focus title input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  // Handle drag and paste on add source card
  useEffect(() => {
    if (!isAddingSource || !addSourceCardRef.current) return;

    const card = addSourceCardRef.current;
    // Focus the card so paste events are captured
    card.focus();

    const handleDragEnter = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingSource(true);
    };

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDragLeave = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.target === card) {
        setIsDraggingSource(false);
      }
    };

    const handleDrop = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingSource(false);

      if (e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        const filePath = window.electronAPI.fs.getPathForFile(file);
        const uri = `file://${filePath}`;
        await addSourceToObject(uri);
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
        const uri = `file://${filePath}`;
        await addSourceToObject(uri);
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

  // Handle resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e) => {
      const newWidth = Math.max(180, Math.min(window.innerWidth - e.clientX, 500)); // Min 180px, max 500px
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Dispatch event to notify App component
      window.dispatchEvent(new Event('rightSidebarWidthChange'));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // Notify App component when width changes
  useEffect(() => {
    window.dispatchEvent(new Event('rightSidebarWidthChange'));
  }, [sidebarWidth]);

  // Handle Escape key to close sidebar or cancel title edit
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        if (isEditingTitle) {
          e.stopPropagation();
          handleCancelTitleEdit();
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isEditingTitle]);

  const handleDelete = async () => {
    if (window.confirm(`Delete object "${object.name}"?`)) {
      const objectId = normalizeId(object.id);
      const push = useHistoryStore.getState().push;

      // Snapshot object data for undo
      const snapshot = {
        name: object.name,
        sources: sources,
      };

      // Get user tags (non-system) assigned to this object
      const tagsResult = await window.electronAPI.db.getTagsForObject(objectId);
      const userTagIds = (tagsResult.data || [])
        .filter((t) => !t.system)
        .map((t) => t.id?.id || t.id);

      // Push undo operation
      push({
        description: `Delete "${object.name}"`,
        undo: async () => {
          // Recreate the object (system tags are auto-assigned)
          const created = await addObject(snapshot);
          const newId = created?.id?.id || created?.id;

          // Reassign user tags
          if (newId) {
            for (const tagId of userTagIds) {
              await window.electronAPI.db.assignTag(newId, tagId);
            }
          }

          // Reload to update the UI
          await useObjectsStore.getState().loadObjects();
        },
      });

      await deleteObject(objectId);
      handleClose();
    }
  };

  const handleSaveTitleEdit = async () => {
    const trimmedTitle = titleValue.trim();
    if (trimmedTitle && trimmedTitle !== object.name) {
      const objectId = normalizeId(object.id);
      await window.electronAPI.db.updateObject(objectId, { name: trimmedTitle });
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
    const objectId = normalizeId(object.id);
    await window.electronAPI.db.updateObject(objectId, { label: trimmed || null });
    setIsEditingLabel(false);
  };

  const handleCancelLabelEdit = () => {
    setLabelValue(object.label || '');
    setIsEditingLabel(false);
  };

  const handleTitleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSaveTitleEdit();
    } else if (e.key === 'Escape') {
      handleCancelTitleEdit();
    }
  };

  const addSourceToObject = async (uri) => {
    try {
      const objectId = normalizeId(object.id);
      const newSource = {
        uri,
        origin: deviceOrigin || 'unknown',
        added_at: new Date().toISOString(),
      };

      // Update local state immediately for instant feedback
      const updatedSources = [...sources, newSource];
      setSources(updatedSources);

      // Send backend update asynchronously (via IPC)
      await window.electronAPI.db.updateObject(objectId, { sources: updatedSources });
    } catch (error) {
      console.error('Error adding source:', error);
    }
  };

  const handleBrowseFile = async () => {
    try {
      const result = await window.electronAPI.fs.pickFile();
      if (result.success && result.filePath) {
        const uri = `file://${result.filePath}`;
        await addSourceToObject(uri);
      }
    } catch (error) {
      console.error('Error picking file:', error);
    }
  };

  const handleDeleteSource = async (index) => {
    try {
      const objectId = normalizeId(object.id);
      const newSources = sources.filter((_, i) => i !== index);

      // Update local state immediately
      setSources(newSources);

      // Send backend update asynchronously (via IPC)
      await window.electronAPI.db.updateObject(objectId, { sources: newSources });
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
          <button className="sidebar-close-btn" onClick={handleClose} aria-label="Close sidebar">
            ✕
          </button>
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
          {/* Sources */}
          {(sources && sources.length > 0) || isAddingSource ? (
            <div className="sidebar-section">
              <div className="sidebar-section-title">SOURCE</div>
              <div className="sources-list">
                {sources?.map((source, index) => {
                  // Use fileType from source (determined by backend)
                  const fileType = source.fileType || 'unknown';

                  return (
                    <div key={index} className="source-item-wrapper">
                      <button
                        className="source-item"
                        onClick={() => {
                          if (source.uri) {
                            window.electronAPI?.openSource?.(source.uri);
                          }
                        }}
                        title={`Open source: ${source.uri}`}
                      >
                        {source.origin} [{fileType}]
                      </button>
                      <button
                        className="source-item-delete"
                        onClick={() => handleDeleteSource(index)}
                        title="Remove this source"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}

                {/* Add source card */}
                {isAddingSource && (
                  <div
                    ref={addSourceCardRef}
                    className={`source-add-card ${isDraggingSource ? 'dragging' : ''}`}
                    tabIndex={0}
                  >
                    <div className="source-add-placeholder">
                      Drop file or paste URL here
                    </div>
                    <button
                      className="source-add-browse-btn"
                      onClick={handleBrowseFile}
                      title="Browse for a file"
                    >
                      📁 Browse file
                    </button>
                  </div>
                )}

                {/* Add source button */}
                {!isAddingSource && (
                  <button
                    className="source-add-btn"
                    onClick={() => setIsAddingSource(true)}
                    title="Add another source"
                  >
                    + Add source
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {/* Tags */}
          <TagAssignmentSection objectId={normalizeId(object.id)} />

          {/* Delete */}
          <div className="sidebar-section sidebar-section-delete">
            <button className="delete-btn" onClick={handleDelete}>
              Delete
            </button>
          </div>
        </div>
        <div className="sidebar-resize-handle" onMouseDown={handleResizeStart} />
      </aside>
    </div>
  );
}
