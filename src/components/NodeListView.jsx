// Author: Claude Sonnet 4.6
// NodeListView — list of nodes with Finder-style multi-selection.
// selectedIds is controlled (lifted to App.jsx). anchorId stays local.

import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { useIndexStore } from '../store/index';
import { ObjectIcon, SpaceIcon } from '../icons/index';
import './NodeListView.css';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'heic', 'heif', 'ico', 'pdf']);
const thumbnailCache = new Map();

function filePathFromUri(uri) {
  if (!uri || !uri.startsWith('file://')) return null;
  return decodeURIComponent(uri.replace(/^file:\/\//, ''));
}

function sourceLabel(node) {
  if (node.schema !== 'object') return '';
  const uri = node.sources?.[0]?.uri ?? '';
  if (uri.startsWith('http://') || uri.startsWith('https://')) return 'URL';
  const ext = uri.split('.').pop()?.toLowerCase() ?? '';
  return ext ? ext.toUpperCase() : '';
}

function NodeRow({ node, isSelected, onClick, onDoubleClick }) {
  const isGroup = node.schema === 'group';
  const isTag   = node.schema === 'tag';
  const uri     = node.sources?.[0]?.uri ?? null;
  const ext     = uri?.split('.').pop()?.toLowerCase();
  const isImage = !isGroup && IMAGE_EXTS.has(ext);
  const filePath = isImage ? filePathFromUri(uri) : null;

  const [thumb, setThumb] = useState(() => filePath && thumbnailCache.has(filePath) ? thumbnailCache.get(filePath) : null);

  useEffect(() => {
    if (!filePath || thumb) return;
    window.electronAPI?.fs?.thumbnail?.(filePath, 40)?.then(dataUrl => {
      if (dataUrl) {
        thumbnailCache.set(filePath, dataUrl);
        setThumb(dataUrl);
      }
    });
  }, [filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      className={`node-row${isSelected ? ' selected' : ''}${isGroup ? ' is-group' : ''}${thumb ? ' has-thumb' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="node-row-icon">
        {thumb
          ? <img className="node-row-thumb" src={thumb} alt="" />
          : isGroup
            ? <SpaceIcon size={12} />
            : <ObjectIcon size={12} />
        }
      </span>
      <div className="node-row-main">
        <span className="node-row-name">{node.name || 'Untitled'}</span>
        {isTag && <span className="node-row-schema-badge">tag</span>}
      </div>
      {!node.system && <span className="node-row-kind">{sourceLabel(node)}</span>}
      {!node.system && <span className="node-row-date">{formatDate(node.created_at)}</span>}
    </div>
  );
}

const NodeListView = forwardRef(function NodeListView({
  nodes = [],
  selectedIds,
  onSelectionChange,
  onEnterNode,
  onDetailNode,
  onDrop,
}, ref) {
  const deleteNode = useIndexStore(s => s.deleteNode);

  const [anchorId,  setAnchorId]  = useState(null);
  const [sortField, setSortField] = useState('created');
  const [sortDir,   setSortDir]   = useState('desc');
  const [isDragOver, setIsDragOver] = useState(false);

  const cursorId    = useRef(null);
  const dragCounter = useRef(0);
  const containerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    selectFirst() {
      if (sortedNodes.length === 0) return;
      const id = sortedNodes[0].id;
      cursorId.current = id;
      setAnchorId(id);
      onSelectionChange(new Set([id]));
    },
  }));

  useEffect(() => {
    if (selectedIds.size === 1) {
      const id = [...selectedIds][0];
      setAnchorId(id);
      cursorId.current = id;
    }
  }, [selectedIds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { containerRef.current?.focus(); }, []);

  useEffect(() => {
    const currentIds = new Set(nodes.map(n => n.id));
    onSelectionChange(prev => {
      const next = new Set([...prev].filter(id => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const sortedNodes = [...nodes].sort((a, b) => {
    if (a.system && !b.system) return -1;
    if (b.system && !a.system) return 1;
    if (a.schema === 'group' && b.schema !== 'group') return -1;
    if (b.schema === 'group' && a.schema !== 'group') return 1;
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
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir(field === 'name' ? 'asc' : 'desc'); }
  };

  const handleRowClick = useCallback((e, id) => {
    e.stopPropagation();
    if (e.shiftKey && anchorId) {
      const ids = sortedNodes.map(n => n.id);
      const a = ids.indexOf(anchorId);
      const b = ids.indexOf(id);
      if (a === -1 || b === -1) return;
      const [lo, hi] = a < b ? [a, b] : [b, a];
      onSelectionChange(new Set(ids.slice(lo, hi + 1)));
      cursorId.current = id;
    } else if (e.metaKey || e.ctrlKey) {
      onSelectionChange(prev => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
      setAnchorId(id);
      cursorId.current = id;
    } else {
      onSelectionChange(new Set([id]));
      setAnchorId(id);
      cursorId.current = id;
      const node = nodes.find(n => n.id === id);
      if (node?.schema !== 'group') onDetailNode?.(id);
    }
  }, [nodes, anchorId, onDetailNode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRowDoubleClick = useCallback((e, id) => {
    e.stopPropagation();
    onSelectionChange(new Set([id]));
    setAnchorId(id);
    onEnterNode?.(id);
  }, [onEnterNode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCanvasClick = useCallback(() => {
    onSelectionChange(new Set());
    setAnchorId(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleKeyDown = useCallback(async (e) => {
    if (e.key === 'Escape') {
      onSelectionChange(new Set());
      setAnchorId(null);
      cursorId.current = null;
      return;
    }
    if (e.key === 'a' && e.metaKey) {
      e.preventDefault();
      const ids = sortedNodes.map(n => n.id);
      if (ids.length) { onSelectionChange(new Set(ids)); setAnchorId(ids[ids.length - 1]); }
      return;
    }
    const navKey = e.key.toLowerCase();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || navKey === 'w' || navKey === 's') {
      e.preventDefault();
      const ids = sortedNodes.map(n => n.id);
      if (!ids.length) return;
      const isUp = e.key === 'ArrowUp' || navKey === 'w';
      const fromId = cursorId.current && ids.includes(cursorId.current) ? cursorId.current : ids[0];
      const fromIndex = ids.indexOf(fromId);
      const nextIndex = isUp ? Math.max(0, fromIndex - 1) : Math.min(ids.length - 1, fromIndex + 1);
      const nextId = ids[nextIndex];
      if (e.shiftKey) {
        cursorId.current = nextId;
        const anchorIndex = anchorId && ids.includes(anchorId) ? ids.indexOf(anchorId) : nextIndex;
        const [lo, hi] = anchorIndex <= nextIndex ? [anchorIndex, nextIndex] : [nextIndex, anchorIndex];
        onSelectionChange(new Set(ids.slice(lo, hi + 1)));
      } else {
        cursorId.current = nextId;
        setAnchorId(nextId);
        onSelectionChange(new Set([nextId]));
        const node = nodes.find(n => n.id === nextId);
        if (node?.schema !== 'group') onDetailNode?.(nextId);
      }
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
      e.preventDefault();
      const toDelete = [...selectedIds].filter(id => {
        const n = nodes.find(x => x.id === id);
        return !n?.system;
      });
      onSelectionChange(new Set());
      setAnchorId(null);
      await Promise.all(toDelete.map(id => deleteNode(id).catch(console.error)));
    }
  }, [sortedNodes, anchorId, selectedIds, deleteNode, onDetailNode, nodes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDragEnter = useCallback((e) => { e.preventDefault(); dragCounter.current++; setIsDragOver(true); }, []);
  const handleDragLeave = useCallback(() => { dragCounter.current--; if (dragCounter.current === 0) setIsDragOver(false); }, []);
  const handleDragOver  = useCallback((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }, []);
  const handleDropEvent = useCallback((e) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    onDrop?.(e);
  }, [onDrop]);

  const sortArrow = sortDir === 'asc' ? '↑' : '↓';

  return (
    <div
      ref={containerRef}
      className="node-list-view"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={handleCanvasClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDropEvent}
    >
      {isDragOver && (
        <div className="drop-overlay">
          <span className="drop-overlay-label">Drop to add</span>
        </div>
      )}
      <div className="node-list-table">
        <div className="node-list-header">
          <button
            className={`node-list-sort-btn${sortField === 'name' ? ' active' : ''}`}
            onClick={e => { e.stopPropagation(); handleSortClick('name'); }}
          >
            Name {sortField === 'name' ? sortArrow : ''}
          </button>
          <span className="node-list-col-label">Kind</span>
          <button
            className={`node-list-sort-btn node-list-sort-btn--right${sortField === 'created' ? ' active' : ''}`}
            onClick={e => { e.stopPropagation(); handleSortClick('created'); }}
          >
            Created {sortField === 'created' ? sortArrow : ''}
          </button>
        </div>

        {sortedNodes.length === 0 ? (
          <div className="node-list-empty">Drop files or links to add</div>
        ) : (
          <div className="node-list">
            {sortedNodes.map(node => (
              <NodeRow
                key={node.id}
                node={node}
                isSelected={selectedIds.has(node.id)}
                onClick={e => handleRowClick(e, node.id)}
                onDoubleClick={e => handleRowDoubleClick(e, node.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default NodeListView;
