// Author: Claude Code (Anthropic)
// Overlay window profile
// Floating panel above all windows, visible on every Space, toggled by global shortcut.

/**
 * Returns base BrowserWindow options for the overlay profile.
 * Platform drivers may add platform-specific overrides on top of these.
 * @param {{ screenWidth: number, screenHeight: number }} dimensions
 * @returns {Object} BrowserWindow options
 */
export function getOptions({ screenWidth, screenHeight }) {
  const w = 800, h = 600;
  return {
    width: w,
    height: h,
    x: Math.round((screenWidth - w) / 2),
    y: Math.round(screenHeight * 0.15),
    alwaysOnTop: true,
    frame: false,
    transparent: true,
    resizable: true,
  };
}

/** Overlay starts hidden; the global shortcut toggles it into view. */
export const startsHidden = true;
