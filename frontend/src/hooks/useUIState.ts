/**
 * useUIState Hook
 *
 * Provides easy access to UI state and actions
 */

import { useCallback } from 'react';
import { useAppStore, type AppStore } from '../store/app-store';

export function useUIState() {
  // Select from store
  const detailPanelOpen = useAppStore((state) => state.detailPanelOpen);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const currentView = useAppStore((state) => state.currentView);
  const searchQuery = useAppStore((state) => state.searchQuery);
  const sortField = useAppStore((state) => state.sortField);
  const sortDirection = useAppStore((state) => state.sortDirection);

  // Get actions
  const setDetailPanelOpen = useAppStore((state) => state.setDetailPanelOpen);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const setCurrentView = useAppStore((state) => state.setCurrentView);
  const setSearchQuery = useAppStore((state) => state.setSearchQuery);
  const setSort = useAppStore((state) => state.setSort);

  // Memoized callbacks
  const handleSetDetailPanelOpen = useCallback(
    (open: boolean) => {
      setDetailPanelOpen(open);
    },
    [setDetailPanelOpen]
  );

  const handleSetSidebarCollapsed = useCallback(
    (collapsed: boolean) => {
      setSidebarCollapsed(collapsed);
    },
    [setSidebarCollapsed]
  );

  const handleSetCurrentView = useCallback(
    (view: AppStore['currentView']) => {
      setCurrentView(view);
    },
    [setCurrentView]
  );

  const handleSetSearchQuery = useCallback(
    (query: string) => {
      setSearchQuery(query);
    },
    [setSearchQuery]
  );

  const handleSetSort = useCallback(
    (field: AppStore['sortField'], direction: AppStore['sortDirection']) => {
      setSort(field, direction);
    },
    [setSort]
  );

  return {
    detailPanelOpen,
    sidebarCollapsed,
    currentView,
    searchQuery,
    sortField,
    sortDirection,
    setDetailPanelOpen: handleSetDetailPanelOpen,
    setSidebarCollapsed: handleSetSidebarCollapsed,
    setCurrentView: handleSetCurrentView,
    setSearchQuery: handleSetSearchQuery,
    setSort: handleSetSort,
  };
}
