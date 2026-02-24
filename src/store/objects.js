import { create } from 'zustand';

// Author: Claude Code
// Objects store - manages synced state with database

export const useObjectsStore = create((set) => ({
  objects: [],
  loading: false,
  error: null,

  /**
   * Load all objects from database
   */
  loadObjects: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.db.getAll('objects');
      if (result.success) {
        set({ objects: result.data || [] });
      } else {
        set({ error: result.error });
      }
    } catch (error) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  /**
   * Add object to store and database
   */
  addObject: async (objectData) => {
    try {
      const result = await window.electronAPI.db.createObject(objectData);
      if (result.success) {
        // Reload all objects to ensure consistency
        await useObjectsStore.getState().loadObjects();
        return result.data;
      } else {
        set({ error: result.error });
        throw new Error(result.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Update object in store and database
   */
  updateObject: async (id, updates) => {
    try {
      const result = await window.electronAPI.db.updateObject(id, updates);
      if (result.success) {
        // Reload all objects to ensure consistency
        await useObjectsStore.getState().loadObjects();
        return result.data;
      } else {
        set({ error: result.error });
        throw new Error(result.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Delete object from store and database
   */
  deleteObject: async (id) => {
    try {
      const result = await window.electronAPI.db.mutate(`DELETE objects:\`${id}\``);
      if (result.success) {
        // Reload all objects to ensure consistency
        await useObjectsStore.getState().loadObjects();
        return true;
      } else {
        set({ error: result.error });
        throw new Error(result.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Delete all objects
   */
  deleteAll: async () => {
    try {
      const result = await window.electronAPI.db.mutate('DELETE FROM objects');
      if (result.success) {
        // Reload all objects to ensure consistency
        await useObjectsStore.getState().loadObjects();
        return true;
      } else {
        set({ error: result.error });
        throw new Error(result.error);
      }
    } catch (error) {
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Clear error
   */
  clearError: () => set({ error: null }),
}));
