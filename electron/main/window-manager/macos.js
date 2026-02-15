// Author: Claude Code
// macOS-specific window manager
// Implements panel-type overlay for floating, non-focus-stealing window

import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class MacOSWindowManager {
  constructor() {
    this.mainWindow = null;
  }

  /**
   * Create the overlay window with macOS-specific settings
   * @param {Object} config - Configuration object
   * @param {string} config.devServerUrl - Vite dev server URL (or null for production)
   * @param {string} config.prodPath - Path to built HTML file
   * @returns {BrowserWindow} The created window
   */
  createWindow(config) {
    // Get the primary display dimensions
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    // Overlay dimensions and positioning
    const overlayWidth = 800;
    const overlayHeight = 600;
    const x = Math.round((screenWidth - overlayWidth) / 2);
    const y = Math.round(screenHeight * 0.15); // Position 15% from top

    this.mainWindow = new BrowserWindow({
      width: overlayWidth,
      height: overlayHeight,
      x,
      y,
      // macOS panel type: floats above full-screen apps, doesn't steal focus
      type: 'panel',
      alwaysOnTop: true,
      focusable: false,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      hasShadow: true,
      // macOS vibrancy for glassmorphic effect
      vibrancy: 'popover',
      visualEffectState: 'active',
      resizable: true,
      webPreferences: {
        preload: path.join(__dirname, '../../preload/index.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        enableFocusRing: false,
      },
    });

    // Load from Vite dev server in development or built files in production
    if (config.devServerUrl) {
      this.mainWindow.loadURL(config.devServerUrl);
    } else {
      this.mainWindow.loadFile(config.prodPath);
    }

    // Hide window by default
    this.mainWindow.hide();

    return this.mainWindow;
  }

  /**
   * Get the main window reference
   * @returns {BrowserWindow|null}
   */
  getWindow() {
    return this.mainWindow;
  }

  /**
   * Setup macOS-specific behaviors
   */
  setupPlatformBehavior(onSpaceChange) {
    // Basic panel implementation - no special space handling
  }

  /**
   * Clean up platform-specific resources
   */
  cleanup() {
    // No cleanup needed for panel type window
  }
}
