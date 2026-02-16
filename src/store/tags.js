import { create } from 'zustand';

// Author: Claude Code
// Tags store - manages tags and tag assignments

export const useTagsStore = create((set, get) => ({
  tags: [],
  objectTags: {}, // Maps objectId -> array of tags
  loading: false,
  error: null,

  /**
   * Load all tags from database
   */
  loadTags: async () => {
    set({ loading: true, error: null });
    try {
      const result = await window.electronAPI.db.getAll('tags');
      if (result.success) {
        set({ tags: result.data || [] });
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
   * Create a new tag (optimistic update)
   */
  createTag: async (tagData) => {
    try {
      const result = await window.electronAPI.db.createTag(tagData);

      if (result.success) {
        // Optimistic update: add new tag to local state
        const newTag = Array.isArray(result.data) ? result.data[0] : result.data;
        if (newTag) {
          const tags = get().tags;
          set({ tags: [...tags, newTag] });
        }
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
   * Get tags for a specific object
   */
  loadTagsForObject: async (objectId) => {
    try {
      const result = await window.electronAPI.db.getTagsForObject(objectId);
      if (result.success) {
        console.log(`[TagsStore] Loaded ${result.data?.length || 0} tags for object ${objectId}`);
        console.log(`[TagsStore] Tag data:`, result.data);
        const objectTags = get().objectTags;
        const newState = { ...objectTags, [objectId]: result.data || [] };
        console.log(`[TagsStore] Setting objectTags state:`, newState);
        set({ objectTags: newState });
        console.log(`[TagsStore] State set, current tags:`, get().objectTags);
        return result.data;
      } else {
        set({ error: result.error });
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`[TagsStore] Error loading tags for ${objectId}:`, error);
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Assign a tag to an object
   */
  assignTag: async (objectId, tagId) => {
    try {
      console.log(`[TagsStore] Assigning tag ${tagId} to object ${objectId}`);
      const result = await window.electronAPI.db.assignTag(objectId, tagId);

      if (!result.success) {
        throw new Error(result.error);
      }

      console.log(`[TagsStore] Tag assigned, reloading tags for object...`);
      // After successful persistence, reload the tags for this object to update UI
      await get().loadTagsForObject(objectId);

      return result.data;
    } catch (error) {
      console.error('[TagsStore] assignTag error:', error);
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Remove a tag from an object
   */
  unassignTag: async (objectId, tagId) => {
    try {
      const result = await window.electronAPI.db.unassignTag(objectId, tagId);

      if (!result.success) {
        throw new Error(result.error);
      }

      // After successful persistence, reload the tags for this object to update UI
      await get().loadTagsForObject(objectId);

      return result.data;
    } catch (error) {
      console.error('[TagsStore] unassignTag error:', error);
      set({ error: error.message });
      throw error;
    }
  },

  /**
   * Clear error
   */
  clearError: () => set({ error: null }),
}));
