// Author: Claude Code
// useIndexStore — unified data store for v0.4.
// Replaces useObjectsStore, useCollectionsStore, useTagsStore.
// LIVE SELECT subscriptions wire once on app mount via subscribeToLive().
// Space model: objects satisfy tag conditions; entering a space filters by server-side evaluation.
// activeView: 'list' | 'calendar' | 'graph' — set on enterSpace from space.default_view.

import { create } from 'zustand';

const SYSTEM_ALL_ID = '__system_all';

export const useIndexStore = create((set, get) => ({
  // ── Data ──────────────────────────────────────────────────────────────────
  objects: [],
  spaces: [],
  tags: [],
  tagTypes: {},        // System tag registry — fetched once on mount from db:getTagTypes
  objectTags: {},      // objectId → tag[] cache
  activeSpaceId: null,      // ID of current space; null = home grid
  spaceObjects: null,       // Evaluated result of active space query; null = not in a space
  activeCalendarDate: null, // 'YYYY-MM-DD'; set when drilling into a calendar day
  activeView: 'list',       // 'list' | 'calendar' | 'graph'
  _calendarBase: null,      // spaceObjects snapshot before entering a calendar day
  loading: false,
  error: null,

  // ── System spaces ─────────────────────────────────────────────────────────
  systemAll: {
    id: SYSTEM_ALL_ID,
    name: 'All',
    system: true,
    pinned: true,
    default_view: 'list',
  },

  // ── Initial load ──────────────────────────────────────────────────────────

  /**
   * Load all data from DB on mount.
   * Called once; LIVE SELECT handles subsequent updates.
   */
  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [objectsResult, spacesResult, tagsResult, tagTypesResult] = await Promise.all([
        window.electronAPI.db.getAll('objects'),
        window.electronAPI.db.getAll('spaces'),
        window.electronAPI.db.getAll('tag_definitions'),
        window.electronAPI.db.getTagTypes(),
      ]);

      const objects = objectsResult.success ? (objectsResult.data || []) : [];
      let spaces = spacesResult.success ? (spacesResult.data || []) : [];
      spaces = spaces.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
      const tags = tagsResult.success ? (tagsResult.data || []) : [];
      const tagTypes = tagTypesResult.success ? (tagTypesResult.data || {}) : {};

      set({ objects, spaces, tags, tagTypes });
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
      const id = result.id;

      if (action === 'CREATE') {
        set({ objects: [...objects, result] });
      } else if (action === 'UPDATE') {
        set({ objects: objects.map(o => o.id === id ? result : o) });
      } else if (action === 'DELETE') {
        set({ objects: objects.filter(o => o.id !== id) });
      }

      get()._reevaluateActiveSpace();
    });

    window.electronAPI.onTagAssignmentsLive(({ action, result }) => {
      // Tag assignment changes — clear the affected object's tag cache.
      const { objectTags } = get();
      const objectId = result.object_id;
      if (objectId && objectTags[objectId]) {
        const { [objectId]: _, ...rest } = objectTags;
        set({ objectTags: rest });
      }

      get()._reevaluateActiveSpace();
    });

    window.electronAPI.onSpacesLive(({ action, result }) => {
      const { spaces } = get();
      const id = result.id;

      if (action === 'CREATE') {
        const sorted = [...spaces, result].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
        set({ spaces: sorted });
      } else if (action === 'UPDATE') {
        set({ spaces: spaces.map(s => s.id === id ? result : s) });
        // Re-evaluate if the active space's definition changed
        const { activeSpaceId } = get();
        if (activeSpaceId === id) get()._reevaluateActiveSpace();
      } else if (action === 'DELETE') {
        set({ spaces: spaces.filter(s => s.id !== id) });
        const { activeSpaceId } = get();
        if (activeSpaceId === id) get().exitSpace();
      }
    });
  },

  // ── Derived ───────────────────────────────────────────────────────────────

  /**
   * Returns spaceObjects if in a space, else all objects.
   */
  getDisplayObjects: () => {
    const { spaceObjects, objects } = get();
    return spaceObjects !== null ? spaceObjects : objects;
  },

  /**
   * All spaces including system ALL — sorted by order.
   */
  getAllSpaces: () => {
    const { systemAll, spaces } = get();
    const sorted = [...spaces].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    return [systemAll, ...sorted];
  },

  /**
   * Dates that have at least one object (space-aware).
   * When drilling into a calendar day, uses the pre-day snapshot so the grid stays accurate.
   */
  getDatesWithObjects: () => {
    const { spaceObjects, objects, _calendarBase, activeCalendarDate } = get();
    const source = activeCalendarDate ? (_calendarBase ?? objects) : (spaceObjects ?? objects);
    return new Set(source.map(o => o.created_at?.slice(0, 10)).filter(Boolean));
  },

  // ── View management ───────────────────────────────────────────────────────

  setView: (viewType) => set({ activeView: viewType }),

  // ── Space navigation ──────────────────────────────────────────────────────

  /**
   * Enter a space — evaluate its query and store results in spaceObjects.
   * SYSTEM_ALL_ID navigates into the "all objects" view (spaceObjects stays null).
   * Passing null exits to the home grid.
   */
  enterSpace: async (spaceId) => {
    if (!spaceId) {
      get().exitSpace();
      return;
    }

    if (spaceId === SYSTEM_ALL_ID) {
      set({ activeSpaceId: SYSTEM_ALL_ID, spaceObjects: null, activeView: 'list' });
      return;
    }

    const { spaces } = get();
    const space = spaces.find(s => s.id === spaceId);
    set({ activeSpaceId: spaceId, activeView: space?.default_view ?? 'list' });

    const result = await window.electronAPI.db.evaluateSpace(spaceId);
    if (result.success) {
      set({ spaceObjects: result.data || [] });
    } else {
      console.error('[Store] evaluateSpace failed:', result.error);
    }
  },

  enterCalendarDay: (dateStr) => {
    const { spaceObjects, objects } = get();
    const base = spaceObjects ?? objects;
    const dayObjects = base.filter(o => o.created_at?.slice(0, 10) === dateStr);
    set({ activeCalendarDate: dateStr, _calendarBase: spaceObjects, spaceObjects: dayObjects });
  },

  exitCalendarDay: () => {
    const { _calendarBase } = get();
    set({ activeCalendarDate: null, spaceObjects: _calendarBase, _calendarBase: null });
  },

  /**
   * Return to home grid.
   */
  exitSpace: () => set({ activeSpaceId: null, spaceObjects: null, activeCalendarDate: null, activeView: 'list', _calendarBase: null }),

  /**
   * Toggle: exit if already in this space, enter otherwise.
   */
  toggleSpace: async (spaceId) => {
    const { activeSpaceId } = get();
    if (activeSpaceId === spaceId) {
      get().exitSpace();
    } else {
      await get().enterSpace(spaceId);
    }
  },

  /**
   * Re-run the active space query after objects or tag assignments change.
   * No-op if no space is active.
   * @private
   */
  _reevaluateActiveSpace: async () => {
    const { activeSpaceId, activeCalendarDate } = get();
    if (!activeSpaceId) return;
    if (activeSpaceId === SYSTEM_ALL_ID) return;

    // Re-filter calendar day if one is open
    if (activeCalendarDate) {
      const { _calendarBase, objects } = get();
      const base = _calendarBase ?? objects;
      const dayObjects = base.filter(o => o.created_at?.slice(0, 10) === activeCalendarDate);
      set({ spaceObjects: dayObjects });
      return;
    }

    const result = await window.electronAPI.db.evaluateSpace(activeSpaceId);
    if (result.success) {
      set({ spaceObjects: result.data || [] });
    }
  },

  // ── Space management ──────────────────────────────────────────────────────

  createSpace: async (spaceData) => {
    const spaces = get().spaces;
    const maxOrder = Math.max(...spaces.map(s => s.order ?? -1), -1);
    const dataWithOrder = { ...spaceData, order: maxOrder + 1 };

    const result = await window.electronAPI.db.createSpace(dataWithOrder);
    if (!result.success) throw new Error(result.error);
    return { success: true, data: result.data, warnings: result.warnings };
    // LIVE SELECT adds it to spaces automatically
  },

  updateSpace: async (spaceId, updates) => {
    const result = await window.electronAPI.db.updateSpace(spaceId, updates);
    if (!result.success) throw new Error(result.error);

    const { activeSpaceId } = get();
    if (activeSpaceId === spaceId) await get()._reevaluateActiveSpace();

    return { success: true, data: result.data };
  },

  deleteSpace: async (spaceId) => {
    const result = await window.electronAPI.db.deleteSpace(spaceId);
    if (!result.success) throw new Error(result.error);

    const { activeSpaceId } = get();
    if (activeSpaceId === spaceId) get().exitSpace();

    return { success: true };
    // LIVE SELECT removes it automatically
  },

  reorderSpaces: async (reorderedSpaces) => {
    set({ spaces: reorderedSpaces });
    await Promise.all(
      reorderedSpaces.map((space, index) =>
        window.electronAPI.db.updateSpace(space.id, { order: index })
      )
    );
  },

  // ── Write semantics ───────────────────────────────────────────────────────

  /**
   * Place an object in a space by assigning all of the space's query.all tags.
   * query.any and query.none are intentionally excluded.
   */
  addObjectToSpace: async (objectId, spaceId) => {
    const { spaces } = get();
    const space = spaces.find(s => s.id === spaceId);
    if (!space) throw new Error(`Space ${spaceId} not found`);

    const requiredTags = space.query?.all || [];
    if (requiredTags.length === 0) return;

    // Load current tags for object if not cached
    const { objectTags } = get();
    let currentTags = objectTags[objectId];
    if (!currentTags) {
      currentTags = await get().loadTagsForObject(objectId);
    }

    const currentTagIds = new Set(currentTags.map(t => t.id));
    const missingTags = requiredTags.filter(tagId => !currentTagIds.has(tagId));

    await Promise.all(missingTags.map(tagId => get().assignTag(objectId, tagId)));
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

  deleteTag: async (tagId) => {
    const result = await window.electronAPI.db.deleteTag(tagId);
    if (!result.success) throw new Error(result.error);
    set(state => ({ tags: state.tags.filter(t => t.id !== tagId) }));
  },

  updateTag: async (tagId, updates) => {
    const result = await window.electronAPI.db.updateTag(tagId, updates);
    if (!result.success) throw new Error(result.error);
    set(state => ({ tags: state.tags.map(t => t.id === tagId ? { ...t, ...updates } : t) }));
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
