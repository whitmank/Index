/**
 * CollectionsView Page
 *
 * Create and manage collections
 * Collections are saved searches with AND/OR/NOT tag queries
 */

import { useState, useCallback } from 'react';
import { CollectionQueryBuilder } from '../components';
import { useCollectionsData } from '../hooks/useCollectionsData';
import { useCollections } from '../hooks/useCollections';
import { useLoadingState } from '../hooks/useLoadingState';
import { LoadingSpinner } from '../components';
import type { CollectionQuery } from '@shared/types/models';

export function CollectionsView() {
  const { refetch } = useCollectionsData();
  const { collections, addCollection, updateCollection, deleteCollection } = useCollections();
  const { loading, error } = useLoadingState();

  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formQuery, setFormQuery] = useState<CollectionQuery>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleSaveCollection = useCallback(async () => {
    if (!formName.trim()) return;

    try {
      if (editingId) {
        // Update existing
        await updateCollection(editingId, {
          name: formName,
          description: formDescription,
          query: formQuery,
          modified_at: new Date().toISOString(),
        });
        setEditingId(null);
      } else {
        // Create new
        const now = new Date().toISOString();
        await addCollection({
          id: `col:${Date.now()}`,
          name: formName,
          description: formDescription,
          query: formQuery,
          created_at: now,
          modified_at: now,
        });
      }

      // Reset form
      setFormName('');
      setFormDescription('');
      setFormQuery({});
      setShowForm(false);
    } catch (err) {
      console.error('Error saving collection:', err);
    }
  }, [formName, formDescription, formQuery, editingId, addCollection, updateCollection]);

  const handleEdit = useCallback(
    (collectionId: string) => {
      const collection = collections.find((c) => c.id === collectionId);
      if (collection) {
        setEditingId(collectionId);
        setFormName(collection.name);
        setFormDescription(collection.description || '');
        setFormQuery(collection.query);
        setShowForm(true);
      }
    },
    [collections]
  );

  const handleDelete = useCallback(
    async (collectionId: string) => {
      if (confirm('Delete this collection?')) {
        try {
          await deleteCollection(collectionId);
        } catch (err) {
          console.error('Error deleting collection:', err);
        }
      }
    },
    [deleteCollection]
  );

  const handleCancel = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormQuery({});
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b bg-gray-50">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Collections</h1>
          <p className="text-sm text-gray-600">
            Create saved searches with tag filters ({collections.length} total)
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          + New Collection
        </button>
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
          <LoadingSpinner message="Loading collections..." size="lg" />
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Collections List */}
            <div className="lg:col-span-1">
              <h2 className="text-lg font-semibold mb-4">Collections</h2>
              {collections.length === 0 ? (
                <p className="text-gray-500 text-sm">No collections yet</p>
              ) : (
                <div className="space-y-2">
                  {collections.map((collection) => (
                    <div
                      key={collection.id}
                      className="p-3 bg-gray-50 rounded border hover:border-blue-300"
                    >
                      <h3 className="font-medium text-sm">{collection.name}</h3>
                      {collection.description && (
                        <p className="text-xs text-gray-600 mt-1">{collection.description}</p>
                      )}
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleEdit(collection.id)}
                          className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(collection.id)}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Query Builder / Details */}
            {showForm && (
              <div className="lg:col-span-2 bg-white p-6 rounded border border-gray-200">
                <div className="mb-4">
                  <h2 className="text-lg font-semibold mb-4">
                    {editingId ? 'Edit' : 'Create'} Collection
                  </h2>

                  {/* Form Fields */}
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Name *
                      </label>
                      <input
                        type="text"
                        value={formName}
                        onChange={(e) => setFormName(e.target.value)}
                        placeholder="Collection name"
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        value={formDescription}
                        onChange={(e) => setFormDescription(e.target.value)}
                        placeholder="Optional description"
                        rows={3}
                        className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Query Builder */}
                  <div className="mb-6 pb-6 border-b">
                    <h3 className="font-semibold text-sm mb-4">Query Filter</h3>
                    <CollectionQueryBuilder
                      query={formQuery}
                      onChange={setFormQuery}
                    />
                  </div>

                  {/* Buttons */}
                  <div className="flex gap-3">
                    <button
                      onClick={handleSaveCollection}
                      disabled={!formName.trim()}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {editingId ? 'Update' : 'Create'} Collection
                    </button>
                    <button
                      onClick={handleCancel}
                      className="px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
