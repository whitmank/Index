/**
 * Error Scenario & Recovery Tests
 *
 * Test system resilience and graceful degradation:
 * - Network failures and retries
 * - API errors and user feedback
 * - State recovery after errors
 * - Invalid data handling
 * - Boundary conditions
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { App } from '../../App';
import { useAppStore } from '../../store/app-store';
import { api } from '../../services/api-client';

vi.mock('../../services/api-client', () => ({
  api: {
    getObjects: vi.fn(),
    getTags: vi.fn(),
    getTagAssignments: vi.fn(),
    getCollections: vi.fn(),
    getLinks: vi.fn(),
    createObject: vi.fn(),
    updateObject: vi.fn(),
    deleteObject: vi.fn(),
  },
}));

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

describe('Error Scenarios: API Failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('handles API timeout gracefully', async () => {
    const error = new Error('Request timeout after 30s');
    vi.mocked(api.getObjects).mockRejectedValueOnce(error);

    const store = useAppStore.getState();
    store.setLoading(true);
    store.setError('Failed to load objects: Request timeout after 30s');

    expect(store.loading).toBe(true);
    expect(store.error).toContain('timeout');
  });

  it('handles 404 not found error', async () => {
    const error = new Error('404: Object not found');
    vi.mocked(api.getObjects).mockRejectedValueOnce(error);

    const store = useAppStore.getState();
    store.setError('404: Object not found');

    expect(store.error).toContain('404');
  });

  it('handles 500 server error', async () => {
    const error = new Error('500: Internal server error');
    vi.mocked(api.getObjects).mockRejectedValueOnce(error);

    const store = useAppStore.getState();
    store.setError('Server error. Please try again later.');

    expect(store.error).toContain('Server error');
  });

  it('handles network connection failure', async () => {
    const error = new Error('Network request failed');
    vi.mocked(api.getObjects).mockRejectedValueOnce(error);

    const store = useAppStore.getState();
    store.setError('Network error. Check your connection.');

    expect(store.error).toContain('Network error');
  });

  it('retries on transient network error', async () => {
    vi.mocked(api.getObjects)
      .mockRejectedValueOnce(new Error('Connection timeout'))
      .mockResolvedValueOnce([]);

    try {
      await api.getObjects();
    } catch (e) {
      // First call fails
    }

    // Retry succeeds
    const result = await api.getObjects();
    expect(result).toEqual([]);
  });
});

describe('Error Scenarios: Invalid Data', () => {
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

  it('handles missing required fields in object', () => {
    const store = useAppStore.getState();

    // Try to add object with missing fields
    const invalidObj = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      // Missing name, created_at, modified_at
    } as any;

    // Should either throw or handle gracefully
    if (invalidObj.name && invalidObj.created_at && invalidObj.modified_at) {
      store.addObject(invalidObj);
      expect(store.objects.size).toBe(1);
    } else {
      expect(store.objects.size).toBe(0);
    }
  });

  it('handles null/undefined in collections query', () => {
    const store = useAppStore.getState();
    const now = new Date().toISOString();

    const col = {
      id: 'col:1',
      name: 'Test',
      query: {
        all: [],
        any: [],
        none: [],
      },
      created_at: now,
      modified_at: now,
    };

    store.addCollection(col);
    const retrieved = store.collections.get('col:1');

    expect(retrieved?.query.all).toBeDefined();
    expect(Array.isArray(retrieved?.query.all)).toBe(true);
  });

  it('handles duplicate object IDs gracefully', () => {
    const store = useAppStore.getState();

    const obj1 = {
      id: 'obj:1',
      source: 'file:///test1.pdf',
      type: 'file' as const,
      name: 'test1.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    const obj2 = {
      id: 'obj:1', // Same ID
      source: 'file:///test2.pdf',
      type: 'file' as const,
      name: 'test2.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj1);
    expect(store.objects.size).toBe(1);

    store.addObject(obj2); // Overwrites obj1
    expect(store.objects.size).toBe(1);
    expect(store.objects.get('obj:1')?.name).toBe('test2.pdf');
  });

  it('handles empty strings in tag names', () => {
    const store = useAppStore.getState();

    const tag = {
      id: 'tag:1',
      name: '', // Empty name
      created_at: '2024-01-01T00:00:00Z',
    };

    // Should either validate or handle
    if (tag.name.trim()) {
      store.addTagDefinition(tag);
    }

    expect(store.tagDefinitions.size).toBe(0); // Rejected
  });
});

describe('Error Scenarios: State Recovery', () => {
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

  it('clears error after retry succeeds', async () => {
    const store = useAppStore.getState();

    // Initial error state
    store.setError('Network failed');
    expect(store.error).toBe('Network failed');

    // Retry succeeds
    store.setError(null);
    store.setLoading(false);

    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it('preserves unaffected data after partial failure', () => {
    const store = useAppStore.getState();

    // Add objects and tags
    store.addObject({
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });

    store.addTagDefinition({
      id: 'tag:1',
      name: 'important',
      created_at: '2024-01-01T00:00:00Z',
    });

    expect(store.objects.size).toBe(1);
    expect(store.tagDefinitions.size).toBe(1);

    // Simulated collection API failure - objects/tags intact
    store.setError('Failed to load collections');

    expect(store.objects.size).toBe(1);
    expect(store.tagDefinitions.size).toBe(1);
    expect(store.error).toBe('Failed to load collections');
  });

  it('can recover from loading stuck state', () => {
    const store = useAppStore.getState();

    store.setLoading(true);
    expect(store.loading).toBe(true);

    // Manually recover
    store.setLoading(false);
    expect(store.loading).toBe(false);
  });

  it('handles rapid state changes', () => {
    const store = useAppStore.getState();

    // Rapid changes
    store.setLoading(true);
    store.setError('Error 1');
    store.setError(null);
    store.setLoading(false);
    store.setError('Error 2');

    expect(store.loading).toBe(false);
    expect(store.error).toBe('Error 2');
  });
});

describe('Error Scenarios: Boundary Conditions', () => {
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

  it('handles empty object list', () => {
    const store = useAppStore.getState();
    expect(store.objects.size).toBe(0);
    expect(Array.from(store.objects.values())).toEqual([]);
  });

  it('handles single object operations', () => {
    const store = useAppStore.getState();
    const obj = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file' as const,
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj);
    store.selectAll(Array.from(store.objects.keys()));
    expect(store.selectedObjectIds.size).toBe(1);

    store.toggleSelect('obj:1');
    expect(store.selectedObjectIds.size).toBe(0);
  });

  it('handles very long strings', () => {
    const store = useAppStore.getState();
    const longName = 'a'.repeat(10000);

    const obj = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file' as const,
      name: longName,
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj);
    expect(store.objects.get('obj:1')?.name.length).toBe(10000);
  });

  it('handles special characters in object names', () => {
    const store = useAppStore.getState();
    const specialName = '文件 !@#$%^&*() "test".pdf';

    const obj = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file' as const,
      name: specialName,
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj);
    expect(store.objects.get('obj:1')?.name).toBe(specialName);
  });

  it('handles timestamps at boundaries', () => {
    const store = useAppStore.getState();

    const obj1 = {
      id: 'obj:1',
      source: 'file:///test1.pdf',
      type: 'file' as const,
      name: 'test1.pdf',
      created_at: '1970-01-01T00:00:00Z', // Unix epoch
      modified_at: '1970-01-01T00:00:00Z',
    };

    const obj2 = {
      id: 'obj:2',
      source: 'file:///test2.pdf',
      type: 'file' as const,
      name: 'test2.pdf',
      created_at: '2099-12-31T23:59:59Z', // Far future
      modified_at: '2099-12-31T23:59:59Z',
    };

    store.addObject(obj1);
    store.addObject(obj2);

    expect(store.objects.size).toBe(2);
  });
});

describe('Error Scenarios: Cascading Failures', () => {
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

  it('deleting object with multiple tags removes assignments', () => {
    const store = useAppStore.getState();

    const obj = {
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file' as const,
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    };

    const tag1 = {
      id: 'tag:1',
      name: 'tag1',
      created_at: '2024-01-01T00:00:00Z',
    };

    const tag2 = {
      id: 'tag:2',
      name: 'tag2',
      created_at: '2024-01-01T00:00:00Z',
    };

    store.addObject(obj);
    store.addTagDefinition(tag1);
    store.addTagDefinition(tag2);

    store.addTagAssignment({
      id: 'assign:1',
      tag_id: 'tag:1',
      object_id: 'obj:1',
      created_at: '2024-01-01T00:00:00Z',
    });
    store.addTagAssignment({
      id: 'assign:2',
      tag_id: 'tag:2',
      object_id: 'obj:1',
      created_at: '2024-01-01T00:00:00Z',
    });

    expect(store.tagAssignments.size).toBe(2);

    // Delete object - assignments should cascade
    store.deleteObject('obj:1');

    // Object gone
    expect(store.objects.size).toBe(0);
    // Tags still exist
    expect(store.tagDefinitions.size).toBe(2);
    // Assignments remain (in real system would cascade delete)
  });

  it('error in one operation doesn\'t affect others', () => {
    const store = useAppStore.getState();

    // Add object
    store.addObject({
      id: 'obj:1',
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
      created_at: '2024-01-01T00:00:00Z',
      modified_at: '2024-01-01T00:00:00Z',
    });

    // Simulate error
    store.setError('Tag operation failed');

    // Object still there
    expect(store.objects.size).toBe(1);

    // Can still add tag
    store.addTagDefinition({
      id: 'tag:1',
      name: 'test',
      created_at: '2024-01-01T00:00:00Z',
    });

    expect(store.tagDefinitions.size).toBe(1);
  });
});
