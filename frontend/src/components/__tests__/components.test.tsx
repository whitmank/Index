/**
 * Component Tests
 *
 * Tests for Phase 6 UI components
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ObjectListTable } from '../ObjectListTable';
import { DetailPanel } from '../DetailPanel';
import { TagManager } from '../TagManager';
import { SearchBar } from '../SearchBar';
import { LoadingSpinner } from '../LoadingSpinner';
import { useAppStore } from '../../store/app-store';
import type { IndexObject, TagDefinition } from '@shared/types/models';

describe('UI Components', () => {
  beforeEach(() => {
    // Reset store
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

  describe('ObjectListTable', () => {
    it('renders empty state when no objects', () => {
      render(<ObjectListTable />);
      expect(screen.getByText('No objects')).toBeInTheDocument();
    });

    it('renders objects in table', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj);
      render(<ObjectListTable />);

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText('file')).toBeInTheDocument();
    });

    it('filters objects by search query', () => {
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
        source: 'file:///other.pdf',
        type: 'file',
        name: 'other.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj1);
      useAppStore.getState().addObject(obj2);
      useAppStore.getState().setSearchQuery('test');

      render(<ObjectListTable />);

      expect(screen.getByText('test1.pdf')).toBeInTheDocument();
      expect(screen.queryByText('other.pdf')).not.toBeInTheDocument();
    });

    it('shows selection count', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj);
      useAppStore.getState().toggleSelect('obj:1');

      render(<ObjectListTable />);

      expect(screen.getByText('1 of 1 selected')).toBeInTheDocument();
    });
  });

  describe('DetailPanel', () => {
    it('shows "No object selected" when nothing selected', () => {
      render(<DetailPanel />);
      expect(screen.getByText('No object selected')).toBeInTheDocument();
    });

    it('displays selected object details', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
        source_meta: { size: 1024 },
      };

      useAppStore.getState().addObject(obj);
      useAppStore.getState().toggleSelect('obj:1');

      render(<DetailPanel />);

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText('file:///test.pdf')).toBeInTheDocument();
    });

    it('displays source metadata', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
        source_meta: { size: '1024 bytes', extension: 'pdf' },
      };

      useAppStore.getState().addObject(obj);
      useAppStore.getState().toggleSelect('obj:1');

      render(<DetailPanel />);

      expect(screen.getByText('Metadata')).toBeInTheDocument();
      expect(screen.getByText('size')).toBeInTheDocument();
    });
  });

  describe('TagManager', () => {
    it('renders empty state when no tags', () => {
      render(<TagManager />);
      expect(screen.getByText('No tags yet')).toBeInTheDocument();
    });

    it('displays existing tags', () => {
      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addTagDefinition(tag);
      render(<TagManager />);

      expect(screen.getByText('important')).toBeInTheDocument();
      expect(screen.getByText('Tags (1)')).toBeInTheDocument();
    });

    it('provides create tag input', () => {
      render(<TagManager />);
      expect(screen.getByPlaceholderText('Tag name')).toBeInTheDocument();
      expect(screen.getByText('Create')).toBeInTheDocument();
    });
  });

  describe('SearchBar', () => {
    it('renders input field', () => {
      render(<SearchBar />);
      expect(screen.getByPlaceholderText('Search objects...')).toBeInTheDocument();
    });

    it('updates search query on input', () => {
      const { getByPlaceholderText } = render(<SearchBar />);
      const input = getByPlaceholderText('Search objects...') as HTMLInputElement;

      expect(input.value).toBe('');
      expect(useAppStore.getState().searchQuery).toBe('');
    });

    it('shows clear button when query is not empty', () => {
      useAppStore.getState().setSearchQuery('test');
      render(<SearchBar />);
      expect(screen.getByTitle('Clear search')).toBeInTheDocument();
    });
  });

  describe('LoadingSpinner', () => {
    it('renders with default message', () => {
      render(<LoadingSpinner />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('renders with custom message', () => {
      render(<LoadingSpinner message="Fetching data..." />);
      expect(screen.getByText('Fetching data...')).toBeInTheDocument();
    });

    it('renders different sizes', () => {
      const { container: containerSm } = render(<LoadingSpinner size="sm" />);
      const spinnerSm = containerSm.querySelector('.w-4');
      expect(spinnerSm).toBeInTheDocument();

      const { container: containerLg } = render(<LoadingSpinner size="lg" />);
      const spinnerLg = containerLg.querySelector('.w-12');
      expect(spinnerLg).toBeInTheDocument();
    });
  });
});
