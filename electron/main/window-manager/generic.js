// Author: Claude Code
// Generic window manager for platforms without platform-specific behavior
// Provides base implementation that all platforms can override

import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default class GenericWindowManager {
  constructor() {
    this.mainWindow = null;
    this.platformSpecificCleanup = null;
  }

  /**
   * Create the overlay window
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
      alwaysOnTop: true,
      frame: false,
      skipTaskbar: true,
      transparent: true,
      hasShadow: true,
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
   * Setup platform-specific behaviors
   * Override in subclasses for platform-specific functionality
   * @param {Function} onSpaceChange - Callback when user switches desktop/space
   */
  setupPlatformBehavior(onSpaceChange) {
    // Generic implementation does nothing
    // Subclasses override to add platform-specific behavior
  }

  /**
   * Clean up platform-specific resources
   * Call during app shutdown
   */
  cleanup() {
    if (this.platformSpecificCleanup) {
      this.platformSpecificCleanup();
    }
  }
}
