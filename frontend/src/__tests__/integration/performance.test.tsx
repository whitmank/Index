/**
 * Performance Tests
 *
 * Test system performance with large datasets:
 * - 1000+ objects in store
 * - 100+ tags with many assignments
 * - 50+ collections
 * - Complex queries
 * - Sorting and filtering performance
 *
 * Ensures O(1) lookups and efficient state updates.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../store/app-store';
import type { IndexObject, TagDefinition, Collection } from '@shared/types/models';

describe('Performance: Large Object Lists', () => {
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

  it('handles 100 objects efficiently', () => {
    const store = useAppStore.getState();
    const startTime = performance.now();

    for (let i = 0; i < 100; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.objects.size).toBe(100);
    expect(duration).toBeLessThan(1000); // Should complete in <1 second
  });

  it('handles 500 objects efficiently', () => {
    const store = useAppStore.getState();
    const startTime = performance.now();

    for (let i = 0; i < 500; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.objects.size).toBe(500);
    expect(duration).toBeLessThan(2000); // Should complete in <2 seconds
  });

  it('handles 1000 objects efficiently', () => {
    const store = useAppStore.getState();
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.objects.size).toBe(1000);
    expect(duration).toBeLessThan(3000); // Should complete in <3 seconds
  });

  it('performs O(1) lookups on 1000 objects', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    // Lookups should be instant (Map is O(1))
    const startTime = performance.now();

    for (let i = 0; i < 1000; i++) {
      const obj = store.objects.get(`obj:${i}`);
      expect(obj?.id).toBe(`obj:${i}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100); // 1000 O(1) lookups in <100ms
  });

  it('updates object in large list efficiently', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Update 100 random objects
    for (let i = 0; i < 100; i++) {
      const randomId = `obj:${Math.floor(Math.random() * 1000)}`;
      store.updateObject(randomId, { name: 'updated.pdf' });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100); // Should be very fast
  });

  it('deletes from large object list efficiently', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Delete 100 objects
    for (let i = 0; i < 100; i++) {
      store.deleteObject(`obj:${i}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.objects.size).toBe(900);
    expect(duration).toBeLessThan(100); // Should be very fast
  });

  it('converts large Map to array efficiently', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Convert to array (for rendering)
    const objects = Array.from(store.objects.values());

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(objects.length).toBe(1000);
    expect(duration).toBeLessThan(50); // Should be very fast
  });
});

describe('Performance: Large Tag Lists', () => {
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

  it('handles 100 tags efficiently', () => {
    const store = useAppStore.getState();
    const startTime = performance.now();

    for (let i = 0; i < 100; i++) {
      store.addTagDefinition({
        id: `tag:${i}`,
        name: `tag${i}`,
        created_at: '2024-01-01T00:00:00Z',
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.tagDefinitions.size).toBe(100);
    expect(duration).toBeLessThan(500);
  });

  it('handles many tag assignments efficiently', () => {
    const store = useAppStore.getState();

    // Add 10 objects and 10 tags
    for (let i = 0; i < 10; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///doc${i}.pdf`,
        type: 'file',
        name: `doc${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });

      store.addTagDefinition({
        id: `tag:${i}`,
        name: `tag${i}`,
        created_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Assign all combinations (100 assignments)
    let assignmentCounter = 0;
    for (let i = 0; i < 10; i++) {
      for (let j = 0; j < 10; j++) {
        store.addTagAssignment({
          id: `assign:${assignmentCounter++}`,
          tag_id: `tag:${i}`,
          object_id: `obj:${j}`,
          created_at: '2024-01-01T00:00:00Z',
        });
      }
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.tagAssignments.size).toBe(100);
    expect(duration).toBeLessThan(500);
  });
});

describe('Performance: Large Collections', () => {
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

  it('handles 50 collections efficiently', () => {
    const store = useAppStore.getState();
    const now = new Date().toISOString();
    const startTime = performance.now();

    for (let i = 0; i < 50; i++) {
      store.addCollection({
        id: `col:${i}`,
        name: `Collection ${i}`,
        query: { all: [], any: [], none: [] },
        created_at: now,
        modified_at: now,
      });
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.collections.size).toBe(50);
    expect(duration).toBeLessThan(500);
  });

  it('handles complex collection queries efficiently', () => {
    const store = useAppStore.getState();
    const now = new Date().toISOString();

    // Create collection with many tags in query
    const tags = [];
    for (let i = 0; i < 20; i++) {
      tags.push(`tag${i}`);
    }

    const startTime = performance.now();

    store.addCollection({
      id: 'col:complex',
      name: 'Complex Query',
      query: {
        all: tags.slice(0, 5),
        any: tags.slice(5, 12),
        none: tags.slice(12, 20),
      },
      created_at: now,
      modified_at: now,
    });

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(50);

    const col = store.collections.get('col:complex');
    expect(col?.query.all.length).toBe(5);
    expect(col?.query.any.length).toBe(7);
    expect(col?.query.none.length).toBe(8);
  });
});

describe('Performance: Search and Sort', () => {
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

  it('search query updates efficiently on 1000 objects', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Update search query (stores it, view handles filtering)
    store.setSearchQuery('document500');

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.searchQuery).toBe('document500');
    expect(duration).toBeLessThan(10); // Should be instant
  });

  it('sorting updates efficiently on 1000 objects', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Change sort (store handles state, view handles rendering)
    store.setSort('created_at', 'desc');

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.sortField).toBe('created_at');
    expect(store.sortDirection).toBe('desc');
    expect(duration).toBeLessThan(10); // Should be instant
  });

  it('handles rapid search/sort changes', () => {
    const store = useAppStore.getState();

    // Add 100 objects
    for (let i = 0; i < 100; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Rapid changes (like user typing)
    for (let i = 0; i < 20; i++) {
      store.setSearchQuery(`query${i}`);
    }

    for (let i = 0; i < 10; i++) {
      store.setSort('name', i % 2 === 0 ? 'asc' : 'desc');
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(100); // Should handle rapid changes
  });
});

describe('Performance: Selection Operations', () => {
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

  it('selects all of 1000 objects efficiently', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    store.selectAll(Array.from(store.objects.keys()));

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.selectedObjectIds.size).toBe(1000);
    expect(duration).toBeLessThan(100);
  });

  it('clears selection of 1000 objects efficiently', () => {
    const store = useAppStore.getState();

    // Add and select 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    store.selectAll(Array.from(store.objects.keys()));
    expect(store.selectedObjectIds.size).toBe(1000);

    const startTime = performance.now();

    store.clearSelection();

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.selectedObjectIds.size).toBe(0);
    expect(duration).toBeLessThan(10);
  });

  it('bulk deletes 100 from 1000 objects efficiently', () => {
    const store = useAppStore.getState();

    // Add 1000 objects
    for (let i = 0; i < 1000; i++) {
      store.addObject({
        id: `obj:${i}`,
        source: `file:///document${i}.pdf`,
        type: 'file',
        name: `document${i}.pdf`,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      });
    }

    const startTime = performance.now();

    // Delete first 100
    for (let i = 0; i < 100; i++) {
      store.deleteObject(`obj:${i}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    expect(store.objects.size).toBe(900);
    expect(duration).toBeLessThan(100);
  });
});
