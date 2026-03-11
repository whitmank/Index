// Author: Claude Code (Anthropic)
// Window profile
// Standard frameless app window centered on screen. No traffic lights.
// Draggable via the CSS .title-bar drag region in the renderer.

/**
 * Returns base BrowserWindow options for the window profile.
 * Platform drivers may add platform-specific overrides on top of these.
 * @param {{ screenWidth: number, screenHeight: number }} dimensions
 * @returns {Object} BrowserWindow options
 */
export function getOptions({ screenWidth, screenHeight }) {
  const w = 1100, h = 720;
  return {
    width: w,
    height: h,
    x: Math.round((screenWidth - w) / 2),
    y: Math.round((screenHeight - h) / 2),
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    resizable: true,
  };
}

/** Window profile shows immediately after creation or profile switch. */
export const startsHidden = false;
