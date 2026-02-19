import { useEffect, useState, useRef } from 'react';
import { useTagsStore } from '../store/tags';
import { useHistoryStore } from '../store/history';
import './TagAssignmentSection.css';

/**
 * Convert snake_case to Title Case
 * "media_type" -> "Media Type"
 */
function toTitleCase(str) {
  if (!str) return '';
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Define consistent ordering for system tag types
 * Ensures they appear in the same order regardless of database query order
 */
const SYSTEM_TAG_ORDER = ['media_type', 'file_extension'];

/**
 * Map system tag type to short label
 */
function getTagTypeLabel(type) {
  const labels = {
    media_type: 'TYPE',
    file_extension: 'EXTENSION',
  };
  return labels[type] || toTitleCase(type);
}

function getSortIndex(type) {
  const index = SYSTEM_TAG_ORDER.indexOf(type);
  return index === -1 ? SYSTEM_TAG_ORDER.length : index;
}

/**
 * Helper function to format tag display
 * For system tags: shows key and value separately in human-readable form
 * For user tags: shows "type: name" if type is present, otherwise just "name"
 */
function formatTagDisplay(tag) {
  // System tags: format as "Key: Value" with type label title-cased (value is not capitalized)
  if (tag.system === true && tag.type) {
    const typeLabel = toTitleCase(tag.type);
    const valueName = tag.name || '(empty)';
    return `${typeLabel}: ${valueName}`;
  }

  // User tags: show type:name if type present, else just name (no capitalization)
  if (tag.type) {
    return `${tag.type}: ${tag.name}`;
  }
  return tag.name;
}

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
  const [newTagType, setNewTagType] = useState('');
  const [newTagColor, setNewTagColor] = useState('#666666');
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingTagValue, setEditingTagValue] = useState('');
  const [editingTagType, setEditingTagType] = useState('');
  const nameInputRef = useRef(null);
  const editInputRef = useRef(null);

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


  // Focus name input when entering create mode
  useEffect(() => {
    if (isCreatingTag && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [isCreatingTag]);


  const handleUnassignTag = async (tagId) => {
    try {
      const push = useHistoryStore.getState().push;
      const tag = assignedTags.find((t) => (t.id?.id || t.id) === tagId);
      const tagName = tag ? (tag.name || '(empty)') : 'tag';
      const isSystemTag = tag && tag.system === true && tag.type;

      if (isSystemTag) {
        // For system tags: set value to null instead of deleting
        push({
          description: `Clear ${tag.type} tag`,
          undo: async () => {
            await window.electronAPI.db.assignTag(objectId, tagId);
            // Reload tags for this object to update local state
            const result = await window.electronAPI.db.getTagsForObject(objectId);
            if (result.success) {
              setAssignedTags(result.data || []);
            }
          },
        });

        // Find or create the null-valued system tag for this type
        const nullTagResult = await window.electronAPI.db.findOrCreateSystemTag(
          tag.type,
          null
        );

        if (nullTagResult && nullTagResult.success && nullTagResult.data) {
          const nullTagId = nullTagResult.data;
          // Reassign to the null-valued tag
          await window.electronAPI.db.assignTag(objectId, nullTagId);
          // Unassign from the current tag
          await unassignTag(objectId, tagId);
        } else {
          throw new Error('Failed to clear system tag');
        }
      } else {
        // For user tags: actually remove the assignment
        push({
          description: `Remove tag "${tagName}"`,
          undo: async () => {
            await window.electronAPI.db.assignTag(objectId, tagId);
            // Reload tags for this object to update local state
            const result = await window.electronAPI.db.getTagsForObject(objectId);
            if (result.success) {
              setAssignedTags(result.data || []);
            }
          },
        });

        await unassignTag(objectId, tagId);
      }

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
      // Create tag with separate name and type fields
      const result = await createTag({
        name: newTagName.trim(),
        type: newTagType.trim() || null,
        color: newTagColor,
        system: false,
      });

      // Get the created tag from result (handle both single tag and array)
      const newTag = Array.isArray(result) ? result[0] : result;
      if (newTag) {
        // Assign the newly created tag
        await assignTag(objectId, newTag.id?.id || newTag.id);
      }

      setNewTagName('');
      setNewTagType('');
      setNewTagColor('#666666');
      setIsCreatingTag(false);
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  const handleCancelCreate = () => {
    setNewTagName('');
    setNewTagType('');
    setNewTagColor('#666666');
    setIsCreatingTag(false);
  };

  const handleEditSystemTag = (tag) => {
    setEditingTagId(tag.id?.id || tag.id);
    setEditingTagValue(tag.name || '');
    setEditingTagType(tag.type || '');
  };

  const handleSaveSystemTag = async (e) => {
    e?.preventDefault();
    if (!editingTagValue.trim()) return;

    try {
      const oldTag = assignedTags.find(t => (t.id?.id || t.id) === editingTagId);
      if (!oldTag) return;

      const newTagName = editingTagValue.trim();
      const tagType = oldTag.type;

      // Find or create the new system tag with the updated value
      // Check if a system tag with this type and name already exists
      let existingTag = tags.find(
        (t) =>
          t.system === true &&
          t.type === tagType &&
          (t.name || '').toLowerCase() === newTagName.toLowerCase()
      );

      let newTagId;

      if (existingTag) {
        // Use existing tag
        newTagId = existingTag.id?.id || existingTag.id;
      } else {
        // Create new tag
        const newTagData = {
          name: newTagName,
          type: tagType,
          system: true,
          color: oldTag.color,
        };

        const newTagResult = await createTag(newTagData);
        const newTag = Array.isArray(newTagResult) ? newTagResult[0] : newTagResult;

        if (!newTag) {
          throw new Error('Failed to create tag');
        }

        newTagId = newTag.id?.id || newTag.id;
      }

      // Assign the new tag
      await assignTag(objectId, newTagId);

      // Unassign the old tag
      await unassignTag(objectId, editingTagId);

      // Reload tags for this object
      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) {
        setAssignedTags(result.data || []);
      }

      // Close editor
      setEditingTagId(null);
      setEditingTagValue('');
      setEditingTagType('');
    } catch (error) {
      console.error('Error saving system tag:', error);
    }
  };

  const handleCancelEditSystemTag = () => {
    setEditingTagId(null);
    setEditingTagValue('');
    setEditingTagType('');
  };

  // Focus input when editing starts
  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  return (
    <div className="sidebar-section tags-section">
      {/* Assigned tags */}
      <div className="tags-container">
        {assignedTags.length === 0 ? (
          <p className="tags-empty">No tags</p>
        ) : (
          (() => {
            // Separate system tags by type and user tags
            const systemTagsByType = {};
            const userTags = [];

            assignedTags.forEach((tag) => {
              if (tag.system === true && tag.type) {
                if (!systemTagsByType[tag.type]) {
                  systemTagsByType[tag.type] = [];
                }
                systemTagsByType[tag.type].push(tag);
              } else {
                userTags.push(tag);
              }
            });

            return (
              <>
                {/* System tags grouped by type, sorted by defined order */}
                {Object.keys(systemTagsByType).length > 0 && (
                  <div className="system-tag-groups-container">
                    {Object.entries(systemTagsByType)
                      .sort(([typeA], [typeB]) => getSortIndex(typeA) - getSortIndex(typeB))
                      .map(([type, tags]) => (
                      <div key={type} className="system-tag-group">
                    <div className="system-tag-header">{getTagTypeLabel(type)}</div>
                    <div className="system-tag-values">
                      {tags.map((tag) => {
                        const tagId = tag.id?.id || tag.id;
                        const isEditing = editingTagId === tagId;

                        if (isEditing) {
                          return (
                            <form
                              key={tagId}
                              onSubmit={handleSaveSystemTag}
                              className="system-tag-edit-form"
                            >
                              <input
                                ref={editInputRef}
                                type="text"
                                value={editingTagValue}
                                onChange={(e) => setEditingTagValue(e.target.value)}
                                className="system-tag-edit-input"
                                onKeyDown={(e) => {
                                  if (e.key === 'Escape') {
                                    handleCancelEditSystemTag();
                                  }
                                }}
                                placeholder="Enter value..."
                              />
                              <div className="system-tag-edit-buttons">
                                <button
                                  type="submit"
                                  className="system-tag-edit-save"
                                  title="Save"
                                >
                                  ✓
                                </button>
                                <button
                                  type="button"
                                  className="system-tag-edit-cancel"
                                  onClick={handleCancelEditSystemTag}
                                  title="Cancel"
                                >
                                  ✕
                                </button>
                              </div>
                            </form>
                          );
                        }

                        return (
                          <div
                            key={tagId}
                            className="tag-badge system-tag-value"
                            style={{ backgroundColor: tag.color || '#666666' }}
                            title="Auto-assigned system tag. Click to edit or × to remove."
                          >
                            <span
                              className="tag-badge-name system-tag-editable"
                              onClick={() => handleEditSystemTag(tag)}
                              role="button"
                              tabIndex={0}
                            >
                              {tag.name || '(empty)'}
                            </span>
                            <button
                              className="tag-badge-remove"
                              onClick={() => handleUnassignTag(tagId)}
                              aria-label={`Remove ${tag.name || 'empty'} tag`}
                            >
                              ×
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                    ))}
                  </div>
                )}

                {/* User tags header and list */}
                {userTags.length > 0 && (
                  <>
                    <p className="sidebar-section-title tags-user-header">Tags</p>
                    <div className="tags-list">
                    {userTags.map((tag) => {
                      const tagId = tag.id?.id || tag.id;
                      return (
                        <div
                          key={tagId}
                          className="tag-badge"
                          style={{ backgroundColor: tag.color || '#666666' }}
                        >
                          <span className="tag-badge-name">{formatTagDisplay(tag)}</span>
                          <button
                            className="tag-badge-remove"
                            onClick={() => handleUnassignTag(tagId)}
                            aria-label={`Remove ${tag.name} tag`}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  </>
                )}
              </>
            );
          })()
        )}
      </div>

      {/* Create tag form */}
      <div className="tag-input-container">
        {isCreatingTag ? (
          <form onSubmit={handleCreateTag} className="tag-create-form">
            <div className="tag-create-inputs">
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Tag name..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="tag-create-input"
              />
              <input
                type="text"
                placeholder="Type (optional)..."
                value={newTagType}
                onChange={(e) => setNewTagType(e.target.value)}
                className="tag-create-type-input"
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
          <button
            className="tag-add-btn"
            onClick={() => setIsCreatingTag(true)}
          >
            + Add tag
          </button>
        )}
      </div>
    </div>
  );
}
