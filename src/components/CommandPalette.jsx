// Author: Claude Code
// CommandPalette — CMD+K command overlay.
// Receives a flat commands[] array; filters by label and executes on selection.

import { useEffect, useRef, useState } from 'react';
import './CommandPalette.css';

export default function CommandPalette({ isOpen, onClose, commands = [], compact = false }) {
  const [query,         setQuery]         = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef   = useRef(null);
  const overlayRef = useRef(null);

  const filtered = query.trim().length > 0
    ? commands.filter(c => c.label.toLowerCase().includes(query.toLowerCase()))
    : [];

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  function execute(command) {
    command.action();
    onClose();
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
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
      if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
    }
  }

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose();
  }

  if (!isOpen) return null;

  const overlayClass = compact
    ? 'command-palette-overlay--compact'
    : 'command-palette-overlay';

  return (
    <div className={overlayClass} ref={overlayRef} onClick={compact ? undefined : handleOverlayClick}>
      <div className="command-palette-card">
        <input
          ref={inputRef}
          className="command-palette-input"
          placeholder="Command…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {filtered.length > 0 && (
          <ul className="command-palette-list">
            {filtered.map((cmd, i) => (
              <li
                key={cmd.id}
                className={`command-palette-item${i === selectedIndex ? ' active' : ''}`}
                onMouseEnter={() => setSelectedIndex(i)}
                onMouseDown={e => { e.preventDefault(); execute(cmd); }}
              >
                <span className="command-palette-label">{cmd.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
