/**
 * useTags Hook
 *
 * Provides easy access to tag definitions and assignments state
 */

import { useCallback } from 'react';
import { useAppStore, selectAllTags } from '../store/app-store';
import type { TagDefinition, TagAssignment } from '@shared/types/models';

export function useTags() {
  // Select from store
  const tags = useAppStore(selectAllTags);
  const tagAssignments = useAppStore((state) =>
    Array.from(state.tagAssignments.values())
  );

  // Get actions
  const addTagDefinition = useAppStore((state) => state.addTagDefinition);
  const updateTagDefinition = useAppStore((state) => state.updateTagDefinition);
  const deleteTagDefinition = useAppStore((state) => state.deleteTagDefinition);
  const addTagAssignment = useAppStore((state) => state.addTagAssignment);
  const deleteTagAssignment = useAppStore((state) => state.deleteTagAssignment);
  const getTagsForObject = useAppStore((state) => state.getTagsForObject);
  const getObjectsWithTag = useAppStore((state) => state.getObjectsWithTag);

  // Memoized callbacks
  const handleAddTag = useCallback(
    (tag: TagDefinition) => {
      addTagDefinition(tag);
    },
    [addTagDefinition]
  );

  const handleUpdateTag = useCallback(
    (id: string, updates: Partial<TagDefinition>) => {
      updateTagDefinition(id, updates);
    },
    [updateTagDefinition]
  );

  const handleDeleteTag = useCallback(
    (id: string) => {
      deleteTagDefinition(id);
    },
    [deleteTagDefinition]
  );

  const handleAssignTag = useCallback(
    (assignment: TagAssignment) => {
      addTagAssignment(assignment);
    },
    [addTagAssignment]
  );

  const handleUnassignTag = useCallback(
    (assignmentId: string) => {
      deleteTagAssignment(assignmentId);
    },
    [deleteTagAssignment]
  );

  return {
    tags,
    tagAssignments,
    addTag: handleAddTag,
    updateTag: handleUpdateTag,
    deleteTag: handleDeleteTag,
    assignTag: handleAssignTag,
    unassignTag: handleUnassignTag,
    getTagsForObject,
    getObjectsWithTag,
  };
}
