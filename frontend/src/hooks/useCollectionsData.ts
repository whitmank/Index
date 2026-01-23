/**
 * useCollectionsData Hook
 *
 * Fetches collections from API and populates the Zustand store
 * Handles loading and error states
 */

import { useEffect, useCallback } from 'react';
import { api } from '../services/api-client';
import { useAppStore } from '../store/app-store';

export function useCollectionsData() {
  const { setCollections, setLoading, setError } = useAppStore();

  const fetchCollections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const collections = await api.getCollections();
      setCollections(collections);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch collections';
      setError(message);
      console.error('Error fetching collections:', err);
    } finally {
      setLoading(false);
    }
  }, [setCollections, setLoading, setError]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  return { refetch: fetchCollections };
}
