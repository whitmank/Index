// Author: Claude Code
// CommandPalette — CMD+K floating command overlay.

import { useEffect, useRef, useState } from 'react';
import './CommandPalette.css';

const COMMANDS = [
  { id: 'spaces',   label: 'Spaces',   description: 'View all spaces' },
  { id: 'tags',     label: 'Tags',     description: 'Manage tags' },
  { id: 'settings', label: 'Settings', description: 'App settings' },
];

export default function CommandPalette({ isOpen, onClose, onNavigate }) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const overlayRef = useRef(null);

  const filtered = COMMANDS.filter(cmd =>
    cmd.label.toLowerCase().includes(query.toLowerCase()) ||
    cmd.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[selectedIndex]) {
        onNavigate(filtered[selectedIndex].id);
        onClose();
      }
    } else if (e.key === 'Escape') {
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
          placeholder="Type a command…"
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
                onClick={() => { onNavigate(cmd.id); onClose(); }}
              >
                <span className="command-palette-label">{cmd.label}</span>
                <span className="command-palette-desc">{cmd.description}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
