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
};

/**
 * Custom hook for keyboard shortcuts
 * @param {Object} actions - Object containing action callbacks
 * @param {Function} actions.onEscape - Called when Escape is pressed
 * @param {Function} actions.onNewObject - Called when Cmd/Ctrl+O is pressed
 * @param {Function} actions.onSettings - Called when Cmd+, is pressed
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
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, state]);
}

// Export shortcuts config for reference/documentation
export { SHORTCUTS };
