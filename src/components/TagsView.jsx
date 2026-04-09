// Author: Claude Code
// TagsView — two-panel tag library.
// Left column: section headers. Right column: contents of selected section.
// Tags are grouped by type via typedEdges (tag_definitions→typed→tag_types).

import { useState, useRef, useEffect } from 'react';
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
  const deleteTagType = useIndexStore(s => s.deleteTagType);

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

  const typeTagType  = tagTypes.find(t => (t.name ?? '').toLowerCase() === 'type');
  const sortedTypes  = [...tagTypes]
    .filter(t => (t.name ?? '').toLowerCase() !== 'type')
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

  const [activeSection, setActiveSection] = useState(() => typeTagType?.id ?? '_user');
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
        {typeTagType && (
          <div
            className={`tags-nav-item${activeSection === typeTagType.id ? ' active' : ''}`}
            onClick={() => setActiveSection(typeTagType.id)}
          >
            <span className="tags-nav-label">Types</span>
                      </div>
        )}

        <div className="tags-nav-divider">
          <span className="tags-nav-section-label">Tag Types</span>
        </div>

        <button
          className={`tags-nav-item${activeSection === '_user' ? ' active' : ''}`}
          onClick={() => setActiveSection('_user')}
        >
          <span className="tags-nav-label tags-nav-label--untyped">∅</span>
                  </button>

        {sortedTypes.map(tt => (
          <div
            key={tt.id}
            className={`tags-nav-item${activeSection === tt.id ? ' active' : ''}`}
            onClick={() => setActiveSection(tt.id)}
          >
            <span className="tags-nav-label">{tt.label}</span>
                        <button
              className="tags-nav-delete-type"
              onClick={e => { e.stopPropagation(); deleteTagType(tt.id); if (activeSection === tt.id) setActiveSection('_user'); }}
              title="Delete type"
            >×</button>
          </div>
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
          const activeType = [typeTagType, ...sortedTypes].find(tt => tt?.id === activeSection);
          return activeType?.description
            ? <p className="tags-type-description">{activeType.description}</p>
            : null;
        })()}

        {typeTagType && activeSection === typeTagType.id && (
          <TypesPanel
            key={typeTagType.id}
            typeRecord={typeTagType}
            tags={systemByTypeId[typeTagType.id] ?? []}
            tagTypes={tagTypes}
            onCreateTag={createTag}
            onDeleteTag={deleteTag}
          />
        )}
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
            onSave={async (data) => {
              try { await onCreateTag(data); }
              catch (e) { console.error('[UserTagsSection] createTag failed:', e); }
              setCreatingNew(false);
            }}
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

// ── Types Panel ───────────────────────────────────────────────────────────────
// Renders the list of type values (book, song, …). Clicking a row expands an
// inline schema editor showing which tag types are attached to that type.

const SYSTEM_TYPE_NAMES = new Set(['type', 'medium', 'file', 'origin']);

function TypesPanel({ typeRecord, tags, tagTypes, onCreateTag, onDeleteTag }) {
  const updateTag = useIndexStore(s => s.updateTag);
  const [selectedId, setSelectedId] = useState(null);
  const [addingNew,  setAddingNew]  = useState(false);

  const sorted = [...tags].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
  const selectedTag = sorted.find(t => t.id === selectedId) ?? null;

  return (
    <div className="types-panel-layout">
      <section className="tags-section types-list-col">
        <ul className="tags-list">
          {sorted.map(tag => (
            <li key={tag.id}
                className={`tag-row type-row${selectedId === tag.id ? ' selected' : ''}`}
                onClick={() => setSelectedId(selectedId === tag.id ? null : tag.id)}
            >
              <span className="tag-name">{tag.name}</span>
              <button className="tag-delete-btn"
                onClick={e => { e.stopPropagation(); onDeleteTag(tag.id); if (selectedId === tag.id) setSelectedId(null); }}
                title="Delete">×</button>
            </li>
          ))}
          {addingNew && (
            <NewTagRow
              onSave={async (data) => {
                try { await onCreateTag({ ...data, system: true, typeId: typeRecord.id }); }
                catch (e) { console.error('[TypesPanel] createTag failed:', e); }
                setAddingNew(false);
              }}
              onCancel={() => setAddingNew(false)}
            />
          )}
        </ul>
        {!addingNew && (
          <button className="tags-new-btn" onClick={() => setAddingNew(true)}>+ New</button>
        )}
      </section>

      <div className="types-schema-col">
        {selectedTag ? (
          <TypeSchemaEditor
            tag={selectedTag}
            tagTypes={tagTypes}
            onUpdate={schema => updateTag(selectedTag.id, { schema })}
          />
        ) : (
          <p className="types-schema-empty">Select a type to edit its schema</p>
        )}
      </div>
    </div>
  );
}

