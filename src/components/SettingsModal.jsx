import { useEffect, useState, useRef } from 'react';
import './SettingsModal.css';

/**
 * SettingsModal - Settings panel for managing tag types and system configuration
 *
 * Author: Claude Code (Anthropic)
 */
export default function SettingsModal({ isOpen, onClose }) {
  const [tagTypes, setTagTypes] = useState([]);
  const [newTagType, setNewTagType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);
  const isClosingRef = useRef(false);

  // Load tag types on mount
  useEffect(() => {
    if (isOpen) {
      loadTagTypes();
      isClosingRef.current = false;
    }
  }, [isOpen]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const loadTagTypes = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.db.getTagTypes();
      if (result.success) {
        setTagTypes(result.data || []);
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTagType = async (e) => {
    e.preventDefault();
    const trimmed = newTagType.trim();
    if (!trimmed) return;

    try {
      setLoading(true);
      const result = await window.electronAPI.db.createTagType({ name: trimmed });
      if (result.success) {
        setTagTypes([...tagTypes, result.data]);
        setNewTagType('');
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTagType = async (tagTypeId) => {
    try {
      setLoading(true);
      const result = await window.electronAPI.db.deleteTagType(tagTypeId);
      if (result.success) {
        setTagTypes(tagTypes.filter((t) => t.id !== tagTypeId));
        setError(null);
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleClose = () => {
    isClosingRef.current = true;
    onClose();
  };

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className={`settings-overlay ${isClosingRef.current ? 'closing' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`settings-modal ${isClosingRef.current ? 'closing' : ''}`}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={handleClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-content">
          {/* Tag Types Section */}
          <section className="settings-section">
            <h3 className="settings-section-title">Tag Types</h3>
            <p className="settings-section-description">
              Define the types that can be used when tagging objects. Each type allows flexible key-value tagging.
            </p>

            {/* Create new tag type */}
            <form onSubmit={handleCreateTagType} className="tag-type-form">
              <div className="tag-type-input-group">
                <input
                  ref={inputRef}
                  type="text"
                  value={newTagType}
                  onChange={(e) => setNewTagType(e.target.value)}
                  placeholder="Enter new tag type name..."
                  className="tag-type-input"
                  disabled={loading}
                />
                <button
                  type="submit"
                  className="tag-type-create-btn"
                  disabled={loading || !newTagType.trim()}
                >
                  Add Type
                </button>
              </div>
            </form>

            {/* Error message */}
            {error && <div className="settings-error">{error}</div>}

            {/* Tag types list */}
            <div className="tag-types-list">
              {loading && tagTypes.length === 0 ? (
                <p className="tag-types-empty">Loading...</p>
              ) : tagTypes.length === 0 ? (
                <p className="tag-types-empty">No tag types yet. Create one to get started.</p>
              ) : (
                tagTypes.map((type) => (
                  <div key={type.id || type.name} className="tag-type-item">
                    <span className="tag-type-name">{type.name}</span>
                    <button
                      className="tag-type-delete-btn"
                      onClick={() => handleDeleteTagType(type.id || type.name)}
                      disabled={loading}
                      aria-label={`Delete ${type.name} tag type`}
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
