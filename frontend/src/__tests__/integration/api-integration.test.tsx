/**
 * API Integration Tests
 *
 * Verify all 25 API endpoints work correctly together:
 * - Objects CRUD (5 endpoints)
 * - Tags CRUD (5 endpoints)
 * - Tag assignments (3 endpoints)
 * - Collections CRUD (5 endpoints)
 * - Links CRUD (3 endpoints)
 * - Import (1 endpoint)
 * - Health check (1 endpoint)
 *
 * Tests error handling, retries, timeouts, and response formats.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api } from '../../services/api-client';
import type { IndexObject, TagDefinition, TagAssignment, Collection, Link } from '@shared/types/models';

const mockFetch = vi.fn();
global.fetch = mockFetch as any;

describe('API Integration: Objects', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('gets all objects', async () => {
    const mockObjects: IndexObject[] = [
      {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockObjects,
    });

    const result = await api.getObjects();
    expect(result).toEqual(mockObjects);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/objects'),
      expect.any(Object)
    );
  });

  it('creates object', async () => {
    const newObject: Partial<IndexObject> = {
      source: 'file:///test.pdf',
      type: 'file',
      name: 'test.pdf',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...newObject, id: 'obj:1', created_at: '2024-01-01T00:00:00Z', modified_at: '2024-01-01T00:00:00Z' }),
    });

    const result = await api.createObject(newObject as any);
    expect(result.id).toBe('obj:1');
    expect(result.name).toBe('test.pdf');
  });

  it('updates object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'obj:1', name: 'updated.pdf' }),
    });

    const result = await api.updateObject('obj:1', { name: 'updated.pdf' });
    expect(result.name).toBe('updated.pdf');
  });

  it('deletes object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'obj:1' }),
    });

    const result = await api.deleteObject('obj:1');
    expect(result.id).toBe('obj:1');
  });

  it('retries on network error', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]),
      });

    const result = await api.getObjects();
    expect(result).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(3); // Failed twice, succeeded on 3rd
  });

  it('throws after 3 retries', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(api.getObjects()).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledTimes(3); // Max retries
  });

  it('parses API error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Object not found',
    });

    await expect(api.getObject('nonexistent')).rejects.toThrow('404');
  });
});

describe('API Integration: Tags', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('gets all tags', async () => {
    const mockTags: TagDefinition[] = [
      {
        id: 'tag:1',
        name: 'important',
        color: '#FF5733',
        created_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockTags,
    });

    const result = await api.getTagDefinitions();
    expect(result).toEqual(mockTags);
  });

  it('creates tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'tag:1',
        name: 'important',
        color: '#FF5733',
        created_at: '2024-01-01T00:00:00Z',
      }),
    });

    const result = await api.createTagDefinition({ name: 'important', color: '#FF5733' });
    expect(result.name).toBe('important');
  });

  it('updates tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'tag:1', name: 'critical' }),
    });

    const result = await api.updateTagDefinition('tag:1', { name: 'critical' });
    expect(result.name).toBe('critical');
  });

  it('deletes tag', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'tag:1' }),
    });

    const result = await api.deleteTagDefinition('tag:1');
    expect(result.id).toBe('tag:1');
  });

  it('gets tag assignments', async () => {
    const mockAssignments: TagAssignment[] = [
      {
        id: 'assign:1',
        tag_id: 'tag:1',
        object_id: 'obj:1',
        created_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAssignments,
    });

    const result = await api.getTagAssignments();
    expect(result).toEqual(mockAssignments);
  });

  it('assigns tag to object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'assign:1',
        tag_id: 'tag:1',
        object_id: 'obj:1',
        created_at: '2024-01-01T00:00:00Z',
      }),
    });

    const result = await api.assignTag('tag:1', 'obj:1');
    expect(result.tag_id).toBe('tag:1');
    expect(result.object_id).toBe('obj:1');
  });

  it('unassigns tag from object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'assign:1' }),
    });

    const result = await api.unassignTag('assign:1');
    expect(result.id).toBe('assign:1');
  });
});

describe('API Integration: Collections', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('gets all collections', async () => {
    const now = new Date().toISOString();
    const mockCollections: Collection[] = [
      {
        id: 'col:1',
        name: 'Important',
        query: { all: ['important'], any: [], none: [] },
        created_at: now,
        modified_at: now,
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockCollections,
    });

    const result = await api.getCollections();
    expect(result).toEqual(mockCollections);
  });

  it('creates collection with query', async () => {
    const now = new Date().toISOString();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'col:1',
        name: 'Important PDFs',
        query: { all: ['pdf'], any: ['important', 'work'], none: ['archived'] },
        created_at: now,
        modified_at: now,
      }),
    });

    const result = await api.createCollection({
      name: 'Important PDFs',
      query: { all: ['pdf'], any: ['important', 'work'], none: ['archived'] },
    } as any);

    expect(result.name).toBe('Important PDFs');
    expect(result.query.all).toContain('pdf');
    expect(result.query.any).toContain('important');
    expect(result.query.none).toContain('archived');
  });

  it('updates collection', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'col:1',
        name: 'Updated Collection',
        query: { all: ['updated'], any: [], none: [] },
      }),
    });

    const result = await api.updateCollection('col:1', {
      name: 'Updated Collection',
      query: { all: ['updated'], any: [], none: [] },
    } as any);

    expect(result.name).toBe('Updated Collection');
  });

  it('deletes collection', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'col:1' }),
    });

    const result = await api.deleteCollection('col:1');
    expect(result.id).toBe('col:1');
  });

  it('gets collection objects by query', async () => {
    const mockObjects: IndexObject[] = [
      {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockObjects,
    });

    const result = await api.getCollectionObjects('col:1');
    expect(result).toEqual(mockObjects);
  });
});

describe('API Integration: Links', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('gets all links', async () => {
    const mockLinks: Link[] = [
      {
        id: 'link:1',
        source_object: 'obj:1',
        target_object: 'obj:2',
        type: 'related',
        bidirectional: true,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockLinks,
    });

    const result = await api.getLinks();
    expect(result).toEqual(mockLinks);
  });

  it('creates link', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'link:1',
        source_object: 'obj:1',
        target_object: 'obj:2',
        type: 'derivative',
        bidirectional: false,
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      }),
    });

    const result = await api.createLink({
      source_object: 'obj:1',
      target_object: 'obj:2',
      type: 'derivative',
      bidirectional: false,
    } as any);

    expect(result.source_object).toBe('obj:1');
    expect(result.target_object).toBe('obj:2');
  });

  it('deletes link', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'link:1' }),
    });

    const result = await api.deleteLink('link:1');
    expect(result.id).toBe('link:1');
  });
});

describe('API Integration: Import', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('imports source and creates object', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      }),
    });

    const result = await api.importSource('file:///test.pdf', {
      name: 'test.pdf',
      tags: ['important'],
    });

    expect(result.source).toBe('file:///test.pdf');
    expect(result.name).toBe('test.pdf');
  });

  it('import with multiple tags', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      }),
    });

    const result = await api.importSource('file:///test.pdf', {
      name: 'test.pdf',
      tags: ['important', 'work', 'urgent'],
      notes: 'Important document',
    });

    expect(result.source).toBe('file:///test.pdf');
    // Tags assigned via separate calls in real scenario
  });
});

describe('API Integration: Error Handling', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('handles server timeout gracefully', async () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), 100)
        )
    );

    await expect(api.getObjects()).rejects.toThrow();
  });

  it('handles 500 server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal server error',
    });

    await expect(api.getObjects()).rejects.toThrow('500');
  });

  it('handles 403 permission error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    await expect(api.getObjects()).rejects.toThrow('403');
  });

  it('handles malformed JSON response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });

    await expect(api.getObjects()).rejects.toThrow();
  });
});

describe('API Integration: Concurrent Requests', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  it('handles parallel data fetching on app init', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]), // Objects
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]), // Tags
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]), // Assignments
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]), // Collections
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([]), // Links
      });

    const [objects, tags, assignments, collections, links] = await Promise.all([
      api.getObjects(),
      api.getTagDefinitions(),
      api.getTagAssignments(),
      api.getCollections(),
      api.getLinks(),
    ]);

    expect(objects).toEqual([]);
    expect(tags).toEqual([]);
    expect(assignments).toEqual([]);
    expect(collections).toEqual([]);
    expect(links).toEqual([]);
    expect(mockFetch).toHaveBeenCalledTimes(5);
  });

  it('maintains response order with concurrent requests', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'obj:1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'tag:1' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 'col:1' }) });

    const results = await Promise.all([
      api.getObjects(),
      api.getTagDefinitions(),
      api.getCollections(),
    ]);

    expect(results[0].id).toBe('obj:1');
    expect(results[1].id).toBe('tag:1');
    expect(results[2].id).toBe('col:1');
  });
});
