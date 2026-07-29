# Window Behavior

The app is a tool that can be accessed anywhere, at any time, in any context.

It’s a toggleable overlay, much like MacOS spotlight, or a Command Bar more generally.

- Hotkey opens the window to the front.
- Hotkey while the window is open hides it.
- The window opens to the front by default. Once open, the user can rearrange the position (including the z-position), which the window controls should respect. (i.e)
- The window can be resized, and since the app is designed to be frequently invoked and hidden, naturally the position and size of the window should be remembered by the application.
- The app has no top handle with traffic light style affordances for closing/minimizing/maximizing. Closing is handled by hotkeys, and resizing can be done with system window managers or by using the cursor to drag the window at it’s edges.
- When the window is opened on a specific system Desktop, it should stay there. Switching desktops leaves the window open where it was originally opened, it does not follow to the active Desktop automatically. If the user invokes the hotkey while the window is open in another desktop (not the current one), then the window is transferred to the current desktop.
- If the window is open but unfocussed, hotkey brings it to front and focusses. Subsequent hotkey would then naturally hide it, since it’s in focus.

# CLAUDE WRITE HERE

_As built. Authored by Karter Whitman using Claude Opus 5._

The app is a tool that can be accessed anywhere, at any time, in any context.

It's a toggleable overlay, much like MacOS spotlight, or a Command Bar more generally — except that there is one of it per desktop, the way there can be many Finder windows onto one filesystem.

## Summoning

- The hotkey is ⌘\`. `INDEX_HOTKEY` overrides it with any Electron accelerator. It is registered system-wide, so it takes the key away from every other app.
- The hotkey acts on the desktop you are on, and only on that one.
  - No window on this desktop yet → one opens here.
  - The window is hidden, minimized, or buried behind another app → it comes forward and takes focus.
  - The window is already focused → it hides, and focus returns to whatever was in front before.
- Because a hotkey press can only ever hide a window you are already looking at, it can never lose one you meant to summon.

## Desktops

- A window belongs to the desktop it was opened on and stays there. Switching desktops leaves it behind; it does not follow, and it does not disappear.
- Returning to a desktop finds its window exactly as it was left.
- A window is never moved between desktops. Pressing the hotkey on a desktop that hasn't got one opens an additional window there, leaving every other window untouched.

## Windows are plural, the app is not

- One process, one database, any number of windows.
- A change made in one window appears in all of them immediately — the same record pool, updated from the same write.
- Undo is per-window: ⌘Z walks back what you did in that window. A change made elsewhere can therefore make a local undo stale, and undoing it will overwrite the newer edit.
- Launching Index again does not start a second copy; it summons the one already running.

## The window itself

- No title bar and no traffic lights. There is nothing to click to close, minimize, or maximize.
- The address bar along the top is the drag handle. The edges resize, as does any system window manager.
- Position and size are remembered. A new window opens at the last remembered frame, stepped aside 28px per window already open so it doesn't land invisibly on top of another.
- Minimum size 720×520; 1280×820 the first time, centered.
- Once open, the window is yours to arrange, including its z-position. Nothing re-raises it except the hotkey.

## Closing and quitting

- ⌘W closes that window for good. Nothing is lost with it — what it was showing lives in the database — and the hotkey opens a fresh one.
- ⌘Q quits.
- Closing the last window does not quit. Index stays resident so the hotkey always has something to open.
- No Dock icon and no ⌘Tab entry. The hotkey is the way in.

## Where this departs from the spec above

- **"If the user invokes the hotkey while the window is open in another desktop, the window is transferred to the current desktop"** — superseded. A new window opens on the current desktop instead, and the window on the other desktop is left alone. This was originally built as a transfer; multi-window made transferring the wrong behavior, since it would take a window away from a desktop you had deliberately put it on.
- **"Closing is handled by hotkeys"** — ⌘W and ⌘Q are handled explicitly by the app rather than by the menu bar, which never appears for an app with no Dock icon. Without that they would silently do nothing.

