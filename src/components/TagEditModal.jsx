// Author: Claude Sonnet 4.6
// TagEditModal — context-sensitive edit modal for one or more selected objects.
// Single space:   renders SpaceRulesSection (tag rules + device rules).
// Single object:  renders TagAssignmentSection (full typed/untyped input, inline edit).
// Multiple items: batch tag UI with universal/partial display and TagAddInput.

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useIndexStore } from '../store/index';
import TagAssignmentSection from './TagAssignmentSection';
import SpaceRulesSection from './SpaceRulesSection';
import TagAddInput from './TagAddInput';
import './TagEditModal.css';

export default function TagEditModal({ isOpen, onClose, objectIds = [] }) {
  const objects           = useIndexStore(s => s.objects);
  const tags              = useIndexStore(s => s.tags);
  const tagTypes          = useIndexStore(s => s.tagTypes);
  const typedEdges        = useIndexStore(s => s.typedEdges);
  const objectTags        = useIndexStore(s => s.objectTags);
  const loadTagsForObject = useIndexStore(s => s.loadTagsForObject);
  const createTag         = useIndexStore(s => s.createTag);
  const createTagType     = useIndexStore(s => s.createTagType);
  const batchAssignTag    = useIndexStore(s => s.batchAssignTag);
  const batchUnassignTag  = useIndexStore(s => s.batchUnassignTag);
  const unassignTag       = useIndexStore(s => s.unassignTag);
  const assignTag         = useIndexStore(s => s.assignTag);

  const [loading, setLoading] = useState(false);

  const isSingle    = objectIds.length === 1;
  const firstObject = isSingle ? objects.find(o => o.id === objectIds[0]) : null;
  const isSpace     = isSingle && firstObject?.space === true;
  const headerVerb  = isSpace ? 'Edit Rules' : 'Edit Tags';
  const headerLabel = isSingle
    ? (firstObject?.name || 'Untitled')
    : `${objectIds.length} objects`;

  // Load tags for all selected objects when modal opens
  useEffect(() => {
    if (!isOpen || objectIds.length === 0) return;
    setLoading(true);
    Promise.all(objectIds.map(id => loadTagsForObject(id)))
      .finally(() => setLoading(false));
  }, [isOpen, objectIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape closes modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // ── Batch tag derivation (all hooks before early return) ─────────────────

  const allLoaded = isOpen && objectIds.every(id => objectTags[id] !== undefined);

  const universalTags = useMemo(() => {
    if (!allLoaded || objectIds.length === 0) return [];
    const first = objectTags[objectIds[0]] || [];
    return first.filter(tag =>
      objectIds.every(id => (objectTags[id] || []).some(t => t.id === tag.id))
    );
  }, [objectTags, objectIds, allLoaded]);

  const partialTags = useMemo(() => {
    if (!allLoaded || objectIds.length === 0) return [];
    const universalIds = new Set(universalTags.map(t => t.id));
    const seen = new Map();
    objectIds.forEach(id => {
      (objectTags[id] || []).forEach(tag => {
        if (!universalIds.has(tag.id)) seen.set(tag.id, tag);
      });
    });
    return [...seen.values()].map(tag => ({
      ...tag,
      count: objectIds.filter(id => (objectTags[id] || []).some(t => t.id === tag.id)).length,
    }));
  }, [objectTags, objectIds, universalTags, allLoaded]);

  const reloadAll = useCallback(async () => {
    await Promise.all(objectIds.map(id => loadTagsForObject(id)));
  }, [objectIds, loadTagsForObject]);

  if (!isOpen || objectIds.length === 0) return null;

  // ── Batch commit — mirrors TagAssignmentSection.handleCommit ─────────────

  const handleBatchCommit = async ({ existingId, name, typeName }) => {
    try {
      if (existingId) {
        await batchAssignTag(objectIds, existingId);
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
        if (newTag?.id) await batchAssignTag(objectIds, newTag.id);
      }
    } catch (err) {
      console.error('[TagEditModal] handleBatchCommit:', err);
    }
    await reloadAll();
  };

  const handleRemoveUniversal = async (tagId) => {
    await batchUnassignTag(objectIds, tagId);
    await reloadAll();
  };

  const handleRemovePartial = async (tagId) => {
    const havers = objectIds.filter(id => (objectTags[id] || []).some(t => t.id === tagId));
    await Promise.all(havers.map(id => unassignTag(id, tagId)));
    await reloadAll();
  };

  const handleAddPartialToAll = async (tagId) => {
    const lacking = objectIds.filter(id => !(objectTags[id] || []).some(t => t.id === tagId));
    await Promise.all(lacking.map(id => assignTag(id, tagId)));
    await reloadAll();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="tag-edit-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="tag-edit-modal">
        <div className="tag-edit-header">
          <span className="tag-edit-title">
            <span className="tag-edit-label">{headerVerb}</span>
            <span className="tag-edit-subject">{headerLabel}</span>
          </span>
          <button className="tag-edit-close" onClick={onClose}>×</button>
        </div>

        <div className="tag-edit-body">
          {isSpace ? (
            <SpaceRulesSection spaceId={objectIds[0]} query={firstObject.query || {}} />
          ) : isSingle ? (
            <TagAssignmentSection objectId={objectIds[0]} defaultAdding={true} />
          ) : (
            <BatchTagBody
              loading={loading}
              universalTags={universalTags}
              partialTags={partialTags}
              objectCount={objectIds.length}
              tags={tags}
              tagTypes={tagTypes}
              typedEdges={typedEdges}
              onCommit={handleBatchCommit}
              onRemoveUniversal={handleRemoveUniversal}
              onRemovePartial={handleRemovePartial}
              onAddPartialToAll={handleAddPartialToAll}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function BatchTagBody({
  loading,
  universalTags,
  partialTags,
  objectCount,
  tags,
  tagTypes,
  typedEdges,
  onCommit,
  onRemoveUniversal,
  onRemovePartial,
  onAddPartialToAll,
}) {
  const hasAny = universalTags.length > 0 || partialTags.length > 0;

  return (
    <div className="batch-tag-body">
      <TagAddInput
        tags={tags}
        tagTypes={tagTypes}
        typedEdges={typedEdges}
        onCommit={onCommit}
        onCancel={() => {}}
      />

      {loading && <p className="batch-tag-loading">Loading…</p>}

      {!loading && !hasAny && (
        <p className="batch-tag-empty">No tags on selected objects</p>
      )}

      {!loading && universalTags.length > 0 && (
        <div className="batch-tag-group">
          <div className="batch-tag-group-label">ALL {objectCount}</div>
          <div className="batch-tag-pills">
            {universalTags.map(tag => (
              <div key={tag.id} className="tag-badge" style={{ backgroundColor: tag.color || '#666' }}>
                <span className="tag-badge-name">{tag.name}</span>
                <button
                  className="tag-badge-remove"
                  onClick={() => onRemoveUniversal(tag.id)}
                  title={`Remove from all ${objectCount} objects`}
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && partialTags.length > 0 && (
        <div className="batch-tag-group">
          <div className="batch-tag-group-label">SOME</div>
          <div className="batch-tag-pills">
            {partialTags.map(tag => (
              <div key={tag.id} className="tag-badge tag-badge--partial" style={{ backgroundColor: tag.color || '#666' }}>
                <span className="tag-badge-name">{tag.name}</span>
                <span className="tag-badge-count">{tag.count}/{objectCount}</span>
                <button
                  className="tag-badge-action"
                  onClick={() => onAddPartialToAll(tag.id)}
                  title={`Add to all ${objectCount} objects`}
                >+</button>
                <button
                  className="tag-badge-remove"
                  onClick={() => onRemovePartial(tag.id)}
                  title="Remove from objects that have it"
                >×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
