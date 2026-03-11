// Author: Claude Code
// macOS-specific window manager
// Applies macOS-only BrowserWindow properties on top of the shared profile options.

import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import * as overlayProfile from './profiles/overlay.js';
import * as windowProfile from './profiles/window.js';
import { loadWindowSettings, saveWindowSettings } from '../../config/window-settings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROFILES = {
  overlay: overlayProfile,
  window: windowProfile,
};

// macOS-specific overrides per profile
const MACOS_OVERRIDES = {
  overlay: {
    type: 'panel',
    collectionBehavior: ['canJoinAllSpaces', 'ignoresCycle'],
    roundedCorners: false,
  },
  window: {},
};

/** Returns true if the given bounds intersect any currently connected display. */
function boundsOnScreen(bounds) {
  return screen.getAllDisplays().some(({ workArea: d }) =>
    bounds.x < d.x + d.width &&
    bounds.x + bounds.width > d.x &&
    bounds.y < d.y + d.height &&
    bounds.y + bounds.height > d.y
  );
}

/** Simple debounce. */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export default class MacOSWindowManager {
  constructor() {
    this.mainWindow = null;
  }

  /**
   * Create the main window using the given profile.
   * @param {Object} config
   * @param {string} config.devServerUrl - Vite dev server URL (or null for production)
   * @param {string} config.prodPath - Path to built HTML file
   * @param {string} [config.profile='overlay'] - 'overlay' | 'window'
   * @returns {BrowserWindow}
   */
  createWindow(config) {
    const profileName = config.profile || 'overlay';
    const profile = PROFILES[profileName] ?? PROFILES.overlay;
    const macosOverrides = MACOS_OVERRIDES[profileName] ?? {};

    const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
    const baseOptions = profile.getOptions({ screenWidth, screenHeight });

    // Restore saved bounds for the window profile if they're still on a connected display
    let savedBoundsOptions = {};
    if (profileName === 'window') {
      const { windowBounds } = loadWindowSettings();
      if (windowBounds && boundsOnScreen(windowBounds)) {
        savedBoundsOptions = {
          x: windowBounds.x,
          y: windowBounds.y,
          width: windowBounds.width,
          height: windowBounds.height,
        };
      }
    }

    this.mainWindow = new BrowserWindow({
      ...baseOptions,
      ...savedBoundsOptions,
      ...macosOverrides,
      webPreferences: {
        preload: path.join(__dirname, '../../../preload/index.js'),
        contextIsolation: true,
        enableRemoteModule: false,
        enableFocusRing: false,
      },
    });

    if (config.devServerUrl) {
      this.mainWindow.loadURL(config.devServerUrl);
    } else {
      this.mainWindow.loadFile(config.prodPath);
    }

    // Persist bounds on move/resize (window profile only)
    if (profileName === 'window') {
      const saveBounds = debounce(() => {
        if (!this.mainWindow.isDestroyed()) {
          saveWindowSettings({ windowBounds: this.mainWindow.getBounds() });
        }
      }, 500);
      this.mainWindow.on('move', saveBounds);
      this.mainWindow.on('resize', saveBounds);
    }

    if (profile.startsHidden) {
      this.mainWindow.hide();
    }

    return this.mainWindow;
  }

  getWindow() {
    return this.mainWindow;
  }

  setupPlatformBehavior(onSpaceChange) {
    // Basic panel implementation - no special space handling
  }

  cleanup() {
    // No cleanup needed for panel type window
  }
}
