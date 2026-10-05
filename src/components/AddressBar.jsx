// Author: Claude Code
// AddressBar — browser-style navigation strip.
// Doubles as the space navigator: click the field (or CMD+L) to enter navigation mode.
// The dropdown anchors below the field in-place; no overlay or modal.

import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { useIndexStore, ROOT_CONTAINER_ID } from '../store/index';
import './AddressBar.css';

const VIEWS = [
  { type: 'list',     icon: '≡' },
  { type: 'calendar', icon: '▦' },
  { type: 'graph',    icon: '⬡' },
];

const AddressBar = forwardRef(function AddressBar({ label, onBack, activeView, setView, onNavigate }, ref) {
  const allSpaces = useIndexStore(s =>
    s.objects.filter(o => o.container && o.id !== ROOT_CONTAINER_ID)
  );

  const [editing,       setEditing]       = useState(false);
  const [query,         setQuery]         = useState('');
  const [showList,      setShowList]       = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef(null);

  const ROOT_ENTRY = { id: null, name: '/' };

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    const spaces = q ? allSpaces.filter(s => s.name.toLowerCase().includes(q)) : allSpaces;
    const includeRoot = !q || '/'.includes(q);
    return includeRoot ? [ROOT_ENTRY, ...spaces] : spaces;
  })();

  // Expose startNavigation() so App.jsx can trigger it via CMD+L
  useImperativeHandle(ref, () => ({
    startNavigation() {
      setEditing(true);
      setQuery('');
      setShowList(false);
      setSelectedIndex(0);
    },
  }));

  useEffect(() => {
    if (editing) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editing]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  function stopEditing() {
    setEditing(false);
    setQuery('');
    setShowList(false);
  }

  function execute(space) {
    onNavigate(space.id);
    stopEditing();
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (query.trim().length === 0) {
        setShowList(true);
        setSelectedIndex(0);
      } else if (filtered.length > 0) {
        setQuery(filtered[0].name);
        setShowList(true);
        setSelectedIndex(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShowList(true);
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = showList ? filtered[selectedIndex] : filtered[0];
      if (target) execute(target);
      return;
    }
    if (e.key === 'Escape') {
      stopEditing();
    }
  }

  function handleBlur(e) {
    // Keep open if focus moves to a dropdown item
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
        >
          ‹
        </button>
      </div>

      <div className={`address-bar-field${editing ? ' editing' : ''}`}>
        {editing ? (
          <>
            <input
              ref={inputRef}
              className="address-bar-input"
              value={query}
              placeholder=""
              onChange={e => {
                setQuery(e.target.value);
                setShowList(e.target.value.trim().length > 0);
              }}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
            />
            {showList && filtered.length > 0 && (
              <ul className="address-bar-dropdown">
                {filtered.map((space, i) => (
                  <li
                    key={space.id}
                    className={`address-bar-dropdown-item${i === selectedIndex ? ' active' : ''}`}
                    tabIndex={-1}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onMouseDown={e => { e.preventDefault(); execute(space); }}
                  >
                    {space.name}
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <span
            className="address-bar-label"
            onClick={() => setEditing(true)}
            title="Navigate (CMD+L)"
          >
            {label}
          </span>
        )}
      </div>

      <div className="address-bar-right-slot">
        {activeView && (
          <div className="address-bar-views">
            {VIEWS.map(v => (
              <button
                key={v.type}
                className={`view-btn${activeView === v.type ? ' active' : ''}`}
                onClick={() => setView(v.type)}
                title={v.type}
              >
                {v.icon}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

export default AddressBar;
