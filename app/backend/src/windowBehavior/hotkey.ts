// Authored by Karter Whitman using Claude Opus 5
// The one way in. Index is meant to be reachable from inside whatever the
// user is already doing, so the binding is system-wide rather than an
// in-app shortcut.
import { globalShortcut } from "electron";
import { toggleWindow } from "./windows.js";

// A system-wide binding takes the key away from every other app. ⌘` is
// macOS's "cycle windows in this app" — that is the trade this default
// makes, and INDEX_HOTKEY overrides it with any Electron accelerator.
const DEFAULT_HOTKEY = "CommandOrControl+`";

export function registerHotkey(): void {
  const accelerator = process.env.INDEX_HOTKEY || DEFAULT_HOTKEY;
  // Registration fails when something else already owns the combination.
  // Worth saying loudly: without it the app has no way to be summoned.
  if (globalShortcut.register(accelerator, toggleWindow)) return;
  console.error(
    `[hotkey] ${accelerator} is already taken — Index cannot be summoned. ` +
      "Set INDEX_HOTKEY to a free combination.",
  );
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll();
}
