import { useEffect, useRef, useState } from 'react';
import './SettingsModal.css';

/**
 * SettingsModal - Settings panel
 * Displays device information and application settings
 *
 * Author: Claude Code (Anthropic)
 */
export default function SettingsModal({ isOpen, onClose }) {
  const isClosingRef = useRef(false);
  const [deviceOrigin, setDeviceOrigin] = useState(null);
  const [deviceId, setDeviceId] = useState(null);
  const [loading, setLoading] = useState(true);

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

      // Get device information
      Promise.all([
        window.electronAPI.device.getOrigin(),
        window.electronAPI.device.getId()
      ]).then(([origin, id]) => {
        setDeviceOrigin(origin);
        setDeviceId(id);
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

        <div className="settings-content">
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
              <p className="settings-value">0.1.0</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
