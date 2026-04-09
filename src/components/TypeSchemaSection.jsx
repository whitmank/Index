// Author: Claude Sonnet 4.6
// TypeSchemaSection — renders schema-driven metadata fields for an object based on its type.
// Each field corresponds to a tag type in the type tag definition's schema array.
// Fields are populated from existing typed tags on the object; empty slots are interactive.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';
import './TypeSchemaSection.css';

function SchemaField({ objectId, schemaTypeId, label }) {
  const tagTypes          = useIndexStore(s => s.tagTypes);
  const typedEdges        = useIndexStore(s => s.typedEdges);
  const objectTags        = useIndexStore(s => s.objectTags);
  const createTag         = useIndexStore(s => s.createTag);
  const assignTag         = useIndexStore(s => s.assignTag);
  const unassignTag       = useIndexStore(s => s.unassignTag);
  const loadTagsForObject = useIndexStore(s => s.loadTagsForObject);

  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const inputRef              = useRef(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const assignedTags = objectTags[objectId] || [];
  const valueTag = assignedTags.find(tag =>
    typedEdges.some(e => e.in === tag.id && e.out === schemaTypeId)
  );

  const cancelEdit = () => { setEditing(false); setDraft(''); };

  const handleSave = async () => {
    const name = draft.trim();
    cancelEdit();
    if (!name || name === valueTag?.name) return;
    try {
      const result = await window.electronAPI.db.createTag({ name, typeId: schemaTypeId });
      if (!result.success) return;
      await assignTag(objectId, result.data.id);
      if (valueTag) await unassignTag(objectId, valueTag.id);
      await loadTagsForObject(objectId);
    } catch (err) {
      console.error('[TypeSchemaSection] save failed:', err);
    }
  };

  const handleUnassign = async () => {
    if (!valueTag) return;
    try {
      await unassignTag(objectId, valueTag.id);
      await loadTagsForObject(objectId);
    } catch (err) {
      console.error('[TypeSchemaSection] unassign failed:', err);
    }
  };

  return (
    <div className="schema-field-row">
      <span className="schema-field-label">{label}</span>
      <div className="schema-field-value">
        {editing ? (
          <form
            className="system-tag-edit-form"
            onSubmit={e => { e.preventDefault(); handleSave(); }}
          >
            <input
              ref={inputRef}
              className="system-tag-edit-input"
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') cancelEdit(); }}
              placeholder="Enter value…"
            />
            <button type="submit" className="system-tag-edit-save">✓</button>
            <button type="button" className="system-tag-edit-cancel" onClick={cancelEdit}>✕</button>
          </form>
        ) : valueTag ? (
          <div className="tag-badge" style={{ backgroundColor: valueTag.color || '#666' }}>
            <span
              className="tag-badge-name editable"
              onClick={() => { setDraft(valueTag.name || ''); setEditing(true); }}
            >
              {valueTag.name || '(empty)'}
            </span>
            <button className="tag-badge-remove" onClick={handleUnassign}>×</button>
          </div>
        ) : (
          <span
            className="schema-field-empty"
            onClick={() => { setDraft(''); setEditing(true); }}
          >
            —
          </span>
        )}
      </div>
    </div>
  );
}

export default function TypeSchemaSection({ objectId, typeTag }) {
  const tagTypes = useIndexStore(s => s.tagTypes);

  const schema = typeTag?.schema;
  if (!schema?.length) return null;

  return (
    <div className="sidebar-section">
      <div className="sidebar-section-title">Details</div>
      {schema.map(schemaTypeId => {
        const tagType = tagTypes.find(t => t.id === schemaTypeId);
        if (!tagType) return null;
        return (
          <SchemaField
            key={schemaTypeId}
            objectId={objectId}
            schemaTypeId={schemaTypeId}
            label={tagType.label}
          />
        );
      })}
    </div>
  );
}
