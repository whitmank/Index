/**
 * useLinks Hook
 *
 * Provides easy access to links state and actions
 */

import { useCallback } from 'react';
import { useAppStore, selectAllLinks } from '../store/app-store';
import type { Link } from '@shared/types/models';

export function useLinks() {
  // Select from store
  const links = useAppStore(selectAllLinks);

  // Get actions
  const addLink = useAppStore((state) => state.addLink);
  const updateLink = useAppStore((state) => state.updateLink);
  const deleteLink = useAppStore((state) => state.deleteLink);

  // Memoized callbacks
  const handleAddLink = useCallback(
    (link: Link) => {
      addLink(link);
    },
    [addLink]
  );

  const handleUpdateLink = useCallback(
    (id: string, updates: Partial<Link>) => {
      updateLink(id, updates);
    },
    [updateLink]
  );

  const handleDeleteLink = useCallback(
    (id: string) => {
      deleteLink(id);
    },
    [deleteLink]
  );

  // Get links for a specific object
  const getLinksForObject = useCallback(
    (objectId: string) => {
      return links.filter((link) =>
        link.source_object === objectId || link.target_object === objectId
      );
    },
    [links]
  );

  return {
    links,
    addLink: handleAddLink,
    updateLink: handleUpdateLink,
    deleteLink: handleDeleteLink,
    getLinksForObject,
  };
}
