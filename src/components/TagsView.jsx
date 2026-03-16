// Author: Claude Code
// TagsView — top-level view for managing tag definitions.
// User tags: editable (name, color), deletable.
// System tags: read-only, grouped by type.

import { useState } from 'react';
import { useIndexStore } from '../store/index';
import './TagsView.css';

export default function TagsView() {
  const tags     = useIndexStore(s => s.tags);
  const tagTypes = useIndexStore(s => s.tagTypes);
  const createTag = useIndexStore(s => s.createTag);
  const updateTag = useIndexStore(s => s.updateTag);
  const deleteTag = useIndexStore(s => s.deleteTag);

  const userTags   = tags.filter(t => !t.system);
  const systemTags = tags.filter(t => t.system);

  // Group system tags by their `type` field
  const systemByType = systemTags.reduce((acc, tag) => {
    const key = tag.type || 'other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(tag);
    return acc;
  }, {});

  return (
    <div className="tags-view">
      <UserTagsSection
        tags={userTags}
        onCreateTag={createTag}
        onUpdateTag={updateTag}
        onDeleteTag={deleteTag}
      />
      <SystemTagsSection
        groupedTags={systemByType}
        tagTypes={tagTypes}
        onCreateTag={createTag}
        onDeleteTag={deleteTag}
      />
    </div>
  );
}

// ── User Tags ─────────────────────────────────────────────────────────────────

function UserTagsSection({ tags, onCreateTag, onUpdateTag, onDeleteTag }) {
  const [creatingNew, setCreatingNew] = useState(false);

  return (
    <section className="tags-section">
      <div className="tags-section-header">
        <h2>User Tags</h2>
        <span className="tags-count">{tags.length}</span>
      </div>

      <ul className="tags-list">
        {tags.map(tag => (
          <UserTagRow
            key={tag.id}
            tag={tag}
            onUpdate={updates => onUpdateTag(tag.id, updates)}
            onDelete={() => onDeleteTag(tag.id)}
          />
        ))}
        {creatingNew && (
          <NewTagRow
            onSave={async (data) => { await onCreateTag(data); setCreatingNew(false); }}
            onCancel={() => setCreatingNew(false)}
          />
        )}
      </ul>

      {!creatingNew && (
        <button className="tags-new-btn" onClick={() => setCreatingNew(true)}>
          + New tag
        </button>
      )}
    </section>
  );
}

function UserTagRow({ tag, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tag.name);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tag.name) {
      onUpdate({ name: trimmed });
    } else {
      setDraft(tag.name);
    }
    setEditing(false);
  }

  return (
    <li className="tag-row">
      <span
        className="tag-color-swatch"
        style={{ background: tag.color || 'var(--text-tertiary)' }}
      />
      {editing ? (
        <input
          className="tag-inline-input"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') { setDraft(tag.name); setEditing(false); }
          }}
        />
      ) : (
        <span className="tag-name" onClick={() => setEditing(true)} title="Click to edit">
          {tag.name}
        </span>
      )}
      <button className="tag-delete-btn" onClick={onDelete} title="Delete tag">
        ×
      </button>
    </li>
  );
}

function NewTagRow({ onSave, onCancel }) {
  const [name, setName] = useState('');

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { onCancel(); return; }
    await onSave({ name: trimmed });
  }

  return (
    <li className="tag-row">
      <span className="tag-color-swatch" style={{ background: 'var(--text-tertiary)' }} />
      <input
        className="tag-inline-input"
        placeholder="Tag name"
        value={name}
        autoFocus
        onChange={e => setName(e.target.value)}
        onBlur={handleSave}
        onKeyDown={e => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
    </li>
  );
}

// ── System Tags ───────────────────────────────────────────────────────────────

function SystemTagsSection({ groupedTags, tagTypes, onCreateTag, onDeleteTag }) {
  const typeKeys = Object.keys(groupedTags).sort();
  const anyEditable = typeKeys.some(k => tagTypes[k]?.editable);

  return (
    <section className="tags-section">
      <div className="tags-section-header">
        <h2>System Tags</h2>
        {!anyEditable && <span className="tags-readonly-badge">read-only</span>}
      </div>

      {typeKeys.map(typeKey => {
        const typeDef = tagTypes[typeKey];
        const editable = typeDef?.editable ?? false;
        const deletable = typeDef?.deletable ?? false;
        return (
          <SystemTagGroup
            key={typeKey}
            typeKey={typeKey}
            label={typeDef?.label ?? typeKey}
            tags={groupedTags[typeKey]}
            editable={editable}
            deletable={deletable}
            onCreateTag={onCreateTag}
            onDeleteTag={onDeleteTag}
          />
        );
      })}
    </section>
  );
}

function SystemTagGroup({ typeKey, label, tags, editable, deletable, onCreateTag, onDeleteTag }) {
  const [addingNew, setAddingNew] = useState(false);

  return (
    <div className="system-tags-group">
      <div className="system-tags-group-label">
        {label}
        {editable && !addingNew && (
          <button className="tags-new-btn inline" onClick={() => setAddingNew(true)}>+</button>
        )}
      </div>
      <ul className="tags-list">
        {tags.map(tag => (
          <li key={tag.id} className="tag-row system">
            <span
              className="tag-color-swatch"
              style={{ background: tag.color || 'var(--text-tertiary)' }}
            />
            <span className="tag-name">{tag.name}</span>
            {deletable && (
              <button className="tag-delete-btn" onClick={() => onDeleteTag(tag.id)} title="Delete">×</button>
            )}
          </li>
        ))}
        {addingNew && (
          <NewTagRow
            onSave={async (data) => {
              await onCreateTag({ ...data, system: true, type: typeKey });
              setAddingNew(false);
            }}
            onCancel={() => setAddingNew(false)}
          />
        )}
      </ul>
    </div>
  );
}
