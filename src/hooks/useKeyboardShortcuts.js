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
    modifiers: [],
    description: 'Navigate back',
  },
  NAV_FORWARD: {
    key: 'd',
    modifiers: [],
    description: 'Navigate forward',
  },
  NAV_ROOT: {
    key: '/',
    modifiers: ['metaKey'],
    description: 'Navigate to root (/)',
  },
  NAV_HOME: {
    key: '`',
    modifiers: ['metaKey'],
    description: 'Navigate to home (~)',
  },
  TOGGLE_VIEW: {
    key: 'v',
    modifiers: [],
    description: 'Toggle list/graph view',
  },
  PASTE_RESOURCE: {
    key: 'v',
    modifiers: ['metaKey'],
    description: 'Paste URL or file path as new object',
  },
  TAG_EDIT: {
    key: 'e',
    modifiers: ['metaKey'],
    description: 'Edit tags for selection',
  },
};

export function useKeyboardShortcuts(actions) {
  useEffect(() => {
    function handlePaste(e) {
      const active = document.activeElement;
      const inInput = active?.tagName === 'INPUT'
        || active?.tagName === 'TEXTAREA'
        || active?.isContentEditable;
      if (inInput) return;

      const uriList = e.clipboardData?.getData('text/uri-list') || '';
      const plain   = e.clipboardData?.getData('text/plain')    || '';
      const text    = uriList.trim() || plain.trim();
      if (!text) return;

      e.preventDefault();
      actions.onPaste?.(text);
    }

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

      // Cmd+/ - navigate to root (/)
      if (e.key === SHORTCUTS.NAV_ROOT.key && e.metaKey) {
        e.preventDefault();
        actions.onNavRoot?.();
      }

      // Cmd+` - navigate to home (~)
      if (e.key === SHORTCUTS.NAV_HOME.key && e.metaKey) {
        e.preventDefault();
        actions.onNavHome?.();
      }


      // Cmd+E - edit tags for selection
      if (
        e.key === SHORTCUTS.TAG_EDIT.key &&
        SHORTCUTS.TAG_EDIT.modifiers.some((mod) => e[mod])
      ) {
        e.preventDefault();
        actions.onTagEdit?.();
      }

      // V — toggle list/graph view (not in inputs)
      if (
        e.key === 'v' &&
        !e.metaKey && !e.ctrlKey && !e.altKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        !document.activeElement?.isContentEditable
      ) {
        e.preventDefault();
        actions.onToggleView?.();
      }

      // ArrowLeft/Right and A/D — back/forward (not in inputs, no modifier required)
      const inInput = document.activeElement?.tagName === 'INPUT'
        || document.activeElement?.tagName === 'TEXTAREA'
        || document.activeElement?.isContentEditable;
      if (!inInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'ArrowLeft'  || e.key === 'a') { e.preventDefault(); actions.onNavBack?.(); }
        if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); actions.onNavForward?.(); }
      }

      // Escape — dismiss current overlay/view
      if (e.key === 'Escape') {
        actions.onEscape?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste',   handlePaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste',   handlePaste);
    };
  }, [actions]);
}

// Export shortcuts config for reference/documentation
export { SHORTCUTS };
