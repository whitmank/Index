// Author: Claude Code
// useIndexStore — unified data store for v0.4.2.
// Spaces are not a separate primitive — containers are objects with container: true.
// Tag assignments are RELATE edges (tagged table), not a join table.
// Explicit containment is RELATE edges (contains, excludes tables).
// LIVE SELECT subscriptions wire once on app mount via subscribeToLive().

import { create } from 'zustand';

// Fixed IDs for system containers — must match electron/main/db/connection.js
export const ROOT_CONTAINER_ID = 'objects:root';
export const ALL_CONTAINER_ID  = 'objects:all';

export const useIndexStore = create((set, get) => ({
  // ── Data ──────────────────────────────────────────────────────────────────
  objects: [],          // All records: leaf objects AND containers
  tags: [],
  tagTypes: [],         // tag_types records array, sorted by order
  typedEdges: [],       // typed edge records: { id, in, out }
  objectTags: {},       // objectId → tag[] cache
  rootObjects: [],      // Evaluated contents of objects:root (user-pinned items)
  activeSpaceId: null,  // ID of current container (an object); null = home grid
  spaceObjects: null,   // Evaluated result of active container; null = not in a container
  activeCalendarDate: null,
  activeView: 'list',
  _calendarBase: null,
  loading: false,
  error: null,

  // ── Navigation history ────────────────────────────────────────────────────
  navHistory: [null],
  navCursor: 0,

  // ── Initial load ──────────────────────────────────────────────────────────

  /**
   * Load all data from DB on mount.
   * Called once; LIVE SELECT handles subsequent updates.
   */
  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [objectsResult, tagsResult, tagTypesResult, typedResult, rootResult] = await Promise.all([
        window.electronAPI.db.getAll('objects'),
        window.electronAPI.db.getAll('tag_definitions'),
        window.electronAPI.db.getTagTypes(),
        window.electronAPI.db.getAll('typed'),
        window.electronAPI.db.evaluateContainer(ROOT_CONTAINER_ID),
      ]);

      const objects     = objectsResult.success   ? (objectsResult.data   || []) : [];
      const tags        = tagsResult.success      ? (tagsResult.data      || []) : [];
      const tagTypes    = tagTypesResult.success  ? (tagTypesResult.data  || []) : [];
      const typedEdges  = typedResult.success     ? (typedResult.data     || []) : [];
      const rootObjects = rootResult.success      ? (rootResult.data      || []) : [];

      set({ objects, tags, tagTypes, typedEdges, rootObjects });
    } catch (error) {
      set({ error: error.message });
    } finally {
      set({ loading: false });
    }
  },

  _reloadTagTypes: async () => {
    const result = await window.electronAPI.db.getTagTypes();
    if (result.success) set({ tagTypes: result.data || [] });
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
        const { activeSpaceId } = get();
        if (activeSpaceId === id) get()._reevaluateActiveContainer();
      } else if (action === 'DELETE') {
        set({ objects: objects.filter(o => o.id !== id) });
        const { activeSpaceId } = get();
        if (activeSpaceId === id) get().exitSpace();
        // A deleted object may have been pinned to root
        get()._reevaluateRoot();
      }

      if (action !== 'UPDATE' || get().activeSpaceId !== id) {
        get()._reevaluateActiveContainer();
      }
    });

    window.electronAPI.onTaggedLive(({ action, result }) => {
      // tagged edge changed — clear affected object's tag cache and re-evaluate
      const { objectTags } = get();
      const objectId = result.in?.toString?.() ?? result.in;
      if (objectId && objectTags[objectId]) {
        const { [objectId]: _, ...rest } = objectTags;
        set({ objectTags: rest });
      }
      get()._reevaluateActiveContainer();
    });

    window.electronAPI.onContainsLive(({ action, result }) => {
      const parentId = result.in?.toString?.() ?? result.in;
      // Re-evaluate root if a pin was added/removed
      if (parentId === ROOT_CONTAINER_ID) get()._reevaluateRoot();
      // Re-evaluate active container if it's affected
      const { activeSpaceId } = get();
      if (activeSpaceId && activeSpaceId === parentId) get()._reevaluateActiveContainer();
    });

    window.electronAPI.onExcludesLive(({ action, result }) => {
      // excludes edge changed — re-evaluate if the affected container is active
      const { activeSpaceId } = get();
      const parentId = result.in?.toString?.() ?? result.in;
      if (activeSpaceId && activeSpaceId === parentId) {
        get()._reevaluateActiveContainer();
      }
    });

    window.electronAPI.onTagDefinitionsLive(({ action, result }) => {
      const { tags } = get();
      const id = result.id;
      if (action === 'CREATE') {
        set({ tags: [...tags, result] });
      } else if (action === 'UPDATE') {
        set({ tags: tags.map(t => t.id === id ? result : t) });
      } else if (action === 'DELETE') {
        set({ tags: tags.filter(t => t.id !== id) });
      }
    });

    window.electronAPI.onTypedLive(({ action, result }) => {
      const { typedEdges } = get();
      const id = result.id;
      if (action === 'CREATE') {
        set({ typedEdges: [...typedEdges, result] });
      } else if (action === 'DELETE') {
        set({ typedEdges: typedEdges.filter(e => e.id !== id) });
      }
    });
  },

  // ── Derived ───────────────────────────────────────────────────────────────

  /**
   * All container objects sorted by order then name.
   */
  getAllContainers: () => {
    return get().objects
      .filter(o => o.container)
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.name || '').localeCompare(b.name || ''));
  },

  /**
   * Dates that have at least one non-container object (for calendar dot markers).
   * Containers are excluded — they are navigational, not temporal content.
   */
  getDatesWithObjects: () => {
    const { spaceObjects, objects, _calendarBase, activeCalendarDate } = get();
    const leafObjects = objects.filter(o => !o.container);
    const spaceLeafs = spaceObjects?.filter(o => !o.container) ?? null;
    const source = activeCalendarDate ? (_calendarBase ?? leafObjects) : (spaceLeafs ?? leafObjects);
    return new Set(source.map(o => o.created_at?.slice(0, 10)).filter(Boolean));
  },

  // ── View management ───────────────────────────────────────────────────────

  setView: (viewType) => set({ activeView: viewType }),

  // ── Container navigation ──────────────────────────────────────────────────

  /**
   * Internal: activate a container without touching navigation history.
   * @private
   */
  _activateSpace: async (containerId) => {
    if (!containerId) {
      set({ activeSpaceId: null, spaceObjects: null, activeCalendarDate: null, activeView: 'list', _calendarBase: null });
      window.electronAPI?.app?.setActiveSpace(null);
      return;
    }

    const { objects } = get();
    const container = objects.find(o => o.id === containerId);

    // "ALL" shows every leaf object — no containers.
    if (containerId === ALL_CONTAINER_ID) {
      const leafObjects = get().objects.filter(o => !o.container);
      set({ activeSpaceId: containerId, spaceObjects: leafObjects, activeView: container?.default_view ?? 'list' });
      window.electronAPI?.app?.setActiveSpace(containerId);
      return;
    }

    set({ activeSpaceId: containerId, activeView: container?.default_view ?? 'list', spaceObjects: [] });
    window.electronAPI?.app?.setActiveSpace(containerId);
    const result = await window.electronAPI.db.evaluateContainer(containerId);
    if (result.success) {
      set({ spaceObjects: result.data || [] });
    } else {
      console.error('[Store] evaluateContainer failed:', result.error);
    }
  },

  _navPush: (spaceId) => {
    const { navHistory, navCursor } = get();
    const next = [...navHistory.slice(0, navCursor + 1), spaceId];
    set({ navHistory: next, navCursor: next.length - 1 });
  },

  /**
   * Enter a container — evaluate its query and push to navigation history.
   */
  enterSpace: async (containerId) => {
    if (!containerId) {
      get().exitSpace();
      return;
    }
    await get()._activateSpace(containerId);
    get()._navPush(containerId);
  },

  enterCalendarDay: (dateStr) => {
    const { spaceObjects, objects } = get();
    const nonContainerObjects = objects.filter(o => !o.container);
    const base = spaceObjects ?? nonContainerObjects;
    const dayObjects = base.filter(o => o.created_at?.slice(0, 10) === dateStr);
    set({ activeCalendarDate: dateStr, _calendarBase: spaceObjects, spaceObjects: dayObjects });
  },

  exitCalendarDay: () => {
    const { _calendarBase } = get();
    set({ activeCalendarDate: null, spaceObjects: _calendarBase, _calendarBase: null });
  },

  exitSpace: () => {
    set({ activeSpaceId: null, spaceObjects: null, activeCalendarDate: null, activeView: 'list', _calendarBase: null });
    window.electronAPI?.app?.setActiveSpace(null);
    get()._navPush(null);
  },

  navBack: async () => {
    const { navCursor, navHistory } = get();
    if (navCursor <= 0) return;
    const newCursor = navCursor - 1;
    set({ navCursor: newCursor });
    await get()._activateSpace(navHistory[newCursor]);
  },

  navForward: async () => {
    const { navCursor, navHistory } = get();
    if (navCursor >= navHistory.length - 1) return;
    const newCursor = navCursor + 1;
    set({ navCursor: newCursor });
    await get()._activateSpace(navHistory[newCursor]);
  },

  canNavBack:    () => get().navCursor > 0,
  canNavForward: () => get().navCursor < get().navHistory.length - 1,

  toggleSpace: async (containerId) => {
    const { activeSpaceId } = get();
    if (activeSpaceId === containerId) {
      get().exitSpace();
    } else {
      await get().enterSpace(containerId);
    }
  },

  /**
   * Re-run the active container query after objects or edges change.
   * No-op if no container is active or if the active container is a system container.
   * @private
   */
  _reevaluateActiveContainer: async () => {
    const { activeSpaceId, activeCalendarDate, objects } = get();
    if (!activeSpaceId) return;

    if (activeSpaceId === ALL_CONTAINER_ID) {
      set({ spaceObjects: objects.filter(o => !o.container) });
      return;
    }

    if (activeCalendarDate) {
      const { _calendarBase } = get();
      const nonContainerObjects = objects.filter(o => !o.container);
      const base = _calendarBase ?? nonContainerObjects;
      const dayObjects = base.filter(o => o.created_at?.slice(0, 10) === activeCalendarDate);
      set({ spaceObjects: dayObjects });
      return;
    }

    const result = await window.electronAPI.db.evaluateContainer(activeSpaceId);
    if (result.success) {
      set({ spaceObjects: result.data || [] });
    }
  },

  // ── Root management ───────────────────────────────────────────────────────

  _reevaluateRoot: async () => {
    const result = await window.electronAPI.db.evaluateContainer(ROOT_CONTAINER_ID);
    if (result.success) set({ rootObjects: result.data || [] });
  },

  pinToRoot: async (objectId) => {
    const result = await window.electronAPI.db.addContains(ROOT_CONTAINER_ID, objectId);
    if (!result.success) throw new Error(result.error);
  },

  unpinFromRoot: async (objectId) => {
    const result = await window.electronAPI.db.removeContains(ROOT_CONTAINER_ID, objectId);
    if (!result.success) throw new Error(result.error);
  },

  // ── Container management ──────────────────────────────────────────────────

  createContainer: async (data) => {
    const containers = get().objects.filter(o => o.container && !o.system);
    const maxOrder = Math.max(...containers.map(c => c.order ?? -1), -1);
    const dataWithOrder = { ...data, order: maxOrder + 1 };

    const result = await window.electronAPI.db.createContainer(dataWithOrder);
    if (!result.success) throw new Error(result.error);

    // Auto-pin to root so new containers appear at / by default
    const newId = result.data?.id;
    if (newId) await window.electronAPI.db.addContains(ROOT_CONTAINER_ID, newId);

    return { success: true, data: result.data };
  },

  updateContainer: async (containerId, updates) => {
    const result = await window.electronAPI.db.updateContainer(containerId, updates);
    if (!result.success) throw new Error(result.error);

    const { activeSpaceId } = get();
    if (activeSpaceId === containerId) await get()._reevaluateActiveContainer();

    return { success: true, data: result.data };
  },

  deleteContainer: async (containerId) => {
    const result = await window.electronAPI.db.deleteObject(containerId);
    if (!result.success) throw new Error(result.error);

    const { activeSpaceId } = get();
    if (activeSpaceId === containerId) get().exitSpace();

    return { success: true };
    // LIVE SELECT removes it automatically
  },

  reorderContainers: async (reorderedContainers) => {
    set(state => ({
      objects: state.objects.map(o => {
        const reordered = reorderedContainers.find(c => c.id === o.id);
        return reordered ? { ...o, order: reordered.order } : o;
      }),
    }));
    await Promise.all(
      reorderedContainers.map((container, index) =>
        window.electronAPI.db.updateContainer(container.id, { order: index })
      )
    );
  },

  // ── Explicit edge actions ─────────────────────────────────────────────────

  addContains: async (parentId, childId, order) => {
    const result = await window.electronAPI.db.addContains(parentId, childId, order);
    if (!result.success) throw new Error(result.error);
  },

  removeContains: async (parentId, childId) => {
    const result = await window.electronAPI.db.removeContains(parentId, childId);
    if (!result.success) throw new Error(result.error);
  },

  addExcludes: async (parentId, childId) => {
    const result = await window.electronAPI.db.addExcludes(parentId, childId);
    if (!result.success) throw new Error(result.error);
  },

  removeExcludes: async (parentId, childId) => {
    const result = await window.electronAPI.db.removeExcludes(parentId, childId);
    if (!result.success) throw new Error(result.error);
  },

  // ── Object actions ────────────────────────────────────────────────────────

  addObject: async (objectData) => {
    const result = await window.electronAPI.db.createObject(objectData);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  updateObject: async (id, updates) => {
    const result = await window.electronAPI.db.updateObject(id, updates);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  deleteObject: async (id) => {
    const result = await window.electronAPI.db.deleteObject(id);
    if (!result.success) throw new Error(result.error);
    return true;
  },

  // ── Tag type actions ──────────────────────────────────────────────────────

  createTagType: async (data) => {
    const result = await window.electronAPI.db.createTagType(data);
    if (!result.success) throw new Error(result.error);
    await get()._reloadTagTypes();
    return result.data;
  },

  updateTagType: async (typeId, updates) => {
    const result = await window.electronAPI.db.updateTagType(typeId, updates);
    if (!result.success) throw new Error(result.error);
    await get()._reloadTagTypes();
  },

  deleteTagType: async (typeId) => {
    const result = await window.electronAPI.db.deleteTagType(typeId);
    if (!result.success) throw new Error(result.error);
    await get()._reloadTagTypes();
    // typed edges for this type will be cleaned up by LIVE SELECT
  },

  // ── Tag actions ───────────────────────────────────────────────────────────

  createTag: async (tagData) => {
    const result = await window.electronAPI.db.createTag(tagData);
    if (!result.success) throw new Error(result.error);
    // LIVE SELECT on tag_definitions handles state update
    return result.data;
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
    // Invalidate object's tag cache — LIVE SELECT will update tagged edges
    set(state => {
      const { [objectId]: _, ...rest } = state.objectTags;
      return { objectTags: rest };
    });
    return result.data;
  },

  deleteTag: async (tagId) => {
    const result = await window.electronAPI.db.deleteTag(tagId);
    if (!result.success) throw new Error(result.error);
    // LIVE SELECT on tag_definitions handles state update
  },

  updateTag: async (tagId, updates) => {
    const result = await window.electronAPI.db.updateTag(tagId, updates);
    if (!result.success) throw new Error(result.error);
    // LIVE SELECT on tag_definitions handles state update
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
