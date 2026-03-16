// Author: Claude Code
// SpaceNavigator — CMD+L space navigation with terminal-style tab completion.
// Opens empty; Tab reveals all spaces or autocompletes to the closest match.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';

export default function SpaceNavigator({ isOpen, onClose, onEnterSpace }) {
  const spaces    = useIndexStore(s => s.spaces);
  const systemAll = useIndexStore(s => s.systemAll);

  const allSpaces = [systemAll, ...spaces];

  const [query,         setQuery]         = useState('');
  const [showList,      setShowList]       = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef  = useRef(null);
  const overlayRef = useRef(null);

  const filtered = query.trim().length > 0
    ? allSpaces.filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
    : allSpaces;

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setShowList(false);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function execute(space) {
    onEnterSpace(space.id);
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      if (query.trim().length === 0) {
        // Empty input: reveal all spaces
        setShowList(true);
        setSelectedIndex(0);
      } else if (filtered.length > 0) {
        // Partial input: autocomplete to first match
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
      onClose();
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="command-palette-overlay" ref={overlayRef} onClick={handleOverlayClick}>
      <div className="command-palette-card">
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Navigate to space…"
          value={query}
          onChange={e => { setQuery(e.target.value); setShowList(e.target.value.trim().length > 0); }}
          onKeyDown={handleKeyDown}
        />
        {showList && filtered.length > 0 && (
          <ul className="command-palette-list">
            {filtered.map((space, i) => (
              <li
                key={space.id}
                className={`command-palette-item${i === selectedIndex ? ' active' : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onClick={() => execute(space)}
              >
                <span className="command-palette-label">{space.name}</span>
                <span className="command-palette-badge">space</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
