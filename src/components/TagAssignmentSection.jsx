// Author: Claude Sonnet 4.6
// TagAssignmentSection — tag display and assignment for a single object.
// Uses typedEdges from the store to resolve tag types, following the same
// pattern as TagsView. createTag calls mirror TagsView's SystemTagGroup and
// UserTagsSection to avoid duplicating the type/edge wiring logic.

import { useEffect, useState, useRef, useCallback } from 'react';
import { useIndexStore } from '../store/index';
import TagAddInput from './TagAddInput';
import './TagAssignmentSection.css';

export default function TagAssignmentSection({ objectId, excludeTypeIds = [], defaultAdding = false }) {
  const tags          = useIndexStore(s => s.tags);
  const tagTypes      = useIndexStore(s => s.tagTypes);
  const typedEdges    = useIndexStore(s => s.typedEdges);
  const objectTags    = useIndexStore(s => s.objectTags);
  const loadTagsForObject = useIndexStore(s => s.loadTagsForObject);
  const createTag     = useIndexStore(s => s.createTag);
  const createTagType = useIndexStore(s => s.createTagType);
  const assignTag     = useIndexStore(s => s.assignTag);
  const unassignTag   = useIndexStore(s => s.unassignTag);

  const assignedTags = objectTags[objectId] || [];
  const [isAdding,     setIsAdding]     = useState(defaultAdding);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const editInputRef = useRef(null);

  const getTagTypeId = useCallback(
    (tagId) => typedEdges.find(e => e.in === tagId)?.out ?? null,
    [typedEdges]
  );

  useEffect(() => { loadTagsForObject(objectId); }, [objectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editingTagId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingTagId]);

  // Commit from TagAddInput: either assign an existing tag by ID, or
  // find/create the type then create+assign a new tag
  const handleCommit = async ({ existingId, name, typeName }) => {
    try {
      if (existingId) {
        await assignTag(objectId, existingId);
      } else if (name) {
        let typeId = null;
        if (typeName) {
          const lower = typeName.toLowerCase();
          const found = tagTypes.find(t =>
            (t.name ?? '').toLowerCase() === lower ||
            (t.label ?? '').toLowerCase() === lower
          );
          if (found) {
            typeId = found.id;
          } else {
            const newType = await createTagType({ name: typeName, label: typeName });
            typeId = newType?.id ?? null;
          }
        }
        const tagData = typeId ? { name, system: true, typeId } : { name };
        const newTag = await createTag(tagData);
        if (newTag?.id) await assignTag(objectId, newTag.id);
      }
    } catch (err) {
      console.error('[TagAssignmentSection] handleCommit:', err);
    }
    setIsAdding(false);
    await loadTagsForObject(objectId);
  };

  // Unassign — system tags get replaced with a null-value placeholder so the
  // type slot remains visible; user tags are removed outright
  const handleUnassign = async (tagId) => {
    try {
      const typeId = getTagTypeId(tagId);
      if (typeId) {
        const typeRecord = tagTypes.find(t => t.id === typeId);
        if (typeRecord) {
          const nullResult = await window.electronAPI.db.findOrCreateSystemTag(typeRecord.name, null);
          if (nullResult.success) await assignTag(objectId, nullResult.data);
        }
      }
      await unassignTag(objectId, tagId);
    } catch (err) {
      console.error('[TagAssignmentSection] handleUnassign:', err);
    }
    await loadTagsForObject(objectId);
  };

  const handleSaveEdit = async () => {
    const name = editingValue.trim();
    if (!name || !editingTagId) { cancelEdit(); return; }
    try {
      const typeId = getTagTypeId(editingTagId);
      const typeRecord = tagTypes.find(t => t.id === typeId);
      if (typeRecord) {
        const result = await window.electronAPI.db.findOrCreateSystemTag(typeRecord.name, name);
        if (result.success) {
          await assignTag(objectId, result.data);
          await unassignTag(objectId, editingTagId);
        }
      }
    } catch (err) {
      console.error('[TagAssignmentSection] handleSaveEdit:', err);
    }
    cancelEdit();
    await loadTagsForObject(objectId);
  };

  const cancelEdit = () => { setEditingTagId(null); setEditingValue(''); };

  // Derive display groups from assignedTags + typedEdges
  const userTags = assignedTags.filter(t => !getTagTypeId(t.id));
  const systemTagsByTypeId = assignedTags.reduce((acc, tag) => {
    const typeId = getTagTypeId(tag.id);
    if (typeId) {
      if (!acc[typeId]) acc[typeId] = [];
      acc[typeId].push(tag);
    }
    return acc;
  }, {});
  const displayedTypes = [...tagTypes]
    .filter(t => t.display && (t.name ?? '').toLowerCase() !== 'type' && !excludeTypeIds.includes(t.id))
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const hasAnyTags = assignedTags.length > 0;

  return (
    <div className="tags-assignment">
      {!hasAnyTags && !isAdding && <p className="tags-empty">No tags</p>}

      {/* System type groups */}
      {displayedTypes
        .filter(tt => systemTagsByTypeId[tt.id])
        .map(tt => (
          <div key={tt.id} className="tag-group">
            <div className="tag-group-label">{tt.label.toUpperCase()}</div>
            <div className="tag-group-values">
              {systemTagsByTypeId[tt.id].map(tag => {
                const isEditable = tt.editable ?? true;
                if (editingTagId === tag.id) {
                  return (
                    <form key={tag.id} className="system-tag-edit-form"
                      onSubmit={e => { e.preventDefault(); handleSaveEdit(); }}>
                      <input
                        ref={editInputRef}
                        className="system-tag-edit-input"
                        value={editingValue}
                        onChange={e => setEditingValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
                        placeholder="Enter value…"
                      />
                      <button type="submit" className="system-tag-edit-save">✓</button>
                      <button type="button" className="system-tag-edit-cancel" onClick={cancelEdit}>✕</button>
                    </form>
                  );
                }
                return (
                  <div key={tag.id} className="tag-badge" style={{ backgroundColor: tag.color || '#666' }}>
                    <span
                      className={`tag-badge-name${isEditable ? ' editable' : ''}`}
                      onClick={isEditable ? () => { setEditingTagId(tag.id); setEditingValue(tag.name || ''); } : undefined}
                      role={isEditable ? 'button' : undefined}
                      tabIndex={isEditable ? 0 : undefined}
                    >
                      {tag.name || '(empty)'}
                    </span>
                    <button className="tag-badge-remove" onClick={() => handleUnassign(tag.id)}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

      {/* User tags */}
      {userTags.length > 0 && (
        <div className="tag-group">
          <div className="tag-group-values">
            {userTags.map(tag => (
              <div key={tag.id} className="tag-badge" style={{ backgroundColor: tag.color || '#666' }}>
                <span className="tag-badge-name">{tag.name}</span>
                <button className="tag-badge-remove" onClick={() => handleUnassign(tag.id)}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add tag */}
      {isAdding ? (
        <TagAddInput
          tags={tags}
          tagTypes={tagTypes}
          typedEdges={typedEdges}
          onCommit={handleCommit}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button className="tag-add-btn" onClick={() => setIsAdding(true)}>+ Add tag</button>
      )}
    </div>
  );
}


