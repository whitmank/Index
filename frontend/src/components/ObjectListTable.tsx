/**
 * ObjectListTable Component
 *
 * Main table view for displaying indexed objects
 * Supports multi-select, sorting, and filtering
 */

import { useMemo, useCallback, useRef, useEffect } from 'react';
import { useObjects } from '../hooks/useObjects';
import { useSelection } from '../hooks/useSelection';
import { useUIState } from '../hooks/useUIState';
import type { IndexObject } from '@shared/types/models';

export interface ObjectListTableProps {
  onSelectObject?: (object: IndexObject) => void;
}

export function ObjectListTable({ onSelectObject }: ObjectListTableProps) {
  const { objects } = useObjects();
  const { selectedObjectIds, toggleSelect, selectAll, isSelected } = useSelection();
  const { sortField, sortDirection, searchQuery, setSort } = useUIState();

  // Filter objects by search query
  const filteredObjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return objects;
    }

    const query = searchQuery.toLowerCase();
    return objects.filter(
      (obj) =>
        obj.name.toLowerCase().includes(query) ||
        obj.source.toLowerCase().includes(query)
    );
  }, [objects, searchQuery]);

  // Sort objects
  const sortedObjects = useMemo(() => {
    const sorted = [...filteredObjects];
    // Validate and default sort field
    const validFields: ('name' | 'created_at' | 'modified_at')[] = ['name', 'created_at', 'modified_at'];
    const field = (validFields.includes(sortField as any)
      ? sortField
      : 'name') as keyof IndexObject;

    sorted.sort((a, b) => {
      let aVal: any = a[field];
      let bVal: any = b[field];

      // Handle null/undefined
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return sortDirection === 'asc' ? 1 : -1;
      if (bVal == null) return sortDirection === 'asc' ? -1 : 1;

      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }

      // Numeric comparison
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredObjects, sortField, sortDirection]);

  const handleSort = useCallback(
    (field: string) => {
      // Validate field is a sortable property (matches store types)
      const validFields: ('name' | 'created_at' | 'modified_at')[] = ['name', 'created_at', 'modified_at'];
      if (!validFields.includes(field as any)) {
        return;
      }

      // Toggle direction if same field, otherwise set to ascending
      if (sortField === field) {
        setSort(field as 'name' | 'created_at' | 'modified_at', sortDirection === 'asc' ? 'desc' : 'asc');
      } else {
        setSort(field as 'name' | 'created_at' | 'modified_at', 'asc');
      }
    },
    [sortField, sortDirection, setSort]
  );

  const handleSelectAll = useCallback(() => {
    if (selectedObjectIds.size === sortedObjects.length) {
      // Deselect all
      selectAll([]);
    } else {
      // Select all visible
      selectAll(sortedObjects.map((obj) => obj.id));
    }
  }, [selectedObjectIds.size, sortedObjects, selectAll]);

  const handleRowClick = useCallback(
    (object: IndexObject, event: React.MouseEvent) => {
      // Multi-select support: Cmd/Ctrl for toggle, Shift for range
      if (event.metaKey || event.ctrlKey) {
        toggleSelect(object.id);
      } else if (event.shiftKey) {
        // Range selection: find first and last selected, select range
        const visibleIds = sortedObjects.map((obj) => obj.id);
        const lastSelectedIdx = visibleIds.findIndex((id) => selectedObjectIds.has(id));
        const currentIdx = visibleIds.indexOf(object.id);

        if (lastSelectedIdx >= 0 && currentIdx >= 0) {
          const [start, end] = lastSelectedIdx < currentIdx
            ? [lastSelectedIdx, currentIdx]
            : [currentIdx, lastSelectedIdx];
          const rangeIds = visibleIds.slice(start, end + 1);
          selectAll(rangeIds);
          return;
        }
      }

      // Single select
      toggleSelect(object.id);
      onSelectObject?.(object);
    },
    [sortedObjects, selectedObjectIds, toggleSelect, selectAll, onSelectObject]
  );

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return <span className="text-gray-300">⇅</span>;
    return sortDirection === 'asc' ? <span>↑</span> : <span>↓</span>;
  };

  const allSelected = sortedObjects.length > 0 && selectedObjectIds.size === sortedObjects.length;
  const someSelected = selectedObjectIds.size > 0 && selectedObjectIds.size < sortedObjects.length;
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  // Update checkbox indeterminate state
  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Header with select all */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-gray-50">
        <input
          ref={selectAllCheckboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={handleSelectAll}
          className="cursor-pointer"
          title={allSelected ? 'Deselect all' : 'Select all visible'}
        />
        <span className="text-sm text-gray-600">
          {selectedObjectIds.size} of {sortedObjects.length} selected
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 bg-gray-100 border-b">
            <tr>
              <th className="p-2 text-left font-semibold">
                <button
                  onClick={() => handleSort('name')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Name <SortIcon field="name" />
                </button>
              </th>
              <th className="p-2 text-left font-semibold">
                <span className="flex items-center gap-1">
                  Type <SortIcon field="name" />
                </span>
              </th>
              <th className="p-2 text-left font-semibold">
                <span className="flex items-center gap-1">
                  Source <SortIcon field="name" />
                </span>
              </th>
              <th className="p-2 text-left font-semibold">
                <button
                  onClick={() => handleSort('modified_at')}
                  className="flex items-center gap-1 hover:text-blue-600"
                >
                  Modified <SortIcon field="modified_at" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedObjects.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-center text-gray-500">
                  {objects.length === 0 ? 'No objects' : 'No matches'}
                </td>
              </tr>
            ) : (
              sortedObjects.map((object) => (
                <tr
                  key={object.id}
                  onClick={(e) => handleRowClick(object, e)}
                  className={`border-b cursor-pointer hover:bg-blue-50 ${
                    isSelected(object.id) ? 'bg-blue-100' : ''
                  }`}
                >
                  <td className="p-2">
                    <input
                      type="checkbox"
                      checked={isSelected(object.id)}
                      onChange={() => toggleSelect(object.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="p-2">{object.name}</td>
                  <td className="p-2 text-gray-600">{object.type}</td>
                  <td className="p-2 text-gray-600 text-xs break-all">{object.source}</td>
                  <td className="p-2 text-gray-600 text-xs">
                    {new Date(object.modified_at).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
