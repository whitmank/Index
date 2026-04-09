// Author: Claude Code
// useIndexStore — unified data store.
// Spaces are objects with space: true — no separate primitive.
// Tag assignments are RELATE edges (tagged table).
// Explicit containment is RELATE edges (contains, excludes tables).
// LIVE SELECT subscriptions wire once on app mount via subscribeToLive().

import { create } from 'zustand';

// Fixed IDs for system spaces — must match electron/main/db/connection.js
export const HOME_SPACE_ID = 'objects:⟨~⟩';
export const ROOT_SPACE_ID = 'objects:⟨/⟩';

export const useIndexStore = create((set, get) => ({
  // ── Data ──────────────────────────────────────────────────────────────────
  objects: [],          // All records: leaf objects AND spaces
  tags: [],
  tagTypes: [],         // tag_types records array, sorted by order
  typedEdges: [],       // typed edge records: { id, in, out }
  devices: [],          // devices table records: { id, name, created_at }
  objectTags: {},       // objectId → tag[] cache
  activeSpaceId: HOME_SPACE_ID,  // ID of the active space; always set — home is the default
  activeSpaceObjects: [],        // Evaluated contents of the active space
  activeCalendarDate: null,
  activeView: 'list',
  _calendarBase: null,
  loading: false,
  error: null,

  // ── Navigation history ────────────────────────────────────────────────────
  navHistory: [HOME_SPACE_ID],
  navCursor: 0,

  // ── Initial load ──────────────────────────────────────────────────────────

  /**
   * Load all data from DB on mount.
   * Called once; LIVE SELECT handles subsequent updates.
   */
  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [objectsResult, tagsResult, tagTypesResult, typedResult, devicesResult] = await Promise.all([
        window.electronAPI.db.getAll('objects'),
        window.electronAPI.db.getAll('tag_definitions'),
        window.electronAPI.db.getTagTypes(),
        window.electronAPI.db.getAll('typed'),
        window.electronAPI.db.getDevices(),
      ]);

      const objects     = objectsResult.success   ? (objectsResult.data   || []) : [];
      const tags        = tagsResult.success      ? (tagsResult.data      || []) : [];
      const tagTypes    = tagTypesResult.success  ? (tagTypesResult.data  || []) : [];
      const typedEdges  = typedResult.success     ? (typedResult.data     || []) : [];
      const devices     = devicesResult.success   ? (devicesResult.data   || []) : [];

      set({ objects, tags, tagTypes, typedEdges, devices });
      await get()._reevaluateActiveSpace();
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
        get()._reevaluateActiveSpace();
      } else if (action === 'UPDATE') {
        set({ objects: objects.map(o => o.id === id ? result : o) });
        get()._reevaluateActiveSpace();
      } else if (action === 'DELETE') {
        set({ objects: objects.filter(o => o.id !== id) });
        const { activeSpaceId } = get();
        if (activeSpaceId === id) get().exitSpace();
        else get()._reevaluateActiveSpace();
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
      get()._reevaluateActiveSpace();
    });

    window.electronAPI.onContainsLive(({ action, result }) => {
      const parentId = result.in?.toString?.() ?? result.in;
      const { activeSpaceId } = get();
      if (activeSpaceId === parentId) get()._reevaluateActiveSpace();
    });

    window.electronAPI.onExcludesLive(({ action, result }) => {
      // excludes edge changed — re-evaluate if the affected space is active
      const { activeSpaceId } = get();
      const parentId = result.in?.toString?.() ?? result.in;
      if (activeSpaceId && activeSpaceId === parentId) {
        get()._reevaluateActiveSpace();
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

    window.electronAPI.onDevicesLive(({ action, result }) => {
      const { devices } = get();
      const id = result.id;
      if (action === 'CREATE') {
        set({ devices: [...devices, result] });
      } else if (action === 'UPDATE') {
        set({ devices: devices.map(d => d.id === id ? result : d) });
      } else if (action === 'DELETE') {
        set({ devices: devices.filter(d => d.id !== id) });
      }
    });

    window.electronAPI.onSourcedFromLive(() => {
      get()._reevaluateActiveSpace();
    });
  },

  // ── Derived ───────────────────────────────────────────────────────────────

  /**
   * All space objects sorted by order then name.
   */
  getAllSpaces: () => {
    return get().objects
      .filter(o => o.space)
      .sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity) || (a.name || '').localeCompare(b.name || ''));
  },

  /**
   * Dates that have at least one non-space object (for calendar dot markers).
   * Spaces are excluded — they are navigational, not temporal content.
   */
  getDatesWithObjects: () => {
    const { activeSpaceObjects, objects, _calendarBase, activeCalendarDate } = get();
    const source = activeCalendarDate ? (_calendarBase ?? activeSpaceObjects) : activeSpaceObjects;
    return new Set(source.map(o => o.created_at?.slice(0, 10)).filter(Boolean));
  },

  // ── View management ───────────────────────────────────────────────────────

  setView: (viewType) => set({ activeView: viewType }),

  // ── Space navigation ──────────────────────────────────────────────────────

  /**
   * Internal: activate a space without touching navigation history.
   * @private
   */
  _activateSpace: async (spaceId) => {
    const { objects } = get();
    const space = objects.find(o => o.id === spaceId);

    // "ALL" shows every non-system object — leaf objects and user spaces.
    if (spaceId === ROOT_SPACE_ID) {
      const allObjects = get().objects.filter(o => !o.system);
      set({ activeSpaceId: spaceId, activeSpaceObjects: allObjects, activeView: space?.default_view ?? 'list' });
      window.electronAPI?.app?.setActiveSpace(spaceId);
      return;
    }

    set({ activeSpaceId: spaceId, activeView: space?.default_view ?? 'list', activeSpaceObjects: [] });
    window.electronAPI?.app?.setActiveSpace(spaceId);
    const result = await window.electronAPI.db.evaluateSpace(spaceId);
    if (result.success) {
      set({ activeSpaceObjects: result.data || [] });
    } else {
      console.error('[Store] evaluateSpace failed:', result.error);
    }
  },

  _navPush: (spaceId) => {
    const { navHistory, navCursor } = get();
    const next = [...navHistory.slice(0, navCursor + 1), spaceId];
    set({ navHistory: next, navCursor: next.length - 1 });
  },

  /**
   * Enter a space — evaluate its query and push to navigation history.
   */
  enterSpace: async (spaceId) => {
    await get()._activateSpace(spaceId);
    get()._navPush(spaceId);
  },

  enterCalendarDay: (dateStr) => {
    const { activeSpaceObjects } = get();
    const dayObjects = activeSpaceObjects.filter(o => o.created_at?.slice(0, 10) === dateStr);
    set({ activeCalendarDate: dateStr, _calendarBase: activeSpaceObjects, activeSpaceObjects: dayObjects });
  },

  exitCalendarDay: () => {
    const { _calendarBase } = get();
    set({ activeCalendarDate: null, activeSpaceObjects: _calendarBase, _calendarBase: null });
  },

  exitSpace: async () => {
    set({ activeCalendarDate: null, activeView: 'list', _calendarBase: null });
    await get()._activateSpace(HOME_SPACE_ID);
    get()._navPush(HOME_SPACE_ID);
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

  toggleSpace: async (spaceId) => {
    const { activeSpaceId } = get();
    if (activeSpaceId === spaceId) {
      get().exitSpace();
    } else {
      await get().enterSpace(spaceId);
    }
  },

  /**
   * Re-run the active space query after objects or edges change.
   * No-op if no space is active or if the active space is a system space.
   * @private
   */
  _reevaluateActiveSpace: async () => {
    const { activeSpaceId, activeCalendarDate, objects } = get();

    if (activeSpaceId === ROOT_SPACE_ID) {
      set({ activeSpaceObjects: objects.filter(o => !o.system) });
      return;
    }

    if (activeCalendarDate) {
      const { _calendarBase } = get();
      const nonSpaceObjects = objects.filter(o => !o.space);
      const base = _calendarBase ?? nonSpaceObjects;
      const dayObjects = base.filter(o => o.created_at?.slice(0, 10) === activeCalendarDate);
      set({ activeSpaceObjects: dayObjects });
      return;
    }

    const result = await window.electronAPI.db.evaluateSpace(activeSpaceId);
    if (result.success) {
      set({ activeSpaceObjects: result.data || [] });
    }
  },

  pinToHome: async (objectId) => {
    const result = await window.electronAPI.db.addContains(HOME_SPACE_ID, objectId);
    if (!result.success) throw new Error(result.error);
  },

  unpinFromHome: async (objectId) => {
    const result = await window.electronAPI.db.removeContains(HOME_SPACE_ID, objectId);
    if (!result.success) throw new Error(result.error);
  },

  // ── Space management ──────────────────────────────────────────────────────

  createSpace: async (data) => {
    const spaces = get().objects.filter(o => o.space && !o.system);
    const maxOrder = Math.max(...spaces.map(c => c.order ?? -1), -1);
    const dataWithOrder = { ...data, order: maxOrder + 1 };

    const result = await window.electronAPI.db.createSpace(dataWithOrder);
    if (!result.success) throw new Error(result.error);

    return { success: true, data: result.data };
  },

  updateSpace: async (spaceId, updates) => {
    const result = await window.electronAPI.db.updateSpace(spaceId, updates);
    if (!result.success) throw new Error(result.error);

    const { activeSpaceId } = get();
    if (activeSpaceId === spaceId) await get()._reevaluateActiveSpace();

    return { success: true, data: result.data };
  },

  deleteSpace: async (spaceId) => {
    const result = await window.electronAPI.db.deleteObject(spaceId);
    if (!result.success) throw new Error(result.error);

    const { activeSpaceId } = get();
    if (activeSpaceId === spaceId) get().exitSpace();

    return { success: true };
    // LIVE SELECT removes it automatically
  },

  reorderSpaces: async (reorderedSpaces) => {
    set(state => ({
      objects: state.objects.map(o => {
        const reordered = reorderedSpaces.find(c => c.id === o.id);
        return reordered ? { ...o, order: reordered.order } : o;
      }),
    }));
    await Promise.all(
      reorderedSpaces.map((space, index) =>
        window.electronAPI.db.updateSpace(space.id, { order: index })
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

  batchAssignTag: async (objectIds, tagId) => {
    await Promise.all(objectIds.map(id => get().assignTag(id, tagId)));
  },

  batchUnassignTag: async (objectIds, tagId) => {
    await Promise.all(objectIds.map(id => get().unassignTag(id, tagId)));
  },

  clearError: () => set({ error: null }),
}));
