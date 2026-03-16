// Author: Claude Code
// ObjectListView — list of index objects with Finder-style multi-selection.
// Selection state is local. Store's deleteObject is called directly on Delete key.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIndexStore } from '../store/index';
import './ObjectListView.css';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ObjectRow({ object, isSelected, onClick, onDoubleClick }) {
  const primarySource = object.sources?.[0];
  const uri           = primarySource?.uri ?? null;
  const fileType      = primarySource?.fileType ?? null;

  return (
    <div
      className={`object-row${isSelected ? ' selected' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="object-row-type">{fileType ?? '—'}</span>
      <div className="object-row-main">
        <span className="object-row-name">{object.name || 'Untitled'}</span>
        {uri && <span className="object-row-uri">{uri}</span>}
      </div>
      <span className="object-row-date">{formatDate(object.created_at)}</span>
    </div>
  );
}

export default function ObjectListView({ objects = [], onObjectOpen }) {
  const deleteObject = useIndexStore(s => s.deleteObject);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [anchorId, setAnchorId]       = useState(null);
  const containerRef = useRef(null);

  useEffect(() => { containerRef.current?.focus(); }, []);

  // Sync: remove stale IDs when objects list changes (e.g. after LIVE SELECT delete)
  useEffect(() => {
    const currentIds = new Set(objects.map(o => o.id));
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [objects]);

  const handleRowClick = useCallback((e, id) => {
    e.stopPropagation();

    if (e.shiftKey && anchorId) {
      // Range select from anchor to clicked
      const ids = objects.map(o => o.id);
      const a = ids.indexOf(anchorId);
      const b = ids.indexOf(id);
      if (a === -1 || b === -1) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelectedIds(new Set(ids.slice(lo, hi + 1)));
      // Anchor unchanged on shift-click
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setAnchorId(id);
    } else {
      // Single select
      setSelectedIds(new Set([id]));
      setAnchorId(id);
    }
  }, [objects, anchorId]);

  const handleRowDoubleClick = useCallback((e, id) => {
    e.stopPropagation();
    setSelectedIds(new Set([id]));
    setAnchorId(id);
    onObjectOpen?.(id);
  }, [onObjectOpen]);

  const handleCanvasClick = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
  }, []);

  const handleKeyDown = useCallback(async (e) => {
    if (e.key === 'Escape') {
      setSelectedIds(new Set());
      setAnchorId(null);
      return;
    }

    if (e.key === 'w' || e.key === 's' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const ids = objects.map(o => o.id);
      if (ids.length === 0) return;
      const lastSelected = anchorId && ids.includes(anchorId) ? anchorId : null;
      const currentIndex = lastSelected ? ids.indexOf(lastSelected) : -1;
      const nextIndex = (e.key === 'w' || e.key === 'ArrowUp')
        ? (currentIndex <= 0 ? 0 : currentIndex - 1)
        : (currentIndex >= ids.length - 1 ? ids.length - 1 : currentIndex + 1);
      const nextId = ids[nextIndex];
      setSelectedIds(new Set([nextId]));
      setAnchorId(nextId);
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
      e.preventDefault();
      const toDelete = [...selectedIds];
      setSelectedIds(new Set());
      setAnchorId(null);
      await Promise.all(toDelete.map(id => deleteObject(id).catch(err =>
        console.error('[ObjectListView] Delete failed:', err)
      )));
    }
  }, [objects, anchorId, selectedIds, deleteObject]);

  if (objects.length === 0) {
    return (
      <div ref={containerRef} className="object-list-view" tabIndex={0}>
        <div className="object-list-empty">No objects.</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="object-list-view"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleCanvasClick}
    >
      <div className="object-list">
        {objects.map(obj => (
          <ObjectRow
            key={obj.id}
            object={obj}
            isSelected={selectedIds.has(obj.id)}
            onClick={e => handleRowClick(e, obj.id)}
            onDoubleClick={e => handleRowDoubleClick(e, obj.id)}
          />
        ))}
      </div>
    </div>
  );
}
