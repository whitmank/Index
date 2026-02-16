import { useEffect, useState, useRef } from 'react';
import { useTagsStore } from '../store/tags';
import './TagAssignmentSection.css';

/**
 * TagAssignmentSection - Manage tags for an object in the sidebar
 *
 * Author: Claude Code (Anthropic)
 */
export default function TagAssignmentSection({ objectId }) {
  const tags = useTagsStore((state) => state.tags);
  const loadTags = useTagsStore((state) => state.loadTags);
  const assignTag = useTagsStore((state) => state.assignTag);
  const unassignTag = useTagsStore((state) => state.unassignTag);
  const createTag = useTagsStore((state) => state.createTag);

  // Local state for this object's tags
  const [assignedTags, setAssignedTags] = useState([]);
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#666666');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  // Load tags when object changes
  useEffect(() => {
    const loadObjectTags = async () => {
      await loadTags();
      // Fetch tags for this object
      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) {
        console.log('[TagAssignment] Loaded tags:', result.data);
        setAssignedTags(result.data || []);
      }
    };
    loadObjectTags();
  }, [objectId, loadTags]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus input when entering create mode
  useEffect(() => {
    if (isCreatingTag && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isCreatingTag]);

  const assignedTagIds = new Set(assignedTags.map(t => (t.id?.id || t.id)));
  const unassignedTags = tags.filter(t => !assignedTagIds.has(t.id?.id || t.id));

  const handleAssignTag = async (tagId) => {
    try {
      await assignTag(objectId, tagId);
      // Reload tags for this object to update local state
      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) {
        setAssignedTags(result.data || []);
      }
      setShowDropdown(false);
    } catch (error) {
      console.error('Error assigning tag:', error);
    }
  };

  const handleUnassignTag = async (tagId) => {
    try {
      await unassignTag(objectId, tagId);
      // Reload tags for this object to update local state
      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) {
        setAssignedTags(result.data || []);
      }
    } catch (error) {
      console.error('Error unassigning tag:', error);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      // Create tag (store will optimistically add it)
      const result = await createTag({
        name: newTagName.trim(),
        color: newTagColor,
      });

      // Get the created tag from result (handle both single tag and array)
      const newTag = Array.isArray(result) ? result[0] : result;
      if (newTag) {
        // Assign the newly created tag
        await assignTag(objectId, newTag.id?.id || newTag.id);
      }

      setNewTagName('');
      setNewTagColor('#666666');
      setIsCreatingTag(false);
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  const handleCancelCreate = () => {
    setNewTagName('');
    setNewTagColor('#666666');
    setIsCreatingTag(false);
  };

  return (
    <div className="sidebar-section tags-section">
      <p className="sidebar-section-title">Tags</p>

      {/* Assigned tags */}
      <div className="tags-list">
        {assignedTags.length === 0 ? (
          <p className="tags-empty">No tags</p>
        ) : (
          assignedTags.map((tag) => (
            <div
              key={tag.id?.id || tag.id}
              className="tag-badge"
              style={{ backgroundColor: tag.color || '#666666' }}
            >
              <span className="tag-badge-name">{tag.name}</span>
              <button
                className="tag-badge-remove"
                onClick={() => handleUnassignTag(tag.id?.id || tag.id)}
                aria-label={`Remove ${tag.name} tag`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add tag dropdown */}
      <div className="tag-input-container" ref={dropdownRef}>
        <button
          className="tag-add-btn"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          + Add tag
        </button>

        {showDropdown && (
          <div className="tag-dropdown">
            {isCreatingTag ? (
              <form onSubmit={handleCreateTag} className="tag-create-form">
                <div className="tag-create-inputs">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder="Tag name..."
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    className="tag-create-input"
                  />
                  <input
                    type="color"
                    value={newTagColor}
                    onChange={(e) => setNewTagColor(e.target.value)}
                    className="tag-color-picker"
                  />
                </div>
                <div className="tag-create-buttons">
                  <button type="submit" className="tag-create-submit">
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCreate}
                    className="tag-create-cancel"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <>
                {unassignedTags.length === 0 ? (
                  <div className="tag-dropdown-empty">
                    <p>All tags assigned</p>
                    <button
                      className="tag-create-from-dropdown"
                      onClick={() => setIsCreatingTag(true)}
                    >
                      Create new tag
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="tag-dropdown-list">
                      {unassignedTags.map((tag) => (
                        <button
                          key={tag.id?.id || tag.id}
                          className="tag-dropdown-item"
                          onClick={() => handleAssignTag(tag.id?.id || tag.id)}
                        >
                          <span
                            className="tag-dropdown-color"
                            style={{ backgroundColor: tag.color || '#666666' }}
                          />
                          <span className="tag-dropdown-name">{tag.name}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      className="tag-create-from-dropdown"
                      onClick={() => setIsCreatingTag(true)}
                    >
                      Create new tag
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
