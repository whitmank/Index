/**
 * TagsView Page
 *
 * Manage tag definitions
 * Create, rename, color-pick, and delete tags
 */

import { useState } from 'react';
import { TagManager } from '../components';
import { useTagsData } from '../hooks/useTagsData';
import { useTags } from '../hooks/useTags';
import { useLoadingState } from '../hooks/useLoadingState';
import { LoadingSpinner } from '../components';

export function TagsView() {
  const { refetch } = useTagsData();
  const { tags } = useTags();
  const { loading, error } = useLoadingState();
  const [showManager, setShowManager] = useState(true);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-gray-50">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tags</h1>
          <p className="text-sm text-gray-600">
            Organize objects with tags ({tags.length} total)
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh tags"
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

      {/* Content */}
      {loading && !error ? (
        <div className="flex-1 flex items-center justify-center">
          <LoadingSpinner message="Loading tags..." size="lg" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-2xl">
            {showManager ? (
              <TagManager onClose={() => setShowManager(false)} />
            ) : (
              <button
                onClick={() => setShowManager(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Show Tag Manager
              </button>
            )}
          </div>
        </div>
      )}

      {/* Info Section */}
      <div className="px-6 py-4 border-t bg-gray-50 text-sm text-gray-600">
        <h3 className="font-semibold mb-2">About Tags</h3>
        <ul className="space-y-1 text-xs">
          <li>• Tags help you organize and categorize objects</li>
          <li>• Each tag has a name and optional color</li>
          <li>• Renaming a tag updates all objects with that tag</li>
          <li>• Deleting a tag removes it from all objects</li>
          <li>• Use tags in collections to create smart filters</li>
        </ul>
      </div>
    </div>
  );
}
