// Author: Claude Code
// CreateSpaceModal — three-column drag-and-drop space builder / editor.
// Pass a `space` prop to open in edit mode (pre-populates name + query, calls updateSpace).

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';
import './CreateSpaceModal.css';

const COLUMNS = [
  { slot: 'all',  label: 'Must have ALL', desc: 'Object must carry every one of these tags.' },
  { slot: 'any',  label: 'Has ANY',       desc: 'Object must carry at least one.' },
  { slot: 'none', label: 'Has NONE',      desc: 'Object must not carry any of these.' },
];

export default function CreateSpaceModal({ isOpen, onClose, space }) {
  const isEdit = !!space;

  const tags        = useIndexStore(s => s.tags);
  const createTag   = useIndexStore(s => s.createTag);
  const createSpace = useIndexStore(s => s.createSpace);
  const updateSpace = useIndexStore(s => s.updateSpace);

  const [name, setName]     = useState('');
  const [query, setQuery]   = useState({ all: [], any: [], none: [] });
  const [drag, setDrag]     = useState(null);     // { tagId, fromSlot: 'pool'|'all'|'any'|'none' }
  const [dragOver, setDragOver] = useState(null); // 'pool'|'all'|'any'|'none'
  const [inputs, setInputs] = useState({ all: '', any: '', none: '' });
  const [dropdown, setDropdown] = useState(null); // 'all'|'any'|'none'|null
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  const nameRef = useRef(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setName(isEdit ? space.name : '');
      setQuery(isEdit
        ? { all: [...(space.query?.all || [])], any: [...(space.query?.any || [])], none: [...(space.query?.none || [])] }
        : { all: [], any: [], none: [] }
      );
      setDrag(null);
      setDragOver(null);
      setInputs({ all: '', any: '', none: '' });
      setDropdown(null);
      setError(null);
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Derived
  const assignedIds = new Set([...query.all, ...query.any, ...query.none]);
  const sortedTags = [...tags].sort((a, b) => {
    if (a.system && !b.system) return 1;
    if (!a.system && b.system) return -1;
    return (a.name || '').localeCompare(b.name || '');
  });
  const poolTags = sortedTags.filter(t => !assignedIds.has(t.id));

  const hasQuery = query.all.length + query.any.length + query.none.length > 0;
  const canSubmit = name.trim().length > 0 && !saving;

  // ── Mutations ────────────────────────────────────────────────────────────

  function moveTag(tagId, toSlot) {
    setQuery(prev => {
      const next = {
        all:  prev.all.filter(id => id !== tagId),
        any:  prev.any.filter(id => id !== tagId),
        none: prev.none.filter(id => id !== tagId),
      };
      if (toSlot) next[toSlot] = [...next[toSlot], tagId];
      return next;
    });
  }

  // ── Drag handlers ────────────────────────────────────────────────────────

  function onPillDragStart(e, tagId, fromSlot) {
    e.dataTransfer.effectAllowed = 'move';
    setDrag({ tagId, fromSlot });
  }

  function onPillDragEnd() {
    setDrag(null);
    setDragOver(null);
  }

  function onZoneDragOver(e, slot) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(slot);
  }

  function onZoneDragLeave(e) {
    // Only clear if leaving the zone itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null);
  }

  function onZoneDrop(e, toSlot) {
    e.preventDefault();
    if (drag) moveTag(drag.tagId, toSlot === 'pool' ? null : toSlot);
    setDrag(null);
    setDragOver(null);
  }

  // ── Inline column input ──────────────────────────────────────────────────

  function getColumnSuggestions(slot) {
    const term = inputs[slot].trim().toLowerCase();
    if (!term) return poolTags.slice(0, 8);
    return poolTags.filter(t => t.name.toLowerCase().includes(term)).slice(0, 8);
  }

  // True when the typed text is non-empty and doesn't exactly match any existing tag
  function canCreateForSlot(slot) {
    const term = inputs[slot].trim();
    if (!term) return false;
    return !sortedTags.some(t => t.name.toLowerCase() === term.toLowerCase());
  }

  function addToSlot(slot, tagId) {
    moveTag(tagId, slot);
    setInputs(prev => ({ ...prev, [slot]: '' }));
    setDropdown(null);
  }

  async function createAndAddToSlot(slot) {
    const tagName = inputs[slot].trim();
    if (!tagName) return;
    try {
      const newTag = await createTag({ name: tagName });
      addToSlot(slot, newTag.id);
    } catch (e) {
      setError(e.message);
    }
  }

  function handleColInputChange(slot, value) {
    setInputs(prev => ({ ...prev, [slot]: value }));
    setDropdown(value || poolTags.length > 0 ? slot : null);
  }

  function handleColInputKeyDown(slot, e) {
    const suggestions = getColumnSuggestions(slot);
    if (e.key === 'Enter') {
      if (suggestions.length > 0) {
        addToSlot(slot, suggestions[0].id);
      } else if (canCreateForSlot(slot)) {
        createAndAddToSlot(slot);
      }
    } else if (e.key === 'Escape') {
      setDropdown(null);
      setInputs(prev => ({ ...prev, [slot]: '' }));
    }
  }

  // ── Submit ───────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        await updateSpace(space.id, { name: name.trim(), query });
      } else {
        await createSpace({ name: name.trim(), query, space: true });
      }
      onClose();
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="create-space-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="create-space-modal" role="dialog" aria-modal="true" aria-label={isEdit ? 'Edit space' : 'Create space'}>

        <div className="csm-header">
          <h2 className="csm-title">{isEdit ? 'Edit space' : 'New space'}</h2>
          <button className="csm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="csm-body">

          {/* Name */}
          <div className="csm-field">
            <label className="csm-label" htmlFor="csm-name">Name</label>
            <input
              id="csm-name"
              ref={nameRef}
              className="csm-input"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="e.g. Reading list"
              maxLength={80}
              autoComplete="off"
            />
          </div>

          {/* Tag pool */}
          <div className="csm-pool-section">
            <span className="csm-label">Available tags</span>
            <div
              className={`csm-pool${dragOver === 'pool' ? ' drag-over' : ''}`}
              onDragOver={e => onZoneDragOver(e, 'pool')}
              onDragLeave={onZoneDragLeave}
              onDrop={e => onZoneDrop(e, 'pool')}
            >
              {poolTags.length === 0 && !drag && (
                <span className="csm-pool-empty">All tags assigned</span>
              )}
              {poolTags.map(tag => (
                <span
                  key={tag.id}
                  className={`csm-pill pool${drag?.tagId === tag.id ? ' dragging' : ''}`}
                  draggable
                  onDragStart={e => onPillDragStart(e, tag.id, 'pool')}
                  onDragEnd={onPillDragEnd}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          </div>

          {/* Three columns */}
          <div className="csm-columns">
            {COLUMNS.map(({ slot, label, desc }) => {
              const colTags = query[slot].map(id => sortedTags.find(t => t.id === id)).filter(Boolean);
              const suggestions = getColumnSuggestions(slot);

              return (
                <div
                  key={slot}
                  className={`csm-column col-${slot}${dragOver === slot ? ' drag-over' : ''}`}
                  onDragOver={e => onZoneDragOver(e, slot)}
                  onDragLeave={onZoneDragLeave}
                  onDrop={e => onZoneDrop(e, slot)}
                >
                  <div className="csm-col-header">
                    <span className="csm-col-title">{label}</span>
                    <p className="csm-col-desc">{desc}</p>
                  </div>

                  <div className="csm-col-body">
                    {colTags.length === 0 && (
                      <span className="csm-col-empty">drag or type below</span>
                    )}
                    {colTags.map(tag => (
                      <span
                        key={tag.id}
                        className={`csm-pill col-${slot}${drag?.tagId === tag.id ? ' dragging' : ''}`}
                        draggable
                        onDragStart={e => onPillDragStart(e, tag.id, slot)}
                        onDragEnd={onPillDragEnd}
                      >
                        {tag.name}
                        <span
                          className="csm-pill-remove"
                          role="button"
                          aria-label={`Remove ${tag.name}`}
                          onClick={e => { e.stopPropagation(); moveTag(tag.id, null); }}
                        >
                          ✕
                        </span>
                      </span>
                    ))}
                  </div>

                  <div className="csm-col-input-wrap">
                    <input
                      className="csm-col-input"
                      type="text"
                      value={inputs[slot]}
                      placeholder="+ add tag"
                      autoComplete="off"
                      onChange={e => handleColInputChange(slot, e.target.value)}
                      onFocus={() => setDropdown(slot)}
                      onBlur={() => setTimeout(() => setDropdown(d => d === slot ? null : d), 150)}
                      onKeyDown={e => handleColInputKeyDown(slot, e)}
                    />
                    {dropdown === slot && (suggestions.length > 0 || canCreateForSlot(slot)) && (
                      <div className="csm-col-dropdown">
                        {suggestions.map(tag => (
                          <button
                            key={tag.id}
                            className="csm-dropdown-item"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => addToSlot(slot, tag.id)}
                          >
                            {tag.name}
                          </button>
                        ))}
                        {canCreateForSlot(slot) && (
                          <button
                            className="csm-dropdown-item csm-dropdown-create"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => createAndAddToSlot(slot)}
                          >
                            Create "{inputs[slot].trim()}"
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>

        <div className="csm-footer">
          {error && <span className="csm-error">{error}</span>}
          <button className="csm-btn csm-btn-cancel" onClick={onClose}>Cancel</button>
          <button className="csm-btn csm-btn-create" onClick={handleSubmit} disabled={!canSubmit}>
            {saving ? (isEdit ? 'Saving…' : 'Creating…') : (isEdit ? 'Save changes' : 'Create space')}
          </button>
        </div>

      </div>
    </div>
  );
}
