/**
 * Views Tests
 *
 * Tests for Phase 7 page views
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { ObjectsView } from '../ObjectsView';
import { TagsView } from '../TagsView';
import { CollectionsView } from '../CollectionsView';
import { SettingsView } from '../SettingsView';
import { useAppStore } from '../../store/app-store';
import type { IndexObject, TagDefinition, Collection } from '@shared/types/models';

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

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>);
};

describe('Page Views', () => {
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

  describe('ObjectsView', () => {
    it('renders title and description', () => {
      renderWithRouter(<ObjectsView />);
      expect(screen.getByText('Objects')).toBeInTheDocument();
      expect(screen.getByText('Browse and manage all indexed objects')).toBeInTheDocument();
    });

    it('renders search bar', () => {
      renderWithRouter(<ObjectsView />);
      expect(screen.getByPlaceholderText(/Search objects/)).toBeInTheDocument();
    });

    it('renders refresh button', () => {
      renderWithRouter(<ObjectsView />);
      expect(screen.getByTitle('Refresh object list')).toBeInTheDocument();
    });

    it('shows loading state when loading', () => {
      useAppStore.setState({ loading: true });
      renderWithRouter(<ObjectsView />);
      expect(screen.getByText('Loading objects...')).toBeInTheDocument();
    });

    it('shows error alert when error exists', () => {
      useAppStore.setState({ error: 'Failed to load objects' });
      renderWithRouter(<ObjectsView />);
      expect(screen.getByText('Failed to load objects')).toBeInTheDocument();
    });

    it('renders object list table when data loaded', () => {
      const obj: IndexObject = {
        id: 'obj:1',
        source: 'file:///test.pdf',
        type: 'file',
        name: 'test.pdf',
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addObject(obj);
      useAppStore.setState({ loading: false });

      renderWithRouter(<ObjectsView />);

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  describe('TagsView', () => {
    it('renders title and tag count', () => {
      renderWithRouter(<TagsView />);
      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(screen.getByText(/Organize objects with tags \(0 total\)/)).toBeInTheDocument();
    });

    it('renders refresh button', () => {
      renderWithRouter(<TagsView />);
      expect(screen.getByText('Refresh')).toBeInTheDocument();
    });

    it('shows loading state when loading', () => {
      useAppStore.setState({ loading: true });
      renderWithRouter(<TagsView />);
      expect(screen.getByText('Loading tags...')).toBeInTheDocument();
    });

    it('displays tag information section', () => {
      renderWithRouter(<TagsView />);
      expect(screen.getByText('About Tags')).toBeInTheDocument();
      expect(screen.getByText(/Tags help you organize/)).toBeInTheDocument();
    });

    it('shows tag count when tags exist', () => {
      const tag: TagDefinition = {
        id: 'tag:1',
        name: 'important',
        created_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addTagDefinition(tag);
      renderWithRouter(<TagsView />);

      expect(screen.getByText(/1 total/)).toBeInTheDocument();
    });
  });

  describe('CollectionsView', () => {
    it('renders title and collection count', () => {
      renderWithRouter(<CollectionsView />);
      expect(screen.getByText('Collections')).toBeInTheDocument();
      expect(screen.getByText(/Create saved searches.*0 total/)).toBeInTheDocument();
    });

    it('renders new collection button', () => {
      renderWithRouter(<CollectionsView />);
      expect(screen.getByText('+ New Collection')).toBeInTheDocument();
    });

    it('shows loading state when loading', () => {
      useAppStore.setState({ loading: true });
      renderWithRouter(<CollectionsView />);
      expect(screen.getByText('Loading collections...')).toBeInTheDocument();
    });

    it('shows empty state when no collections', () => {
      renderWithRouter(<CollectionsView />);
      expect(screen.getByText('No collections yet')).toBeInTheDocument();
    });

    it('displays collections in list', () => {
      const collection: Collection = {
        id: 'col:1',
        name: 'My Collection',
        query: { all: ['tag1'] },
        created_at: '2024-01-01T00:00:00Z',
        modified_at: '2024-01-01T00:00:00Z',
      };

      useAppStore.getState().addCollection(collection);
      renderWithRouter(<CollectionsView />);

      expect(screen.getByText('My Collection')).toBeInTheDocument();
    });
  });

  describe('SettingsView', () => {
    it('renders title and description', () => {
      render(<SettingsView />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('Configure application preferences')).toBeInTheDocument();
    });

    it('renders all sections', () => {
      render(<SettingsView />);
      expect(screen.getByText('General')).toBeInTheDocument();
      expect(screen.getByText('UI Preferences')).toBeInTheDocument();
      expect(screen.getByText('Data Management')).toBeInTheDocument();
      expect(screen.getByText('Keyboard Shortcuts')).toBeInTheDocument();
      expect(screen.getByText('About')).toBeInTheDocument();
    });

    it('displays application version', () => {
      render(<SettingsView />);
      expect(screen.getByText('Index v0.3')).toBeInTheDocument();
    });

    it('displays keyboard shortcuts', () => {
      render(<SettingsView />);
      expect(screen.getByText('Toggle sidebar')).toBeInTheDocument();
      expect(screen.getByText('Toggle detail panel')).toBeInTheDocument();
      expect(screen.getByText('Focus search')).toBeInTheDocument();
    });

    it('displays about information', () => {
      render(<SettingsView />);
      expect(screen.getByText(/Index.*personal information indexing/)).toBeInTheDocument();
    });
  });
});
