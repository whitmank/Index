import { useEffect } from 'react';

// Keyboard shortcuts configuration
const SHORTCUTS = {
  ESCAPE: {
    key: 'Escape',
    description: 'Close/cancel forms',
  },
  NEW_OBJECT: {
    key: 'o',
    modifiers: ['metaKey', 'ctrlKey'],
    description: 'Create new object',
  },
  SETTINGS: {
    key: ',',
    modifiers: ['metaKey'],
    description: 'Open settings',
  },
  DETAIL: {
    key: '.',
    modifiers: ['metaKey'],
    description: 'Toggle detail panel',
  },
  UNDO: {
    key: 'z',
    modifiers: ['metaKey', 'ctrlKey'],
    description: 'Undo last action',
  },
  COMMAND_PALETTE: {
    key: 'k',
    modifiers: ['metaKey'],
    description: 'Open command palette',
  },
  VIEW_SPACES: {
    key: '1',
    modifiers: ['metaKey'],
    description: 'Go to Spaces',
  },
  VIEW_TAGS: {
    key: '2',
    modifiers: ['metaKey'],
    description: 'Go to Tags',
  },
  VIEW_SETTINGS: {
    key: '3',
    modifiers: ['metaKey'],
    description: 'Go to Settings',
  },
  VIEW_ALL: {
    key: 'a',
    modifiers: ['metaKey'],
    description: 'Go to All space',
  },
};

/**
 * Custom hook for keyboard shortcuts
 * @param {Object} actions - Object containing action callbacks
 * @param {Function} actions.onEscape - Called when Escape is pressed
 * @param {Function} actions.onNewObject - Called when Cmd/Ctrl+O is pressed
 * @param {Function} actions.onSettings - Called when Cmd+, is pressed
 * @param {Function} actions.onUndo - Called when Cmd/Ctrl+Z is pressed
 * @param {Object} state - Current state for conditional actions
 * @param {boolean} state.editingId - Whether in edit mode
 * @param {boolean} state.showForm - Whether form is open
 */
export function useKeyboardShortcuts(actions, state) {
  useEffect(() => {
    function handleKeyDown(e) {
      // Escape - close/cancel forms
      if (e.key === SHORTCUTS.ESCAPE.key) {
        actions.onEscape?.();
      }

      // Cmd+O / Ctrl+O - create new object
      if (
        e.key === SHORTCUTS.NEW_OBJECT.key &&
        SHORTCUTS.NEW_OBJECT.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onNewObject?.();
      }

      // Cmd+, - open settings
      if (
        e.key === SHORTCUTS.SETTINGS.key &&
        SHORTCUTS.SETTINGS.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onSettings?.();
      }

      // Cmd+. - toggle detail panel
      if (
        e.key === SHORTCUTS.DETAIL.key &&
        SHORTCUTS.DETAIL.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onDetail?.();
      }

      // Cmd+Z / Ctrl+Z - undo
      if (
        e.key === SHORTCUTS.UNDO.key &&
        SHORTCUTS.UNDO.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onUndo?.();
      }

      // Cmd+K - command palette
      if (
        e.key === SHORTCUTS.COMMAND_PALETTE.key &&
        SHORTCUTS.COMMAND_PALETTE.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onPalette?.();
      }

      // Cmd+1/2/3 - direct view navigation
      if (e.metaKey) {
        if (e.key === '1') { e.preventDefault(); actions.onViewSpaces?.(); }
        if (e.key === '2') { e.preventDefault(); actions.onViewTags?.(); }
        if (e.key === '3') { e.preventDefault(); actions.onViewSettings?.(); }
        if (e.key === 'a') { e.preventDefault(); actions.onViewAll?.(); }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, state]);
}

// Export shortcuts config for reference/documentation
export { SHORTCUTS };
