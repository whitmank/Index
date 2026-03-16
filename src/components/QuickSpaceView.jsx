// Author: Claude Code
// QuickSpaceView — persistent overlay window; user navigates via CommandPalette.

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
  const enterSpace      = useIndexStore(s => s.enterSpace);
  const objects         = useIndexStore(s => s.objects);
  const spaceObjects    = useIndexStore(s => s.spaceObjects);
  const spaces          = useIndexStore(s => s.spaces);
  const systemAll       = useIndexStore(s => s.systemAll);

  const [activeSpaceId, setActiveSpaceId] = useState(null);
  const [showPalette, setShowPalette]     = useState(false);

  useEffect(() => {
    loadAll().then(() => setShowPalette(true));
    subscribeToLive();
  }, []);

  useKeyboardShortcuts({ onPalette: () => setShowPalette(v => !v) });

  const handleEnterSpace = (id) => {
    enterSpace(id);
    setActiveSpaceId(id);
    setShowPalette(false);
  };

  const activeSpace = activeSpaceId
    ? ([systemAll, ...spaces].find(s => s.id === activeSpaceId) ?? null)
    : null;

  const displayObjects = activeSpaceId
    ? (spaceObjects !== null ? spaceObjects : objects)
    : [];

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
          {activeSpace ? activeSpace.name : 'No space selected'}
        </span>
      </div>
      <GraphView objects={displayObjects} />
      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        onNavigate={() => {}}
        onEnterSpace={handleEnterSpace}
        compact
      />
    </div>
  );
}
