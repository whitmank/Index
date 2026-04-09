// Author: Claude Code
// App root — routes to MainApp or QuickSpaceView based on ?mode=quick query param.

const SPACE_PREFS_KEY = 'index:space-prefs';
function loadSpacePrefs() {
  try { return JSON.parse(localStorage.getItem(SPACE_PREFS_KEY)) ?? {}; }
  catch { return {}; }
}
function saveSpacePrefs(map) {
  localStorage.setItem(SPACE_PREFS_KEY, JSON.stringify(map));
}

const NAV_STATE_KEY = 'index:nav-state';
function loadNavState() {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY)) ?? {}; }
  catch { return {}; }
}
function saveNavState(state) {
  localStorage.setItem(NAV_STATE_KEY, JSON.stringify(state));
}

import { useEffect, useRef, useState } from 'react';
import { useIndexStore, HOME_SPACE_ID, ROOT_SPACE_ID } from './store/index';
import { useAppearance } from './hooks/useAppearance';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import SettingsView, { TABS as SETTINGS_TABS } from './components/SettingsView';
import ObjectListView from './components/ObjectListView';
import ObjectCardModal from './components/ObjectCardModal';
import ObjectSourceView from './components/ObjectSourceView';
import GraphView from './components/GraphView';
import CreateSpaceModal from './components/CreateSpaceModal';
import CommandPalette from './components/CommandPalette';
import ImportModal from './components/ImportModal';
import TagEditModal from './components/TagEditModal';
import AddressBar from './components/AddressBar';
import QuickSpaceView from './components/QuickSpaceView';
import './App.css';

