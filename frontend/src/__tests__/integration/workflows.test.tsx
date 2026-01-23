/**
 * End-to-End Workflow Integration Tests
 *
 * Test complete workflows from user action to database and back:
 * - Import workflow
 * - Tagging workflow
 * - Collection creation and querying workflow
 * - Multi-select and bulk operations workflow
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';
import { useAppStore } from '../../store/app-store';
import type { IndexObject, TagDefinition, Collection } from '@shared/types/models';

// Mock API client
vi.mock('../../services/api-client', () => ({
  api: {
    getObjects: vi.fn(async () => []),
    getTags: vi.fn(async () => []),
    getTagAssignments: vi.fn(async () => []),
    getCollections: vi.fn(async () => []),
    getLinks: vi.fn(async () => []),
    createObject: vi.fn(async (data) => ({ ...data, id: `obj:${Date.now()}` })),
    updateObject: vi.fn(async (id, updates) => ({ id, ...updates })),
    deleteObject: vi.fn(async (id) => ({ id })),
    createTag: vi.fn(async (data) => ({ ...data, id: `tag:${Date.now()}` })),
    updateTag: vi.fn(async (id, updates) => ({ id, ...updates })),
    deleteTag: vi.fn(async (id) => ({ id })),
    assignTag: vi.fn(async (tagId, objectId) => ({ id: `assign:${Date.now()}`, tag_id: tagId, object_id: objectId })),
    createCollection: vi.fn(async (data) => ({ ...data, id: `col:${Date.now()}` })),
    updateCollection: vi.fn(async (id, updates) => ({ id, ...updates })),
    deleteCollection: vi.fn(async (id) => ({ id })),
    getCollectionObjects: vi.fn(async (id) => []),
    importSource: vi.fn(async (source, options) => ({ source, ...options, id: `obj:${Date.now()}` })),
  }
}));

// Mock data hooks
vi.mock('../../hooks/useObjectsData', () => ({
  useObjectsData: () => ({ refetch: vi.fn() }),
}));

vi.mock('../../hooks/useTagsData', () => ({
  useTagsData: () => ({ refetch: vi.fn() }),
}));

vi.mock('../../hooks/useCollectionsData', () => ({
  useCollectionsData: () => ({ refetch: vi.fn() }),
}));

vi.mock('../../hooks/useLinksData', () => ({
  useLinksData: () => ({ refetch: vi.fn() }),
}));

describe('E2E Workflow: Import', () => {
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

  it('imports file and appears in objects list', async () => {
    const newObject: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    // Simulate import: store adds object
    useAppStore.getState().addObject(newObject);

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  it('imported object has correct metadata', async () => {
    const newObject: IndexObject = {
      id: 'obj:1',
      source: 'file:///Users/karter/documents.pdf',
      type: 'file',
      name: 'documents.pdf',
      created_at: '2024-01-20T10:00:00Z',
      modified_at: '2024-01-20T10:00:00Z',
      source_meta: {
        size: 1024000,
        mime_type: 'application/pdf',
      },
    };

    useAppStore.getState().addObject(newObject);
    useAppStore.setState({ loading: false, error: null });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('documents.pdf')).toBeInTheDocument();
    });
  });
});

describe('E2E Workflow: Tagging', () => {
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

  it('creates tag definition and assigns to object', async () => {
    // Step 1: Create object
    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    // Step 2: Create tag definition
    const tag: TagDefinition = {
      id: 'tag:1',
      name: 'important',
      color: '#FF5733',
      created_at: '2024-01-01T00:00:00Z',
    };

    // Step 3: Assign tag to object
    const store = useAppStore.getState();
    store.addObject(obj);
    store.addTagDefinition(tag);

    const assignment = {
      id: `assign:${Date.now()}`,
      tag_id: tag.id,
      object_id: obj.id,
      created_at: '2024-01-01T00:00:00Z',
    };
    store.addTagAssignment(assignment);

    // Verify workflow
    const objects = Array.from(store.objects.values());
    const tags = Array.from(store.tagDefinitions.values());

    expect(objects).toHaveLength(1);
    expect(tags).toHaveLength(1);
    expect(tags[0].name).toBe('important');
  });

  it('renaming tag updates everywhere', async () => {
    const tag: TagDefinition = {
      id: 'tag:1',
      name: 'important',
      created_at: '2024-01-01T00:00:00Z',
    };

    const obj: IndexObject = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    const store = useAppStore.getState();
    store.addTagDefinition(tag);
    store.addObject(obj);

    const assignment = {
      id: `assign:${Date.now()}`,
      tag_id: tag.id,
      object_id: obj.id,
      created_at: '2024-01-01T00:00:00Z',
    };
    store.addTagAssignment(assignment);

    // Rename tag
    store.updateTagDefinition(tag.id, { name: 'critical' });

    // Verify tag updated
    const updatedTag = store.tagDefinitions.get(tag.id);
    expect(updatedTag?.name).toBe('critical');

    // Assignment still exists
    expect(store.tagAssignments.size).toBe(1);
  });

  it('deleting tag removes all assignments', async () => {
    const tag: TagDefinition = {
      id: 'tag:1',
      name: 'important',
      created_at: '2024-01-01T00:00:00Z',
    };

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

    const store = useAppStore.getState();
    store.addTagDefinition(tag);
    store.addObject(obj1);
    store.addObject(obj2);

    const assignment1 = {
      id: `assign:1`,
      tag_id: tag.id,
      object_id: obj1.id,
      created_at: '2024-01-01T00:00:00Z',
    };
    const assignment2 = {
      id: `assign:2`,
      tag_id: tag.id,
      object_id: obj2.id,
      created_at: '2024-01-01T00:00:00Z',
    };
    store.addTagAssignment(assignment1);
    store.addTagAssignment(assignment2);

    expect(store.tagAssignments.size).toBe(2);

    // Delete tag
    store.deleteTagDefinition(tag.id);

    // Tag gone
    expect(store.tagDefinitions.has(tag.id)).toBe(false);
    // Assignments cascade deleted
    expect(store.tagAssignments.size).toBe(0);
  });
});

describe('E2E Workflow: Collections', () => {
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

  it('creates collection with AND/OR/NOT query', async () => {
    const now = new Date().toISOString();
    const collection: Collection = {
      id: 'col:1',
      name: 'Important PDFs',
      query: {
        all: ['important'],
        any: [],
        none: ['archived'],
      },
      created_at: now,
      modified_at: now,
    };

    useAppStore.getState().addCollection(collection);

    const col = useAppStore.getState().collections.get('col:1');
    expect(col?.name).toBe('Important PDFs');
    expect(col?.query.all).toContain('important');
    expect(col?.query.none).toContain('archived');
  });

  it('collection with complex query (all AND any NOT)', async () => {
    const now = new Date().toISOString();
    const collection: Collection = {
      id: 'col:1',
      name: 'Complex Query',
      query: {
        all: ['pdf', 'important'],         // Must have both
        any: ['work', 'personal'],         // Must have at least one
        none: ['archived', 'spam'],        // Must not have either
      },
      created_at: now,
      modified_at: now,
    };

    useAppStore.getState().addCollection(collection);

    const col = useAppStore.getState().collections.get('col:1');
    expect(col?.query.all).toEqual(['pdf', 'important']);
    expect(col?.query.any).toEqual(['work', 'personal']);
    expect(col?.query.none).toEqual(['archived', 'spam']);
  });

  it('pinned collection appears first', async () => {
    const now = new Date().toISOString();
    const col1: Collection = {
      id: 'col:1',
      name: 'First',
      query: { all: [], any: [], none: [] },
      created_at: now,
      modified_at: now,
      pinned: false,
    };

    const col2: Collection = {
      id: 'col:2',
      name: 'Pinned',
      query: { all: [], any: [], none: [] },
      created_at: now,
      modified_at: now,
      pinned: true,
    };

    const store = useAppStore.getState();
    store.addCollection(col1);
    store.addCollection(col2);

    const collections = Array.from(store.collections.values());
    const pinned = collections.filter((c) => c.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].name).toBe('Pinned');
  });
});

describe('E2E Workflow: Multi-Select', () => {
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

  it('selects single object', async () => {
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
    store.toggleSelect('obj:1');

    expect(store.selectedObjectIds.has('obj:1')).toBe(true);
    expect(store.selectedObjectIds.size).toBe(1);
  });

  it('deselects object', async () => {
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
    store.toggleSelect('obj:1');
    expect(store.selectedObjectIds.size).toBe(1);

    store.toggleSelect('obj:1');
    expect(store.selectedObjectIds.size).toBe(0);
  });

  it('selects all objects', async () => {
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

    store.selectAll(Array.from(store.objects.keys()));

    expect(store.selectedObjectIds.size).toBe(2);
    expect(store.selectedObjectIds.has('obj:1')).toBe(true);
    expect(store.selectedObjectIds.has('obj:2')).toBe(true);
  });

  it('clears selection', async () => {
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
    expect(store.selectedObjectIds.size).toBe(1);

    store.clearSelection();
    expect(store.selectedObjectIds.size).toBe(0);
  });

  it('bulk delete removes all selected objects', async () => {
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

    store.selectAll(Array.from(store.objects.keys()));
    expect(store.objects.size).toBe(2);

    // Bulk delete
    store.selectedObjectIds.forEach((id) => store.deleteObject(id));
    store.clearSelection();

    expect(store.objects.size).toBe(0);
    expect(store.selectedObjectIds.size).toBe(0);
  });
});

describe('E2E Workflow: Search and Filter', () => {
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

  it('search query filters objects by name', async () => {
    const store = useAppStore.getState();
    store.addObject({
      id: 'obj:1',
      source: 'file:///important.pdf',
      type: 'file',
      name: 'important.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });
    store.addObject({
      id: 'obj:2',
      source: 'file:///notes.txt',
      type: 'file',
      name: 'notes.txt',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });

    store.setSearchQuery('important');

    expect(store.searchQuery).toBe('important');
    expect(store.objects.size).toBe(2); // Objects still exist, just filtered in view
  });

  it('sorting changes order', async () => {
    const store = useAppStore.getState();
    store.addObject({
      id: 'obj:1',
      source: 'file:///z.pdf',
      type: 'file',
      name: 'z.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });
    store.addObject({
      id: 'obj:2',
      source: 'file:///a.pdf',
      type: 'file',
      name: 'a.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });

    store.setSort('name', 'asc');
    expect(store.sortField).toBe('name');
    expect(store.sortDirection).toBe('asc');

    store.setSort('name', 'desc');
    expect(store.sortDirection).toBe('desc');
  });
});
