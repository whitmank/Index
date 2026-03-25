// Author: Claude Code
// ObjectListView — list of index objects with Finder-style multi-selection.
// Selection state is local. Store's deleteObject is called directly on Delete key.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIndexStore } from '../store/index';
import { ObjectIcon, SpaceIcon, MonadIcon } from '../icons/index';
import './ObjectListView.css';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function FilterIcon({ side, combined, size = 12 }) {
  if (combined)              return <MonadIcon   size={size} />;
  if (side === 'spaces')     return <SpaceIcon   size={size} />;
  return                            <ObjectIcon  size={size} />;
}

function ObjectRow({ object, isSelected, onClick, onDoubleClick }) {
  const isSpace       = object.space === true;
  const primarySource = object.sources?.[0];
  const uri           = primarySource?.uri ?? null;
  const fileType      = primarySource?.fileType ?? null;

  return (
    <div
      className={`object-row${isSelected ? ' selected' : ''}${isSpace ? ' is-space' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="object-row-type">
        {isSpace ? <SpaceIcon size={12} /> : <ObjectIcon size={12} />}
      </span>
      <div className="object-row-main">
        <span className="object-row-name">{object.name || 'Untitled'}</span>
      </div>
      {!object.system && <span className="object-row-date">{formatDate(object.created_at)}</span>}
    </div>
  );
}

export default function ObjectListView({ objects = [], onEnterSpace, onObjectSelect }) {
  const deleteObject = useIndexStore(s => s.deleteObject);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [anchorId, setAnchorId]       = useState(null);
  const [sortField, setSortField]     = useState('created'); // 'created' | 'name'
  const [sortDir, setSortDir]         = useState('desc');    // 'asc' | 'desc'
  const [filterSide,     setFilterSide]     = useState('objects'); // 'objects' | 'spaces'
  const [filterCombined, setFilterCombined] = useState(false);     // true = show both
  const containerRef = useRef(null);

  const holdTimer = useRef(null);
  const didHold   = useRef(false);
  const HOLD_MS   = 300;

  const handleFilterMouseDown = (e) => {
    e.stopPropagation();
    didHold.current = false;
    holdTimer.current = setTimeout(() => {
      didHold.current = true;
      setFilterCombined(c => !c);
    }, HOLD_MS);
  };

  const handleFilterMouseUp = (e) => {
    e.stopPropagation();
    clearTimeout(holdTimer.current);
    if (!didHold.current) {
      if (filterCombined) {
        setFilterCombined(false);
      } else {
        setFilterSide(s => s === 'objects' ? 'spaces' : 'objects');
      }
    }
  };

  const handleFilterMouseLeave = () => {
    clearTimeout(holdTimer.current);
    didHold.current = false;
  };

  const filteredObjects = filterCombined        ? objects
                        : filterSide === 'objects' ? objects.filter(o => !o.space)
                        :                            objects.filter(o =>  o.space);

  const sortedObjects = [...filteredObjects].sort((a, b) => {
    if (a.system && !b.system) return -1;
    if (b.system && !a.system) return 1;
    if (sortField === 'name') {
      const na = (a.name || '').toLowerCase();
      const nb = (b.name || '').toLowerCase();
      return sortDir === 'asc' ? na.localeCompare(nb) : nb.localeCompare(na);
    }
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
    return sortDir === 'desc' ? tb - ta : ta - tb;
  });

  const handleSortClick = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  useEffect(() => { containerRef.current?.focus(); }, []);

  // Sync: remove stale IDs when objects list changes (e.g. after LIVE SELECT delete)
  useEffect(() => {
    const currentIds = new Set(sortedObjects.map(o => o.id));
    setSelectedIds(prev => {
      const next = new Set([...prev].filter(id => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [objects]);

  const handleRowClick = useCallback((e, id) => {
    e.stopPropagation();

    if (e.shiftKey && anchorId) {
      // Range select from anchor to clicked
      const ids = sortedObjects.map(o => o.id);
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
      onObjectSelect?.(id);
      return;
    }
    // Multi-select or range: close detail pane
    onObjectSelect?.(null);
  }, [objects, anchorId, onObjectSelect]);

  const handleRowDoubleClick = useCallback((e, id) => {
    e.stopPropagation();
    setSelectedIds(new Set([id]));
    setAnchorId(id);
    const obj = sortedObjects.find(o => o.id === id);
    if (obj?.space) {
      onEnterSpace?.(id);
    } else {
      const source = obj?.sources?.[0];
      if (source?.uri) window.electronAPI?.openSource?.(source.uri);
    }
  }, [objects, onEnterSpace]);

  const handleCanvasClick = useCallback(() => {
    setSelectedIds(new Set());
    setAnchorId(null);
    onObjectSelect?.(null);
  }, [onObjectSelect]);

  const handleKeyDown = useCallback(async (e) => {
    if (e.key === 'Escape') {
      setSelectedIds(new Set());
      setAnchorId(null);
      onObjectSelect?.(null);
      return;
    }

    if (e.key === 'w' || e.key === 's' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const ids = sortedObjects.map(o => o.id);
      if (ids.length === 0) return;
      const lastSelected = anchorId && ids.includes(anchorId) ? anchorId : null;
      const currentIndex = lastSelected ? ids.indexOf(lastSelected) : -1;
      const nextIndex = (e.key === 'w' || e.key === 'ArrowUp')
        ? (currentIndex <= 0 ? 0 : currentIndex - 1)
        : (currentIndex >= ids.length - 1 ? ids.length - 1 : currentIndex + 1);
      const nextId = ids[nextIndex];
      setSelectedIds(new Set([nextId]));
      setAnchorId(nextId);
      onObjectSelect?.(nextId);
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
  }, [objects, anchorId, selectedIds, deleteObject, onObjectSelect]);

  const sortArrow = sortDir === 'asc' ? '↑' : '↓';
  const listHeader = (
    <div className="object-list-header">
      <button
        className={`object-list-filter-btn${filterCombined ? ' combined' : ''}`}
        onMouseDown={handleFilterMouseDown}
        onMouseUp={handleFilterMouseUp}
        onMouseLeave={handleFilterMouseLeave}
        title={filterCombined ? 'Showing all (hold to collapse)' : filterSide === 'objects' ? 'Objects only' : 'Spaces only'}
      >
        <FilterIcon side={filterSide} combined={filterCombined} />
      </button>
      <button
        className={`object-list-sort-btn${sortField === 'name' ? ' active' : ''}`}
        onClick={e => { e.stopPropagation(); handleSortClick('name'); }}
      >
        Name {sortField === 'name' ? sortArrow : ''}
      </button>
      <button
        className={`object-list-sort-btn object-list-sort-btn--right${sortField === 'created' ? ' active' : ''}`}
        onClick={e => { e.stopPropagation(); handleSortClick('created'); }}
      >
        Created {sortField === 'created' ? sortArrow : ''}
      </button>
    </div>
  );

  if (objects.length === 0) {
    return (
      <div ref={containerRef} className="object-list-view" tabIndex={0}>
        <div className="object-list-table">
          {listHeader}
          <div className="object-list-empty">No objects.</div>
        </div>
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
      <div className="object-list-table">
      {listHeader}
      <div className="object-list">
        {sortedObjects.map(obj => (
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
    </div>
  );
}
