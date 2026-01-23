/**
 * API Client Tests
 *
 * Tests the centralized API client layer
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { api, ApiError } from '../api-client';
import type { IndexObject, TagDefinition, Collection } from '@shared/types/models';

// Mock fetch
global.fetch = vi.fn();

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Objects', () => {
    it('fetches all objects', async () => {
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

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObjects,
      });

      const result = await api.getObjects();
      expect(result).toEqual(mockObjects);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/objects'),
        expect.any(Object)
      );
    });

    it('creates a new object', async () => {
      const mockObject: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObject,
      });

      const result = await api.createObject({
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
      });

      expect(result).toEqual(mockObject);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/objects'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('updates an object', async () => {
      const mockObject: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'updated.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObject,
      });

      const result = await api.updateObject('obj:1', { name: 'updated.pdf' });
      expect(result.name).toBe('updated.pdf');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/objects/obj%3A1'),
        expect.objectContaining({ method: 'PUT' })
      );
    });

    it('deletes an object', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => '',
      });

      await api.deleteObject('obj:1');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/objects/obj%3A1'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('gets a single object', async () => {
      const mockObject: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObject,
      });

      const result = await api.getObject('obj:1');
      expect(result).toEqual(mockObject);
    });
  });

  describe('Tags', () => {
    it('fetches all tag definitions', async () => {
      const mockTags: TagDefinition[] = [
        {
          id: 'tag:1',
          name: 'important',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockTags,
      });

      const result = await api.getTagDefinitions();
      expect(result).toEqual(mockTags);
    });

    it('creates a tag definition', async () => {
      const mockTag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        color: '#FF0000',
        created_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockTag,
      });

      const result = await api.createTagDefinition({
        name: 'important',
        color: '#FF0000',
      });

      expect(result).toEqual(mockTag);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/tags'),
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('assigns a tag to an object', async () => {
      const mockAssignment = {
        id: 'assign:1',
        tag_id: 'tag:1',
        object_id: 'obj:1',
        created_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockAssignment,
      });

      const result = await api.assignTag('tag:1', 'obj:1');
      expect(result.tag_id).toBe('tag:1');
      expect(result.object_id).toBe('obj:1');
    });

    it('gets tags for an object', async () => {
      const mockTags: TagDefinition[] = [
        {
          id: 'tag:1',
          name: 'important',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockTags,
      });

      const result = await api.getTagsForObject('obj:1');
      expect(result).toEqual(mockTags);
    });

    it('gets objects with a tag', async () => {
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

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObjects,
      });

      const result = await api.getObjectsWithTag('tag:1');
      expect(result).toEqual(mockObjects);
    });
  });

  describe('Collections', () => {
    it('fetches all collections', async () => {
      const mockCollections: Collection[] = [
        {
          id: 'col:1',
          name: 'My Collection',
          query: { all: ['tag1'] },
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockCollections,
      });

      const result = await api.getCollections();
      expect(result).toEqual(mockCollections);
    });

    it('creates a collection', async () => {
      const mockCollection: Collection = {
        id: 'col:1',
        name: 'My Collection',
        query: { all: ['tag1'] },
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockCollection,
      });

      const result = await api.createCollection({
        name: 'My Collection',
        query: { all: ['tag1'] },
      });

      expect(result).toEqual(mockCollection);
    });

    it('gets collection objects', async () => {
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

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObjects,
      });

      const result = await api.getCollectionObjects('col:1');
      expect(result).toEqual(mockObjects);
    });
  });

  describe('Error Handling', () => {
    it('throws ApiError on 404', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Not found' }),
      });

      await expect(api.getObject('nonexistent')).rejects.toThrow(ApiError);
    });

    it('throws ApiError on 500', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Server error' }),
      });

      await expect(api.getObjects()).rejects.toThrow(ApiError);
    });

    it('handles network errors with retry', async () => {
      (global.fetch as any)
        .mockRejectedValueOnce(new TypeError('Failed to fetch'))
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => [],
        });

      const result = await api.getObjects();
      expect(result).toEqual([]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('handles request timeout', async () => {
      const abortError = new DOMException('Aborted', 'AbortError');
      (global.fetch as any).mockRejectedValueOnce(abortError);

      await expect(api.getObjects()).rejects.toThrow(ApiError);
    });
  });

  describe('Import', () => {
    it('imports a source with tags', async () => {
      const mockObject: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockObject,
      });

      const result = await api.importSource('file:///test.pdf', {
        tags: ['tag1', 'tag2'],
        notes: 'Test import',
      });

      expect(result).toEqual(mockObject);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/objects/import'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
