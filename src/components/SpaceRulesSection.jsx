// Author: Claude Sonnet 4.6
// SpaceRulesSection — inline rule editor for the space detail pane.
// Tag groups (All of / Any of / None of) + device groups (From any / Not from).
// Each group shows removable pills and an inline add-input with autocomplete.
// Calls updateSpace on every mutation.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';
import './SpaceRulesSection.css';

const SLOTS = [
  { key: 'all',  label: 'All of',  title: 'Object must carry every tag' },
  { key: 'any',  label: 'Any of',  title: 'Object must carry at least one' },
  { key: 'none', label: 'None of', title: 'Object must not carry any of these' },
];

const DEVICE_SLOTS = [
  { key: 'from_any',  label: 'From any', title: 'Object must originate from at least one of these devices' },
  { key: 'from_none', label: 'Not from',  title: 'Object must not originate from any of these devices' },
];

export default function SpaceRulesSection({ spaceId, query = {} }) {
  const tags        = useIndexStore(s => s.tags);
  const devices     = useIndexStore(s => s.devices);
  const updateSpace = useIndexStore(s => s.updateSpace);

  // Which slot's add-input is open
  const [activeSlot, setActiveSlot] = useState(null);

  const assignedTagIds = new Set([
    ...(query.all  || []),
    ...(query.any  || []),
    ...(query.none || []),
  ]);

  const assignedDeviceIds = new Set([
    ...(query.from_any  || []),
    ...(query.from_none || []),
  ]);

  const tagById    = id => tags.find(t => t.id === id);
  const deviceById = id => devices.find(d => d.id === id);

  const poolTags    = tags.filter(t => t.name && !assignedTagIds.has(t.id));
  const poolDevices = devices.filter(d => !assignedDeviceIds.has(d.id));

  const removeTag = async (slot, tagId) => {
    const next = buildNext(query);
    next[slot] = next[slot].filter(id => id !== tagId);
    await updateSpace(spaceId, { query: next });
  };

  const addTag = async (slot, tagId) => {
    const next = buildNext(query);
    if (!next[slot].includes(tagId)) next[slot] = [...next[slot], tagId];
    await updateSpace(spaceId, { query: next });
    setActiveSlot(null);
  };

  const removeDevice = async (slot, deviceId) => {
    const next = buildNext(query);
    next[slot] = next[slot].filter(id => id !== deviceId);
    await updateSpace(spaceId, { query: next });
  };

  const addDevice = async (slot, deviceId) => {
    const next = buildNext(query);
    if (!next[slot].includes(deviceId)) next[slot] = [...next[slot], deviceId];
    await updateSpace(spaceId, { query: next });
    setActiveSlot(null);
  };

  return (
    <div className="space-rules-section">
      {/* Tag groups */}
      {SLOTS.map(({ key, label, title }) => {
        const slotTags = (query[key] || []).map(id => tagById(id)).filter(Boolean);

        return (
          <div key={key} className="srs-group">
            <div className="srs-label" title={title}>{label}</div>
            <div className="srs-body">
              {slotTags.map(tag => (
                <span key={tag.id} className={`srs-pill srs-pill--${key}`}>
                  <span className="srs-pill-name">{tag.name}</span>
                  <button
                    className="srs-pill-remove"
                    onClick={() => removeTag(key, tag.id)}
                    aria-label={`Remove ${tag.name}`}
                  >×</button>
                </span>
              ))}
              {activeSlot === key ? (
                <RuleTagInput
                  pool={poolTags}
                  onCommit={tagId => addTag(key, tagId)}
                  onCancel={() => setActiveSlot(null)}
                />
              ) : (
                <button
                  className="srs-add-btn"
                  onClick={() => setActiveSlot(key)}
                  aria-label={`Add tag to ${label}`}
                >+</button>
              )}
            </div>
          </div>
        );
      })}

      {/* Divider */}
      <hr className="srs-divider" />

      {/* Device groups */}
      {DEVICE_SLOTS.map(({ key, label, title }) => {
        const slotDevices = (query[key] || []).map(id => deviceById(id)).filter(Boolean);

        return (
          <div key={key} className="srs-group">
            <div className="srs-label" title={title}>{label}</div>
            <div className="srs-body">
              {slotDevices.map(device => (
                <span key={device.id} className={`srs-pill srs-pill--${key}`}>
                  <span className="srs-pill-name">{device.name}</span>
                  <button
                    className="srs-pill-remove"
                    onClick={() => removeDevice(key, device.id)}
                    aria-label={`Remove ${device.name}`}
                  >×</button>
                </span>
              ))}
              {activeSlot === key ? (
                <RuleDeviceInput
                  pool={poolDevices}
                  onCommit={deviceId => addDevice(key, deviceId)}
                  onCancel={() => setActiveSlot(null)}
                />
              ) : (
                <button
                  className="srs-add-btn"
                  onClick={() => setActiveSlot(key)}
                  aria-label={`Add device to ${label}`}
                >+</button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNext(query) {
  return {
    all:       [...(query.all       || [])],
    any:       [...(query.any       || [])],
    none:      [...(query.none      || [])],
    from_any:  [...(query.from_any  || [])],
    from_none: [...(query.from_none || [])],
  };
}

// ── Inline tag search input ───────────────────────────────────────────────────

function RuleTagInput({ pool, onCommit, onCancel }) {
  const [value,   setValue]   = useState('');
  const [hlIndex, setHlIndex] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHlIndex(-1); }, [value]);

  const q = value.trim().toLowerCase();
  const suggestions = q
    ? pool.filter(t => (t.name || '').toLowerCase().includes(q)).slice(0, 8)
    : pool.slice(0, 8);

  const commit = () => {
    if (hlIndex >= 0 && suggestions[hlIndex]) {
      onCommit(suggestions[hlIndex].id);
      return;
    }
    const exact = pool.find(t => t.name.toLowerCase() === q);
    if (exact) onCommit(exact.id);
    else onCancel();
  };

  const handleKey = e => {
    if      (e.key === 'ArrowDown') { e.preventDefault(); setHlIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHlIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); commit(); }
    else if (e.key === 'Escape')    { onCancel(); }
  };

  return (
    <div className="srs-input-wrap">
      <input
        ref={inputRef}
        className="srs-input"
        placeholder="Tag…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => setTimeout(onCancel, 150)}
      />
      {suggestions.length > 0 && (
        <ul className="srs-suggestions">
          {suggestions.map((t, i) => (
            <li
              key={t.id}
              className={`srs-suggestion${i === hlIndex ? ' highlighted' : ''}`}
              onMouseDown={e => { e.preventDefault(); onCommit(t.id); }}
            >
              {t.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Inline device search input ────────────────────────────────────────────────

function RuleDeviceInput({ pool, onCommit, onCancel }) {
  const [value,   setValue]   = useState('');
  const [hlIndex, setHlIndex] = useState(-1);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setHlIndex(-1); }, [value]);

  const q = value.trim().toLowerCase();
  const suggestions = q
    ? pool.filter(d => (d.name || '').toLowerCase().includes(q)).slice(0, 8)
    : pool.slice(0, 8);

  const commit = () => {
    if (hlIndex >= 0 && suggestions[hlIndex]) {
      onCommit(suggestions[hlIndex].id);
      return;
    }
    const exact = pool.find(d => (d.name || '').toLowerCase() === q);
    if (exact) onCommit(exact.id);
    else onCancel();
  };

  const handleKey = e => {
    if      (e.key === 'ArrowDown') { e.preventDefault(); setHlIndex(i => Math.min(i + 1, suggestions.length - 1)); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); setHlIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter')     { e.preventDefault(); commit(); }
    else if (e.key === 'Escape')    { onCancel(); }
  };

  return (
    <div className="srs-input-wrap">
      <input
        ref={inputRef}
        className="srs-input"
        placeholder="Device…"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        onBlur={() => setTimeout(onCancel, 150)}
      />
      {suggestions.length > 0 && (
        <ul className="srs-suggestions">
          {suggestions.map((d, i) => (
            <li
              key={d.id}
              className={`srs-suggestion${i === hlIndex ? ' highlighted' : ''}`}
              onMouseDown={e => { e.preventDefault(); onCommit(d.id); }}
            >
              {d.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
