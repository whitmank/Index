/**
 * DetailPanel Component
 *
 * Shows details of selected objects
 * Displays metadata, tags, and actions
 */

import { useCallback, useMemo } from 'react';
import { useObjects } from '../hooks/useObjects';
import { useSelection } from '../hooks/useSelection';
import { useTags } from '../hooks/useTags';
import { useUIState } from '../hooks/useUIState';
import type { IndexObject } from '@shared/types/models';

export interface DetailPanelProps {
  onClose?: () => void;
}

export function DetailPanel({ onClose }: DetailPanelProps) {
  const { selectedObjectIds } = useSelection();
  const { objects } = useObjects();
  const { tags, assignTag, unassignTag, getTagsForObject } = useTags();
  const { setDetailPanelOpen } = useUIState();

  // Get selected objects
  const selectedObjects = useMemo(() => {
    return Array.from(selectedObjectIds).map((id) => objects.find((obj) => obj.id === id)).filter(Boolean) as IndexObject[];
  }, [selectedObjectIds, objects]);

  // Get first selected object for details
  const selectedObject = selectedObjects[0];

  // Get tags for selected object
  const objectTags = useMemo(() => {
    if (!selectedObject) return [];
    return getTagsForObject(selectedObject.id);
  }, [selectedObject, getTagsForObject]);

  const handleRemoveTag = useCallback(
    (tagId: string) => {
      if (selectedObject) {
        // In Phase 5, we can call unassignTag with the assignment ID
        // For now, this is a placeholder for the UI
        unassignTag(tagId);
      }
    },
    [selectedObject, unassignTag]
  );

  if (!selectedObject) {
    return (
      <div className="flex flex-col h-full bg-white border-l">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="font-semibold">Details</h2>
          <button
            onClick={() => setDetailPanelOpen(false)}
            className="text-gray-500 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          No object selected
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white border-l overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold truncate">{selectedObject.name}</h2>
        <button
          onClick={() => setDetailPanelOpen(false)}
          className="text-gray-500 hover:text-gray-700 flex-shrink-0"
        >
          ✕
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 space-y-4">
          {/* Object Info */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Information</h3>
            <div className="space-y-2 text-sm bg-gray-50 p-3 rounded">
              <div>
                <span className="text-gray-600">ID:</span>
                <code className="ml-2 text-xs bg-gray-200 px-1 rounded">{selectedObject.id}</code>
              </div>
              <div>
                <span className="text-gray-600">Type:</span>
                <span className="ml-2 font-medium">{selectedObject.type}</span>
              </div>
              <div>
                <span className="text-gray-600">Source:</span>
                <div className="ml-2 text-xs break-all font-mono bg-white p-1 rounded border">
                  {selectedObject.source}
                </div>
              </div>
              <div>
                <span className="text-gray-600">Created:</span>
                <span className="ml-2 text-xs">
                  {new Date(selectedObject.created_at).toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Modified:</span>
                <span className="ml-2 text-xs">
                  {new Date(selectedObject.modified_at).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Source Metadata */}
          {selectedObject.source_meta && Object.keys(selectedObject.source_meta).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Metadata</h3>
              <div className="bg-gray-50 p-3 rounded text-xs space-y-1">
                {Object.entries(selectedObject.source_meta).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-gray-600">{key}:</span>
                    <span className="text-gray-800">{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Tags</h3>
            <div className="space-y-2">
              {objectTags.length === 0 ? (
                <p className="text-sm text-gray-500">No tags assigned</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {objectTags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
                    >
                      <span>{tag.name}</span>
                      <button
                        onClick={() => handleRemoveTag(tag.id)}
                        className="ml-1 text-blue-600 hover:text-blue-800"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* User Metadata */}
          {selectedObject.user_meta && Object.keys(selectedObject.user_meta).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
              <div className="bg-yellow-50 p-3 rounded text-sm">
                {Object.entries(selectedObject.user_meta).map(([key, value]) => (
                  <div key={key} className="text-gray-800">
                    {String(value)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-select Info */}
          {selectedObjects.length > 1 && (
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <p className="text-sm text-blue-800">
                {selectedObjects.length} objects selected
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
