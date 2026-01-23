/**
 * SearchBar Component
 *
 * Search and filter objects by name or source
 */

import { useCallback, useState } from 'react';
import { useUIState } from '../hooks/useUIState';

export interface SearchBarProps {
  placeholder?: string;
}

export function SearchBar({ placeholder = 'Search objects...' }: SearchBarProps) {
  const { searchQuery, setSearchQuery } = useUIState();
  const [localQuery, setLocalQuery] = useState(searchQuery);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setLocalQuery(value);
      setSearchQuery(value);
    },
    [setSearchQuery]
  );

  const handleClear = useCallback(() => {
    setLocalQuery('');
    setSearchQuery('');
  }, [setSearchQuery]);

  return (
    <div className="relative">
      <div className="flex items-center gap-2 px-3 py-2 bg-white border rounded-lg focus-within:ring-2 focus-within:ring-blue-500">
        <span className="text-gray-500">🔍</span>
        <input
          type="text"
          value={localQuery}
          onChange={handleChange}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm"
        />
        {localQuery && (
          <button
            onClick={handleClear}
            className="text-gray-500 hover:text-gray-700"
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
