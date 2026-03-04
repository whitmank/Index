import { useEffect, useRef, useState } from 'react';
import './SettingsModal.css';

/**
 * SettingsModal - Settings panel with tabbed navigation
 * Tabs: General, Window Behavior
 *
 * Author: Claude Code (Anthropic)
 */
export default function SettingsModal({ isOpen, onClose }) {
  const isClosingRef = useRef(false);
  const [activeTab, setActiveTab] = useState('general');
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [windowProfile, setWindowProfile] = useState(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleClose = () => {
    isClosingRef.current = true;
    onClose();
  };

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      handleClose();
    }
  };

  // Load device information when modal opens
  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
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

  if (!isOpen) return null;

  return (
    <div
      className={`settings-overlay ${isClosingRef.current ? 'closing' : ''}`}
      onClick={handleBackdropClick}
    >
      <div className={`settings-modal ${isClosingRef.current ? 'closing' : ''}`}>
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
                  <>
                    <div className="settings-item">
                      <label className="settings-label">Device Name</label>
                      <p className="settings-value">{deviceOrigin || '(unnamed)'}</p>
                    </div>
                    <div className="settings-item">
                      <label className="settings-label">Device ID</label>
                      <p className="settings-value settings-monospace">{deviceId || 'Unknown'}</p>
                    </div>
                  </>
                )}
              </section>

              <section className="settings-section">
                <h3 className="settings-section-title">About</h3>
                <div className="settings-item">
                  <label className="settings-label">Application</label>
                  <p className="settings-value">Index</p>
                </div>
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
              <p className="settings-section-description">
                Choose how Index appears on your desktop. Changes take effect immediately by recreating the window.
              </p>
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
        </div>
      </div>
    </div>
  );
}