function MainApp() {
  useAppearance();

  const loadAll             = useIndexStore(s => s.loadAll);
  const subscribeToLive     = useIndexStore(s => s.subscribeToLive);
  const activeSpaceId       = useIndexStore(s => s.activeSpaceId);
  const exitSpace           = useIndexStore(s => s.exitSpace);
  const activeSpaceObjects        = useIndexStore(s => s.activeSpaceObjects);
  const objects             = useIndexStore(s => s.objects);
  const activeView          = useIndexStore(s => s.activeView);
  const setView             = useIndexStore(s => s.setView);
  const enterSpace          = useIndexStore(s => s.enterSpace);

  const navBack     = useIndexStore(s => s.navBack);
  const navForward  = useIndexStore(s => s.navForward);

  const activeSpace = objects.find(o => o.id === activeSpaceId) ?? null;

  const displayObjects = [...activeSpaceObjects].sort((a, b) => {
    if (a.id === ROOT_SPACE_ID) return -1;
    if (b.id === ROOT_SPACE_ID) return 1;
    return (b.space ? 1 : 0) - (a.space ? 1 : 0);
  });

  const addressBarRef    = useRef(null);
  const objectListRef    = useRef(null);
  const spacePrefs       = useRef(loadSpacePrefs());
  const selectionMemory  = useRef({});  // spaceId → selectedIds; pruned to navHistory on each fresh enter

  const savedNav = useRef(loadNavState());

  const [showCreateSpace, setShowCreateSpace]       = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showImportModal, setShowImportModal]       = useState(false);
  const [showTagEditModal, setShowTagEditModal]     = useState(false);
  const [selectedIds, setSelectedIds]               = useState(new Set());
  const [importTree, setImportTree]                 = useState(null);
  const [activeTopLevelView, setActiveTopLevelView] = useState(savedNav.current.topLevelView ?? 'spaces');
  const [settingsTab, setSettingsTab]               = useState('devices');
  const [cardObjectId, setCardObjectId]             = useState(savedNav.current.detailObjectId ?? null);
  const [editNameOnMount, setEditNameOnMount]       = useState(false);
  const settingsReturnTarget = useRef(null);

  const settingsCommands = SETTINGS_TABS.map(tab => ({
    id:    `settings:${tab.id}`,
    label: `Settings → ${tab.label}`,
    action: () => {
      settingsReturnTarget.current = { view: activeTopLevelView, spaceId: activeSpaceId };
      setActiveTopLevelView('settings');
      setSettingsTab(tab.id);
      if (activeSpaceId !== HOME_SPACE_ID) exitSpace();
    },
  }));
  const inSpacesView = activeTopLevelView === 'spaces';

  function navigateTo(id) {
    if (id === 'spaces' || id === 'tags' || id === 'settings') {
      if (id === 'settings') {
        settingsReturnTarget.current = { view: activeTopLevelView, spaceId: activeSpaceId };
      }
      if (activeSpaceId !== HOME_SPACE_ID) exitSpace();
      setActiveTopLevelView(id);
    }
    setShowCommandPalette(false);
  }

  const label = activeTopLevelView === 'settings' ? 'Settings'
    : activeSpaceId === HOME_SPACE_ID              ? '~'
    : (activeSpace?.name ?? '…');

  const addObject   = useIndexStore(s => s.addObject);
  const createSpace = useIndexStore(s => s.createSpace);

  const handleCreateObject = async () => {
    try {
      const created = await addObject({ name: 'Untitled', sources: [] });
      if (!created?.id) return;
      // Insert into the currently viewed space (or root if at /).
      // ALL is skipped — it contains everything by definition.
      const parentId = activeSpaceId;
      if (parentId !== ROOT_SPACE_ID) {
        await window.electronAPI.db.addContains(parentId, created.id);
      }
      setEditNameOnMount(true);
      setCardObjectId(created.id);
    } catch (err) {
      console.error('[App] Create object failed:', err);
    }
  };

  // Add objects from a list of {uri, name} to the active space.
  // Deduplicates against existing objects by URI; adds contains edge when in a non-root space.
  const addUrisToSpace = async (items) => {
    for (const { uri, name } of items) {
      const existing = objects.find(o => o.sources?.some(s => s.uri?.trim() === uri));
      let objectId;

      if (existing) {
        objectId = existing.id;
      } else {
        const result = await window.electronAPI.db.createObject({ name, sources: [{ uri }] });
        if (!result.success) {
          console.error('[App] addUrisToSpace: create failed:', result.error);
          continue;
        }
        objectId = result.data.id;
      }

      if (activeSpaceId !== ROOT_SPACE_ID) {
        await window.electronAPI.db.addContains(activeSpaceId, objectId);
      }
    }
  };

  const handleDrop = async (e) => {
    const items = [];

    if (e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        const path = window.electronAPI.fs.getPathForFile(file);
        if (path) items.push({ uri: `file://${path}`, name: path.split('/').pop() || path });
      }
    } else {
      const raw = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain') || '';
      for (const line of raw.split(/\r?\n/)) {
        const uri = line.trim();
        if (!uri || uri.startsWith('#')) continue;
        try {
          new URL(uri); // validate
          items.push({ uri, name: uri });
        } catch { /* skip malformed */ }
      }
    }

    await addUrisToSpace(items);
  };

  const handlePaste = async (text) => {
    if (!inSpacesView) return;
    const items = [];
    for (const line of text.split(/\r?\n/)) {
      const raw = line.trim();
      if (!raw || raw.startsWith('#')) continue;
      if (raw.startsWith('/')) {
        items.push({ uri: `file://${raw}`, name: raw.split('/').pop() || raw });
      } else {
        try {
          new URL(raw); // validate
          items.push({ uri: raw, name: raw });
        } catch { /* skip non-URL text */ }
      }
    }
    await addUrisToSpace(items);
  };

  const handleCreateSpace = async () => {
    try {
      const result = await createSpace({ name: 'Untitled', query: {} });
      const id = result?.data?.id;
      if (!id) return;
      // Insert into the currently viewed space (or root if at /).
      // ALL is skipped — it contains everything by definition, no explicit edge needed.
      const parentId = activeSpaceId;
      if (parentId !== ROOT_SPACE_ID) {
        await window.electronAPI.db.addContains(parentId, id);
      }
      setEditNameOnMount(true);
      setCardObjectId(id);
    } catch (err) {
      console.error('[App] Create space failed:', err);
    }
  };

  const handleEnterSpace = async (id) => {
    selectionMemory.current[activeSpaceId] = [...selectedIds];
    setCardObjectId(null);
    setSelectedIds(new Set());
    await enterSpace(id);
    // Prune selection memory for any space no longer in the nav history.
    // This clears backed-out spaces when the user navigates to a different branch.
    const historySet = new Set(useIndexStore.getState().navHistory);
    for (const spaceId of Object.keys(selectionMemory.current)) {
      if (!historySet.has(spaceId)) delete selectionMemory.current[spaceId];
    }
    const saved = selectionMemory.current[id];
    if (saved?.length) setSelectedIds(new Set(saved));
  };

  const handleNavBack = async () => {
    selectionMemory.current[activeSpaceId] = [...selectedIds];
    setCardObjectId(null);
    await navBack();
    const arrived = useIndexStore.getState().activeSpaceId;
    const saved = selectionMemory.current[arrived];
    setSelectedIds(saved?.length ? new Set(saved) : new Set());
  };

  const onBack = activeSpaceId !== HOME_SPACE_ID      ? handleNavBack
    : activeTopLevelView !== 'spaces'                  ? () => setActiveTopLevelView('spaces')
    : null;

  useEffect(() => {
    loadAll().then(() => {
      const nav = savedNav.current;
      if (nav.spaceId && nav.spaceId !== HOME_SPACE_ID) {
        enterSpace(nav.spaceId);
      }
      if (nav.view) setView(nav.view);
    });
    subscribeToLive();
    window.electronAPI.onImportFolder((tree) => {
      setImportTree(tree);
      setShowImportModal(true);
    });
  }, []);

  // Persist nav state on each change
  useEffect(() => {
    saveNavState({
      topLevelView: activeTopLevelView,
      spaceId: activeSpaceId,
      view: activeView,
      detailObjectId: cardObjectId,
    });
  }, [activeTopLevelView, activeSpaceId, activeView, cardObjectId]);

  // D/→: navigate into spaces and objects alike; if nothing selected, select first
  const navigateSelected = () => {
    if (selectedIds.size === 0) {
      objectListRef.current?.selectFirst();
      return true;
    }
    if (selectedIds.size !== 1) return false;
    handleEnterSpace([...selectedIds][0]);
    return true;
  };

  // Enter: navigate into spaces, open card for objects
  const openSelected = () => {
    if (selectedIds.size !== 1) return false;
    const id = [...selectedIds][0];
    const obj = objects.find(o => o.id === id);
    if (obj?.space) {
      handleEnterSpace(id);
    } else {
      setEditNameOnMount(false);
      setCardObjectId(id);
    }
    return true;
  };

  useKeyboardShortcuts({
    onSettings:       () => navigateTo('settings'),
    onPalette:        () => setShowCommandPalette(v => !v),
    onSpaceNavigator: () => addressBarRef.current?.startNavigation(),
    onNavBack:        handleNavBack,
    onNavForward:     async () => {
      if (navigateSelected()) return;
      selectionMemory.current[activeSpaceId] = [...selectedIds];
      await navForward();
      const arrived = useIndexStore.getState().activeSpaceId;
      const saved = selectionMemory.current[arrived];
      setSelectedIds(saved?.length ? new Set(saved) : new Set());
    },
    onNavHome:        () => { setActiveTopLevelView('spaces'); enterSpace(HOME_SPACE_ID); },
    onNavRoot:        () => { setActiveTopLevelView('spaces'); enterSpace(ROOT_SPACE_ID); },
    onToggleView:     () => setView(activeView === 'list' ? 'graph' : 'list'),
    onTagEdit:        () => {
      const hasSelection = selectedIds.size > 0;
      const inSpace = activeSpace?.space === true && activeSpaceId !== HOME_SPACE_ID && activeSpaceId !== ROOT_SPACE_ID;
      if (hasSelection || inSpace) setShowTagEditModal(v => !v);
    },
    onObjectOpen:     () => { openSelected(); },
    onPaste:          handlePaste,
    onEscape: () => {
      if (cardObjectId) { setCardObjectId(null); return; }
      if (showTagEditModal) { setShowTagEditModal(false); return; }
      if (activeTopLevelView === 'settings') {
        const target = settingsReturnTarget.current;
        if (target) {
          setActiveTopLevelView(target.view);
          if (target.spaceId !== HOME_SPACE_ID) enterSpace(target.spaceId);
          settingsReturnTarget.current = null;
        } else {
          setActiveTopLevelView('spaces');
        }
      }
    },
  });

  return (
    <div className="app">
      <div className="app-content">
        <AddressBar
          ref={addressBarRef}
          label={label}
          onBack={onBack}
          activeView={inSpacesView ? activeView : null}
          setView={setView}
          onNavigate={(id) => { setActiveTopLevelView('spaces'); setCardObjectId(null); enterSpace(id ?? HOME_SPACE_ID); }}
          onSelectObject={(id) => { setActiveTopLevelView('spaces'); enterSpace(id); }}
          onCreateObject={handleCreateObject}
          onCreateSpace={handleCreateSpace}
        />
        {activeTopLevelView === 'settings' && <SettingsView activeTab={settingsTab} onTabChange={setSettingsTab} />}
        {inSpacesView && activeSpace && !activeSpace.space && (
          <div className="content-with-detail">
            <ObjectSourceView object={activeSpace} />
          </div>
        )}
        {inSpacesView && (!activeSpace || activeSpace.space) && activeView === 'list' && (
          <div className="content-with-detail">
            <ObjectListView
              key={activeSpaceId}
              ref={objectListRef}
              objects={displayObjects}
              onEnterSpace={handleEnterSpace}
              onDrop={handleDrop}
              selectedIds={selectedIds}
              onSelectionChange={setSelectedIds}
              initialFilterSide={spacePrefs.current[activeSpaceId]?.filterSide ?? 'objects'}
              initialFilterCombined={spacePrefs.current[activeSpaceId]?.filterCombined ?? true}
              initialSortField={spacePrefs.current[activeSpaceId]?.sortField ?? 'created'}
              initialSortDir={spacePrefs.current[activeSpaceId]?.sortDir ?? 'desc'}
              onPrefsChange={(prefs) => { spacePrefs.current[activeSpaceId] = prefs; saveSpacePrefs(spacePrefs.current); }}
            />
          </div>
        )}
        {inSpacesView && (!activeSpace || activeSpace.space) && activeView === 'graph' && (
          <div className="content-with-detail">
            <GraphView
              objects={displayObjects}
              onObjectSelect={(id) => { setEditNameOnMount(false); setCardObjectId(id); }}
            />
          </div>
        )}
      </div>
      <CreateSpaceModal isOpen={showCreateSpace} onClose={() => setShowCreateSpace(false)} />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={settingsCommands}
      />
      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        initialTree={importTree}
      />
      <TagEditModal
        isOpen={showTagEditModal}
        onClose={() => setShowTagEditModal(false)}
        objectIds={selectedIds.size > 0 ? [...selectedIds] : [activeSpaceId]}
      />
      <ObjectCardModal
        isOpen={!!cardObjectId}
        objectId={cardObjectId}
        editNameOnMount={editNameOnMount}
        onClose={() => setCardObjectId(null)}
      />
    </div>
  );
}

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') === 'quick') {
    return <QuickSpaceView />;
  }
  return <MainApp />;
}
