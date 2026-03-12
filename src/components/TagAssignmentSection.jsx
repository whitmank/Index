// Author: Claude Code
// TagAssignmentSection — v0.4.
// Phase 5: hardcoded DISPLAYED_SYSTEM_TAG_TYPES, SYSTEM_TAG_ORDER, getTagTypeLabel()
// replaced by tagTypes registry from useIndexStore (sourced from backend domain/tag-types.js).

import { useEffect, useState, useRef } from 'react';
import { useIndexStore } from '../store/index';
import { useHistoryStore } from '../store/history';
import './TagAssignmentSection.css';

function toTitleCase(str) {
  if (!str) return '';
  return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
}

function formatTagDisplay(tag) {
  if (tag.system === true && tag.type) {
    return `${toTitleCase(tag.type)}: ${tag.name || '(empty)'}`;
  }
  if (tag.type) return `${tag.type}: ${tag.name}`;
  return tag.name;
}

export default function TagAssignmentSection({ objectId }) {
  const tags = useIndexStore(state => state.tags);
  const tagTypes = useIndexStore(state => state.tagTypes);
  const createTag = useIndexStore(state => state.createTag);
  const assignTag = useIndexStore(state => state.assignTag);
  const unassignTag = useIndexStore(state => state.unassignTag);

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

  useEffect(() => {
    const loadObjectTags = async () => {
      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) setAssignedTags(result.data || []);
    };
    loadObjectTags();
  }, [objectId]);

  useEffect(() => {
    if (isCreatingTag && nameInputRef.current) nameInputRef.current.focus();
  }, [isCreatingTag]);

  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  const handleUnassignTag = async (tagId) => {
    try {
      const push = useHistoryStore.getState().push;
      const tag = assignedTags.find(t => t.id === tagId);
      const tagName = tag ? (tag.name || '(empty)') : 'tag';
      const isSystemTag = tag && tag.system === true && tag.type;

      const reloadTags = async () => {
        const result = await window.electronAPI.db.getTagsForObject(objectId);
        if (result.success) setAssignedTags(result.data || []);
      };

      if (isSystemTag) {
        push({
          description: `Clear ${tag.type} tag`,
          undo: async () => {
            await window.electronAPI.db.assignTag(objectId, tagId);
            await reloadTags();
          },
        });

        const nullTagResult = await window.electronAPI.db.findOrCreateSystemTag(tag.type, null);
        if (nullTagResult?.success && nullTagResult.data) {
          await window.electronAPI.db.assignTag(objectId, nullTagResult.data);
          await unassignTag(objectId, tagId);
        }
      } else {
        push({
          description: `Remove tag "${tagName}"`,
          undo: async () => {
            await window.electronAPI.db.assignTag(objectId, tagId);
            await reloadTags();
          },
        });
        await unassignTag(objectId, tagId);
      }

      await reloadTags();
    } catch (error) {
      console.error('Error unassigning tag:', error);
    }
  };

  const handleCreateTag = async (e) => {
    e.preventDefault();
    if (!newTagName.trim()) return;

    try {
      const newTag = await createTag({
        name: newTagName.trim(),
        type: newTagType.trim() || null,
        color: newTagColor,
        system: false,
      });

      if (newTag) {
        await assignTag(objectId, newTag.id);
      }

      setNewTagName('');
      setNewTagType('');
      setNewTagColor('#666666');
      setIsCreatingTag(false);

      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) setAssignedTags(result.data || []);
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  const handleSaveSystemTag = async (e) => {
    e?.preventDefault();
    if (!editingTagValue.trim()) return;

    try {
      const oldTag = assignedTags.find(t => t.id === editingTagId);
      if (!oldTag) return;

      const newTagName = editingTagValue.trim();
      const tagType = oldTag.type;

      let existingTag = tags.find(
        t => t.system === true && t.type === tagType && (t.name || '').toLowerCase() === newTagName.toLowerCase()
      );

      let newTagId;
      if (existingTag) {
        newTagId = existingTag.id;
      } else {
        const newTag = await createTag({ name: newTagName, type: tagType, system: true, color: oldTag.color });
        newTagId = newTag?.id;
        if (!newTagId) throw new Error('Failed to create tag');
      }

      await assignTag(objectId, newTagId);
      await unassignTag(objectId, editingTagId);

      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) setAssignedTags(result.data || []);

      setEditingTagId(null);
      setEditingTagValue('');
      setEditingTagType('');
    } catch (error) {
      console.error('Error saving system tag:', error);
    }
  };

  // Build display data driven by tagTypes registry (from backend domain)
  const displayedSystemTypes = Object.entries(tagTypes)
    .filter(([, meta]) => meta.display)
    .sort(([, a], [, b]) => (a.order ?? 99) - (b.order ?? 99))
    .map(([type, meta]) => ({ type, ...meta }));

  const systemTagsByType = {};
  const userTags = [];

  assignedTags.forEach(tag => {
    const typeConfig = tagTypes[tag.type];
    if (tag.system === true && tag.type && typeConfig?.display) {
      if (!systemTagsByType[tag.type]) systemTagsByType[tag.type] = [];
      systemTagsByType[tag.type].push(tag);
    } else if (tag.system !== true) {
      userTags.push(tag);
    }
  });

  return (
    <div className="sidebar-section tags-section">
      <div className="tags-container">
        {assignedTags.length === 0 ? (
          <p className="tags-empty">No tags</p>
        ) : (
          <>
            {displayedSystemTypes.length > 0 && Object.keys(systemTagsByType).length > 0 && (
              <div className="system-tag-groups-container">
                {displayedSystemTypes
                  .filter(({ type }) => systemTagsByType[type])
                  .map(({ type, label }) => (
                    <div key={type} className="system-tag-group">
                      <div className="system-tag-header">{label.toUpperCase()}</div>
                      <div className="system-tag-values">
                        {(systemTagsByType[type] || []).map(tag => {
                          const tagId = tag.id;
                          const isEditing = editingTagId === tagId;
                          const isEditable = tagTypes[tag.type]?.editable ?? true;

                          if (isEditing) {
                            return (
                              <form key={tagId} onSubmit={handleSaveSystemTag} className="system-tag-edit-form">
                                <input
                                  ref={editInputRef}
                                  type="text"
                                  value={editingTagValue}
                                  onChange={e => setEditingTagValue(e.target.value)}
                                  className="system-tag-edit-input"
                                  onKeyDown={e => { if (e.key === 'Escape') { setEditingTagId(null); setEditingTagValue(''); } }}
                                  placeholder="Enter value..."
                                />
                                <div className="system-tag-edit-buttons">
                                  <button type="submit" className="system-tag-edit-save" title="Save">✓</button>
                                  <button type="button" className="system-tag-edit-cancel" onClick={() => { setEditingTagId(null); setEditingTagValue(''); }} title="Cancel">✕</button>
                                </div>
                              </form>
                            );
                          }

                          return (
                            <div
                              key={tagId}
                              className="tag-badge system-tag-value"
                              style={{ backgroundColor: tag.color || '#666666' }}
                            >
                              <span
                                className={`tag-badge-name ${isEditable ? 'system-tag-editable' : ''}`}
                                onClick={isEditable ? () => { setEditingTagId(tagId); setEditingTagValue(tag.name || ''); setEditingTagType(tag.type || ''); } : undefined}
                                role={isEditable ? 'button' : undefined}
                                tabIndex={isEditable ? 0 : undefined}
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

            {userTags.length > 0 && (
              <>
                <p className="sidebar-section-title tags-user-header">Tags</p>
                <div className="tags-list">
                  {userTags.map(tag => {
                    const tagId = tag.id;
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
        )}
      </div>

      <div className="tag-input-container">
        {isCreatingTag ? (
          <form onSubmit={handleCreateTag} className="tag-create-form">
            <div className="tag-create-inputs">
              <input
                ref={nameInputRef}
                type="text"
                placeholder="Tag name..."
                value={newTagName}
                onChange={e => setNewTagName(e.target.value)}
                className="tag-create-input"
              />
              <input
                type="text"
                placeholder="Type (optional)..."
                value={newTagType}
                onChange={e => setNewTagType(e.target.value)}
                className="tag-create-type-input"
              />
              <input
                type="color"
                value={newTagColor}
                onChange={e => setNewTagColor(e.target.value)}
                className="tag-color-picker"
              />
            </div>
            <div className="tag-create-buttons">
              <button type="submit" className="tag-create-submit">Create</button>
              <button type="button" onClick={() => { setNewTagName(''); setNewTagType(''); setNewTagColor('#666666'); setIsCreatingTag(false); }} className="tag-create-cancel">Cancel</button>
            </div>
          </form>
        ) : (
          <button className="tag-add-btn" onClick={() => setIsCreatingTag(true)}>+ Add tag</button>
        )}
      </div>
    </div>
  );
}
