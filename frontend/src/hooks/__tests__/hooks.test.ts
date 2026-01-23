import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useObjects } from '../useObjects';
import { useTags } from '../useTags';
import { useSelection } from '../useSelection';
import { useUIState } from '../useUIState';
import { useLoadingState } from '../useLoadingState';
import { useAppStore } from '../../store/app-store';
import type { IndexObject, TagDefinition } from '@shared/types/models';

/**
 * Custom Hooks Tests
 *
 * Tests the custom React hooks that wrap Zustand store access
 */

describe('Custom Hooks', () => {
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

  describe('useObjects Hook', () => {
    it('returns objects from store', () => {
      const { result } = renderHook(() => useObjects());

      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.addObject(obj);
      });

      expect(result.current.objects).toHaveLength(1);
      expect(result.current.objects[0].name).toBe('test.pdf');
    });

    it('can update objects', () => {
      const { result } = renderHook(() => useObjects());

      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.addObject(obj);
      });

      act(() => {
        result.current.updateObject('obj:1', { name: 'updated.pdf' });
      });

      expect(result.current.objects[0].name).toBe('updated.pdf');
    });

    it('can delete objects', () => {
      const { result } = renderHook(() => useObjects());

      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.addObject(obj);
      });

      expect(result.current.objects).toHaveLength(1);

      act(() => {
        result.current.deleteObject('obj:1');
      });

      expect(result.current.objects).toHaveLength(0);
    });
  });

  describe('useTags Hook', () => {
    it('returns tags from store', () => {
      const { result } = renderHook(() => useTags());

      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.addTag(tag);
      });

      expect(result.current.tags).toHaveLength(1);
      expect(result.current.tags[0].name).toBe('important');
    });

    it('can update tags', () => {
      const { result } = renderHook(() => useTags());

      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.addTag(tag);
      });

      act(() => {
        result.current.updateTag('tag:1', { name: 'urgent' });
      });

      expect(result.current.tags[0].name).toBe('urgent');
    });

    it('can delete tags', () => {
      const { result } = renderHook(() => useTags());

      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        result.current.addTag(tag);
      });

      expect(result.current.tags).toHaveLength(1);

      act(() => {
        result.current.deleteTag('tag:1');
      });

      expect(result.current.tags).toHaveLength(0);
    });
  });

  describe('useSelection Hook', () => {
    it('can toggle selection', () => {
      const { result } = renderHook(() => useSelection());

      expect(result.current.selectedCount).toBe(0);

      act(() => {
        result.current.toggleSelect('obj:1');
      });

      expect(result.current.selectedCount).toBe(1);
      expect(result.current.isSelected('obj:1')).toBe(true);
    });

    it('can select all', () => {
      const { result } = renderHook(() => useSelection());

      act(() => {
        result.current.selectAll(['obj:1', 'obj:2', 'obj:3']);
      });

      expect(result.current.selectedCount).toBe(3);
    });

    it('can clear selection', () => {
      const { result } = renderHook(() => useSelection());

      act(() => {
        result.current.selectAll(['obj:1', 'obj:2']);
      });

      expect(result.current.selectedCount).toBe(2);

      act(() => {
        result.current.clearSelection();
      });

      expect(result.current.selectedCount).toBe(0);
    });
  });

  describe('useUIState Hook', () => {
    it('can toggle detail panel', () => {
      const { result } = renderHook(() => useUIState());

      expect(result.current.detailPanelOpen).toBe(true);

      act(() => {
        result.current.setDetailPanelOpen(false);
      });

      expect(result.current.detailPanelOpen).toBe(false);
    });

    it('can change current view', () => {
      const { result } = renderHook(() => useUIState());

      expect(result.current.currentView).toBe('all-objects');

      act(() => {
        result.current.setCurrentView('tags');
      });

      expect(result.current.currentView).toBe('tags');
    });

    it('can update search query', () => {
      const { result } = renderHook(() => useUIState());

      expect(result.current.searchQuery).toBe('');

      act(() => {
        result.current.setSearchQuery('test search');
      });

      expect(result.current.searchQuery).toBe('test search');
    });

    it('can update sort', () => {
      const { result } = renderHook(() => useUIState());

      expect(result.current.sortField).toBe('name');

      act(() => {
        result.current.setSort('created_at', 'desc');
      });

      expect(result.current.sortField).toBe('created_at');
      expect(result.current.sortDirection).toBe('desc');
    });
  });

  describe('useLoadingState Hook', () => {
    it('can set loading state', () => {
      const { result } = renderHook(() => useLoadingState());

      expect(result.current.loading).toBe(false);

      act(() => {
        result.current.setLoading(true);
      });

      expect(result.current.loading).toBe(true);
    });

    it('can set error state', () => {
      const { result } = renderHook(() => useLoadingState());

      expect(result.current.error).toBeNull();
      expect(result.current.hasError).toBe(false);

      act(() => {
        result.current.setError('Something went wrong');
      });

      expect(result.current.error).toBe('Something went wrong');
      expect(result.current.hasError).toBe(true);
    });

    it('can clear error', () => {
      const { result } = renderHook(() => useLoadingState());

      act(() => {
        result.current.setError('Error');
      });

      expect(result.current.hasError).toBe(true);

      act(() => {
        result.current.clearError();
      });

      expect(result.current.hasError).toBe(false);
    });
  });

  describe('Hook Integration', () => {
    it('multiple hooks share the same store state', () => {
      const { result: objectsResult } = renderHook(() => useObjects());
      const { result: selectionResult } = renderHook(() => useSelection());

      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      act(() => {
        objectsResult.current.addObject(obj);
      });

      act(() => {
        selectionResult.current.toggleSelect('obj:1');
      });

      expect(objectsResult.current.objects).toHaveLength(1);
      expect(selectionResult.current.selectedCount).toBe(1);
    });
  });
});