function TypeSchemaEditor({ tag, tagTypes, onUpdate }) {
  const createTagType = useIndexStore(s => s.createTagType);
  const [adding,  setAdding]  = useState(false);
  const [draft,   setDraft]   = useState('');
  const [hlIndex, setHlIndex] = useState(-1);
  const inputRef = useRef(null);

  const schema = tag.schema || [];

  const fieldTypes = tagTypes.filter(t =>
    !SYSTEM_TYPE_NAMES.has((t.name ?? '').toLowerCase()) &&
    !schema.includes(t.id)
  );

  const suggestions = draft.trim()
    ? fieldTypes.filter(t => (t.label ?? t.name ?? '').toLowerCase().includes(draft.trim().toLowerCase()))
    : fieldTypes;

  const commitAdding = async () => {
    const name = draft.trim();
    if (!name) { cancelAdding(); return; }

    const exact = fieldTypes.find(t =>
      (t.label ?? t.name ?? '').toLowerCase() === name.toLowerCase()
    );

    let typeId;
    if (hlIndex >= 0 && suggestions[hlIndex]) {
      typeId = suggestions[hlIndex].id;
    } else if (exact) {
      typeId = exact.id;
    } else {
      const created = await createTagType({ name, label: name });
      typeId = created?.id;
    }

    if (typeId && !schema.includes(typeId)) onUpdate([...schema, typeId]);
    cancelAdding();
  };

  const cancelAdding = () => { setAdding(false); setDraft(''); setHlIndex(-1); };

  useEffect(() => { if (adding) inputRef.current?.focus(); }, [adding]);
  useEffect(() => { setHlIndex(-1); }, [draft]);

  const handleKey = (e) => {
    if (e.key === 'Enter')   { e.preventDefault(); commitAdding(); }
    else if (e.key === 'Escape') cancelAdding();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHlIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHlIndex(i => Math.max(i - 1, -1)); }
  };

  return (
    <div className="type-schema-editor" onClick={e => e.stopPropagation()}>
      <div className="type-schema-label">Schema</div>
      {schema.length === 0 && !adding && <div className="type-schema-empty">No fields defined</div>}
      <ul className="type-schema-fields">
        {schema.map(typeId => {
          const tt = tagTypes.find(t => t.id === typeId);
          if (!tt) return null;
          return (
            <li key={typeId} className="type-schema-field">
              <span className="type-schema-field-name">{tt.label ?? tt.name}</span>
              <button className="type-schema-field-remove"
                onClick={() => onUpdate(schema.filter(id => id !== typeId))}>×</button>
            </li>
          );
        })}
      </ul>

      {adding ? (
        <div className="type-schema-add-wrapper">
          <input
            ref={inputRef}
            className="type-schema-add-input"
            placeholder="Field name…"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => setTimeout(cancelAdding, 120)}
          />
          {suggestions.length > 0 && (
            <ul className="type-schema-suggestions">
              {suggestions.map((tt, i) => (
                <li key={tt.id}
                    className={`type-schema-suggestion${i === hlIndex ? ' highlighted' : ''}`}
                    onMouseDown={e => { e.preventDefault(); onUpdate([...schema, tt.id]); cancelAdding(); }}
                >
                  {tt.label ?? tt.name}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <button className="type-schema-add-btn" onClick={() => setAdding(true)}>+ Add field</button>
      )}
    </div>
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
            onSave={async (data) => {
              try { await onCreateTag({ ...data, system: true, typeId: typeRecord.id }); }
              catch (e) { console.error('[SystemTagGroup] createTag failed:', e); }
              setAddingNew(false);
            }}
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
