// Authored by Karter Whitman using Claude Opus 5
// Index is an overlay, not a document, and there is one of it per desktop.
// Each window is frameless — no title bar, no traffic lights, no Dock icon
// — and belongs to the desktop it was summoned to: the hotkey opens the
// window for the desktop you are on, making one if there isn't one yet,
// and never drags another desktop's window away from it.
//
// They are windows onto one shared database, the way two Finder windows
// are: the main process is a single instance, so a change made in one is
// broadcast to the rest and lands in every pool.
import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { activeDesktop } from "./desktops.js";
import { DEFAULT_SIZE, loadBounds, saveBounds, type Bounds } from "./bounds.js";

const here = path.dirname(fileURLToPath(import.meta.url));

// Resolved against the bundle, not this source file: esbuild flattens
// everything into app/backend/dist/main.js, so `here` is that dist/
// wherever the source happens to live, and the renderer is two up.
const BUNDLED_RENDERER = path.join(here, "../../frontend/dist/index.html");

/** How long a frame has to settle before it is written to disk — a drag
 * across the screen is one save, not a thousand. */
const REMEMBER_DELAY = 500;

/** How far each additional window is offset from the remembered frame. A
 * window opening exactly on top of another reads as nothing happening. */
const CASCADE = 28;

/** Where windows are filed when the desktop watcher has no answer — on a
 * machine without one, Index is simply a one-window app again. */
const NO_DESKTOP = " no desktop";

/**
 * Desktop id → the window that belongs to it.
 *
 * Whether a window is on screen is asked of the window every time rather
 * than tracked alongside it. A tracked flag was tried and is what made the
 * hotkey act on every desktop at once: hiding the app and unhiding it
 * again delivers a stray `hide` to a window that is by then visible, so
 * the flag read false while the window was plainly on screen, and the one
 * decision that depends on it — whether any other desktop still has a
 * window up — went the wrong way. `isVisible()` was right at every step of
 * that trace, including for windows on a desktop the user was not on.
 */
const panes = new Map<string, BrowserWindow>();

let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});

function desktopNow(): string {
  return activeDesktop() ?? NO_DESKTOP;
}

/** Where a new window opens: the remembered frame, stepped aside once per
 * window already on screen so they do not stack invisibly. */
function frameFor(offset: number): Partial<Bounds> & { width: number; height: number } {
  const saved = loadBounds();
  if (!saved) return { ...DEFAULT_SIZE };
  if (offset === 0) return saved;
  return {
    ...saved,
    x: saved.x + CASCADE * offset,
    y: saved.y + CASCADE * offset,
  };
}

export function createWindow(desktop: string = desktopNow()): BrowserWindow {
  const existing = panes.get(desktop);
  if (existing && !existing.isDestroyed()) return existing;

  const window = new BrowserWindow({
    ...frameFor(panes.size),
    backgroundColor: "#111113",
    // No frame at all. There is no handle to grab and nothing to close
    // with: the address bar is the drag region and the edges resize.
    frame: false,
    show: false,
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  panes.set(desktop, window);

  let pending: NodeJS.Timeout | null = null;
  const remember = (): void => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(() => {
      pending = null;
      if (window.isDestroyed() || window.isMinimized()) return;
      saveBounds(window.getNormalBounds());
    }, REMEMBER_DELAY);
  };

  window.on("resize", remember);
  window.on("move", remember);
  window.on("close", () => {
    // ⌘W closes a window for good. Nothing is lost with it: what it was
    // showing lives in the database, and the hotkey makes a fresh one.
    if (pending) clearTimeout(pending);
    if (!quitting && !window.isMinimized()) saveBounds(window.getNormalBounds());
  });

  window.on("closed", () => {
    if (panes.get(desktop) === window) panes.delete(desktop);
  });

  // With the Dock icon hidden the app's menu bar never appears, so the two
  // keystrokes that would normally come from it are caught here instead.
  // Without this there is no way to close a window, and no way out of the
  // app but the terminal.
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || !input.meta || input.control || input.alt) return;
    const key = input.key.toLowerCase();
    if (key === "q") {
      event.preventDefault();
      app.quit();
    } else if (key === "w") {
      event.preventDefault();
      window.close();
    }
  });

  window.once("ready-to-show", () => {
    show(window);
    // INDEX_TOP pins the window above everything else — useful when
    // driving or capturing it while other apps are open. Off by default:
    // the z-order belongs to the user.
    if (process.env.INDEX_TOP) window.setAlwaysOnTop(true);
  });

  const devUrl = process.env.INDEX_RENDERER_URL;
  if (devUrl) {
    // In development the renderer's console lands in the same terminal as
    // the main process's, so one log tells the whole story.
    window.webContents.on("console-message", (event) => {
      console.log(`[renderer] ${event.message}`);
    });
    void window.loadURL(devUrl);
    // Devtools stay closed unless asked for — ⌥⌘I opens them on demand,
    // and a detached inspector on every launch buries the window.
    if (process.env.INDEX_DEVTOOLS) window.webContents.openDevTools({ mode: "detach" });
  } else {
    void window.loadFile(BUNDLED_RENDERER);
  }

  return window;
}

