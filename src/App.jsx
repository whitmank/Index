// Author: Claude Code
// App root — v0.4 frontend rebuild.

import { useEffect, useState } from 'react';
import { useIndexStore } from './store/index';
import { useAppearance } from './hooks/useAppearance';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import SettingsView from './components/SettingsView';
import SpacesView from './components/SpacesView';
import TagsView from './components/TagsView';
import CalendarView from './components/CalendarView';
import DayView from './components/DayView';
import ObjectListView from './components/ObjectListView';
import GraphView from './components/GraphView';
import CreateSpaceModal from './components/CreateSpaceModal';
import CommandPalette from './components/CommandPalette';
import AddressBar from './components/AddressBar';
import './App.css';

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function App() {
  useAppearance();

  const loadAll             = useIndexStore(s => s.loadAll);
  const subscribeToLive     = useIndexStore(s => s.subscribeToLive);
  const activeSpaceId       = useIndexStore(s => s.activeSpaceId);
  const spaces              = useIndexStore(s => s.spaces);
  const systemAll           = useIndexStore(s => s.systemAll);
  const exitSpace           = useIndexStore(s => s.exitSpace);
  const spaceObjects        = useIndexStore(s => s.spaceObjects);
  const objects             = useIndexStore(s => s.objects);
  const activeCalendarDate  = useIndexStore(s => s.activeCalendarDate);
  const exitCalendarDay     = useIndexStore(s => s.exitCalendarDay);
  const activeView          = useIndexStore(s => s.activeView);
  const setView             = useIndexStore(s => s.setView);

  const activeSpace = spaces.find(s => s.id === activeSpaceId)
    ?? (activeSpaceId === systemAll.id ? systemAll : null);

  const displayObjects = spaceObjects !== null ? spaceObjects : objects;

  const [showCreateSpace, setShowCreateSpace] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [activeTopLevelView, setActiveTopLevelView] = useState('spaces');

  function navigateTo(id) {
    if (id === 'spaces' || id === 'tags' || id === 'settings') {
      if (activeSpaceId) exitSpace();
      setActiveTopLevelView(id);
    }
    setShowCommandPalette(false);
  }

  const label = activeCalendarDate                       ? formatDate(activeCalendarDate)
    : activeSpaceId                                      ? (activeSpace?.name ?? '…')
    : activeTopLevelView === 'tags'                      ? 'Tags'
    : activeTopLevelView === 'settings'                  ? 'Settings'
    : 'Spaces';

  const onBack = activeCalendarDate                      ? exitCalendarDay
    : activeSpaceId                                      ? exitSpace
    : activeTopLevelView !== 'spaces'                    ? () => setActiveTopLevelView('spaces')
    : null;

  useEffect(() => {
    loadAll();
    subscribeToLive();
  }, []);

  const enterSpace = useIndexStore(s => s.enterSpace);

  useKeyboardShortcuts({
    onSettings:      () => navigateTo('settings'),
    onPalette:       () => setShowCommandPalette(v => !v),
    onViewSpaces:    () => navigateTo('spaces'),
    onViewTags:      () => navigateTo('tags'),
    onViewSettings:  () => navigateTo('settings'),
    onViewAll:       () => { setActiveTopLevelView('spaces'); enterSpace(systemAll.id); },
  });

  return (
    <div className="app">
      <div className="title-bar" />
      <div className="app-content">
        <AddressBar
          label={label}
          onBack={onBack}
          activeView={activeSpaceId ? activeView : null}
          setView={setView}
        />
        {!activeSpaceId && activeTopLevelView === 'spaces'                    && <SpacesView onNewSpace={() => setShowCreateSpace(true)} />}
        {!activeSpaceId && activeTopLevelView === 'tags'                       && <TagsView />}
        {!activeSpaceId && activeTopLevelView === 'settings'                   && <SettingsView />}
        {activeSpaceId && activeView === 'list'                                && <ObjectListView objects={displayObjects} />}
        {activeSpaceId && activeView === 'calendar' && !activeCalendarDate     && <CalendarView />}
        {activeSpaceId && activeView === 'calendar' && activeCalendarDate      && <DayView />}
        {activeSpaceId && activeView === 'graph'                               && <GraphView objects={displayObjects} />}
      </div>
      <CreateSpaceModal isOpen={showCreateSpace} onClose={() => setShowCreateSpace(false)} />
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={navigateTo}
      />
    </div>
  );
}
