import { create } from 'zustand';

// Author: Claude Code
// Collections store - manages collections (saved queries) and filtered objects

export const useCollectionsStore = create((set, get) => ({
  collections: [],
  activeCollectionId: null,
  filteredObjects: null, // null = no filter, array = filtered objects
  loading: false,
  error: null,

  /**
   * System "ALL" collection - appears first, represents "no filter"
   */
  systemAll: {
    id: '__system_all',
    name: 'ALL',
    system: true,
    pinned: true,
  },

  /**
   * Load all collections from database
   */
  loadCollections: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.db.getAll('collections');
      if (result.success) {
        // Normalize collection IDs - ensure id field is always a plain string
        const normalizedCollections = (result.data || []).map((col) => {
          let id = col.id;
          // Extract plain ID if it's a RecordId object
          if (typeof id === 'object' && id.id) {
            id = id.id;
          } else if (typeof id === 'string' && id.includes(':')) {
            id = id.split(':')[1];
          }
          return { ...col, id };
        });
        set({ collections: normalizedCollections });
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
   * Create a new collection (optimistic update)
   */
  createCollection: async (collectionData) => {
    try {
      const result = await window.electronAPI.db.createCollection(collectionData);

      if (result.success) {
        // Optimistic update: add new collection to local state
        // Handle double-wrapped arrays from SurrealDB: [[{...}]]
        let newCollection = result.data;
        if (Array.isArray(newCollection)) {
          newCollection = newCollection[0];
          if (Array.isArray(newCollection)) {
            newCollection = newCollection[0];
          }
        }

        if (newCollection) {
          // Normalize ID
          let id = newCollection.id;
          if (typeof id === 'object' && id.id) {
            id = id.id;
          } else if (typeof id === 'string' && id.includes(':')) {
            id = id.split(':')[1];
          }
          newCollection = { ...newCollection, id };

          const collections = get().collections;
          set({ collections: [...collections, newCollection] });
        }
        return { success: true, data: result.data, warnings: result.warnings };
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
   * Update a collection (name or query)
   */
  updateCollection: async (collectionId, updates) => {
    try {
      const result = await window.electronAPI.db.updateCollection(collectionId, updates);

      if (result.success) {
        // Update in local state
        const collections = get().collections.map((c) => {
          const cId = (c.id && c.id.id) || c.id;
          if (cId === collectionId) {
            return { ...c, ...updates, updated_at: new Date().toISOString() };
          }
          return c;
        });
        set({ collections });

        // Re-evaluate if this collection is active
        const activeCollectionId = get().activeCollectionId;
        if (activeCollectionId === collectionId) {
          await get().activateCollection(collectionId);
        }

        return { success: true, data: result.data, warnings: result.warnings };
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
   * Delete a collection
   */
  deleteCollection: async (collectionId) => {
    try {
      const result = await window.electronAPI.db.deleteCollection(collectionId);

      if (result.success) {
        // Remove from local state
        const collections = get().collections.filter((c) => {
          const cId = (c.id && c.id.id) || c.id;
          return cId !== collectionId;
        });
        set({ collections });

        // Clear filter if this collection was active
        const activeCollectionId = get().activeCollectionId;
        if (activeCollectionId === collectionId) {
          set({ activeCollectionId: null, filteredObjects: null });
        }

        return { success: true };
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
   * Activate a collection - evaluate query and set filtered objects
   */
  activateCollection: async (collectionId) => {
    try {
      const result = await window.electronAPI.db.evaluateCollection(collectionId);

      if (result.success) {
        set({
          activeCollectionId: collectionId,
          filteredObjects: result.data,
        });
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
   * Deactivate collection - clear filter
   */
  deactivateCollection: () => {
    set({ activeCollectionId: null, filteredObjects: null });
  },

  /**
   * Toggle collection active state
   */
  toggleCollection: async (collectionId) => {
    const activeCollectionId = get().activeCollectionId;

    if (collectionId === '__system_all') {
      // System "ALL" collection always deactivates filter
      get().deactivateCollection();
      return;
    }

    if (activeCollectionId === collectionId) {
      // Already active, deactivate
      get().deactivateCollection();
    } else {
      // Not active, activate
      await get().activateCollection(collectionId);
    }
  },

  /**
   * Get all collections including system "ALL" collection
   */
  getAllCollections: () => {
    const systemAll = get().systemAll;
    const collections = get().collections;
    return [systemAll, ...collections];
  },
}));
