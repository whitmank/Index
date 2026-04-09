// Author: Claude Code
// SettingsView — top-level settings page. Replaces SettingsModal.

import { useEffect, useState } from 'react';
import AppearanceSettings from './AppearanceSettings';
import TagsView from './TagsView';
import { useIndexStore } from '../store/index.js';
import './SettingsView.css';

export const TABS = [
  { id: 'devices',    label: 'Devices' },
  { id: 'tags',       label: 'Tags' },
  { id: 'window',     label: 'Window Behavior' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'keybinds',   label: 'Keybinds' },
];

const KEYBIND_GROUPS = [
  {
    label: 'Navigation',
    bindings: [
      { keys: ['⌘', ','],          description: 'Open settings' },
      { keys: ['⌘', 'K'],          description: 'Open command palette' },
      { keys: ['⌘', 'L'],          description: 'Open space navigator' },
      { keys: ['⌘', '`'],          description: 'Go to home (~)' },
      { keys: ['⌘', '/'],          description: 'Go to root (/)' },
      { keys: ['⌘', 'A'],          description: 'Navigate back', alt: ['⌘', '←'] },
      { keys: ['⌘', 'D'],          description: 'Navigate forward', alt: ['⌘', '→'] },
      { keys: ['Esc'],             description: 'Exit current view / dismiss' },
    ],
  },
  {
    label: 'List View',
    bindings: [
      { keys: ['V'],               description: 'Toggle list / graph view' },
      { keys: ['⌘', 'V'],         description: 'Paste URL or file path as new object' },
      { keys: ['⌘', 'E'],         description: 'Edit tags for selected object(s)' },
      { keys: ['W'],               description: 'Move selection up', alt: ['↑'] },
      { keys: ['S'],               description: 'Move selection down', alt: ['↓'] },
      { keys: ['⌫'],              description: 'Delete selected objects' },
      { keys: ['`'],               description: 'Cycle filter (objects ↔ spaces)' },
      { keys: ['` hold'],          description: 'Toggle combined view' },
      { keys: ['Esc'],             description: 'Clear selection' },
    ],
  },
  {
    label: 'Settings',
    bindings: [
      { keys: ['⌘', '1–5'],       description: 'Switch to settings tab by number' },
    ],
  },
];

function Keys({ keys }) {
  return (
    <span className="keybind-keys">
      {keys.map((k, i) => <kbd key={i}>{k}</kbd>)}
    </span>
  );
}

export default function SettingsView({ activeTab, onTabChange }) {
  const [localTab, setLocalTab] = useState('devices');
  const currentTab  = activeTab  ?? localTab;
  const setTab      = onTabChange ?? setLocalTab;
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [windowProfile, setWindowProfile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const devices = useIndexStore(s => s.devices);

  useEffect(() => {
    function handleKeyDown(e) {
      if (!e.metaKey) return;
      const index = parseInt(e.key, 10) - 1;
      if (index >= 0 && index < TABS.length) {
        e.preventDefault();
        setTab(TABS[index].id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    Promise.all([
      window.electronAPI.device.getOrigin(),
      window.electronAPI.window.getProfile(),
    ]).then(([origin, profile]) => {
      setDeviceOrigin(origin);
      setWindowProfile(profile);
    });
  }, []);

  return (
    <div className="settings-view">
      <nav className="settings-view-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`settings-view-tab${currentTab === tab.id ? ' active' : ''}`}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="settings-view-content">
        {currentTab === 'devices' && (
          <section className="settings-section">
            <h3 className="settings-section-title">Devices</h3>
            {devices.length === 0 ? (
              <div className="settings-item">
                <p className="settings-value settings-secondary">No devices recorded.</p>
              </div>
            ) : (
              devices.map(device => {
                const isCurrent = deviceOrigin && device.name === deviceOrigin;
                return (
                  <div key={device.id} className={`settings-item device-row${isCurrent ? ' device-row-current' : ''}`}>
                    <p className="settings-value">
                      {device.name}
                      {isCurrent && <span className="device-current-badge">this device</span>}
                    </p>
                    <p className="settings-value settings-secondary">{device.id}</p>
                  </div>
                );
              })
            )}
          </section>
        )}

        {currentTab === 'window' && (
          <section className="settings-section">
            <h3 className="settings-section-title">Window Behavior</h3>
            <div className="window-profile-options">
              {[
                {
                  id: 'overlay',
                  label: 'Overlay',
                  description: 'Floating panel above all windows. Visible on every Space. Toggle with ⌘`.',
                },
                {
                  id: 'window',
                  label: 'Window',
                  description: 'Standard app window with title bar. Stays in the current Space.',
                },
              ].map(option => (
                <button
                  key={option.id}
                  className={`window-profile-option${windowProfile === option.id ? ' active' : ''}`}
                  onClick={async () => {
                    if (windowProfile === option.id || profileSaving) return;
                    setProfileSaving(true);
                    setWindowProfile(option.id);
                    await window.electronAPI.window.setProfile(option.id);
                    setProfileSaving(false);
                  }}
                  disabled={profileSaving}
                >
                  <span className="window-profile-option-label">{option.label}</span>
                  <span className="window-profile-option-desc">{option.description}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {currentTab === 'tags'       && <TagsView />}
        {currentTab === 'appearance' && <AppearanceSettings />}
        {currentTab === 'keybinds'   && (
          <>
            {KEYBIND_GROUPS.map(group => (
              <section key={group.label} className="settings-section">
                <h3 className="settings-section-title">{group.label}</h3>
                <div className="keybind-list">
                  {group.bindings.map((binding, i) => (
                    <div key={i} className="keybind-row">
                      <span className="keybind-description">{binding.description}</span>
                      <span className="keybind-combos">
                        <Keys keys={binding.keys} />
                        {binding.alt && <><span className="keybind-or">or</span><Keys keys={binding.alt} /></>}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
