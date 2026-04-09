// Author: Claude Code
// ObjectListView — list of index objects with Finder-style multi-selection.
// selectedIds is controlled (lifted to App.jsx). anchorId stays local.
// Store's deleteObject is called directly on Delete key.
// Accepts file and URL drops via onDrop prop; renders a drop overlay on dragenter.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useIndexStore } from '../store/index';
import { ObjectIcon, SpaceIcon, MonadIcon } from '../icons/index';
import './ObjectListView.css';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const IMAGE_TYPES = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'ico', 'pdf']);
const thumbnailCache = new Map();

function filePathFromUri(uri) {
  if (!uri || !uri.startsWith('file://')) return null;
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
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

  const isImage = !isSpace && IMAGE_TYPES.has(fileType);
  const filePath = isImage ? filePathFromUri(uri) : null;

  const [thumb, setThumb] = useState(() => filePath && thumbnailCache.has(filePath) ? thumbnailCache.get(filePath) : null);

  useEffect(() => {
    if (!filePath || thumb) return;
    window.electronAPI?.fs?.thumbnail(filePath, 40).then(dataUrl => {
      if (dataUrl) {
        thumbnailCache.set(filePath, dataUrl);
        setThumb(dataUrl);
      }
    });
  }, [filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`object-row${isSelected ? ' selected' : ''}${isSpace ? ' is-space' : ''}${thumb ? ' has-thumb' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="object-row-type">
        {thumb
          ? <img className="object-row-thumb" src={thumb} alt="" />
          : isSpace ? <SpaceIcon size={12} /> : <ObjectIcon size={12} />
        }
      </span>
      <div className="object-row-main">
        <span className="object-row-name">{object.name || 'Untitled'}</span>
      </div>
      {!object.system && <span className="object-row-date">{formatDate(object.created_at)}</span>}
    </div>
  );
}

export default function ObjectListView({
  objects = [],
  onEnterSpace,
  onObjectSelect,
  onDrop,
  selectedIds,
  onSelectionChange,
  initialFilterSide     = 'objects',
  initialFilterCombined = true,
  initialSortField      = 'created',
  initialSortDir        = 'desc',
  onPrefsChange,
}) {
  const deleteObject = useIndexStore(s => s.deleteObject);

  const [anchorId, setAnchorId] = useState(null);
  const cursorId = useRef(null); // moving end of keyboard range selection; anchor is the fixed end
  const [sortField, setSortField]     = useState(initialSortField);
  const [sortDir, setSortDir]         = useState(initialSortDir);
  const [filterSide,     setFilterSide]     = useState(initialFilterSide);
  const [filterCombined, setFilterCombined] = useState(initialFilterCombined);
  const [isDragOver, setIsDragOver]   = useState(false);
  const dragCounter                   = useRef(0);

  useEffect(() => {
    onPrefsChange?.({ filterSide, filterCombined, sortField, sortDir });
  }, [filterSide, filterCombined, sortField, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps

  const containerRef = useRef(null);

  const holdTimer    = useRef(null);
  const didHold      = useRef(false);
  const keyHoldTimer = useRef(null);
  const keyDidHold   = useRef(false);
  const HOLD_MS      = 300;

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
    onSelectionChange(prev => {
      const next = new Set([...prev].filter(id => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [objects]);

  const handleRowClick = useCallback((e, id) => {
    e.stopPropagation();

    if (e.shiftKey && anchorId) {
      // Range select from anchor to clicked; cursor follows click target
      const ids = sortedObjects.map(o => o.id);
      const a = ids.indexOf(anchorId);
      const b = ids.indexOf(id);
      if (a === -1 || b === -1) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      onSelectionChange(new Set(ids.slice(lo, hi + 1)));
      cursorId.current = id;
    } else if (e.metaKey || e.ctrlKey) {
      // Toggle
      onSelectionChange(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setAnchorId(id);
      cursorId.current = id;
    } else {
      // Single select
      onSelectionChange(new Set([id]));
      setAnchorId(id);
      cursorId.current = id;
      onObjectSelect?.(id);
      return;
    }
    // Multi-select or range: close detail pane
    onObjectSelect?.(null);
  }, [objects, anchorId, onObjectSelect]);

  const handleRowDoubleClick = useCallback((e, id) => {
    e.stopPropagation();
    onSelectionChange(new Set([id]));
    setAnchorId(id);
    onEnterSpace?.(id);
  }, [onEnterSpace]);

  const handleCanvasClick = useCallback(() => {
    onSelectionChange(new Set());
    setAnchorId(null);
    onObjectSelect?.(null);
  }, [onObjectSelect]);

  const handleKeyDown = useCallback(async (e) => {
    if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      if (!e.repeat) {
        keyDidHold.current = false;
        keyHoldTimer.current = setTimeout(() => {
          keyDidHold.current = true;
          setFilterCombined(c => !c);
        }, HOLD_MS);
      }
      return;
    }

    if (e.key === 'Escape') {
      onSelectionChange(new Set());
      setAnchorId(null);
      cursorId.current = null;
      onObjectSelect?.(null);
      return;
    }

    if (e.key === 'a' && e.metaKey) {
      e.preventDefault();
      const ids = sortedObjects.map(o => o.id);
      if (ids.length === 0) return;
      onSelectionChange(new Set(ids));
      setAnchorId(ids[ids.length - 1]);
      onObjectSelect?.(null);
      return;
    }

    const navKey = e.key.toLowerCase();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || navKey === 'w' || navKey === 's') {
      e.preventDefault();
      const ids = sortedObjects.map(o => o.id);
      if (ids.length === 0) return;
      const isUp = e.key === 'ArrowUp' || navKey === 'w';

      if (e.shiftKey) {
        // Extend range from anchor to new cursor position
        const fromId = cursorId.current && ids.includes(cursorId.current) ? cursorId.current : (anchorId && ids.includes(anchorId) ? anchorId : ids[0]);
        const fromIndex = ids.indexOf(fromId);
        const nextIndex = isUp
          ? Math.max(0, fromIndex - 1)
          : Math.min(ids.length - 1, fromIndex + 1);
        const nextCursor = ids[nextIndex];
        cursorId.current = nextCursor;
        // Select range between anchor and cursor
        const anchorIndex = anchorId && ids.includes(anchorId) ? ids.indexOf(anchorId) : nextIndex;
        const [lo, hi] = anchorIndex <= nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex];
        onSelectionChange(new Set(ids.slice(lo, hi + 1)));
        onObjectSelect?.(null);
      } else {
        // Plain move: collapse to single, reset both anchor and cursor
        const fromId = cursorId.current && ids.includes(cursorId.current) ? cursorId.current : (anchorId && ids.includes(anchorId) ? anchorId : null);
        const fromIndex = fromId ? ids.indexOf(fromId) : -1;
        const nextIndex = isUp
          ? (fromIndex <= 0 ? 0 : fromIndex - 1)
          : (fromIndex >= ids.length - 1 ? ids.length - 1 : fromIndex + 1);
        const nextId = ids[nextIndex];
        cursorId.current = nextId;
        setAnchorId(nextId);
        onSelectionChange(new Set([nextId]));
        onObjectSelect?.(nextId);
      }
      return;
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
      e.preventDefault();
      const toDelete = [...selectedIds];
      onSelectionChange(new Set());
      setAnchorId(null);
      await Promise.all(toDelete.map(id => deleteObject(id).catch(err =>
        console.error('[ObjectListView] Delete failed:', err)
      )));
    }
  }, [objects, anchorId, selectedIds, deleteObject, onObjectSelect, filterCombined, filterSide]);

  const handleKeyUp = useCallback((e) => {
    if (e.key === '`' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      clearTimeout(keyHoldTimer.current);
      if (!keyDidHold.current) {
        if (filterCombined) {
          setFilterCombined(false);
        } else {
          setFilterSide(s => s === 'objects' ? 'spaces' : 'objects');
        }
      }
      keyDidHold.current = false;
    }
  }, [filterCombined]);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragOver(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    onDrop?.(e);
  }, [onDrop]);

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

  const dragProps = {
    onDragEnter: handleDragEnter,
    onDragLeave: handleDragLeave,
    onDragOver:  handleDragOver,
    onDrop:      handleDrop,
  };

  const dropOverlay = isDragOver && (
    <div className="drop-overlay">
      <span className="drop-overlay-label">Drop to add</span>
    </div>
  );

  if (objects.length === 0) {
    return (
      <div ref={containerRef} className="object-list-view" tabIndex={0} onKeyDown={handleKeyDown} onKeyUp={handleKeyUp} {...dragProps}>
        {dropOverlay}
        <div className="object-list-table">
          {listHeader}
          <div className="object-list-empty">Drop files or links to add</div>
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
      onKeyUp={handleKeyUp}
      onClick={handleCanvasClick}
      {...dragProps}
    >
      {dropOverlay}
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
