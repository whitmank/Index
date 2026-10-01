// Author: Claude Sonnet 4.6
// TagAssignmentSection — tag display and assignment for a single object.
//
// Phase 2 Stage B: display renders from the new-shape pill data
// (store.pillsForObject, populated by db.getPillsForObject), grouped by
// edge name and ordered by the type-Object's schema. Mutations still go
// through the legacy assignTag / unassignTag IPCs; dual-write keeps the
// new-shape pill list in sync automatically.

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useIndexStore } from '../store/index';
import TagAddInput from './TagAddInput';
import './TagAssignmentSection.css';

export default function TagAssignmentSection({ objectId, excludeTypeIds = [], defaultAdding = false }) {
  const tags          = useIndexStore(s => s.tags);
  const tagTypes      = useIndexStore(s => s.tagTypes);
  const typedEdges    = useIndexStore(s => s.typedEdges);
  const objectTags    = useIndexStore(s => s.objectTags);
  const pillsForObject     = useIndexStore(s => s.pillsForObject);
  const loadTagsForObject  = useIndexStore(s => s.loadTagsForObject);
  const loadPillsForObject = useIndexStore(s => s.loadPillsForObject);
  const createTag     = useIndexStore(s => s.createTag);
  const createTagType = useIndexStore(s => s.createTagType);
  const assignTag     = useIndexStore(s => s.assignTag);
  const unassignTag   = useIndexStore(s => s.unassignTag);

  const assignedTags = objectTags[objectId] || [];
  const pills        = pillsForObject[objectId] || [];
  const [isAdding,     setIsAdding]     = useState(defaultAdding);
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingValue, setEditingValue] = useState('');

  const editInputRef = useRef(null);

  const getTagTypeId = useCallback(
    (tagId) => typedEdges.find(e => e.in === tagId)?.out ?? null,
    [typedEdges]
  );

  // Resolve a new-shape pill back to the legacy tag record by matching
  // name + type-name. Needed because mutations still go through legacy IPCs.
  const resolveLegacyTag = useCallback((pill) => {
    const typeRecord = tagTypes.find(t =>
      (t.name ?? '').toLowerCase() === (pill.edge ?? '').toLowerCase()
    );
    if (!typeRecord) return null;
    return assignedTags.find(tag => {
      if ((tag.name ?? null) !== (pill.targetName ?? null)) return false;
      return getTagTypeId(tag.id) === typeRecord.id;
    }) || null;
  }, [tagTypes, assignedTags, getTagTypeId]);

  useEffect(() => {
    loadTagsForObject(objectId);
    loadPillsForObject(objectId);
  }, [objectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch pills when the cache gets evicted by live events.
  useEffect(() => {
    if (!pillsForObject[objectId]) loadPillsForObject(objectId);
  }, [pillsForObject, objectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    await loadPillsForObject(objectId);
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
    await loadPillsForObject(objectId);
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
    await loadPillsForObject(objectId);
  };

  const cancelEdit = () => { setEditingTagId(null); setEditingValue(''); };

  // Derive display groups from new-shape pills, ordered as returned by the
  // server (schema order from the type-Object's schema array). Pills that fall
  // outside the schema are grouped under a trailing OTHER section — for now
  // the server only returns schema pills, so OTHER is typically empty.
  const pillGroups = useMemo(() => {
    const excludedTypeNames = new Set(
      tagTypes.filter(t => excludeTypeIds.includes(t.id)).map(t => (t.name ?? '').toLowerCase())
    );
    const order = [];
    const byEdge = new Map();
    for (const pill of pills) {
      const edgeKey = (pill.edge ?? '').toLowerCase();
      if (edgeKey === 'type') continue;
      if (excludedTypeNames.has(edgeKey)) continue;
      if (!byEdge.has(pill.edge)) {
        byEdge.set(pill.edge, { edge: pill.edge, edgeName: pill.edgeName, pills: [] });
        order.push(pill.edge);
      }
      byEdge.get(pill.edge).pills.push(pill);
    }
    return order.map(k => byEdge.get(k));
  }, [pills, tagTypes, excludeTypeIds]);

  // User tags (legacy, no type) remain untouched — they're not surfaced via
  // the schema walk and we still render them from the legacy path.
  const userTags = assignedTags.filter(t => !getTagTypeId(t.id));

  const hasAnyTags = pills.length > 0 || userTags.length > 0;

  return (
    <div className="tags-assignment">
      {!hasAnyTags && !isAdding && <p className="tags-empty">No tags</p>}

      {/* New-shape pill groups, schema-ordered */}
      {pillGroups.map(group => {
        const typeRecord = tagTypes.find(t =>
          (t.name ?? '').toLowerCase() === (group.edge ?? '').toLowerCase()
        );
        const label = (typeRecord?.label ?? group.edgeName ?? group.edge ?? '').toUpperCase();
        const isEditable = typeRecord?.editable ?? true;

        return (
          <div key={group.edge} className="tag-group">
            <div className="tag-group-label">{label}</div>
            <div className="tag-group-values">
              {group.pills.map(pill => {
                const legacyTag = resolveLegacyTag(pill);
                const displayName = pill.targetName || legacyTag?.name || '(empty)';
                const color = legacyTag?.color || '#666';
                const pillKey = `${pill.edge}:${pill.targetId}`;

                if (legacyTag && editingTagId === legacyTag.id) {
                  return (
                    <form key={pillKey} className="system-tag-edit-form"
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

                const onClickName = isEditable && legacyTag
                  ? () => { setEditingTagId(legacyTag.id); setEditingValue(legacyTag.name || ''); }
                  : undefined;

                const onRemove = async () => {
                  if (legacyTag) {
                    await handleUnassign(legacyTag.id);
                  } else {
                    // Legacy record missing — refetch and hope dual-write catches up.
                    await loadTagsForObject(objectId);
                    await loadPillsForObject(objectId);
                  }
                };

                return (
                  <div key={pillKey} className="tag-badge" style={{ backgroundColor: color }}>
                    <span
                      className={`tag-badge-name${isEditable && legacyTag ? ' editable' : ''}`}
                      onClick={onClickName}
                      role={onClickName ? 'button' : undefined}
                      tabIndex={onClickName ? 0 : undefined}
                    >
                      {displayName}
                    </span>
                    <button className="tag-badge-remove" onClick={onRemove}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

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


