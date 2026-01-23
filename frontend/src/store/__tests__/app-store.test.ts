import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAppStore, selectAllObjects, selectSelectedObjects } from '../app-store';
import type { IndexObject, TagDefinition, Collection } from '@shared/types/models';

/**
 * Zustand App Store Tests
 *
 * Tests the centralized state management for Index v0.3
 */

describe('Zustand App Store', () => {
  beforeEach(() => {
    // Reset store before each test
    useAppStore.setState({
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
    });
  });

  describe('Object Actions', () => {
    it('adds a new object', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj);
      expect(useAppStore.getState().objects.size).toBe(1);
      expect(useAppStore.getState().getObject('obj:1')).toEqual(obj);
    });

    it('updates an object', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj);
      useAppStore.getState().updateObject('obj:1', { name: 'updated.pdf' });

      const updated = useAppStore.getState().getObject('obj:1');
      expect(updated?.name).toBe('updated.pdf');
    });

    it('deletes an object', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj);
      expect(useAppStore.getState().objects.size).toBe(1);

      useAppStore.getState().deleteObject('obj:1');
      expect(useAppStore.getState().objects.size).toBe(0);
    });

    it('sets multiple objects', () => {
      const objects: IndexObject[] = [
        {
          id: 'obj:1',
          source: 'file:///test1.pdf',
          type: 'file',
          name: 'test1.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'obj:2',
          source: 'file:///test2.pdf',
          type: 'file',
          name: 'test2.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      useAppStore.getState().setObjects(objects);
      expect(useAppStore.getState().objects.size).toBe(2);
    });
  });

  describe('Tag Definition Actions', () => {
    it('adds a tag definition', () => {
      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        color: '#FF0000',
        created_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addTagDefinition(tag);
      expect(useAppStore.getState().tagDefinitions.size).toBe(1);
      expect(useAppStore.getState().getTagDefinition('tag:1')).toEqual(tag);
    });

    it('updates a tag definition', () => {
      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addTagDefinition(tag);
      useAppStore.getState().updateTagDefinition('tag:1', {
        name: 'urgent',
        color: '#FF0000',
      });

      const updated = useAppStore.getState().getTagDefinition('tag:1');
      expect(updated?.name).toBe('urgent');
      expect(updated?.color).toBe('#FF0000');
    });

    it('deletes a tag definition', () => {
      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addTagDefinition(tag);
      useAppStore.getState().deleteTagDefinition('tag:1');
      expect(useAppStore.getState().tagDefinitions.size).toBe(0);
    });
  });

  describe('Selection Actions', () => {
    it('toggles selection for an object', () => {
      useAppStore.getState().toggleSelect('obj:1');
      expect(useAppStore.getState().isSelected('obj:1')).toBe(true);

      useAppStore.getState().toggleSelect('obj:1');
      expect(useAppStore.getState().isSelected('obj:1')).toBe(false);
    });

    it('selects all objects', () => {
      const ids = ['obj:1', 'obj:2', 'obj:3'];
      useAppStore.getState().selectAll(ids);

      expect(useAppStore.getState().getSelectedCount()).toBe(3);
      expect(useAppStore.getState().isSelected('obj:1')).toBe(true);
      expect(useAppStore.getState().isSelected('obj:2')).toBe(true);
      expect(useAppStore.getState().isSelected('obj:3')).toBe(true);
    });

    it('clears selection', () => {
      useAppStore.getState().toggleSelect('obj:1');
      useAppStore.getState().toggleSelect('obj:2');
      expect(useAppStore.getState().getSelectedCount()).toBe(2);

      useAppStore.getState().clearSelection();
      expect(useAppStore.getState().getSelectedCount()).toBe(0);
    });

    it('handles multiple selections', () => {
      useAppStore.getState().toggleSelect('obj:1');
      useAppStore.getState().toggleSelect('obj:2');
      useAppStore.getState().toggleSelect('obj:3');

      expect(useAppStore.getState().getSelectedCount()).toBe(3);

      // Deselect one
      useAppStore.getState().toggleSelect('obj:2');
      expect(useAppStore.getState().getSelectedCount()).toBe(2);
      expect(useAppStore.getState().isSelected('obj:2')).toBe(false);
    });
  });

  describe('UI State Actions', () => {
    it('toggles detail panel', () => {
      const initial = useAppStore.getState().detailPanelOpen;
      useAppStore.getState().setDetailPanelOpen(!initial);
      expect(useAppStore.getState().detailPanelOpen).toBe(!initial);
    });

    it('toggles sidebar', () => {
      const initial = useAppStore.getState().sidebarCollapsed;
      useAppStore.getState().setSidebarCollapsed(!initial);
      expect(useAppStore.getState().sidebarCollapsed).toBe(!initial);
    });

    it('changes view', () => {
      useAppStore.getState().setCurrentView('tags');
      expect(useAppStore.getState().currentView).toBe('tags');

      useAppStore.getState().setCurrentView('collections');
      expect(useAppStore.getState().currentView).toBe('collections');
    });

    it('updates search query', () => {
      useAppStore.getState().setSearchQuery('test search');
      expect(useAppStore.getState().searchQuery).toBe('test search');
    });

    it('updates sort order', () => {
      useAppStore.getState().setSort('created_at', 'desc');
      expect(useAppStore.getState().sortField).toBe('created_at');
      expect(useAppStore.getState().sortDirection).toBe('desc');
    });
  });

  describe('Loading and Error State', () => {
    it('sets loading state', () => {
      useAppStore.getState().setLoading(true);
      expect(useAppStore.getState().loading).toBe(true);

      useAppStore.getState().setLoading(false);
      expect(useAppStore.getState().loading).toBe(false);
    });

    it('sets error state', () => {
      useAppStore.getState().setError('Something went wrong');
      expect(useAppStore.getState().error).toBe('Something went wrong');

      useAppStore.getState().setError(null);
      expect(useAppStore.getState().error).toBeNull();
    });
  });

  describe('Tag Assignment Actions', () => {
    it('gets tags for an object', () => {
      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addTagDefinition(tag);
      useAppStore.getState().addTagAssignment({
        id: 'assign:1',
        tag_id: 'tag:1',
        object_id: 'obj:1',
        created_at: '2024-01-01T00:00:00Z',
      });

      const tags = useAppStore.getState().getTagsForObject('obj:1');
      expect(tags).toHaveLength(1);
      expect(tags[0].name).toBe('important');
    });

    it('gets objects with a tag', () => {
      const objects: IndexObject[] = [
        {
          id: 'obj:1',
          source: 'file:///test1.pdf',
          type: 'file',
          name: 'test1.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'obj:2',
          source: 'file:///test2.pdf',
          type: 'file',
          name: 'test2.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      useAppStore.getState().setObjects(objects);
      useAppStore.getState().addTagAssignment({
        id: 'assign:1',
        tag_id: 'tag:1',
        object_id: 'obj:1',
        created_at: '2024-01-01T00:00:00Z',
      });

      const objectsWithTag = useAppStore.getState().getObjectsWithTag('tag:1');
      expect(objectsWithTag).toHaveLength(1);
      expect(objectsWithTag[0].id).toBe('obj:1');
    });
  });

  describe('Collection Actions', () => {
    it('adds a collection', () => {
      const collection: Collection = {
        id: 'col:1',
        name: 'My Collection',
        query: { all: ['tag1'] },
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addCollection(collection);
      expect(useAppStore.getState().collections.size).toBe(1);
      expect(useAppStore.getState().getCollection('col:1')).toEqual(collection);
    });

    it('updates a collection', () => {
      const collection: Collection = {
        id: 'col:1',
        name: 'My Collection',
        query: { all: ['tag1'] },
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addCollection(collection);
      useAppStore.getState().updateCollection('col:1', { pinned: true });

      const updated = useAppStore.getState().getCollection('col:1');
      expect(updated?.pinned).toBe(true);
    });

    it('deletes a collection', () => {
      const collection: Collection = {
        id: 'col:1',
        name: 'My Collection',
        query: { all: ['tag1'] },
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addCollection(collection);
      useAppStore.getState().deleteCollection('col:1');
      expect(useAppStore.getState().collections.size).toBe(0);
    });
  });

  describe('Derived Selectors', () => {
    it('selects all objects', () => {
      const objects: IndexObject[] = [
        {
          id: 'obj:1',
          source: 'file:///test1.pdf',
          type: 'file',
          name: 'test1.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      useAppStore.getState().setObjects(objects);
      const selected = selectAllObjects(useAppStore.getState());
      expect(selected).toHaveLength(1);
    });

    it('selects selected objects', () => {
      const objects: IndexObject[] = [
        {
          id: 'obj:1',
          source: 'file:///test1.pdf',
          type: 'file',
          name: 'test1.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
        {
          id: 'obj:2',
          source: 'file:///test2.pdf',
          type: 'file',
          name: 'test2.pdf',
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      useAppStore.getState().setObjects(objects);
      useAppStore.getState().toggleSelect('obj:1');

      const selected = selectSelectedObjects(useAppStore.getState());
      expect(selected).toHaveLength(1);
      expect(selected[0].id).toBe('obj:1');
    });
  });

  describe('Immutability', () => {
    it('creates new Map instances for immutability', () => {
      const obj1: IndexObject = {
        id: 'obj:1',
        source: 'file:///test1.pdf',
        type: 'file',
        name: 'test1.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      const obj2: IndexObject = {
        id: 'obj:2',
        source: 'file:///test2.pdf',
        type: 'file',
        name: 'test2.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj1);
      const mapAfterFirst = useAppStore.getState().objects;

      useAppStore.getState().addObject(obj2);
      const mapAfterSecond = useAppStore.getState().objects;

      expect(mapAfterFirst).not.toBe(mapAfterSecond);
      expect(mapAfterFirst.size).toBe(1);
      expect(mapAfterSecond.size).toBe(2);
    });
  });
});
