/**
 * TagManager Component
 *
 * Manage tag definitions (create, rename, delete, color)
 */

import { useState, useCallback } from 'react';
import { useTags } from '../hooks/useTags';
import { useLoadingState } from '../hooks/useLoadingState';

export interface TagManagerProps {
  onClose?: () => void;
}

export function TagManager({ onClose }: TagManagerProps) {
  const { tags, addTag, updateTag, deleteTag } = useTags();
  const { loading, error } = useLoadingState();
  const [newTagName, setNewTagName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingColor, setEditingColor] = useState('#3B82F6');

  const handleCreateTag = useCallback(async () => {
    if (!newTagName.trim()) return;

    try {
      await addTag({
        id: `tag:${Date.now()}`,
        name: newTagName,
        color: editingColor,
        created_at: new Date().toISOString(),
      });
      setNewTagName('');
      setEditingColor('#3B82F6');
    } catch (err) {
      console.error('Error creating tag:', err);
    }
  }, [newTagName, editingColor, addTag]);

  const handleUpdateTag = useCallback(
    async (tagId: string) => {
      if (!editingName.trim()) return;

      try {
        await updateTag(tagId, {
          name: editingName,
          color: editingColor,
        });
        setEditingId(null);
        setEditingName('');
      } catch (err) {
        console.error('Error updating tag:', err);
      }
    },
    [editingName, editingColor, updateTag]
  );

  const handleDeleteTag = useCallback(
    async (tagId: string) => {
      if (confirm('Delete this tag? This will remove it from all objects.')) {
        try {
          await deleteTag(tagId);
        } catch (err) {
          console.error('Error deleting tag:', err);
        }
      }
    },
    [deleteTag]
  );

  const handleStartEdit = useCallback((tagId: string, currentName: string, currentColor?: string) => {
    setEditingId(tagId);
    setEditingName(currentName);
    setEditingColor(currentColor || '#3B82F6');
  }, []);

  return (
    <div className="flex flex-col h-full bg-white border rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold">Tags</h2>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Create New Tag */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Create New Tag</h3>
          <div className="space-y-2">
            <input
              type="text"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              placeholder="Tag name"
              className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateTag();
                }
              }}
            />
            <div className="flex gap-2">
              <input
                type="color"
                value={editingColor}
                onChange={(e) => setEditingColor(e.target.value)}
                className="w-12 h-10 border rounded cursor-pointer"
              />
              <button
                onClick={handleCreateTag}
                disabled={loading || !newTagName.trim()}
                className="flex-1 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create'}
              </button>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </div>

        {/* Existing Tags */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Tags ({tags.length})
          </h3>
          {tags.length === 0 ? (
            <p className="text-sm text-gray-500">No tags yet</p>
          ) : (
            <div className="space-y-2">
              {tags.map((tag) => (
                <div
                  key={tag.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded border hover:border-gray-300"
                >
                  {editingId === tag.id ? (
                    <>
                      <input
                        type="color"
                        value={editingColor}
                        onChange={(e) => setEditingColor(e.target.value)}
                        className="w-8 h-8 border rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="flex-1 px-2 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={() => handleUpdateTag(tag.id)}
                        className="px-2 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-2 py-1 bg-gray-400 text-white text-sm rounded hover:bg-gray-500"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <div
                        className="w-6 h-6 rounded border"
                        style={{ backgroundColor: tag.color || '#3B82F6' }}
                        title={tag.color}
                      />
                      <span className="flex-1 font-medium text-gray-800">{tag.name}</span>
                      <button
                        onClick={() =>
                          handleStartEdit(tag.id, tag.name, tag.color)
                        }
                        className="px-2 py-1 text-sm text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTag(tag.id)}
                        className="px-2 py-1 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
