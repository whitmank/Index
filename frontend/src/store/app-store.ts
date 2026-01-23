/**
 * Index v0.3 - Main Zustand Store
 *
 * Centralized state management for:
 * - Objects (formerly nodes)
 * - Tags (definitions)
 * - Collections
 * - Links
 * - Selection state
 * - UI state
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  IndexObject,
  TagDefinition,
  TagAssignment,
  Collection,
  Link,
} from '@shared/types/models';

// ============================================
// STORE STATE TYPES
// ============================================

export interface AppStore {
  // ============================================
  // DATA STATE (Maps for fast lookup)
  // ============================================

  objects: Map<string, IndexObject>;
  tagDefinitions: Map<string, TagDefinition>;
  tagAssignments: Map<string, TagAssignment>;
  collections: Map<string, Collection>;
  links: Map<string, Link>;

  // ============================================
  // SELECTION STATE
  // ============================================

  selectedObjectIds: Set<string>;

  // ============================================
  // UI STATE
  // ============================================

  detailPanelOpen: boolean;
  sidebarCollapsed: boolean;
  currentView: 'all-objects' | 'tags' | 'collections' | 'settings';
  searchQuery: string;
  sortField: 'name' | 'created_at' | 'modified_at' | 'size';
  sortDirection: 'asc' | 'desc';

  // ============================================
  // LOADING STATE
  // ============================================

  loading: boolean;
  error: string | null;

  // ============================================
  // OBJECT ACTIONS
  // ============================================

  setObjects: (objects: IndexObject[]) => void;
  addObject: (obj: IndexObject) => void;
  updateObject: (id: string, updates: Partial<IndexObject>) => void;
  deleteObject: (id: string) => void;
  getObject: (id: string) => IndexObject | null;

  // ============================================
  // TAG DEFINITION ACTIONS
  // ============================================

  setTagDefinitions: (tags: TagDefinition[]) => void;
  addTagDefinition: (tag: TagDefinition) => void;
  updateTagDefinition: (id: string, updates: Partial<TagDefinition>) => void;
  deleteTagDefinition: (id: string) => void;
  getTagDefinition: (id: string) => TagDefinition | null;

  // ============================================
  // TAG ASSIGNMENT ACTIONS
  // ============================================

  setTagAssignments: (assignments: TagAssignment[]) => void;
  addTagAssignment: (assignment: TagAssignment) => void;
  deleteTagAssignment: (id: string) => void;
  getTagsForObject: (objectId: string) => TagDefinition[];
  getObjectsWithTag: (tagId: string) => IndexObject[];

  // ============================================
  // COLLECTION ACTIONS
  // ============================================

  setCollections: (collections: Collection[]) => void;
  addCollection: (collection: Collection) => void;
  updateCollection: (id: string, updates: Partial<Collection>) => void;
  deleteCollection: (id: string) => void;
  getCollection: (id: string) => Collection | null;

  // ============================================
  // LINK ACTIONS
  // ============================================

  setLinks: (links: Link[]) => void;
  addLink: (link: Link) => void;
  updateLink: (id: string, updates: Partial<Link>) => void;
  deleteLink: (id: string) => void;

  // ============================================
  // SELECTION ACTIONS
  // ============================================

  toggleSelect: (id: string) => void;
  clearSelection: () => void;
  selectAll: (objectIds: string[]) => void;
  isSelected: (id: string) => boolean;
  getSelectedCount: () => number;

  // ============================================
  // UI STATE ACTIONS
  // ============================================

  setDetailPanelOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setCurrentView: (view: AppStore['currentView']) => void;
  setSearchQuery: (query: string) => void;
  setSort: (field: AppStore['sortField'], direction: AppStore['sortDirection']) => void;

  // ============================================
  // LOADING/ERROR ACTIONS
  // ============================================

  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

// ============================================
// STORE CREATION
// ============================================

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      objects: new Map(),
      tagDefinitions: new Map(),
      tagAssignments: new Map(),
      collections: new Map(),
      links: new Map(),
      selectedObjectIds: new Set(),

      detailPanelOpen: true,
      sidebarCollapsed: false,
      currentView: 'all-objects',
      searchQuery: '',
      sortField: 'name',
      sortDirection: 'asc',

      loading: false,
      error: null,

      // ============================================
      // OBJECT ACTIONS
      // ============================================

      setObjects: (objects: IndexObject[]) => {
        set({ objects: new Map(objects.map((o) => [o.id, o])) });
      },

      addObject: (obj: IndexObject) => {
        set((state) => {
          const newMap = new Map(state.objects);
          newMap.set(obj.id, obj);
          return { objects: newMap };
        });
      },

      updateObject: (id: string, updates: Partial<IndexObject>) => {
        set((state) => {
          const newMap = new Map(state.objects);
          const existing = newMap.get(id);
          if (existing) {
            newMap.set(id, { ...existing, ...updates });
          }
          return { objects: newMap };
        });
      },

      deleteObject: (id: string) => {
        set((state) => {
          const newMap = new Map(state.objects);
          newMap.delete(id);
          return { objects: newMap };
        });
      },

      getObject: (id: string) => {
        return get().objects.get(id) || null;
      },

      // ============================================
      // TAG DEFINITION ACTIONS
      // ============================================

      setTagDefinitions: (tags: TagDefinition[]) => {
        set({ tagDefinitions: new Map(tags.map((t) => [t.id, t])) });
      },

      addTagDefinition: (tag: TagDefinition) => {
        set((state) => {
          const newMap = new Map(state.tagDefinitions);
          newMap.set(tag.id, tag);
          return { tagDefinitions: newMap };
        });
      },

      updateTagDefinition: (id: string, updates: Partial<TagDefinition>) => {
        set((state) => {
          const newMap = new Map(state.tagDefinitions);
          const existing = newMap.get(id);
          if (existing) {
            newMap.set(id, { ...existing, ...updates });
          }
          return { tagDefinitions: newMap };
        });
      },

      deleteTagDefinition: (id: string) => {
        set((state) => {
          const newMap = new Map(state.tagDefinitions);
          newMap.delete(id);
          return { tagDefinitions: newMap };
        });
      },

      getTagDefinition: (id: string) => {
        return get().tagDefinitions.get(id) || null;
      },

      // ============================================
      // TAG ASSIGNMENT ACTIONS
      // ============================================

      setTagAssignments: (assignments: TagAssignment[]) => {
        set({ tagAssignments: new Map(assignments.map((a) => [a.id, a])) });
      },

      addTagAssignment: (assignment: TagAssignment) => {
        set((state) => {
          const newMap = new Map(state.tagAssignments);
          newMap.set(assignment.id, assignment);
          return { tagAssignments: newMap };
        });
      },

      deleteTagAssignment: (id: string) => {
        set((state) => {
          const newMap = new Map(state.tagAssignments);
          newMap.delete(id);
          return { tagAssignments: newMap };
        });
      },

      getTagsForObject: (objectId: string) => {
        const assignments = Array.from(get().tagAssignments.values());
        const tagIds = new Set(
          assignments.filter((a) => a.object_id === objectId).map((a) => a.tag_id)
        );

        return Array.from(get().tagDefinitions.values()).filter((tag) =>
          tagIds.has(tag.id)
        );
      },

      getObjectsWithTag: (tagId: string) => {
        const assignments = Array.from(get().tagAssignments.values());
        const objectIds = new Set(
          assignments.filter((a) => a.tag_id === tagId).map((a) => a.object_id)
        );

        return Array.from(get().objects.values()).filter((obj) =>
          objectIds.has(obj.id)
        );
      },

      // ============================================
      // COLLECTION ACTIONS
      // ============================================

      setCollections: (collections: Collection[]) => {
        set({ collections: new Map(collections.map((c) => [c.id, c])) });
      },

      addCollection: (collection: Collection) => {
        set((state) => {
          const newMap = new Map(state.collections);
          newMap.set(collection.id, collection);
          return { collections: newMap };
        });
      },

      updateCollection: (id: string, updates: Partial<Collection>) => {
        set((state) => {
          const newMap = new Map(state.collections);
          const existing = newMap.get(id);
          if (existing) {
            newMap.set(id, { ...existing, ...updates });
          }
          return { collections: newMap };
        });
      },

      deleteCollection: (id: string) => {
        set((state) => {
          const newMap = new Map(state.collections);
          newMap.delete(id);
          return { collections: newMap };
        });
      },

      getCollection: (id: string) => {
        return get().collections.get(id) || null;
      },

      // ============================================
      // LINK ACTIONS
      // ============================================

      setLinks: (links: Link[]) => {
        set({ links: new Map(links.map((l) => [l.id, l])) });
      },

      addLink: (link: Link) => {
        set((state) => {
          const newMap = new Map(state.links);
          newMap.set(link.id, link);
          return { links: newMap };
        });
      },

      updateLink: (id: string, updates: Partial<Link>) => {
        set((state) => {
          const newMap = new Map(state.links);
          const existing = newMap.get(id);
          if (existing) {
            newMap.set(id, { ...existing, ...updates });
          }
          return { links: newMap };
        });
      },

      deleteLink: (id: string) => {
        set((state) => {
          const newMap = new Map(state.links);
          newMap.delete(id);
          return { links: newMap };
        });
      },

      // ============================================
      // SELECTION ACTIONS
      // ============================================

      toggleSelect: (id: string) => {
        set((state) => {
          const newSet = new Set(state.selectedObjectIds);
          if (newSet.has(id)) {
            newSet.delete(id);
          } else {
            newSet.add(id);
          }
          return { selectedObjectIds: newSet };
        });
      },

      clearSelection: () => {
        set({ selectedObjectIds: new Set() });
      },

      selectAll: (objectIds: string[]) => {
        set({ selectedObjectIds: new Set(objectIds) });
      },

      isSelected: (id: string) => {
        return get().selectedObjectIds.has(id);
      },

      getSelectedCount: () => {
        return get().selectedObjectIds.size;
      },

      // ============================================
      // UI STATE ACTIONS
      // ============================================

      setDetailPanelOpen: (open: boolean) => {
        set({ detailPanelOpen: open });
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },

      setCurrentView: (view: AppStore['currentView']) => {
        set({ currentView: view });
      },

      setSearchQuery: (query: string) => {
        set({ searchQuery: query });
      },

      setSort: (field: AppStore['sortField'], direction: AppStore['sortDirection']) => {
        set({ sortField: field, sortDirection: direction });
      },

      // ============================================
      // LOADING/ERROR ACTIONS
      // ============================================

      setLoading: (loading: boolean) => {
        set({ loading });
      },

      setError: (error: string | null) => {
        set({ error });
      },
    }),
    {
      name: 'index-store-v0.3',
      // Persist only UI state, not data (data comes from API)
      partialize: (state) => ({
        detailPanelOpen: state.detailPanelOpen,
        sidebarCollapsed: state.sidebarCollapsed,
        sortField: state.sortField,
        sortDirection: state.sortDirection,
      }),
      // Custom serialization for Set
      storage: {
        getItem: (name: string) => {
          const item = localStorage.getItem(name);
          return item ? JSON.parse(item) : null;
        },
        setItem: (name: string, value: unknown) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name: string) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);

// ============================================
// DERIVED SELECTORS (Computed Properties)
// ============================================

export const selectAllObjects = (state: AppStore) =>
  Array.from(state.objects.values());

export const selectAllTags = (state: AppStore) =>
  Array.from(state.tagDefinitions.values());

export const selectAllCollections = (state: AppStore) =>
  Array.from(state.collections.values());

export const selectAllLinks = (state: AppStore) => Array.from(state.links.values());

export const selectSelectedObjects = (state: AppStore) => {
  const ids = state.selectedObjectIds;
  return Array.from(state.objects.values()).filter((obj) => ids.has(obj.id));
};

export const selectObjectCount = (state: AppStore) => state.objects.size;

export const selectTagCount = (state: AppStore) => state.tagDefinitions.size;

export const selectCollectionCount = (state: AppStore) => state.collections.size;
