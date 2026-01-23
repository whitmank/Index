/**
 * Sidebar Component
 *
 * Navigation and quick actions
 */

import { useCallback, useMemo } from 'react';
import { useUIState } from '../hooks/useUIState';
import { useObjects } from '../hooks/useObjects';
import { useTags } from '../hooks/useTags';
import { useCollections } from '../hooks/useCollections';

export interface SidebarProps {
  onViewChange?: (view: string) => void;
}

type ViewType = 'all-objects' | 'tags' | 'collections' | 'settings';

export function Sidebar({ onViewChange }: SidebarProps) {
  const { currentView, setCurrentView, setSidebarCollapsed } = useUIState();
  const { objects } = useObjects();
  const { tags } = useTags();
  const { collections } = useCollections();

  const objectCount = useMemo(() => objects.length, [objects]);
  const tagCount = useMemo(() => tags.length, [tags]);
  const collectionCount = useMemo(() => collections.length, [collections]);

  const handleViewChange = useCallback(
    (view: ViewType) => {
      setCurrentView(view);
      onViewChange?.(view);
    },
    [setCurrentView, onViewChange]
  );

  const menuItems: { id: ViewType; label: string; icon: string; count?: number }[] = [
    { id: 'all-objects', label: 'Objects', icon: '📄', count: objectCount },
    { id: 'tags', label: 'Tags', icon: '🏷️', count: tagCount },
    { id: 'collections', label: 'Collections', icon: '📚', count: collectionCount },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className="w-64 bg-gray-900 text-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 className="font-bold text-lg">Index</h1>
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="text-gray-400 hover:text-white md:hidden"
          title="Collapse sidebar"
        >
          ☰
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => handleViewChange(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition ${
              currentView === item.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-300 hover:bg-gray-800'
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            <span className="flex-1 text-left font-medium">{item.label}</span>
            {item.count !== undefined && (
              <span
                className={`text-sm px-2 py-1 rounded ${
                  currentView === item.id
                    ? 'bg-blue-700'
                    : 'bg-gray-700 text-gray-300'
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-700 text-xs text-gray-400 space-y-2">
        <div>
          <p className="text-gray-500 mb-1">v0.3</p>
          <a href="#" className="hover:text-gray-300">
            Help
          </a>
          <span className="mx-2">•</span>
          <a href="#" className="hover:text-gray-300">
            Docs
          </a>
        </div>
      </div>
    </aside>
  );
}
