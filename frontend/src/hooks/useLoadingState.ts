/**
 * useLoadingState Hook
 *
 * Provides easy access to loading and error state
 */

import { useCallback } from 'react';
import { useAppStore } from '../store/app-store';

export function useLoadingState() {
  // Select from store
  const loading = useAppStore((state) => state.loading);
  const error = useAppStore((state) => state.error);

  // Get actions
  const setLoading = useAppStore((state) => state.setLoading);
  const setError = useAppStore((state) => state.setError);

  // Memoized callbacks
  const handleSetLoading = useCallback(
    (isLoading: boolean) => {
      setLoading(isLoading);
    },
    [setLoading]
  );

  const handleSetError = useCallback(
    (err: string | null) => {
      setError(err);
    },
    [setError]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, [setError]);

  return {
    loading,
    error,
    setLoading: handleSetLoading,
    setError: handleSetError,
    clearError,
    hasError: error !== null,
  };
}
