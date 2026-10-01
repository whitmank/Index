---
name: run-desktop
description: Build, run, and drive the Index 0.6 Electron desktop app. Use when asked to start the desktop app, take a screenshot of it, or interact with its UI.
---

Index 0.6 is an Electron + Vite desktop app ("personal semantic layer over
files and URLs"). For agent/automated use, drive it via the Playwright REPL
at `.claude/skills/run-desktop/driver.mjs`.

This checkout (`0.1.6/`) runs alongside a separate 0.7 instance elsewhere in
`index-workspace/`. The driver always launches the **isolated 0.6 instance**:
its own SurrealDB (port 8000, pinned 2.x binary — 0.6's SDK can't speak to
3.x), its own Vite dev server (port 5173), and its own Electron userData dir
(`~/Library/Application Support/Index-0.6`). Nothing here touches 0.7's ports
or database, and the driver refuses to run if pointed at 0.7's ports
(8422 / 5273) — same guard as `scripts/launch-independent.sh`.

All paths below are relative to this directory (`0.1.6/`).

## Prerequisites

`playwright-core` is already a devDependency. On a fresh checkout:

```bash
npm install
```

The pinned SurrealDB 2.x binary must exist at `~/.index-0.6/bin/surreal`, and
`~/.index-0.6/surreal/` holds the isolated database (auto-seeded from a
backup on first run by `launch-independent.sh` — the driver assumes this has
already happened at least once; it does not seed the database itself).

## Run (agent path)

```bash
node .claude/skills/run-desktop/driver.mjs
```

Then at the `driver>` prompt:

```
launch
tour
quit
```

Or pipe commands non-interactively:

```bash
printf 'launch\ntour\nquit\n' | node .claude/skills/run-desktop/driver.mjs
```

Wrap in tmux for a persistent, pokeable session:

```bash
tmux new-session -d -s index06 -x 200 -y 50
tmux send-keys -t index06 'node .claude/skills/run-desktop/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t index06 -p | grep -q "driver>"; do sleep 0.2; done'
tmux send-keys -t index06 'launch' Enter
timeout 30 bash -c 'until tmux capture-pane -t index06 -p | grep -q "launched"; do sleep 0.2; done'
tmux send-keys -t index06 'home' Enter
tmux send-keys -t index06 'ss list-view' Enter
tmux capture-pane -t index06 -p
```

Screenshots land in `/tmp/index-0.6-shots/` by default — override with
`SCREENSHOT_DIR=/some/path node .claude/skills/run-desktop/driver.mjs`.

### Commands

| command | what it does |
|---|---|
| `launch` | start vite + electron (isolated 0.6 instance), force the window visible |
| `home` | reset to a known state: list view at root (`/`) — see Gotchas |
| `tour` | walk every top-level UI surface and screenshot each one (list, graph, address-bar search, create menu, node detail, all 4 settings tabs) |
| `ss [name]` | screenshot → `<SHOT_DIR>/<name>.png` |
| `click <css-sel>` | click element via DOM (not coordinates — see Gotchas) |
| `click-text <text>` | click button/link containing text |
| `close-menu` | dismiss the "New…" create menu (ignores Escape — see Gotchas) |
| `type <text>` / `press <key>` | keyboard input (Playwright key names, e.g. `Meta+,`) |
| `wait <css-sel>` | wait for element, 10s timeout |
| `eval <js>` | evaluate in the page, print JSON |
| `text [css-sel]` | print innerText |
| `windows` | list windows + webContents |
| `quit` | close app + vite, exit |

## Run (human path)

```bash
npm run index:independent   # opens the real overlay-profile window; Ctrl-C to quit
```

## Gotchas

- **Default window profile is `overlay`: hidden until a global hotkey
  (⌘⇧Space) toggles it.** A driven Playwright launch never fires that
  hotkey, so `launch` force-shows every `BrowserWindow` via
  `app.evaluate(({BrowserWindow}) => ...)` right after startup. Without this,
  `page.screenshot()` hangs indefinitely on a hidden window.
- **UI state persists across runs.** `App.jsx` saves the active
  view/node/settings-tab to `localStorage` under the isolated userData dir
  and restores it on the *next* launch — a fresh `launch` can land back on
  Settings from a previous session. Always call `home` before assuming
  you're looking at the list view.
- **The "New…" create menu only closes on an outside `mousedown`, not
  Escape** (`AddressBar.jsx` listens for `mousedown`, not `keydown`). Use
  `close-menu`, not `press Escape` — otherwise it stays open and bleeds into
  every screenshot taken afterward.
- **A `.node-row` isn't necessarily an object — it can be a group
  (folder).** Clicking a group row and pressing Enter navigates *into* it
  instead of opening a detail card. `tour` selects the first row without the
  `is-group` class; do the same manually via
  `eval document.querySelector('.node-row:not(.is-group)').click()`.
- **The address-bar search dropdown needs `Tab`, not just a click.**
  Clicking `.address-bar-label` only focuses the input (`editing=true`); the
  dropdown list itself needs `Tab` (or typing a query) to open
  (`showList=true`).

## Troubleshooting

- **`page.screenshot()` hangs / times out:** the window is probably still
  hidden — confirm `launch` completed its show/focus step (check the
  `windows` command output).
- **"refusing to use a port owned by the 0.7 instance":** something set
  `INDEX_DB_PORT=8422` or `INDEX_VITE_PORT=5273` — those belong to the 0.7
  checkout. Leave the env vars unset to use 0.6's defaults (8000 / 5173).
- **Port already in use:** `lsof -i :8000` / `lsof -i :5173` before
  launching — a previous driver run may not have exited cleanly.
