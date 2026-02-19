import { useEffect, useRef } from 'react';
import './SettingsModal.css';

/**
 * SettingsModal - Settings panel
 *
 * Author: Claude Code (Anthropic)
 */
export default function SettingsModal({ isOpen, onClose }) {
  const isClosingRef = useRef(false);

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

  useEffect(() => {
    if (isOpen) {
      isClosingRef.current = false;
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
            <p className="settings-empty-message">No settings available at this time.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
