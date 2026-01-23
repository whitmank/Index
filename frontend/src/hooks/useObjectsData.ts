/**
 * useObjectsData Hook
 *
 * Fetches objects from API and populates the Zustand store
 * Handles loading and error states automatically
 */

import { useEffect, useCallback } from 'react';
import { api } from '../services/api-client';
import { useAppStore } from '../store/app-store';

export function useObjectsData() {
  const { setObjects, setLoading, setError, clearSelection } = useAppStore();

  const fetchObjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const objects = await api.getObjects();
      setObjects(objects);
      clearSelection();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch objects';
      setError(message);
      console.error('Error fetching objects:', err);
    } finally {
      setLoading(false);
    }
  }, [setObjects, setLoading, setError, clearSelection]);

  useEffect(() => {
    fetchObjects();
  }, [fetchObjects]);

  return { refetch: fetchObjects };
}
