/**
 * useTagsData Hook
 *
 * Fetches tag definitions and assignments from API
 * Populates the Zustand store with tag data
 */

import { useEffect, useCallback } from 'react';
import { api } from '../services/api-client';
import { useAppStore } from '../store/app-store';

export function useTagsData() {
  const { setTagDefinitions, setTagAssignments, setLoading, setError } = useAppStore();

  const fetchTags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [definitions, assignments] = await Promise.all([
        api.getTagDefinitions(),
        api.getTagAssignments(),
      ]);
      setTagDefinitions(definitions);
      setTagAssignments(assignments);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch tags';
      setError(message);
      console.error('Error fetching tags:', err);
    } finally {
      setLoading(false);
    }
  }, [setTagDefinitions, setTagAssignments, setLoading, setError]);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  return { refetch: fetchTags };
}
