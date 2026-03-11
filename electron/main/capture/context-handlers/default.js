// Author: Claude Code
// Default capture handler — catch-all that focuses the Index window without creating an object

/**
 * @returns {boolean}
 */
export function canHandle(_appName) {
  return true;
}

/**
 * No-op capture: just let the caller focus the window.
 * @returns {Promise<null>}
 */
export async function capture() {
  return null;
}
