// Author: Claude Code
// CommandPalette — CMD+K functional command overlay.
// Navigation has moved to SpaceNavigator (CMD+L).

import { useEffect, useRef, useState } from 'react';
import './CommandPalette.css';

export default function CommandPalette({ isOpen, onClose, compact = false }) {
  const [query, setQuery] = useState('');
  const inputRef  = useRef(null);
  const overlayRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  function handleKeyDown(e) {
    if (e.key === 'Escape') onClose();
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
      </div>
    </div>
  );
}
