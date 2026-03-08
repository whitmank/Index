import { useEffect, useRef, useState } from 'react';
import AppearanceSettings from './AppearanceSettings';
import './SettingsModal.css';

/**
 * SettingsModal - Settings panel with tabbed navigation
 * Tabs: General, Window Behavior
 *
 * Author: Claude Code (Anthropic)
 */
export default function SettingsModal({ isOpen, onClose }) {
  const [visible, setVisible] = useState(false);
  const [animatingOut, setAnimatingOut] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [windowProfile, setWindowProfile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);

  // Drive mount/unmount and animation from isOpen prop
  useEffect(() => {
    if (isOpen) {
      setAnimatingOut(false);
      setVisible(true);
    } else if (visible) {
      setAnimatingOut(true);
      const t = setTimeout(() => setVisible(false), 200);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  const handleClose = () => onClose();

  const handleEscape = (e) => {
    if (e.key === 'Escape') handleClose();
  };

  // Load device information when modal opens
  useEffect(() => {
    if (isOpen) {
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
      }).catch(error => {
        console.error('Failed to load device info:', error);
        setLoading(false);
      });

      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (!visible) return null;

  return (
    <div className="settings-overlay">
      <div className={`settings-modal ${animatingOut ? 'closing' : ''}`}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close-btn" onClick={handleClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
          <button
            className={`settings-tab ${activeTab === 'window' ? 'active' : ''}`}
            onClick={() => setActiveTab('window')}
          >
            Window Behavior
          </button>
          <button
            className={`settings-tab ${activeTab === 'appearance' ? 'active' : ''}`}
            onClick={() => setActiveTab('appearance')}
          >
            Appearance
          </button>
        </div>

        <div className="settings-content">
          {activeTab === 'general' && (
            <>
              <section className="settings-section">
                <h3 className="settings-section-title">Device</h3>
                {loading ? (
                  <div className="settings-item">
                    <p>Loading device information...</p>
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

          {activeTab === 'window' && (
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
                ].map((option) => (
                  <button
                    key={option.id}
                    className={`window-profile-option ${windowProfile === option.id ? 'active' : ''}`}
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
          {activeTab === 'appearance' && <AppearanceSettings />}
        </div>
      </div>
    </div>
  );
}
