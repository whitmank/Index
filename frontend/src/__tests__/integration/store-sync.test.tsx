/**
 * Store Synchronization Tests
 *
 * Verify Zustand store updates trigger UI re-renders correctly.
 * Test reactive patterns and subscription behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store/app-store';
import type { IndexObject, TagDefinition, Collection } from '@shared/types/models';

describe('Store Sync: Objects', () => {
  beforeEach(() => {
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

  it('adding object triggers subscription', (done) => {
    const store = useAppStore;
    let callCount = 0;

    const unsubscribe = store.subscribe(
      (state) => state.objects,
      (objects) => {
        callCount++;
        if (callCount === 1) {
          expect(objects.size).toBe(1);
          unsubscribe();
          done();
        }
      }
    );

    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    useAppStore.getState().addObject(obj);
  });

  it('updating object triggers subscription', (done) => {
    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    useAppStore.getState().addObject(obj);

    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.objects.get('obj:1')?.name,
      (name) => {
        callCount++;
        if (callCount === 1 && name === 'updated.pdf') {
          expect(name).toBe('updated.pdf');
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().updateObject('obj:1', { name: 'updated.pdf' });
  });

  it('deleting object triggers subscription', (done) => {
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

    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.objects.size,
      (size) => {
        callCount++;
        if (size === 0) {
          expect(size).toBe(0);
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().deleteObject('obj:1');
  });

  it('multiple objects update correctly', () => {
    const store = useAppStore.getState();

    store.addObject({
      id: 'obj:1',
      source: 'file:///test1.pdf',
      type: 'file',
      name: 'test1.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });

    store.addObject({
      id: 'obj:2',
      source: 'file:///test2.pdf',
      type: 'file',
      name: 'test2.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });

    expect(store.objects.size).toBe(2);

    store.updateObject('obj:1', { name: 'renamed.pdf' });

    expect(store.objects.get('obj:1')?.name).toBe('renamed.pdf');
    expect(store.objects.get('obj:2')?.name).toBe('test2.pdf');
  });
});

describe('Store Sync: Tags', () => {
  beforeEach(() => {
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

  it('adding tag triggers subscription', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.tagDefinitions.size,
      (size) => {
        callCount++;
        if (size === 1) {
          expect(size).toBe(1);
          unsubscribe();
          done();
        }
      }
    );

    const tag: TagDefinition = {
      id: 'tag:1',
      name: 'important',
      created_at: '2024-01-01T00:00:00Z',
    };

    useAppStore.getState().addTag(tag);
  });

  it('tag assignment updates both tags and assignments', () => {
    const store = useAppStore.getState();
    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    const tag: TagDefinition = {
      id: 'tag:1',
      name: 'important',
      created_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj);
    store.addTagDefinition(tag);

    const assignment = {
      id: `assign:${Date.now()}`,
      tag_id: tag.id,
      object_id: obj.id,
      created_at: '2024-01-01T00:00:00Z',
    };
    store.addTagAssignment(assignment);

    expect(store.tagAssignments.size).toBe(1);
    expect(store.tagDefinitions.size).toBe(1);

    // Verify assignment points to correct tag and object
    const assignment = Array.from(store.tagAssignments.values())[0];
    expect(assignment.tag_id).toBe('tag:1');
    expect(assignment.object_id).toBe('obj:1');
  });

  it('deleting tag cascades to assignments', () => {
    const store = useAppStore.getState();
    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    const tag: TagDefinition = {
      id: 'tag:1',
      name: 'important',
      created_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj);
    store.addTagDefinition(tag);

    const assignment = {
      id: `assign:${Date.now()}`,
      tag_id: tag.id,
      object_id: obj.id,
      created_at: '2024-01-01T00:00:00Z',
    };
    store.addTagAssignment(assignment);

    expect(store.tagAssignments.size).toBe(1);

    // Delete tag
    store.deleteTagDefinition('tag:1');

    // Tag and its assignments gone
    expect(store.tagDefinitions.size).toBe(0);
    expect(store.tagAssignments.size).toBe(0);
  });
});

describe('Store Sync: Collections', () => {
  beforeEach(() => {
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

  it('adding collection triggers subscription', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.collections.size,
      (size) => {
        callCount++;
        if (size === 1) {
          expect(size).toBe(1);
          unsubscribe();
          done();
        }
      }
    );

    const now = new Date().toISOString();
    const col: Collection = {
      id: 'col:1',
      name: 'Important',
      query: { all: ['important'], any: [], none: [] },
      created_at: now,
      modified_at: now,
    };

    useAppStore.getState().addCollection(col);
  });

  it('updating collection query persists', () => {
    const now = new Date().toISOString();
    const col: Collection = {
      id: 'col:1',
      name: 'Important',
      query: { all: [], any: [], none: [] },
      created_at: now,
      modified_at: now,
    };

    const store = useAppStore.getState();
    store.addCollection(col);

    store.updateCollection('col:1', {
      query: { all: ['pdf', 'important'], any: ['work'], none: ['archived'] },
    });

    const updated = store.collections.get('col:1');
    expect(updated?.query.all).toContain('pdf');
    expect(updated?.query.any).toContain('work');
    expect(updated?.query.none).toContain('archived');
  });
});

describe('Store Sync: Selection State', () => {
  beforeEach(() => {
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

  it('selecting object updates state', (done) => {
    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    const store = useAppStore.getState();
    store.addObject(obj);

    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.selectedObjectIds.size,
      (size) => {
        callCount++;
        if (size === 1) {
          expect(size).toBe(1);
          expect(store.selectedObjectIds.has('obj:1')).toBe(true);
          unsubscribe();
          done();
        }
      }
    );

    store.toggleSelect('obj:1');
  });

  it('clearing selection updates state', (done) => {
    const store = useAppStore.getState();
    store.addObject({
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });
    store.toggleSelect('obj:1');

    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.selectedObjectIds.size,
      (size) => {
        callCount++;
        if (callCount === 2 && size === 0) {
          expect(size).toBe(0);
          unsubscribe();
          done();
        }
      }
    );

    store.clearSelection();
  });
});

describe('Store Sync: UI State', () => {
  beforeEach(() => {
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

  it('toggling detail panel updates state', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.detailPanelOpen,
      (open) => {
        callCount++;
        if (callCount === 1 && !open) {
          expect(open).toBe(false);
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().setDetailPanelOpen(false);
  });

  it('toggling sidebar updates state', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.sidebarCollapsed,
      (collapsed) => {
        callCount++;
        if (callCount === 1 && collapsed) {
          expect(collapsed).toBe(true);
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().setSidebarCollapsed(true);
  });

  it('search query updates state', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.searchQuery,
      (query) => {
        callCount++;
        if (query === 'important') {
          expect(query).toBe('important');
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().setSearchQuery('important');
  });

  it('sorting updates state', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => `${state.sortField}:${state.sortDirection}`,
      (sort) => {
        callCount++;
        if (sort === 'created_at:desc') {
          expect(sort).toBe('created_at:desc');
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().setSort('created_at', 'desc');
  });
});

describe('Store Sync: Loading and Error States', () => {
  beforeEach(() => {
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

  it('loading state triggers subscription', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.loading,
      (loading) => {
        callCount++;
        if (callCount === 1 && loading) {
          expect(loading).toBe(true);
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().setLoading(true);
  });

  it('error state triggers subscription', (done) => {
    let callCount = 0;
    const unsubscribe = useAppStore.subscribe(
      (state) => state.error,
      (error) => {
        callCount++;
        if (error === 'Network error') {
          expect(error).toBe('Network error');
          unsubscribe();
          done();
        }
      }
    );

    useAppStore.getState().setError('Network error');
  });

  it('clearing error state works', () => {
    const store = useAppStore.getState();
    store.setError('Some error');
    expect(store.error).toBe('Some error');

    store.setError(null);
    expect(store.error).toBeNull();
  });
});
