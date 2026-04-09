// Author: Claude Sonnet 4.6
// TagAddInput — flexible dual-field tag input with autocomplete.
//
// Field 1 is context-sensitive:
//   Single-field mode: field 1 is the tag VALUE.
//     Suggestions filter by value. Single exact match auto-assigns.
//     Ambiguous match reveals field 2 for type disambiguation.
//     No match creates a new typeless tag.
//   Two-field mode (Tab pressed): field 1 becomes TYPE, field 2 is VALUE.
//     Suggestions filter typed tags by type + value.
//     Exact type+value match assigns existing. No match creates new typed tag
//     (auto-creating the type record if it doesn't exist).
//
// Props:
//   tags       — all tag_definition records
//   tagTypes   — all tag_type records
//   typedEdges — typed RELATE edges { id, in, out }
//   onCommit({ existingId?, name?, typeName? })
//   onCancel()

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import './TagAddInput.css';

export default function TagAddInput({ tags, tagTypes, typedEdges, onCommit, onCancel }) {
  const [field1,   setField1]  = useState('');
  const [field2,   setField2]  = useState('');
  const [twoField, setTwoField] = useState(false);
  const [hlIndex,  setHlIndex]  = useState(-1);

  const field1Ref = useRef(null);
  const field2Ref = useRef(null);

  useEffect(() => { field1Ref.current?.focus(); }, []);
  useEffect(() => { if (twoField) field2Ref.current?.focus(); }, [twoField]);
  useEffect(() => { setHlIndex(-1); }, [field1, field2]);

  const tagMeta = useCallback((tag) => {
    const typeId = typedEdges.find(e => e.in === tag.id)?.out ?? null;
    const typeRecord = typeId ? tagTypes.find(t => t.id === typeId) : null;
    return {
      typeId,
      typeName:  typeRecord?.name  ?? null,
      typeLabel: typeRecord?.label ?? null,
    };
  }, [typedEdges, tagTypes]);

  const suggestions = useMemo(() => {
    if (!twoField) {
      const q = field1.trim().toLowerCase();
      if (!q) return [];
      return tags
        .map(tag => ({ tag, ...tagMeta(tag) }))
        .filter(({ tag }) => (tag.name ?? '').toLowerCase().includes(q))
        .map(({ tag, typeId, typeName, typeLabel }) => ({
          id: tag.id, name: tag.name, color: tag.color, typeId, typeName, typeLabel,
        }))
        .slice(0, 8);
    } else {
      const typeQ = field1.trim().toLowerCase();
      const nameQ = field2.trim().toLowerCase();
      if (!typeQ && !nameQ) return [];
      return tags
        .map(tag => ({ tag, ...tagMeta(tag) }))
        .filter(({ tag, typeName, typeLabel }) => {
          const tl = (typeLabel ?? typeName ?? '').toLowerCase();
          if (!tl) return false;
          if (typeQ && !tl.includes(typeQ)) return false;
          if (nameQ && !(tag.name ?? '').toLowerCase().includes(nameQ)) return false;
          return true;
        })
        .map(({ tag, typeId, typeName, typeLabel }) => ({
          id: tag.id, name: tag.name, color: tag.color, typeId, typeName, typeLabel,
        }))
        .slice(0, 8);
    }
  }, [field1, field2, twoField, tags, tagMeta]);

  const commit = () => {
    if (!twoField) {
      const value = field1.trim();
      if (!value) { onCancel(); return; }

      if (hlIndex >= 0 && suggestions[hlIndex]) {
        onCommit({ existingId: suggestions[hlIndex].id });
        return;
      }

      const exactByName = tags.filter(t =>
        (t.name ?? '').toLowerCase() === value.toLowerCase()
      );

      if (exactByName.length === 1) {
        onCommit({ existingId: exactByName[0].id });
        return;
      }

      if (exactByName.length > 1) {
        setTwoField(true);
        return;
      }

      onCommit({ name: value });

    } else {
      const typeName = field1.trim();
      const value    = field2.trim();

      if (!value) { field2Ref.current?.focus(); return; }

      if (hlIndex >= 0 && suggestions[hlIndex]) {
        onCommit({ existingId: suggestions[hlIndex].id });
        return;
      }

      const exact = tags.find(t => {
        if ((t.name ?? '').toLowerCase() !== value.toLowerCase()) return false;
        const { typeLabel, typeName: tn } = tagMeta(t);
        const tl = (typeLabel ?? tn ?? '').toLowerCase();
        return tl === typeName.toLowerCase();
      });
      if (exact) { onCommit({ existingId: exact.id }); return; }

      onCommit({ name: value, typeName: typeName || null });
    }
  };

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHlIndex(i => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHlIndex(i => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleField1Tab = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      setTwoField(true);
    } else {
      handleKey(e);
    }
  };

  return (
    <div className="tag-add-wrapper">
      <div className="tag-add-row">
        <input
          ref={field1Ref}
          className={`tag-field1${twoField ? ' is-type' : ''}`}
          placeholder={twoField ? 'Type…' : 'Tag name…'}
          value={field1}
          onChange={e => setField1(e.target.value)}
          onKeyDown={handleField1Tab}
        />
        {twoField && (
          <input
            ref={field2Ref}
            className="tag-field2"
            placeholder="Value…"
            value={field2}
            onChange={e => setField2(e.target.value)}
            onKeyDown={handleKey}
          />
        )}
        <button
          className="tag-add-submit"
          onMouseDown={e => { e.preventDefault(); commit(); }}
        >↵</button>
      </div>

      {suggestions.length > 0 && (
        <ul className="tag-suggestions">
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              className={`tag-suggestion${i === hlIndex ? ' highlighted' : ''}`}
              onMouseDown={e => { e.preventDefault(); onCommit({ existingId: s.id }); }}
            >
              {s.typeLabel && <span className="suggestion-type">{s.typeLabel}</span>}
              <span className="suggestion-name">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
