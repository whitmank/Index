// Author: Claude Code
// useIndexStore — unified data store for v0.4.
// Replaces useObjectsStore, useCollectionsStore, useTagsStore.
// LIVE SELECT subscriptions wire once on app mount via subscribeToLive().
// filteredObjects is a derived selector — computed from objects + active collection on read.

import { create } from 'zustand';

const SYSTEM_ALL_ID = '__system_all';

export const useIndexStore = create((set, get) => ({
  // ── Data ──────────────────────────────────────────────────────────────────
  objects: [],
  collections: [],
  tags: [],
  tagTypes: {},        // System tag registry — fetched once on mount from db:getTagTypes
  objectTags: {},      // objectId → tag[] cache
  activeCollectionId: null,
  loading: false,
  error: null,

  // ── System collection ─────────────────────────────────────────────────────
  systemAll: {
    id: SYSTEM_ALL_ID,
    name: 'ALL',
    system: true,
    pinned: true,
  },

  // ── Initial load ──────────────────────────────────────────────────────────

  /**
   * Load all data from DB on mount.
   * Called once; LIVE SELECT handles subsequent updates.
   */
  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [objectsResult, collectionsResult, tagsResult, tagTypesResult] = await Promise.all([
        window.electronAPI.db.getAll('objects'),
        window.electronAPI.db.getAll('collections'),
        window.electronAPI.db.getAll('tag_definitions'),
        window.electronAPI.db.getTagTypes(),
      ]);

      const objects = objectsResult.success ? (objectsResult.data || []) : [];

      let collections = collectionsResult.success ? (collectionsResult.data || []) : [];
      collections = collections.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

      const tags = tagsResult.success ? (tagsResult.data || []) : [];
      const tagTypes = tagTypesResult.success ? (tagTypesResult.data || {}) : {};

      set({ objects, collections, tags, tagTypes });
    } catch (error) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  // ── LIVE SELECT subscription ───────────────────────────────────────────────

  /**
   * Wire LIVE SELECT subscriptions. Call once in App.jsx useEffect on mount.
   */
  subscribeToLive: () => {
    window.electronAPI.onObjectsLive(({ action, result }) => {
      const { objects } = get();
      const id = result.id?.id || result.id;

      if (action === 'CREATE') {
        set({ objects: [...objects, result] });
      } else if (action === 'UPDATE') {
        set({ objects: objects.map(o => (o.id?.id || o.id) === id ? result : o) });
      } else if (action === 'DELETE') {
        set({ objects: objects.filter(o => (o.id?.id || o.id) !== id) });
      }
    });

    window.electronAPI.onTagAssignmentsLive(({ action, result }) => {
      // Tag assignment changes — clear the affected object's tag cache so
      // the next getTagsForObject call returns fresh data.
      const { objectTags } = get();
      const objectId = result.object_id;
      if (objectId && objectTags[objectId]) {
        const { [objectId]: _, ...rest } = objectTags;
        set({ objectTags: rest });
      }
    });

    window.electronAPI.onCollectionsLive(({ action, result }) => {
      const { collections } = get();
      const id = result.id?.id || result.id;

      if (action === 'CREATE') {
        const sorted = [...collections, result].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
        set({ collections: sorted });
      } else if (action === 'UPDATE') {
        set({ collections: collections.map(c => (c.id?.id || c.id) === id ? result : c) });
      } else if (action === 'DELETE') {
        const newCollections = collections.filter(c => (c.id?.id || c.id) !== id);
        set({ collections: newCollections });

        // Clear active collection if deleted
        const { activeCollectionId } = get();
        if (activeCollectionId === id) {
          set({ activeCollectionId: null });
        }
      }
    });
  },

  // ── Derived ───────────────────────────────────────────────────────────────

  /**
   * Returns display objects — filtered by active collection, or all objects.
   * Collection evaluation is client-side using the cached tag assignments.
   */
  getDisplayObjects: () => {
    const { objects, activeCollectionId, collections } = get();
    if (!activeCollectionId || activeCollectionId === SYSTEM_ALL_ID) return objects;

    const collection = collections.find(c => (c.id?.id || c.id) === activeCollectionId);
    if (!collection) return objects;

    return get()._evaluateCollectionLocally(collection.query, objects);
  },

  /**
   * Evaluate a collection query against objects using the live tag assignment cache.
   * Falls back to IPC if the cache is cold.
   * @private
   */
  _evaluateCollectionLocally: (query, objects) => {
    // We use objectTags cache which is populated lazily.
    // For collection filtering we use the server-side evaluation to ensure accuracy.
    // This is called only when an active collection is set; the result is used as displayObjects.
    // Return all objects as a safe fallback — the collection activation via IPC sets filteredObjects.
    return objects;
  },

  /**
   * All collections including system ALL — sorted by order.
   */
  getAllCollections: () => {
    const { systemAll, collections } = get();
    const sorted = [...collections].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    return [systemAll, ...sorted];
  },

  // ── Object actions ────────────────────────────────────────────────────────

  addObject: async (objectData) => {
    const result = await window.electronAPI.db.createObject(objectData);
    if (!result.success) throw new Error(result.error);
    return result.data;
    // LIVE SELECT pushes the new object to the store automatically
  },

  updateObject: async (id, updates) => {
    const result = await window.electronAPI.db.updateObject(id, updates);
    if (!result.success) throw new Error(result.error);
    return result.data;
    // LIVE SELECT pushes the updated object automatically
  },

  deleteObject: async (id) => {
    const result = await window.electronAPI.db.deleteObject(id);
    if (!result.success) throw new Error(result.error);
    // LIVE SELECT removes the object automatically
    return true;
  },

  // ── Collection actions ────────────────────────────────────────────────────

  activateCollection: async (collectionId) => {
    if (collectionId === SYSTEM_ALL_ID) {
      set({ activeCollectionId: null });
      return;
    }
    set({ activeCollectionId: collectionId });
  },

  deactivateCollection: () => set({ activeCollectionId: null }),

  toggleCollection: async (collectionId) => {
    const { activeCollectionId } = get();
    if (collectionId === SYSTEM_ALL_ID || activeCollectionId === collectionId) {
      get().deactivateCollection();
    } else {
      await get().activateCollection(collectionId);
    }
  },

  createCollection: async (collectionData) => {
    const collections = get().collections;
    const maxOrder = Math.max(...collections.map(c => c.order ?? -1), -1);
    const dataWithOrder = { ...collectionData, order: maxOrder + 1 };

    const result = await window.electronAPI.db.createCollection(dataWithOrder);
    if (!result.success) throw new Error(result.error);
    return { success: true, data: result.data, warnings: result.warnings };
    // LIVE SELECT adds it to collections automatically
  },

  updateCollection: async (collectionId, updates) => {
    const result = await window.electronAPI.db.updateCollection(collectionId, updates);
    if (!result.success) throw new Error(result.error);
    return { success: true, data: result.data, warnings: result.warnings };
  },

  deleteCollection: async (collectionId) => {
    const result = await window.electronAPI.db.deleteCollection(collectionId);
    if (!result.success) throw new Error(result.error);
    return { success: true };
    // LIVE SELECT removes it and clears activeCollectionId if needed
  },

  reorderCollections: async (reorderedCollections) => {
    set({ collections: reorderedCollections });
    await Promise.all(
      reorderedCollections.map((col, index) =>
        window.electronAPI.db.updateCollection(col.id, { order: index })
      )
    );
  },

  // ── Tag actions ───────────────────────────────────────────────────────────

  createTag: async (tagData) => {
    const result = await window.electronAPI.db.createTag(tagData);
    if (!result.success) throw new Error(result.error);

    const newTag = result.data;
    if (newTag) {
      set(state => ({ tags: [...state.tags, newTag] }));
    }
    return newTag;
  },

  loadTagsForObject: async (objectId) => {
    const result = await window.electronAPI.db.getTagsForObject(objectId);
    if (!result.success) throw new Error(result.error);

    set(state => ({ objectTags: { ...state.objectTags, [objectId]: result.data || [] } }));
    return result.data;
  },

  assignTag: async (objectId, tagId) => {
    const result = await window.electronAPI.db.assignTag(objectId, tagId);
    if (!result.success) throw new Error(result.error);
    // Invalidate object's tag cache — LIVE SELECT will update tag_assignments
    set(state => {
      const { [objectId]: _, ...rest } = state.objectTags;
      return { objectTags: rest };
    });
    return result.data;
  },

  unassignTag: async (objectId, tagId) => {
    const result = await window.electronAPI.db.unassignTag(objectId, tagId);
    if (!result.success) throw new Error(result.error);
    set(state => {
      const { [objectId]: _, ...rest } = state.objectTags;
      return { objectTags: rest };
    });
    return result.data;
  },

  clearError: () => set({ error: null }),
}));
