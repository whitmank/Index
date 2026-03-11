// Author: Claude Code (Anthropic)
// Undo/redo command stack for destructive operations

import { create } from 'zustand';

const MAX_HISTORY = 20;

export const useHistoryStore = create((set, get) => ({
  history: [], // [{ description, undo }]

  /**
   * Push an undo operation onto the stack
   * @param {Object} entry - { description: string, undo: async function }
   */
  push: ({ description, undo }) => {
    set((state) => ({
      history: [...state.history.slice(-(MAX_HISTORY - 1)), { description, undo }],
    }));
  },

  /**
   * Pop and execute the top undo operation
   */
  undo: async () => {
    const { history } = get();
    if (history.length === 0) return;
    const entry = history[history.length - 1];
    set((state) => ({ history: state.history.slice(0, -1) }));
    await entry.undo();
  },

  /**
   * Clear all undo history
   */
  clear: () => {
    set({ history: [] });
  },
}));
