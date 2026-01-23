/**
 * useLinksData Hook
 *
 * Fetches links from API and populates the Zustand store
 * Handles loading and error states
 */

import { useEffect, useCallback } from 'react';
import { api } from '../services/api-client';
import { useAppStore } from '../store/app-store';

export function useLinksData() {
  const { setLinks, setLoading, setError } = useAppStore();

  const fetchLinks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const links = await api.getLinks();
      setLinks(links);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch links';
      setError(message);
      console.error('Error fetching links:', err);
    } finally {
      setLoading(false);
    }
  }, [setLinks, setLoading, setError]);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  return { refetch: fetchLinks };
}
