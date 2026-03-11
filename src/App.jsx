// Author: Claude Code
// App root — v0.4.
// Changes from v0.3:
//   - Uses useIndexStore (replaces three separate stores)
//   - subscribeToLive() wired on mount — LIVE SELECT drives all state updates
//   - onObjectsChanged file watcher listener removed (no longer needed)
//   - loadAll() on mount instead of loadObjects()

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from './store/index';
import { useHistoryStore } from './store/history';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import GraphView from './components/GraphView';
import ObjectDetailSidebar from './components/ObjectDetailSidebar';
import SettingsModal from './components/SettingsModal';
import CollectionsSidebar from './components/CollectionsSidebar';
import UndoToast from './components/UndoToast';
import './App.css';

function getNameFromSource(source) {
  if (source.includes('/') || source.includes('\\')) {
    const filename = source.split(/[\\/]/).pop();
    return filename.replace(/\.[^.]*$/, '') || filename;
  }
  try {
    const url = new URL(source);
    const pathname = url.pathname.split('/').filter(Boolean).pop();
    return pathname || url.hostname;
  } catch {
    return source.split('/').pop() || source;
  }
}

export default function App() {
  const objects = useIndexStore(state => state.objects);
  const loading = useIndexStore(state => state.loading);
  const loadAll = useIndexStore(state => state.loadAll);
  const subscribeToLive = useIndexStore(state => state.subscribeToLive);
  const addObject = useIndexStore(state => state.addObject);
  const activeCollectionId = useIndexStore(state => state.activeCollectionId);
  const getDisplayObjects = useIndexStore(state => state.getDisplayObjects);

  const [isDragging, setIsDragging] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const lastSelectedNodeIdRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const [deviceOrigin, setDeviceOrigin] = useState(null);

  const displayObjects = getDisplayObjects();

  useEffect(() => {
    window.electronAPI?.device?.getOrigin().then(origin => {
      setDeviceOrigin(origin || 'unknown');
    });
  }, []);

  useEffect(() => {
    if (selectedNodeId !== null) {
      lastSelectedNodeIdRef.current = selectedNodeId;
    }
  }, [selectedNodeId]);

  const undo = useHistoryStore(state => state.undo);
  useKeyboardShortcuts({
    onSettings: () => setShowSettings(v => !v),
    onDetail: () => {
      if (selectedNodeId !== null) {
        setSelectedNodeId(null);
      } else {
        const target = lastSelectedNodeIdRef.current ?? displayObjects[0]?.id ?? null;
        setSelectedNodeId(target);
      }
    },
    onUndo: undo,
  });

  // On mount: load initial state and wire LIVE SELECT
  useEffect(() => {
    loadAll();
    subscribeToLive();

    // Capture-triggered selection (Cmd+I from another app)
    window.electronAPI?.onSelectObject((id) => {
      setSelectedNodeId(id);
    });
  }, []);

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target.closest('.object-detail-sidebar')) return;
    setIsDragging(true);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target.closest('.object-detail-sidebar')) return;
    if (e.target === e.currentTarget) setIsDragging(false);
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
        const uri = `file://${filePath}`;
        const name = getNameFromSource(filePath);
        await addObject({ name, sources: [{ uri, origin: deviceOrigin || 'unknown' }] });
      } catch (error) {
        console.error('Error creating object from dropped file:', error);
      }
    }
  };

  const handlePaste = async (e) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      try {
        const file = e.clipboardData.files[0];
        const filePath = window.electronAPI.fs.getPathForFile(file);
        const uri = `file://${filePath}`;
        const name = getNameFromSource(filePath);
        await addObject({ name, sources: [{ uri, origin: deviceOrigin || 'unknown' }] });
      } catch (error) {
        console.error('Error creating object from pasted file:', error);
      }
      return;
    }

    const text = e.clipboardData.getData('text');
    if (text && (text.startsWith('http') || text.includes('/'))) {
      e.preventDefault();
      try {
        const name = getNameFromSource(text);
        const isUrl = text.startsWith('http://') || text.startsWith('https://');
        const sources = isUrl
          ? [{ uri: text, origin: 'Web' }]
          : [{ uri: `file://${text}`, origin: deviceOrigin || 'unknown' }];
        await addObject({ name, sources });
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
      <CollectionsSidebar />
      {isDragging && (
        <div className="drop-indicator">
          <div className="drop-indicator-content">
            Drop file or URL to create object
          </div>
        </div>
      )}
      {loading && objects.length === 0 ? (
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
          {lastSelectedNodeIdRef.current !== null && (
            <ObjectDetailSidebar
              key={`sidebar-${selectedNodeId ?? lastSelectedNodeIdRef.current}`}
              objectId={selectedNodeId ?? lastSelectedNodeIdRef.current}
              isOpen={selectedNodeId !== null}
              onClose={() => setSelectedNodeId(null)}
            />
          )}
        </>
      )}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />
      <UndoToast />
    </div>
  );
}
