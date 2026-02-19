import { useEffect, useState } from 'react';
import { useObjectsStore } from './store/objects';
import { useCollectionsStore } from './store/collections';
import { useHistoryStore } from './store/history';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import GraphView from './components/GraphView';
import ObjectDetailSidebar from './components/ObjectDetailSidebar';
import CollectionsSidebar from './components/CollectionsSidebar';
import SettingsModal from './components/SettingsModal';
import './App.css';

// Helper function to derive object name from source
function getNameFromSource(source) {
  // Remove extension if it's a file path
  if (source.includes('/') || source.includes('\\')) {
    const filename = source.split(/[\\/]/).pop();
    return filename.replace(/\.[^.]*$/, '') || filename;
  }
  // For URLs, extract hostname or last path segment
  try {
    const url = new URL(source);
    const pathname = url.pathname.split('/').filter(Boolean).pop();
    return pathname || url.hostname;
  } catch {
    // Fallback for non-URL strings
    return source.split('/').pop() || source;
  }
}

export default function App() {
  const objects = useObjectsStore((state) => state.objects);
  const loading = useObjectsStore((state) => state.loading);
  const loadObjects = useObjectsStore((state) => state.loadObjects);
  const addObject = useObjectsStore((state) => state.addObject);
  const filteredObjects = useCollectionsStore((state) => state.filteredObjects);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem('collectionsCollapsed');
    return saved ? JSON.parse(saved) : false;
  });
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('sidebarWidth');
    return saved ? parseInt(saved, 10) : 240;
  });

  // Listen for sidebar collapse and width changes
  useEffect(() => {
    const handleCollapsedChange = () => {
      const saved = localStorage.getItem('collectionsCollapsed');
      setSidebarCollapsed(saved ? JSON.parse(saved) : false);
    };
    const handleWidthChange = () => {
      const saved = localStorage.getItem('sidebarWidth');
      setSidebarWidth(saved ? parseInt(saved, 10) : 240);
    };
    window.addEventListener('collectionsCollapsedChange', handleCollapsedChange);
    window.addEventListener('sidebarWidthChange', handleWidthChange);
    return () => {
      window.removeEventListener('collectionsCollapsedChange', handleCollapsedChange);
      window.removeEventListener('sidebarWidthChange', handleWidthChange);
    };
  }, []);

  // Setup keyboard shortcuts
  const undo = useHistoryStore((state) => state.undo);
  useKeyboardShortcuts({
    onSettings: () => setShowSettings(true),
    onUndo: undo,
  });

  // Use filtered objects if a collection is active, otherwise use all objects
  const displayObjects = filteredObjects !== null ? filteredObjects : objects;
  const selectedObject = displayObjects.find((obj) => obj.id === selectedNodeId);

  // Load objects on mount and setup file watcher
  useEffect(() => {
    loadObjects();
    // Listen for file system changes
    window.electronAPI?.onObjectsChanged(() => {
      console.log('File change detected, reloading objects...');
      loadObjects();
    });
  }, [loadObjects]);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore collection reorder drags
    if (e.dataTransfer.types.includes('application/x-collection-drag')) {
      return;
    }
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore collection reorder drags
    if (e.dataTransfer.types.includes('application/x-collection-drag')) {
      return;
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore collection reorder drags
    if (e.dataTransfer.types.includes('application/x-collection-drag')) {
      return;
    }
    if (e.target === e.currentTarget) {
      setIsDragging(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      try {
        const file = files[0];
        const filePath = window.electronAPI.fs.getPathForFile(file);
        const name = getNameFromSource(filePath);
        await addObject({ name, source_local: filePath, source_remote: null });
      } catch (error) {
        console.error('Error creating object from dropped file:', error);
      }
    }
  };

  const handlePaste = async (e) => {
    // Check for files in clipboard
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      try {
        const file = e.clipboardData.files[0];
        const filePath = window.electronAPI.fs.getPathForFile(file);
        const name = getNameFromSource(filePath);
        await addObject({ name, source_local: filePath, source_remote: null });
      } catch (error) {
        console.error('Error creating object from pasted file:', error);
      }
      return;
    }

    // Fall back to text (URL or path)
    const text = e.clipboardData.getData('text');
    if (text && (text.startsWith('http') || text.includes('/'))) {
      e.preventDefault();
      try {
        const name = getNameFromSource(text);
        const isUrl = text.startsWith('http://') || text.startsWith('https://');
        await addObject({
          name,
          source_local: isUrl ? null : text,
          source_remote: isUrl ? text : null,
        });
      } catch (error) {
        console.error('Error creating object from pasted text:', error);
      }
    }
  };

  return (
    <div
      className={`app ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
      style={{
        paddingLeft: sidebarCollapsed ? '60px' : `${sidebarWidth}px`,
      }}
      tabIndex={0}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onPaste={handlePaste}
    >
      <div className="title-bar" />
      {isDragging && (
        <div className="drop-indicator">
          <div className="drop-indicator-content">
            Drop file or URL to create object
          </div>
        </div>
      )}
      <CollectionsSidebar />
      {loading ? (
        <div className="loading">Loading...</div>
      ) : objects.length === 0 ? (
        <div className="empty-state">No objects yet</div>
      ) : displayObjects.length === 0 ? (
        <div className="empty-state">No matching objects</div>
      ) : (
        <>
          <GraphView
            objects={displayObjects}
            onNodeClick={setSelectedNodeId}
            selectedNodeId={selectedNodeId}
          />
          {selectedObject && (
            <ObjectDetailSidebar
              object={selectedObject}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </>
      )}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
