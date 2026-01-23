/**
 * useObjects Hook
 *
 * Provides easy access to objects state and actions
 */

import { useCallback } from 'react';
import { useAppStore, selectAllObjects } from '../store/app-store';
import type { IndexObject } from '@shared/types/models';

export function useObjects() {
  // Select from store
  const objects = useAppStore(selectAllObjects);
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);

  // Get actions
  const setObjects = useAppStore((state) => state.setObjects);
  const addObject = useAppStore((state) => state.addObject);
  const updateObject = useAppStore((state) => state.updateObject);
  const deleteObject = useAppStore((state) => state.deleteObject);
  const getObject = useAppStore((state) => state.getObject);

  // Memoized callbacks
  const handleAddObject = useCallback(
    (obj: IndexObject) => {
      addObject(obj);
    },
    [addObject]
  );

  const handleUpdateObject = useCallback(
    (id: string, updates: Partial<IndexObject>) => {
      updateObject(id, updates);
    },
    [updateObject]
  );

  const handleDeleteObject = useCallback(
    (id: string) => {
      deleteObject(id);
    },
    [deleteObject]
  );

  const handleGetObject = useCallback(
    (id: string) => {
      return getObject(id);
    },
    [getObject]
  );

  return {
    objects,
    loading,
    error,
    addObject: handleAddObject,
    updateObject: handleUpdateObject,
    deleteObject: handleDeleteObject,
    getObject: handleGetObject,
    setObjects,
  };
}
