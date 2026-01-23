/**
 * useSelection Hook
 *
 * Provides easy access to selection state and actions
 */

import { useCallback } from 'react';
import { useAppStore, selectSelectedObjects } from '../store/app-store';

export function useSelection() {
  // Select from store
  const selectedObjectIds = useAppStore((state) => state.selectedObjectIds);
  const selectedObjects = useAppStore(selectSelectedObjects);
  const selectedCount = useAppStore((state) => state.getSelectedCount());

  // Get actions
  const toggleSelect = useAppStore((state) => state.toggleSelect);
  const clearSelection = useAppStore((state) => state.clearSelection);
  const selectAll = useAppStore((state) => state.selectAll);
  const isSelected = useAppStore((state) => state.isSelected);

  // Memoized callbacks
  const handleToggleSelect = useCallback(
    (id: string) => {
      toggleSelect(id);
    },
    [toggleSelect]
  );

  const handleSelectAll = useCallback(
    (objectIds: string[]) => {
      selectAll(objectIds);
    },
    [selectAll]
  );

  const handleClearSelection = useCallback(() => {
    clearSelection();
  }, [clearSelection]);

  const handleIsSelected = useCallback(
    (id: string) => {
      return isSelected(id);
    },
    [isSelected]
  );

  return {
    selectedObjectIds,
    selectedObjects,
    selectedCount,
    toggleSelect: handleToggleSelect,
    selectAll: handleSelectAll,
    clearSelection: handleClearSelection,
    isSelected: handleIsSelected,
  };
}
