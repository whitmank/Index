// Author: Claude Code
// TagsView — two-panel tag library.
// Left column: section headers. Right column: contents of selected section.
// Tags are grouped by type via typedEdges (tag_definitions→typed→tag_types).

import { useState, useRef } from 'react';
import { useIndexStore } from '../store/index';
import './TagsView.css';

export default function TagsView() {
  const tags       = useIndexStore(s => s.tags);
  const tagTypes   = useIndexStore(s => s.tagTypes);
  const typedEdges = useIndexStore(s => s.typedEdges);
  const createTag     = useIndexStore(s => s.createTag);
  const updateTag     = useIndexStore(s => s.updateTag);
  const deleteTag     = useIndexStore(s => s.deleteTag);
  const createTagType = useIndexStore(s => s.createTagType);

  const alpha = (a, b) => (a.name ?? '').localeCompare(b.name ?? '');

  // Look up the tag_type id for a given tag via typedEdges
  const getTagTypeId = (tagId) => typedEdges.find(e => e.in === tagId)?.out ?? null;

  const userTags   = tags.filter(t => !t.system).sort(alpha);
  const systemTags = tags.filter(t => t.system).sort(alpha);

  // Group system tags by their tag_type record id
  const systemByTypeId = systemTags.reduce((acc, tag) => {
    const typeId = getTagTypeId(tag.id) || '_user';
    if (!acc[typeId]) acc[typeId] = [];
    acc[typeId].push(tag);
    return acc;
  }, {});

  const sortedTypes = [...tagTypes].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const [activeSection, setActiveSection] = useState('_user');
  const [addingType, setAddingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const typeInputRef = useRef(null);

  async function commitNewType() {
    const name = newTypeName.trim();
    setAddingType(false);
    setNewTypeName('');
    if (!name) return;
    const created = await createTagType({ name });
    if (created?.id) setActiveSection(created.id);
  }

  return (
    <div className="tags-view">
      <div className="tags-nav">
        <div className="tags-nav-divider">
          <span className="tags-nav-section-label">Types</span>
        </div>

        <button
          className={`tags-nav-item${activeSection === '_user' ? ' active' : ''}`}
          onClick={() => setActiveSection('_user')}
        >
          <span className="tags-nav-label tags-nav-label--untyped">∅</span>
          <span className="tags-nav-count">{userTags.length}</span>
        </button>

        {sortedTypes.map(tt => (
          <button
            key={tt.id}
            className={`tags-nav-item${activeSection === tt.id ? ' active' : ''}`}
            onClick={() => setActiveSection(tt.id)}
          >
            <span className="tags-nav-label">{tt.label}</span>
            <span className="tags-nav-count">{systemByTypeId[tt.id]?.length ?? 0}</span>
          </button>
        ))}

        {addingType ? (
          <div className="tags-nav-new-type">
            <input
              ref={typeInputRef}
              className="tags-nav-type-input"
              placeholder="Type name"
              value={newTypeName}
              autoFocus
              onChange={e => setNewTypeName(e.target.value)}
              onBlur={commitNewType}
              onKeyDown={e => {
                if (e.key === 'Enter')  commitNewType();
                if (e.key === 'Escape') { setAddingType(false); setNewTypeName(''); }
              }}
            />
          </div>
        ) : (
          <button
            className="tags-nav-add-type"
            onClick={() => setAddingType(true)}
          >
            + New type
          </button>
        )}
      </div>

      <div className="tags-panel">
        {(() => {
          const activeType = sortedTypes.find(tt => tt.id === activeSection);
          return activeType?.description
            ? <p className="tags-type-description">{activeType.description}</p>
            : null;
        })()}

        {activeSection === '_user' && (
          <UserTagsSection
            tags={userTags}
            onCreateTag={createTag}
            onUpdateTag={updateTag}
            onDeleteTag={deleteTag}
          />
        )}
        {sortedTypes.map(tt => activeSection === tt.id && (
          <SystemTagGroup
            key={tt.id}
            typeRecord={tt}
            tags={systemByTypeId[tt.id] ?? []}
            onCreateTag={createTag}
            onDeleteTag={deleteTag}
          />
        ))}
      </div>
    </div>
  );
}

// ── User Tags ─────────────────────────────────────────────────────────────────

function UserTagsSection({ tags, onCreateTag, onUpdateTag, onDeleteTag }) {
  const [creatingNew, setCreatingNew] = useState(false);

  return (
    <section className="tags-section">
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
  const [draft,   setDraft]   = useState(tag.name);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== tag.name) onUpdate({ name: trimmed });
    else setDraft(tag.name);
    setEditing(false);
  }

  return (
    <li className="tag-row">
      <span className="tag-color-swatch" style={{ background: tag.color || 'var(--text-tertiary)' }} />
      {editing ? (
        <input
          className="tag-inline-input"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter')  commitEdit();
            if (e.key === 'Escape') { setDraft(tag.name); setEditing(false); }
          }}
        />
      ) : (
        <span className="tag-name" onClick={() => setEditing(true)} title="Click to edit">
          {tag.name}
        </span>
      )}
      <button className="tag-delete-btn" onClick={onDelete} title="Delete tag">×</button>
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
          if (e.key === 'Enter')  handleSave();
          if (e.key === 'Escape') onCancel();
        }}
      />
    </li>
  );
}

// ── System Tag Group ──────────────────────────────────────────────────────────

function SystemTagGroup({ typeRecord, tags, onCreateTag, onDeleteTag }) {
  const [addingNew, setAddingNew] = useState(false);
  const { editable, deletable } = typeRecord;

  return (
    <section className="tags-section">
      <ul className="tags-list">
        {tags.map(tag => (
          <li key={tag.id} className="tag-row system">
            <span className="tag-color-swatch" style={{ background: tag.color || 'var(--text-tertiary)' }} />
            <span className="tag-name">{tag.name}</span>
            {deletable && (
              <button className="tag-delete-btn" onClick={() => onDeleteTag(tag.id)} title="Delete">×</button>
            )}
          </li>
        ))}
        {addingNew && (
          <NewTagRow
            onSave={async (data) => { await onCreateTag({ ...data, system: true, typeId: typeRecord.id }); setAddingNew(false); }}
            onCancel={() => setAddingNew(false)}
          />
        )}
      </ul>
      {editable && !addingNew && (
        <button className="tags-new-btn" onClick={() => setAddingNew(true)}>+ New</button>
      )}
    </section>
  );
}
