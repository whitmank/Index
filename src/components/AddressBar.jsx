// Author: Claude Sonnet 4.6
// AddressBar — navigation strip. CMD+L to search nodes and groups.

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useIndexStore, HOME_NODE_ID } from '../store/index';
import './AddressBar.css';

const VIEWS = [
  { type: 'list',  icon: '≡' },
  { type: 'graph', icon: '⬡' },
];

const AddressBar = forwardRef(function AddressBar(
  { label, onBack, activeView, setView, onNavigate, onSelectNode, onCreateNode, onCreateGroup },
  ref
) {
  const allGroups  = useIndexStore(s => s.nodes.filter(n => n.schema === 'group' && n.id !== HOME_NODE_ID));
  const allObjects = useIndexStore(s => s.nodes.filter(n => n.schema === 'object'));
  const allTags    = useIndexStore(s => s.nodes.filter(n => n.schema === 'tag'));

  const [editing,        setEditing]        = useState(false);
  const [query,          setQuery]          = useState('');
  const [showList,       setShowList]       = useState(false);
  const [selectedIndex,  setSelectedIndex]  = useState(0);
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const inputRef      = useRef(null);
  const createMenuRef = useRef(null);

  const ROOT_ENTRY = { schema: 'group', id: null, name: '~' };

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return [ROOT_ENTRY, ...allGroups.map(g => ({ ...g }))];
    const matchGroups  = allGroups.filter(n => n.name?.toLowerCase().includes(q));
    const matchObjects = allObjects.filter(n => n.name?.toLowerCase().includes(q));
    const matchTags    = allTags.filter(n => n.name?.toLowerCase().includes(q));
    return [
      ...('~'.includes(q) ? [ROOT_ENTRY] : []),
      ...matchGroups,
      ...matchObjects,
      ...matchTags,
    ];
  })();

  useImperativeHandle(ref, () => ({
    startNavigation() {
      setEditing(true);
      setQuery('');
      setShowList(false);
      setSelectedIndex(0);
    },
  }));

  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 0); }, [editing]);
  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    if (!showCreateMenu) return;
    const handler = (e) => {
      if (!createMenuRef.current?.contains(e.target)) setShowCreateMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showCreateMenu]);

  function stopEditing() {
    setEditing(false);
    setQuery('');
    setShowList(false);
  }

  function execute(item) {
    if (item.schema === 'group') {
      onNavigate?.(item.id);
    } else {
      onSelectNode?.(item.id);
    }
    stopEditing();
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!query.trim()) {
        setShowList(true);
        setSelectedIndex(0);
      } else if (filtered.length > 0) {
        setQuery(filtered[0].name);
        setShowList(true);
        setSelectedIndex(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setShowList(true); setSelectedIndex(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = showList ? filtered[selectedIndex] : filtered[0];
      if (target) execute(target);
      return;
    }
    if (e.key === 'Escape') stopEditing();
  }

  function handleBlur(e) {
    if (e.relatedTarget?.closest?.('.address-bar-dropdown')) return;
    stopEditing();
  }

  return (
    <div className="address-bar">
      <div className="address-bar-back-slot">
        <button
          className="address-bar-back"
          onClick={onBack ?? undefined}
          disabled={!onBack}
          aria-label="Back"
        >‹</button>
      </div>

      <div className={`address-bar-field${editing ? ' editing' : ''}`}>
        {editing ? (
          <>
            <input
              ref={inputRef}
              className="address-bar-input"
              value={query}
              placeholder=""
              onChange={e => { setQuery(e.target.value); setShowList(e.target.value.trim().length > 0); }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />
            {showList && filtered.length > 0 && (
              <ul className="address-bar-dropdown">
                {filtered.map((item, i) => (
                  <li
                    key={item.id ?? '__home__'}
                    className={`address-bar-dropdown-item${i === selectedIndex ? ' active' : ''}`}
                    tabIndex={-1}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onMouseDown={e => { e.preventDefault(); execute(item); }}
                  >
                    <span className="address-bar-dropdown-icon">
                      {item.schema === 'group' ? '○' : item.schema === 'tag' ? '◇' : '●'}
                    </span>
                    {item.name}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <span className="address-bar-label" onClick={() => setEditing(true)} title="Search (CMD+L)">
            {label}
          </span>
        )}
      </div>

      <div className="address-bar-right-slot">
        {activeView && (
          <button
            className="view-toggle-btn"
            onClick={() => setView(activeView === 'list' ? 'graph' : 'list')}
            title={activeView === 'list' ? 'Switch to graph' : 'Switch to list'}
          >
            {VIEWS.find(v => v.type === activeView).icon}
          </button>
        )}
        <div className="address-bar-create-wrap" ref={createMenuRef}>
          <button
            className={`address-bar-create-btn${showCreateMenu ? ' active' : ''}`}
            onClick={() => setShowCreateMenu(v => !v)}
            title="New…"
            aria-label="New…"
          />
          {showCreateMenu && (
            <div className="address-bar-create-menu">
              <button className="create-menu-item" onClick={() => { setShowCreateMenu(false); onCreateNode?.(); }}>
                <span className="create-menu-icon">●</span> Object
              </button>
              <button className="create-menu-item" onClick={() => { setShowCreateMenu(false); onCreateGroup?.(); }}>
                <span className="create-menu-icon">○</span> Group
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default AddressBar;
