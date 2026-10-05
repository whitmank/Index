import { useEffect } from 'react';

// Keyboard shortcuts configuration
const SHORTCUTS = {
  SETTINGS: {
    key: ',',
    modifiers: ['metaKey'],
    description: 'Open settings',
  },
  COMMAND_PALETTE: {
    key: 'k',
    modifiers: ['metaKey'],
    description: 'Open command palette',
  },
  SPACE_NAVIGATOR: {
    key: 'l',
    modifiers: ['metaKey'],
    description: 'Open space navigator',
  },
  NAV_BACK: {
    key: 'a',
    modifiers: ['metaKey'],
    description: 'Navigate back',
  },
  NAV_FORWARD: {
    key: 'd',
    modifiers: ['metaKey'],
    description: 'Navigate forward',
  },
  NAV_ROOT: {
    key: '/',
    modifiers: ['metaKey'],
    description: 'Navigate to root',
  },
};

export function useKeyboardShortcuts(actions) {
  useEffect(() => {
    function handleKeyDown(e) {
      // Cmd+, - open settings
      if (
        e.key === SHORTCUTS.SETTINGS.key &&
        SHORTCUTS.SETTINGS.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onSettings?.();
      }

      // Cmd+K - command palette
      if (
        e.key === SHORTCUTS.COMMAND_PALETTE.key &&
        SHORTCUTS.COMMAND_PALETTE.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onPalette?.();
      }

      // Cmd+L - space navigator
      if (
        e.key === SHORTCUTS.SPACE_NAVIGATOR.key &&
        SHORTCUTS.SPACE_NAVIGATOR.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onSpaceNavigator?.();
      }

      // Cmd+/ - navigate to root
      if (e.key === SHORTCUTS.NAV_ROOT.key && e.metaKey) {
        e.preventDefault();
        actions.onNavRoot?.();
      }

      if (e.metaKey) {
        if (e.key === 'a') { e.preventDefault(); actions.onNavBack?.(); }
        if (e.key === 'd') { e.preventDefault(); actions.onNavForward?.(); }
      }

      // Cmd+Left/Right — back/forward (not in inputs)
      if (e.metaKey && document.activeElement?.tagName !== 'INPUT') {
        if (e.key === 'ArrowLeft')  { e.preventDefault(); actions.onNavBack?.(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); actions.onNavForward?.(); }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions]);
}

// Export shortcuts config for reference/documentation
export { SHORTCUTS };
