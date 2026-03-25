// Author: Claude Code
// QuickSpaceView — persistent overlay window; user navigates via CommandPalette.
// Spaces are sourced from objects.filter(o => o.space).

import { useEffect, useState } from 'react';
import { useIndexStore } from '../store/index';
import { useAppearance } from '../hooks/useAppearance';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import GraphView from './GraphView';
import CommandPalette from './CommandPalette';
import '../App.css';

export default function QuickSpaceView() {
  useAppearance();

  const loadAll         = useIndexStore(s => s.loadAll);
  const subscribeToLive = useIndexStore(s => s.subscribeToLive);

  const [showPalette, setShowPalette] = useState(false);

  useEffect(() => {
    loadAll().then(() => setShowPalette(true));
    subscribeToLive();
  }, []);

  useKeyboardShortcuts({ onPalette: () => setShowPalette(v => !v) });

  return (
    <div className="app">
      <div className="title-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{
          fontSize: '0.72rem',
          fontWeight: 500,
          color: 'rgba(0,0,0,0.35)',
          letterSpacing: '0.2px',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          Index
        </span>
      </div>
      <GraphView objects={[]} />
      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        compact
      />
    </div>
  );
}
