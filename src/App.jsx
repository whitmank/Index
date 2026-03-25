// Author: Claude Code
// App root — routes to MainApp or QuickSpaceView based on ?mode=quick query param.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore, HOME_SPACE_ID, ROOT_SPACE_ID } from './store/index';
import { useAppearance } from './hooks/useAppearance';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import SettingsView, { TABS as SETTINGS_TABS } from './components/SettingsView';
import ObjectListView from './components/ObjectListView';
import ObjectDetailPane from './components/ObjectDetailPane';
import GraphView from './components/GraphView';
import CreateSpaceModal from './components/CreateSpaceModal';
import CommandPalette from './components/CommandPalette';
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

  const activeSpace = objects.find(o => o.id === activeSpaceId && o.space) ?? null;

  const displayObjects = [...activeSpaceObjects].sort((a, b) => {
    if (a.id === ROOT_SPACE_ID) return -1;
    if (b.id === ROOT_SPACE_ID) return 1;
    return (b.space ? 1 : 0) - (a.space ? 1 : 0);
  });

  const addressBarRef = useRef(null);

  const [showCreateSpace, setShowCreateSpace]       = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeTopLevelView, setActiveTopLevelView] = useState('spaces');
  const [settingsTab, setSettingsTab]               = useState('general');
  const [detailObjectId, setDetailObjectId]         = useState(null);
  const [editNameOnMount, setEditNameOnMount]       = useState(false);

  const settingsCommands = SETTINGS_TABS.map(tab => ({
    id:    `settings:${tab.id}`,
    label: `Settings → ${tab.label}`,
    action: () => {
      setActiveTopLevelView('settings');
      setSettingsTab(tab.id);
      if (activeSpaceId !== HOME_SPACE_ID) exitSpace();
    },
  }));
  const inSpacesView = activeTopLevelView === 'spaces';

  function navigateTo(id) {
    if (id === 'spaces' || id === 'tags' || id === 'settings') {
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
      setDetailObjectId(created.id);
    } catch (err) {
      console.error('[App] Create object failed:', err);
    }
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
      setDetailObjectId(id);
    } catch (err) {
      console.error('[App] Create space failed:', err);
    }
  };

  const handleEnterSpace = (id) => {
    setDetailObjectId(null);
    enterSpace(id);
  };

  const onBack = activeSpaceId !== HOME_SPACE_ID      ? () => { setDetailObjectId(null); exitSpace(); }
    : activeTopLevelView !== 'spaces'                  ? () => setActiveTopLevelView('spaces')
    : null;

  useEffect(() => {
    loadAll();
    subscribeToLive();
  }, []);

  useKeyboardShortcuts({
    onSettings:       () => navigateTo('settings'),
    onPalette:        () => setShowCommandPalette(v => !v),
    onSpaceNavigator: () => addressBarRef.current?.startNavigation(),
    onNavBack:        () => navBack(),
    onNavForward:     () => navForward(),
    onNavHome:        () => { setActiveTopLevelView('spaces'); enterSpace(HOME_SPACE_ID); },
    onNavRoot:        () => { setActiveTopLevelView('spaces'); enterSpace(ROOT_SPACE_ID); },
    onToggleView:     () => setView(activeView === 'list' ? 'graph' : 'list'),
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
          onNavigate={(id) => { setActiveTopLevelView('spaces'); setDetailObjectId(null); enterSpace(id ?? HOME_SPACE_ID); }}
          onCreateObject={handleCreateObject}
          onCreateSpace={handleCreateSpace}
        />
        {activeTopLevelView === 'settings' && <SettingsView activeTab={settingsTab} onTabChange={setSettingsTab} />}
        {inSpacesView && activeView === 'list' && (
          <div className="content-with-detail">
            <ObjectListView objects={displayObjects} onEnterSpace={handleEnterSpace} onObjectSelect={(id) => { setEditNameOnMount(false); setDetailObjectId(id); }} />
            {detailObjectId && <ObjectDetailPane objectId={detailObjectId} editNameOnMount={editNameOnMount} />}
          </div>
        )}
        {inSpacesView && activeView === 'graph' && <GraphView objects={displayObjects} />}
      </div>
      <CreateSpaceModal isOpen={showCreateSpace} onClose={() => setShowCreateSpace(false)} />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={settingsCommands}
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
