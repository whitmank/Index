/**
 * useImportSource Hook
 *
 * Handles importing sources (files, URLs) via the API
 * Updates the store with the new object
 */

import { useCallback } from 'react';
import { api, ApiError } from '../services/api-client';
import { useAppStore } from '../store/app-store';
import type { IndexObject } from '@shared/types/models';

export interface ImportOptions {
  tags?: string[];
  notes?: string;
}

export function useImportSource() {
  const { addObject, setLoading, setError } = useAppStore();

  const importSource = useCallback(
    async (source: string, options?: ImportOptions): Promise<IndexObject | null> => {
      setLoading(true);
      setError(null);
      try {
        const object = await api.importSource(source, options);
        addObject(object);
        return object;
      } catch (err) {
        let message = 'Failed to import source';
        if (err instanceof ApiError) {
          message = err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        setError(message);
        console.error('Error importing source:', err);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [addObject, setLoading, setError]
  );

  return { importSource };
}