function show(window: BrowserWindow): void {
  if (window.isDestroyed()) return;

  if (window.isMinimized()) window.restore();
  window.show();

  // An app with no Dock icon is never activated for us, so focus has to be
  // taken outright — otherwise the window arrives behind whatever the user
  // was just typing into.
  app.focus({ steal: true });
  window.focus();
}

/** Is any window other than this one still on screen — which, since there
 * is at most one per desktop, means on some desktop the user is not
 * looking at. A window on another desktop counts: it is ordered in, and
 * says so, whether or not the space it lives on is the one in front. */
function othersOnScreen(except: BrowserWindow): boolean {
  for (const window of panes.values()) {
    if (window !== except && !window.isDestroyed() && window.isVisible()) return true;
  }
  return false;
}

function hide(window: BrowserWindow): void {
  if (window.isDestroyed() || !window.isVisible()) return;

  saveBounds(window.getNormalBounds());
  // Only this desktop's window goes away. It has to be hidden by itself
  // rather than with `app.hide()`, which is app-wide: that took every
  // other desktop's window down with it and — because unhiding restores
  // exactly what it hid — handed them all back on the next summon, which
  // is what made one hotkey press act on every desktop at once.
  window.hide();

  // Hiding the app is still how focus returns to whatever Index
  // interrupted, the way it does after Spotlight, so it is used for that
  // and nothing else: once no window of ours is on screen there is
  // nothing left for a later unhide to bring back.
  if (process.platform === "darwin" && !othersOnScreen(window)) app.hide();
}

/** Bring the window for the desktop in front of the user forward, making
 * one if that desktop hasn't got one. */
export function showWindow(): void {
  const desktop = desktopNow();
  const window = panes.get(desktop);
  if (!window || window.isDestroyed()) {
    createWindow(desktop);
    return;
  }
  show(window);
}

/**
 * Only reachable when the watcher had no answer in time and a window was
 * filed under the placeholder — a helper that was slow to start, or one
 * that died and came back. Move that window to where it actually is,
 * otherwise the hotkey would not find it and would open a second one on
 * top of it. Internal to this module: the ordering in `index.ts` is what
 * normally makes it unnecessary.
 */
export function adopt(desktop: string): void {
  const stray = panes.get(NO_DESKTOP);
  if (!stray || panes.has(desktop)) return;
  panes.delete(NO_DESKTOP);
  panes.set(desktop, stray);
}

/**
 * The hotkey, both ways, for the desktop the user is on. A window they
 * cannot use — hidden, minimised, or buried under another app — comes
 * forward; only one that already has their focus goes away. A desktop
 * without a window gets one, which is how a second window is opened
 * without disturbing the first.
 */
export function toggleWindow(): void {
  const desktop = desktopNow();
  const window = panes.get(desktop);

  if (!window || window.isDestroyed()) {
    createWindow(desktop);
    return;
  }

  if (window.isVisible() && !window.isMinimized() && window.isFocused()) hide(window);
  else show(window);
}

/** Tell every window the same thing. They show one database, so news for
 * one of them is news for all of them. */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of panes.values()) {
    if (!window.isDestroyed()) window.webContents.send(channel, ...args);
  }
}
