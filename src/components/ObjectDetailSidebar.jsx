import { useEffect, useRef, useState } from 'react';
import { useObjectsStore } from '../store/objects';
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
  const updateObject = useObjectsStore((state) => state.updateObject);
  const deleteObject = useObjectsStore((state) => state.deleteObject);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(object.name);
  const [isClosing, setIsClosing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('rightSidebarWidth');
    return saved ? parseInt(saved, 10) : 260;
  });
  const [isResizing, setIsResizing] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(onClose, 300); // Match animation duration
  };

  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  // Focus title input when entering edit mode
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

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
      await deleteObject(objectId);
      handleClose();
    }
  };

  const handleOpenSource = () => {
    const source = object.source_local || object.source_remote;
    window.electronAPI?.openSource?.(source);
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
          {/* Source */}
          <div className="sidebar-section">
            <div className="source-path" onClick={handleOpenSource}>
              {object.source_local || object.source_remote}
            </div>
          </div>

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
