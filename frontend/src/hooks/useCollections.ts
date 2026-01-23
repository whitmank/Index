/**
 * useCollections Hook
 *
 * Provides easy access to collections state and actions
 */

import { useCallback } from 'react';
import { useAppStore, selectAllCollections } from '../store/app-store';
import type { Collection } from '@shared/types/models';

export function useCollections() {
  // Select from store
  const collections = useAppStore(selectAllCollections);

  // Get actions
  const addCollection = useAppStore((state) => state.addCollection);
  const updateCollection = useAppStore((state) => state.updateCollection);
  const deleteCollection = useAppStore((state) => state.deleteCollection);
  const getCollection = useAppStore((state) => state.getCollection);

  // Memoized callbacks
  const handleAddCollection = useCallback(
    (collection: Collection) => {
      addCollection(collection);
    },
    [addCollection]
  );

  const handleUpdateCollection = useCallback(
    (id: string, updates: Partial<Collection>) => {
      updateCollection(id, updates);
    },
    [updateCollection]
  );

  const handleDeleteCollection = useCallback(
    (id: string) => {
      deleteCollection(id);
    },
    [deleteCollection]
  );

  const handleGetCollection = useCallback(
    (id: string) => {
      return getCollection(id);
    },
    [getCollection]
  );

  // Derive pinned collections
  const pinnedCollections = collections.filter((c) => c.pinned);

  return {
    collections,
    pinnedCollections,
    addCollection: handleAddCollection,
    updateCollection: handleUpdateCollection,
    deleteCollection: handleDeleteCollection,
    getCollection: handleGetCollection,
  };
}
