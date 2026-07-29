// Authored by Karter Whitman using Claude Opus 5
// Which desktop the user is on. macOS calls them Spaces and so does the
// API this asks; everywhere else in Index they are desktops, which is
// what the user calls them.
//
// Electron exposes nothing for this, so a JXA helper answers it. AppKit
// does post NSWorkspaceActiveSpaceDidChangeNotification, and observing it
// from the helper registers cleanly and fires correctly on a locally
// posted notification — but the real one never arrives in a plain
// `osascript` process, which has no NSApplication and so is not the kind
// of client the window server delivers workspace notifications to. Asking
// CoreGraphics which Space is active does work there, so the helper polls
// that instead.
import { spawn, type ChildProcess } from "node:child_process";

/** Frequent enough to be current whenever the hotkey asks, and one cheap
 * out-of-process call each time. */
const POLL_SECONDS = 0.15;

/**
 * Runs under `osascript -l JavaScript`. `CGSGetActiveSpace` is private
 * CoreGraphics — unavailable to bind through any public framework, but
 * stable for many years and the same call every window manager on macOS
 * relies on. A failure to bind throws, which shows up on stderr and is
 * handled as a dead helper.
 */
const POLLER = `
ObjC.import('AppKit');
ObjC.bindFunction('CGSMainConnectionID', ['int', []]);
ObjC.bindFunction('CGSGetActiveSpace', ['long long', ['int']]);
var out = $.NSFileHandle.fileHandleWithStandardOutput;
function emit(id) {
  out.writeData($.NSString.alloc.initWithUTF8String(id + '\\n')
    .dataUsingEncoding($.NSUTF8StringEncoding));
}
var connection = $.CGSMainConnectionID();
var last = $.CGSGetActiveSpace(connection);
// The opening reading says where the user already is, which is how the
// app knows which desktop it is being launched onto.
emit(last);
while (true) {
  $.NSThread.sleepForTimeInterval(${POLL_SECONDS});
  var space = $.CGSGetActiveSpace(connection);
  if (space !== last) { last = space; emit(space); }
}
`;

/** Long enough not to spin on a helper that cannot start at all. */
const RESTART_DELAY = 2_000;
/** A helper that lives this long is working; its failure budget resets. */
const HEALTHY_AFTER = 30_000;
const MAX_FAILURES = 3;

/** The desktop the user is on, or null before the first reading — and on
 * any platform that has no such notion. */
let active: string | null = null;

export function activeDesktop(): string | null {
  return active;
}

let announceOriented: () => void;
const oriented = new Promise<void>((resolve) => {
  announceOriented = resolve;
});

/**
 * Resolves once the first reading has arrived, so the first window can be
 * filed under the desktop it is actually opening on rather than a
 * placeholder to be corrected later. Resolves anyway after `timeout`: a
 * watcher that cannot answer must not hold up the app, and a window with
 * no desktop is the degraded single-window case, which still works.
 */
export function whenOriented(timeout: number): Promise<void> {
  if (active !== null) return Promise.resolve();
  return Promise.race([
    oriented,
    new Promise<void>((resolve) => {
      setTimeout(resolve, timeout).unref();
    }),
  ]);
}

/**
 * Keep track of which desktop the user is on, so the hotkey knows which
 * window it is talking about. `onOrient` is called once per helper with
 * its first reading — the desktop the user is already on.
 *
 * Later readings are not announced. Windows belong to their desktop and
 * stay there; changing desktops is not news anything has to act on.
 *
 * Returns the function that stops watching — it must be called before
 * quitting, or the helper outlives the app.
 */
export function watchDesktops(onOrient: (desktop: string) => void): () => void {
  if (process.platform !== "darwin") return () => {};

  let child: ChildProcess | null = null;
  let stopped = false;
  let failures = 0;

  const start = (): void => {
    child = spawn("osascript", ["-l", "JavaScript", "-e", POLLER], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    // The helper's opening reading is where the user already is, not
    // somewhere they moved to — and it is per-helper, so a restarted
    // watcher re-orients itself instead of announcing a move nobody made.
    let settled = false;

    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // A partial line means the write was split; hold it for the next
      // chunk rather than reading it as a desktop.
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const desktop = line.trim();
        if (!desktop) continue;
        active = desktop;
        if (settled) continue;
        settled = true;
        announceOriented();
        onOrient(desktop);
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      console.error(`[spaces] ${chunk.toString().trim()}`);
    });

    child.on("exit", (code, signal) => {
      child = null;
      if (stopped) return;
      console.error(`[spaces] watcher exited (code ${code}, signal ${signal})`);
      failures += 1;
      if (failures > MAX_FAILURES) {
        console.error(
          "[spaces] the desktop-switch watcher keeps dying — the window will " +
            "stay open when you change desktops.",
        );
        return;
      }
      setTimeout(start, RESTART_DELAY).unref();
    });

    setTimeout(() => {
      if (child) failures = 0;
    }, HEALTHY_AFTER).unref();
  };

  start();

  return () => {
    stopped = true;
    child?.kill();
    child = null;
  };
}
