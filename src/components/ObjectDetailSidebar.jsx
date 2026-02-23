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
export default function ObjectDetailSidebar({ object, onClose }) {
  const sidebarRef = useRef(null);
  const titleInputRef = useRef(null);
  const addSourceCardRef = useRef(null);
  const updateObject = useObjectsStore((state) => state.updateObject);
  const deleteObject = useObjectsStore((state) => state.deleteObject);
  const loadObjects = useObjectsStore((state) => state.loadObjects);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(object.name);
  const [isClosing, setIsClosing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('rightSidebarWidth');
    return saved ? parseInt(saved, 10) : 260;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [isAddingSource, setIsAddingSource] = useState(false);
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [isDraggingSource, setIsDraggingSource] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 300); // Match animation duration
  };

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

  // Save width to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('rightSidebarWidth', sidebarWidth.toString());
    // Dispatch event to notify App component
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

  // Handle backdrop click
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleDelete = async () => {
    if (window.confirm(`Delete object "${object.name}"?`)) {
      const objectId = object.id.id || object.id;
      const push = useHistoryStore.getState().push;

      // Snapshot object data for undo
      const snapshot = {
        name: object.name,
        sources: object.sources,
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

  const handleOpenSource = () => {
    const uri = object.sources?.[0]?.uri;
    if (uri) {
      window.electronAPI?.openSource?.(uri);
    }
  };

  const handleSaveTitleEdit = async () => {
    const trimmedTitle = titleValue.trim();
    if (trimmedTitle && trimmedTitle !== object.name) {
      const objectId = object.id.id || object.id;
      await updateObject(objectId, { name: trimmedTitle });
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
    if (e.key === 'Enter') {
      handleSaveTitleEdit();
    } else if (e.key === 'Escape') {
      handleCancelTitleEdit();
    }
  };

  const addSourceToObject = async (uri) => {
    try {
      const objectId = object.id.id || object.id;

      // Origin will be determined by backend (web for URLs, device for files)
      // UI just passes the device origin as context
      const newSources = [
        ...(object.sources || []),
        {
          uri,
          origin: deviceOrigin || 'unknown',
          added_at: new Date().toISOString(),
        },
      ];

      await updateObject(objectId, { sources: newSources });
      setIsAddingSource(false);
      await loadObjects();
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
      const objectId = object.id.id || object.id;
      const newSources = object.sources.filter((_, i) => i !== index);

      await updateObject(objectId, { sources: newSources });
      await loadObjects();
    } catch (error) {
      console.error('Error deleting source:', error);
    }
  };


  return (
    <div className={`sidebar-overlay ${isClosing ? 'closing' : ''}`} onClick={handleBackdropClick}>
      <aside
        ref={sidebarRef}
        className={`object-detail-sidebar ${isClosing ? 'closing' : ''} ${isResizing ? 'resizing' : ''}`}
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

        <div className="sidebar-content">
          {/* Sources */}
          {(object.sources && object.sources.length > 0) || isAddingSource ? (
            <div className="sidebar-section">
              <div className="sidebar-section-title">SOURCE</div>
              <div className="sources-list">
                {object.sources?.map((source, index) => {
                  // Extract file extension or determine type
                  let fileType = 'unknown';
                  if (source.uri.startsWith('http://') || source.uri.startsWith('https://')) {
                    fileType = 'url';
                  } else {
                    const match = source.uri.match(/\.([a-z0-9]+)$/i);
                    if (match) {
                      fileType = match[1].toLowerCase();
                    }
                  }

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
          <TagAssignmentSection objectId={object.id.id || object.id} />

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
