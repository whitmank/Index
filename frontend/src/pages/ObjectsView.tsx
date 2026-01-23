/**
 * ObjectsView Page
 *
 * Main view displaying all indexed objects
 * Combines search, table, and detail panel
 */

import { useEffect } from 'react';
import { SearchBar, ObjectListTable, LoadingSpinner } from '../components';
import { useObjectsData } from '../hooks/useObjectsData';
import { useLoadingState } from '../hooks/useLoadingState';

export function ObjectsView() {
  const { refetch } = useObjectsData();
  const { loading, error } = useLoadingState();

  // Initial fetch is handled by useObjectsData hook on mount
  // But expose refetch for manual refresh

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-gray-50">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Objects</h1>
          <p className="text-sm text-gray-600">Browse and manage all indexed objects</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh object list"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="px-6 py-4 border-b bg-white">
        <SearchBar placeholder="Search objects by name or source..." />
      </div>

      {/* Content */}
      {loading && !error ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner message="Loading objects..." size="lg" />
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ObjectListTable />
        </div>
      )}
    </div>
  );
}
