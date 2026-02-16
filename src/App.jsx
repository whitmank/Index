import { useEffect } from 'react';
import { useObjectsStore } from './store/objects';
import GraphView from './components/GraphView';
import './App.css';

export default function App() {
  const objects = useObjectsStore((state) => state.objects);
  const loading = useObjectsStore((state) => state.loading);
  const loadObjects = useObjectsStore((state) => state.loadObjects);

  // Load objects on mount and setup file watcher
  useEffect(() => {
    loadObjects();
    // Listen for file system changes
    window.electronAPI?.onObjectsChanged(() => {
      console.log('File change detected, reloading objects...');
      loadObjects();
    });
  }, [loadObjects]);

  return (
    <div className="app">
      <div className="title-bar" />
      {loading ? (
        <div className="loading">Loading...</div>
      ) : objects.length === 0 ? (
        <div className="empty-state">No objects yet</div>
      ) : (
        <GraphView objects={objects} />
      )}
    </div>
  );
}
