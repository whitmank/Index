/**
 * CollectionQueryBuilder Component
 *
 * Build collection queries with AND/OR/NOT logic
 */

import { useState, useCallback, useMemo } from 'react';
import { useTags } from '../hooks/useTags';
import type { CollectionQuery } from '@shared/types/models';

export interface CollectionQueryBuilderProps {
  query?: CollectionQuery;
  onChange: (query: CollectionQuery) => void;
}

export function CollectionQueryBuilder({ query = {}, onChange }: CollectionQueryBuilderProps) {
  const { tags } = useTags();
  const [showSuggestions, setShowSuggestions] = useState<'all' | 'any' | 'none' | null>(null);
  const [inputValue, setInputValue] = useState('');

  const allTags = useMemo(() => {
    return tags.map((tag) => tag.name);
  }, [tags]);

  const filteredSuggestions = useMemo(() => {
    if (!inputValue.trim()) return allTags;
    return allTags.filter((tag) => tag.toLowerCase().includes(inputValue.toLowerCase()));
  }, [allTags, inputValue]);

  const handleAddTag = useCallback(
    (type: 'all' | 'any' | 'none', tagName: string) => {
      const newQuery = { ...query };
      if (!newQuery[type]) {
        newQuery[type] = [];
      }
      if (!newQuery[type]!.includes(tagName)) {
        newQuery[type] = [...newQuery[type]!, tagName];
      }
      onChange(newQuery);
      setInputValue('');
      setShowSuggestions(null);
    },
    [query, onChange]
  );

  const handleRemoveTag = useCallback(
    (type: 'all' | 'any' | 'none', tagName: string) => {
      const newQuery = { ...query };
      if (newQuery[type]) {
        newQuery[type] = newQuery[type]!.filter((tag) => tag !== tagName);
        if (newQuery[type]!.length === 0) {
          delete newQuery[type];
        }
      }
      onChange(newQuery);
    },
    [query, onChange]
  );

  const renderQuerySection = (
    type: 'all' | 'any' | 'none',
    label: string,
    description: string
  ) => {
    const tags = query[type] || [];
    return (
      <div className="mb-4">
        <div className="mb-2">
          <h4 className="font-semibold text-sm text-gray-700">{label}</h4>
          <p className="text-xs text-gray-600">{description}</p>
        </div>

        {/* Tag Input */}
        <div className="relative mb-2">
          <input
            type="text"
            value={showSuggestions === type ? inputValue : ''}
            onChange={(e) => {
              setInputValue(e.target.value);
              setShowSuggestions(type);
            }}
            onFocus={() => setShowSuggestions(type)}
            placeholder={`Add ${label.toLowerCase()} tag...`}
            className="w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          {/* Suggestions */}
          {showSuggestions === type && filteredSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-10">
              {filteredSuggestions.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleAddTag(type, tag)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Selected Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <div
                key={tag}
                className="flex items-center gap-1 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"
              >
                <span>{tag}</span>
                <button
                  onClick={() => handleRemoveTag(type, tag)}
                  className="text-blue-600 hover:text-blue-800"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {tags.length === 0 && (
          <p className="text-xs text-gray-500">No tags selected</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {renderQuerySection(
        'all',
        'Must have ALL',
        'Objects must have ALL these tags (AND logic)'
      )}

      <div className="border-t pt-4">
        {renderQuerySection(
          'any',
          'Must have ANY',
          'Objects must have AT LEAST ONE of these tags (OR logic)'
        )}
      </div>

      <div className="border-t pt-4">
        {renderQuerySection(
          'none',
          'Must have NONE',
          'Objects must NOT have ANY of these tags (NOT logic)'
        )}
      </div>

      {/* Query Summary */}
      <div className="bg-gray-50 p-3 rounded border">
        <p className="text-xs text-gray-600 mb-2">Query Summary:</p>
        {Object.keys(query).length === 0 ? (
          <p className="text-xs text-gray-500 italic">No filters applied</p>
        ) : (
          <pre className="text-xs bg-white p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(query, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
