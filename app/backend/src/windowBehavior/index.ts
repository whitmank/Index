// Authored by Karter Whitman using Claude Opus 5
// How Index behaves as a desktop window: one frameless overlay per
// desktop, summoned and dismissed by a global hotkey, remembering the
// frame it was left in. The parts are the windows themselves, the desktop
// the user is on, the remembered frame, and the hotkey — separate files
// because they are separate concerns, one module because none of them
// means anything without the others.
//
// The rest of the app sees only what is below.
import { watchDesktops, whenOriented } from "./desktops.js";
import { registerHotkey, unregisterHotkeys } from "./hotkey.js";
import { adopt, createWindow } from "./windows.js";

export { broadcast, createWindow, showWindow } from "./windows.js";

/**
 * How long to wait for the desktop watcher before opening the first
 * window anyway. It answers in a fraction of this; a watcher that does
 * not answer at all is a machine where Index is a one-window app, and
 * making the user wait to find that out helps nobody.
 */
const ORIENT_TIMEOUT = 2_000;

/**
 * Start behaving like a window: learn which desktop we are on, open the
 * first window there, and start listening for the hotkey.
 *
 * The order is the point. Knowing the desktop first is what lets the
 * window be filed under it immediately, instead of being opened under a
 * placeholder and corrected — which, until it was corrected, made the
 * hotkey open a second window on top of the first.
 */
export async function startWindowBehavior(): Promise<() => void> {
  const stopWatching = watchDesktops(adopt);
  await whenOriented(ORIENT_TIMEOUT);

  createWindow();
  registerHotkey();

  return () => {
    unregisterHotkeys();
    stopWatching();
  };
}
