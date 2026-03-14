// Author: Claude Code
// UndoToast — v0.4.
// Displays a transient notification after any undoable action.
// Dismissed automatically after 4s or immediately on Cmd+Z (which also triggers undo).

import { useEffect, useState } from 'react';
import { useHistoryStore } from '../store/history';
import './UndoToast.css';

const TOAST_DURATION_MS = 4000;

export default function UndoToast() {
  const history = useHistoryStore(state => state.history);
  const undo = useHistoryStore(state => state.undo);

  const [toast, setToast] = useState(null);
  const [visible, setVisible] = useState(false);

  // Show toast whenever a new item is pushed to history
  useEffect(() => {
    if (history.length === 0) { setVisible(false); return; }

    const latest = history[history.length - 1];
    setToast(latest);
    setVisible(true);

    const timer = setTimeout(() => setVisible(false), TOAST_DURATION_MS);
    return () => clearTimeout(timer);
  }, [history.length]);

  if (!visible || !toast) return null;

  return (
    <div className="undo-toast">
      <span className="undo-toast-message">{toast.description}</span>
      <button
        className="undo-toast-btn"
        onClick={() => { setVisible(false); undo(); }}
      >
        Undo ⌘Z
      </button>
    </div>
  );
}
