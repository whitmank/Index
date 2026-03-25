// Author: Claude Code
// SettingsView — top-level settings page. Replaces SettingsModal.

import { useEffect, useState } from 'react';
import AppearanceSettings from './AppearanceSettings';
import TagsView from './TagsView';
import './SettingsView.css';

export const TABS = [
  { id: 'general',    label: 'General' },
  { id: 'tags',       label: 'Tags' },
  { id: 'window',     label: 'Window Behavior' },
  { id: 'appearance', label: 'Appearance' },
];

export default function SettingsView({ activeTab, onTabChange }) {
  const [localTab, setLocalTab] = useState('general');
  const currentTab  = activeTab  ?? localTab;
  const setTab      = onTabChange ?? setLocalTab;
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [windowProfile, setWindowProfile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);

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
    setLoading(true);
    Promise.all([
      window.electronAPI.device.getOrigin(),
      window.electronAPI.device.getId(),
      window.electronAPI.window.getProfile(),
    ]).then(([origin, id, profile]) => {
      setDeviceOrigin(origin);
      setDeviceId(id);
      setWindowProfile(profile);
      setLoading(false);
    }).catch(() => setLoading(false));
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
        {currentTab === 'general' && (
          <>
            <section className="settings-section">
              <h3 className="settings-section-title">Device</h3>
              {loading ? (
                <div className="settings-item">
                  <p>Loading…</p>
                </div>
              ) : (
                <div className="settings-item">
                  <p className="settings-value">{deviceOrigin || '(unnamed)'}</p>
                  <p className="settings-value settings-secondary">{deviceId || 'Unknown'}</p>
                </div>
              )}
            </section>

            <section className="settings-section">
              <h3 className="settings-section-title">About</h3>
              <div className="settings-item">
                <label className="settings-label">Version</label>
                <p className="settings-value">{__APP_VERSION__}</p>
              </div>
            </section>
          </>
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
      </div>
    </div>
  );
}
