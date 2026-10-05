// Author: Claude Code
// App root — v0.4 frontend rebuild.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore, ROOT_CONTAINER_ID } from './store/index';
import { useAppearance } from './hooks/useAppearance';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import SettingsView, { TABS as SETTINGS_TABS } from './components/SettingsView';
import CalendarView from './components/CalendarView';
import DayView from './components/DayView';
import ObjectListView from './components/ObjectListView';
import GraphView from './components/GraphView';
import CreateSpaceModal from './components/CreateSpaceModal';
import CommandPalette from './components/CommandPalette';
import AddressBar from './components/AddressBar';
import QuickSpaceView from './components/QuickSpaceView';
import './App.css';

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function MainApp() {
  useAppearance();

  const loadAll             = useIndexStore(s => s.loadAll);
  const subscribeToLive     = useIndexStore(s => s.subscribeToLive);
  const activeSpaceId       = useIndexStore(s => s.activeSpaceId);
  const exitSpace           = useIndexStore(s => s.exitSpace);
  const spaceObjects        = useIndexStore(s => s.spaceObjects);
  const objects             = useIndexStore(s => s.objects);
  const activeCalendarDate  = useIndexStore(s => s.activeCalendarDate);
  const exitCalendarDay     = useIndexStore(s => s.exitCalendarDay);
  const activeView          = useIndexStore(s => s.activeView);
  const setView             = useIndexStore(s => s.setView);
  const enterSpace          = useIndexStore(s => s.enterSpace);

  const navBack     = useIndexStore(s => s.navBack);
  const navForward  = useIndexStore(s => s.navForward);

  const rootObjects = useIndexStore(s => s.rootObjects);

  const activeSpace = objects.find(o => o.id === activeSpaceId && o.container) ?? null;

  // Root shows only what is explicitly linked via contains edges from objects:root.
  // Containers first, then leaf objects.
  const displayObjects = spaceObjects !== null
    ? spaceObjects
    : [...rootObjects].sort((a, b) => (b.container ? 1 : 0) - (a.container ? 1 : 0));

  const addressBarRef = useRef(null);

  const [showCreateSpace, setShowCreateSpace]       = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeTopLevelView, setActiveTopLevelView] = useState('spaces');
  const [settingsTab, setSettingsTab]               = useState('general');

  const settingsCommands = SETTINGS_TABS.map(tab => ({
    id:    `settings:${tab.id}`,
    label: `Settings → ${tab.label}`,
    action: () => {
      setActiveTopLevelView('settings');
      setSettingsTab(tab.id);
      if (activeSpaceId) exitSpace();
    },
  }));
  const inSpacesView = activeTopLevelView === 'spaces';

  function navigateTo(id) {
    if (id === 'spaces' || id === 'tags' || id === 'settings') {
      if (activeSpaceId) exitSpace();
      setActiveTopLevelView(id);
    }
    setShowCommandPalette(false);
  }

  const label = activeCalendarDate                       ? formatDate(activeCalendarDate)
    : activeSpaceId                                      ? (activeSpace?.name ?? '…')
    : activeTopLevelView === 'settings'                  ? 'Settings'
    : '/';

  const onBack = activeCalendarDate                      ? exitCalendarDay
    : activeSpaceId                                      ? exitSpace
    : activeTopLevelView !== 'spaces'                    ? () => setActiveTopLevelView('spaces')
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
    onNavRoot:        () => { setActiveTopLevelView('spaces'); exitSpace(); },
  });

  return (
    <div className="app">
      <div className="title-bar" />
      <div className="app-content">
        <AddressBar
          ref={addressBarRef}
          label={label}
          onBack={onBack}
          activeView={inSpacesView ? activeView : null}
          setView={setView}
          onNavigate={(id) => { setActiveTopLevelView('spaces'); if (id === null) exitSpace(); else enterSpace(id); }}
        />
        {activeTopLevelView === 'settings' && <SettingsView activeTab={settingsTab} onTabChange={setSettingsTab} />}
        {inSpacesView && activeView === 'list'                            && <ObjectListView objects={displayObjects} onEnterContainer={enterSpace} />}
        {inSpacesView && activeView === 'calendar' && !activeCalendarDate && <CalendarView />}
        {inSpacesView && activeView === 'calendar' && activeCalendarDate  && <DayView />}
        {inSpacesView && activeView === 'graph'                           && <GraphView objects={displayObjects} />}
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
