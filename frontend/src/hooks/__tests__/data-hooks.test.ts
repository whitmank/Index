/**
 * Data Hooks Tests
 *
 * Tests the data-fetching hooks that integrate with the store
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useObjectsData } from '../useObjectsData';
import { useTagsData } from '../useTagsData';
import { useCollectionsData } from '../useCollectionsData';
import { useLinksData } from '../useLinksData';
import { useImportSource } from '../useImportSource';
import { useAppStore } from '../../store/app-store';
import { api } from '../../services/api-client';
import type { IndexObject, TagDefinition, Collection, Link } from '@shared/types/models';

// Mock the API client
vi.mock('../../services/api-client', () => ({
  api: {
    getObjects: vi.fn(),
    getTagDefinitions: vi.fn(),
    getTagAssignments: vi.fn(),
    getCollections: vi.fn(),
    getLinks: vi.fn(),
    importSource: vi.fn(),
  },
  ApiError: Error,
}));

describe('Data Hooks', () => {
  beforeEach(() => {
    // Reset store
    useAppStore.setState({
      objects: new Map(),
      tagDefinitions: new Map(),
      tagAssignments: new Map(),
      collections: new Map(),
      links: new Map(),
      loading: false,
      error: null,
    });

    vi.clearAllMocks();
  });

  describe('useObjectsData', () => {
    it('fetches and stores objects on mount', async () => {
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

      vi.mocked(api.getObjects).mockResolvedValueOnce(mockObjects);

      const { result } = renderHook(() => useObjectsData());

      await waitFor(() => {
        expect(useAppStore.getState().objects.size).toBe(1);
      });

      expect(api.getObjects).toHaveBeenCalled();
      expect(useAppStore.getState().getObject('obj:1')).toEqual(mockObjects[0]);
    });

    it('handles errors gracefully', async () => {
      const error = new Error('Network error');
      vi.mocked(api.getObjects).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useObjectsData());

      await waitFor(() => {
        expect(useAppStore.getState().error).toBe('Network error');
      });

      expect(useAppStore.getState().loading).toBe(false);
    });

    it('provides refetch function', async () => {
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

      vi.mocked(api.getObjects).mockResolvedValueOnce(mockObjects);

      const { result } = renderHook(() => useObjectsData());

      await waitFor(() => {
        expect(useAppStore.getState().objects.size).toBe(1);
      });

      // Clear and refetch
      useAppStore.setState({ objects: new Map() });
      expect(useAppStore.getState().objects.size).toBe(0);

      vi.mocked(api.getObjects).mockResolvedValueOnce(mockObjects);

      act(() => {
        result.current.refetch();
      });

      await waitFor(() => {
        expect(useAppStore.getState().objects.size).toBe(1);
      });

      expect(api.getObjects).toHaveBeenCalledTimes(2);
    });
  });

  describe('useTagsData', () => {
    it('fetches and stores tags on mount', async () => {
      const mockDefinitions: TagDefinition[] = [
        {
          id: 'tag:1',
          name: 'important',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      const mockAssignments = [
        {
          id: 'assign:1',
          tag_id: 'tag:1',
          object_id: 'obj:1',
          created_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(api.getTagDefinitions).mockResolvedValueOnce(mockDefinitions);
      vi.mocked(api.getTagAssignments).mockResolvedValueOnce(mockAssignments as any);

      const { result } = renderHook(() => useTagsData());

      await waitFor(() => {
        expect(useAppStore.getState().tagDefinitions.size).toBe(1);
      });

      expect(useAppStore.getState().tagAssignments.size).toBe(1);
    });

    it('handles parallel fetch errors', async () => {
      vi.mocked(api.getTagDefinitions).mockRejectedValueOnce(new Error('Fetch failed'));
      vi.mocked(api.getTagAssignments).mockResolvedValueOnce([]);

      const { result } = renderHook(() => useTagsData());

      await waitFor(() => {
        expect(useAppStore.getState().error).toBe('Fetch failed');
      });
    });
  });

  describe('useCollectionsData', () => {
    it('fetches and stores collections on mount', async () => {
      const mockCollections: Collection[] = [
        {
          id: 'col:1',
          name: 'My Collection',
          query: { all: ['tag1'] },
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(api.getCollections).mockResolvedValueOnce(mockCollections);

      const { result } = renderHook(() => useCollectionsData());

      await waitFor(() => {
        expect(useAppStore.getState().collections.size).toBe(1);
      });

      expect(api.getCollections).toHaveBeenCalled();
    });
  });

  describe('useLinksData', () => {
    it('fetches and stores links on mount', async () => {
      const mockLinks: Link[] = [
        {
          id: 'link:1',
          source_object: 'obj:1',
          target_object: 'obj:2',
          type: 'related',
          bidirectional: false,
          created_at: '2024-01-01T00:00:00Z',
          modified_at: '2024-01-01T00:00:00Z',
        },
      ];

      vi.mocked(api.getLinks).mockResolvedValueOnce(mockLinks);

      const { result } = renderHook(() => useLinksData());

      await waitFor(() => {
        expect(useAppStore.getState().links.size).toBe(1);
      });

      expect(api.getLinks).toHaveBeenCalled();
    });
  });

  describe('useImportSource', () => {
    it('imports a source and adds to store', async () => {
      const mockObject: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(api.importSource).mockResolvedValueOnce(mockObject);

      const { result } = renderHook(() => useImportSource());

      let importedObject: IndexObject | null = null;
      await act(async () => {
        importedObject = await result.current.importSource('file:///test.pdf', {
          tags: ['tag1'],
        });
      });

      expect(importedObject).toEqual(mockObject);
      expect(useAppStore.getState().objects.size).toBe(1);
      expect(useAppStore.getState().getObject('obj:1')).toEqual(mockObject);
    });

    it('handles import errors', async () => {
      const error = new Error('Import failed');
      vi.mocked(api.importSource).mockRejectedValueOnce(error);

      const { result } = renderHook(() => useImportSource());

      let importedObject: IndexObject | null = null;
      await act(async () => {
        importedObject = await result.current.importSource('file:///test.pdf');
      });

      expect(importedObject).toBeNull();
      expect(useAppStore.getState().error).toBe('Import failed');
      expect(useAppStore.getState().loading).toBe(false);
    });

    it('returns null on error and sets error state', async () => {
      vi.mocked(api.importSource).mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useImportSource());

      let importedObject: IndexObject | null = undefined as any;
      await act(async () => {
        importedObject = await result.current.importSource('file:///test.pdf');
      });

      expect(importedObject).toBeNull();
    });
  });
});
