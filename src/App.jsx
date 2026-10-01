// Author: Claude Sonnet 4.6
// App root — main Index 0.6 UI.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore, HOME_NODE_ID, ROOT_NODE_ID } from './store/index';
import { useAppearance } from './hooks/useAppearance';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import AddressBar from './components/AddressBar';
import NodeListView from './components/NodeListView';
import NodeDetailPane from './components/NodeDetailPane';
import GraphView from './components/GraphView';
import SettingsView from './components/SettingsView';
import './App.css';

const NAV_STATE_KEY = 'index:nav-state-0.6';
function loadNavState() {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY)) ?? {}; }
  catch { return {}; }
}
function saveNavState(s) {
  localStorage.setItem(NAV_STATE_KEY, JSON.stringify(s));
}

export default function App() {
  useAppearance();

  const loadAll         = useIndexStore(s => s.loadAll);
  const subscribeToLive = useIndexStore(s => s.subscribeToLive);
  const activeNodeId    = useIndexStore(s => s.activeNodeId);
  const activeView      = useIndexStore(s => s.activeView);
  const setView         = useIndexStore(s => s.setView);
  const enterNode       = useIndexStore(s => s.enterNode);
  const navBack         = useIndexStore(s => s.navBack);
  const navForward      = useIndexStore(s => s.navForward);
  const navCursor       = useIndexStore(s => s.navCursor);
  const navHistory      = useIndexStore(s => s.navHistory);
  const canNavBack      = navCursor > 0;
  const nodes           = useIndexStore(s => s.nodes);
  const edges           = useIndexStore(s => s.edges);
  const addToGroup      = useIndexStore(s => s.addToGroup);
  const createNode      = useIndexStore(s => s.createNode);

  const savedNav = useRef(loadNavState());
  const addressBarRef = useRef(null);
  const listRef = useRef(null);

  const [selectedIds, setSelectedIds]           = useState(new Set());
  const [detailNodeId, setDetailNodeId]         = useState(savedNav.current.detailNodeId ?? null);
  const [activeTopView, setActiveTopView]       = useState(savedNav.current.topView ?? 'list');
  const [settingsTab, setSettingsTab]           = useState('edge-types');

  const activeNode = nodes.find(n => n.id === activeNodeId) ?? null;

  // Compute group contents inline so it reacts to both nodes and edges
  const groupNodes = (() => {
    const containsTypeId = 'edge_types:contains';
    const childIds = new Set(
      edges
        .filter(e => e.in === activeNodeId && e.type === containsTypeId)
        .map(e => e.out)
    );
    return nodes.filter(n => childIds.has(n.id));
  })();

  // Root group shows all non-system nodes
  const displayNodes = activeNodeId === ROOT_NODE_ID
    ? nodes.filter(n => !n.system)
    : groupNodes;

  useEffect(() => {
    loadAll().then(() => {
      const nav = savedNav.current;
      if (nav.nodeId && nav.nodeId !== HOME_NODE_ID) enterNode(nav.nodeId);
      if (nav.view) setView(nav.view);
    });
    subscribeToLive();
  }, []);

  useEffect(() => {
    saveNavState({
      topView: activeTopView,
      nodeId: activeNodeId,
      view: activeView,
      detailNodeId,
    });
  }, [activeTopView, activeNodeId, activeView, detailNodeId]);

  const handleDrop = async (e) => {
    const items = [];
    if (e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        const p = window.electronAPI.fs.getPathForFile(file);
        if (p) items.push({ uri: `file://${p}`, name: p.split('/').pop() || p });
      }
    } else {
      const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
      for (const line of raw.split(/\r?\n/)) {
        const uri = line.trim();
        if (!uri || uri.startsWith('#')) continue;
        try { new URL(uri); items.push({ uri, name: uri }); } catch { /* skip */ }
      }
    }
    await addUrisToGroup(items);
  };

  const handlePaste = async (text) => {
    if (activeTopView !== 'list') return;
    const items = [];
    for (const line of text.split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw || raw.startsWith('#')) continue;
      if (raw.startsWith('/')) {
        items.push({ uri: `file://${raw}`, name: raw.split('/').pop() || raw });
      } else {
        try { new URL(raw); items.push({ uri: raw, name: raw }); } catch { /* skip */ }
      }
    }
    await addUrisToGroup(items);
  };

  const addUrisToGroup = async (items) => {
    for (const { uri, name } of items) {
      const existing = nodes.find(n => n.sources?.some(s => s.uri?.trim() === uri));
      let nodeId;
      if (existing) {
        nodeId = existing.id;
      } else {
        const created = await createNode({ name, schema: 'object', sources: [{ uri }] });
        nodeId = created?.id;
        if (!nodeId) continue;
      }
      if (activeNodeId !== ROOT_NODE_ID) {
        await addToGroup(activeNodeId, nodeId);
      }
    }
  };

  const handleCreateNode = async () => {
    try {
      const created = await createNode({ name: 'Untitled', schema: 'object', sources: [] });
      if (!created?.id) return;
      if (activeNodeId !== ROOT_NODE_ID) {
        await addToGroup(activeNodeId, created.id);
      }
      setDetailNodeId(created.id);
    } catch (err) {
      console.error('[App] Create node failed:', err);
    }
  };

  const handleCreateGroup = async () => {
    try {
      const created = await createNode({ name: 'Untitled Group', schema: 'group' });
      if (!created?.id) return;
      if (activeNodeId !== ROOT_NODE_ID) {
        await addToGroup(activeNodeId, created.id);
      }
      setDetailNodeId(created.id);
    } catch (err) {
      console.error('[App] Create group failed:', err);
    }
  };

  const isGroupOrRoot = !activeNode || activeNode.schema === 'group';
  const onBack = canNavBack ? navBack : null;

  useKeyboardShortcuts({
    onSettings:       () => { setActiveTopView('settings'); },
    onSpaceNavigator: () => addressBarRef.current?.startNavigation(),
    onNavBack:        navBack,
    onNavForward:     navForward,
    onNavHome:        () => { setActiveTopView('list'); enterNode(HOME_NODE_ID); },
    onNavRoot:        () => { setActiveTopView('list'); enterNode(ROOT_NODE_ID); },
    onToggleView:     () => setView(activeView === 'list' ? 'graph' : 'list'),
    onObjectOpen:     () => {
      if (selectedIds.size === 1) {
        const id = [...selectedIds][0];
        const n = nodes.find(x => x.id === id);
        if (n?.schema === 'group') {
          setSelectedIds(new Set());
          enterNode(id);
        } else {
          setDetailNodeId(id);
        }
      }
    },
    onPaste: handlePaste,
    onEscape: () => {
      if (detailNodeId) { setDetailNodeId(null); return; }
      if (activeTopView === 'settings') { setActiveTopView('list'); return; }
      setSelectedIds(new Set());
    },
  });

  const label = activeTopView === 'settings' ? 'Settings'
    : activeNodeId === HOME_NODE_ID ? '~'
    : activeNodeId === ROOT_NODE_ID ? '/'
    : (activeNode?.name ?? '…');

  return (
    <div className="app" onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <div className="app-content">
        <AddressBar
          ref={addressBarRef}
          label={label}
          onBack={onBack}
          activeView={activeTopView === 'list' ? activeView : null}
          setView={setView}
          onNavigate={(id) => {
            setActiveTopView('list');
            setDetailNodeId(null);
            enterNode(id ?? HOME_NODE_ID);
          }}
          onSelectNode={(id) => {
            setActiveTopView('list');
            enterNode(id);
          }}
          onCreateNode={handleCreateNode}
          onCreateGroup={handleCreateGroup}
        />

        {activeTopView === 'settings' && (
          <SettingsView activeTab={settingsTab} onTabChange={setSettingsTab} />
        )}

        {activeTopView === 'list' && isGroupOrRoot && activeView === 'list' && (
          <div className="content-with-detail">
            <NodeListView
              ref={listRef}
              nodes={displayNodes}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              onEnterNode={(id) => {
                setSelectedIds(new Set());
                setDetailNodeId(null);
                enterNode(id);
              }}
              onDetailNode={(id) => setDetailNodeId(id)}
              onDrop={handleDrop}
            />
            {detailNodeId && (
              <NodeDetailPane
                nodeId={detailNodeId}
                onClose={() => setDetailNodeId(null)}
              />
            )}
          </div>
        )}

        {activeTopView === 'list' && isGroupOrRoot && activeView === 'graph' && (
          <div className="content-with-detail">
            <GraphView
              nodes={displayNodes}
              onNodeSelect={(id) => {
                setDetailNodeId(id);
              }}
            />
            {detailNodeId && (
              <NodeDetailPane
                nodeId={detailNodeId}
                onClose={() => setDetailNodeId(null)}
              />
            )}
          </div>
        )}

        {activeTopView === 'list' && !isGroupOrRoot && (
          <div className="content-with-detail">
            <NodeDetailPane
              nodeId={activeNodeId}
              onClose={() => navBack()}
              fullWidth
            />
          </div>
        )}
      </div>
    </div>
  );
}
