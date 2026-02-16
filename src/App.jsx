import { useEffect, useState } from 'react';
import { useObjectsStore } from './store/objects';
import { useCollectionsStore } from './store/collections';
import GraphView from './components/GraphView';
import ObjectDetailSidebar from './components/ObjectDetailSidebar';
import CollectionsSidebar from './components/CollectionsSidebar';
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
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
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
        await addObject({ name, source: filePath });
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
        await addObject({ name, source: filePath });
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
        await addObject({ name, source: text });
      } catch (error) {
        console.error('Error creating object from pasted text:', error);
      }
    }
  };

  return (
    <div
      className="app"
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
    </div>
  );
}
