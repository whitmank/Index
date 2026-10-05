<!-- Authored by Karter Whitman using Claude Sonnet 5 -->
---
name: run-index
description: Build, run, and drive the Index Electron desktop app for this workspace. Use when asked to start/launch/run the app, check if it's running, take a screenshot, or diagnose "no data" / empty-looking app.
---

Index is an Electron app (Vite dev server + Electron main process). This
workspace is a per-checkout dev instance — its data is isolated from other
checkouts by design. All commands below run from the project root
(`/Users/karter/files/dev/index-workspace/0.1.5`), which is native macOS —
no xvfb/container needed, the app opens a real window.

## Launch (dev)

```bash
npm run electron:dev    # alias: npm run index
```

This runs `scripts/electron-dev.js`, which:
1. Picks a free port and starts `vite` on it.
2. Waits 3s, then launches `npx electron .` pointed at that Vite URL.
3. Sets `INDEX_DATA_DIR` for both, deriving it from the **workspace folder's
   basename** — e.g. checkout `0.1.5` → `~/.index-0.1.5`. This isolates the
   dev instance's SurrealDB/device-id/settings from any other checkout or
   the packaged app, so parallel dev instances never collide.

To watch the launch and confirm the DB came up clean, run it backgrounded and
tail the log — a healthy start ends with `[App] Application ready`:

```bash
npm run electron:dev > /tmp/index-launch.log 2>&1 &
disown
sleep 6 && cat /tmp/index-launch.log
```

Look for `[Migration] Already migrated, skipping` (normal) vs. a fresh
`[DB] System home space seeded` (means it just created a **brand-new empty
DB** — see Gotchas below before assuming something's wrong).

## Gotcha: "the app has no data" after a folder rename or fresh checkout

`electron/main/config/paths.js` defines the data dir as:

```js
INDEX_DIR = process.env.INDEX_DATA_DIR
  ? path.resolve(process.env.INDEX_DATA_DIR)
  : path.join(os.homedir(), '.index');
```

The dev launcher always sets `INDEX_DATA_DIR` from the current folder name.
So if this workspace directory is ever renamed (e.g. `0.5` → `0.1.5`, which
happened once already), the dev launcher starts pointing at a **new, empty**
`~/.index-<new-name>` directory — the old data isn't gone, it's just sitting
under `~/.index-<old-name>`. Symptom: app opens fine, DB starts fine, but
the UI shows zero objects/tags.

**Diagnose** — list candidate data dirs and compare sizes/dates:

```bash
for d in ~/.index ~/.index-0.5 ~/.index-0.6 ~/.index-0.1.5; do
  echo "=== $d ==="; du -sh "$d" 2>/dev/null; ls -la "$d" 2>/dev/null
done
```

**Verify record counts without launching the app** (safe, read-only — starts
a throwaway SurrealDB pointed at the candidate dir on a scratch port, queries
it, kills it):

```bash
PORT=57999
surreal start --bind 127.0.0.1:$PORT --user root --pass root \
  "rocksdb://<candidate-dir>/surreal" > /tmp/probe.log 2>&1 &
PID=$!
sleep 2
echo "SELECT count() FROM objects GROUP ALL;" \
  | surreal sql -e "http://127.0.0.1:$PORT" -u root -p root --ns index --db main --pretty
echo "SELECT count() FROM tag_definitions GROUP ALL;" \
  | surreal sql -e "http://127.0.0.1:$PORT" -u root -p root --ns index --db main --pretty
kill $PID; wait $PID 2>/dev/null
```

(Table names: `objects`, `tag_definitions`, `tag_types`, `tagged`,
`devices` — see `electron/main/db/connection.js` for the schema.)

**Fix** — stop the app, move the empty dir aside (don't delete — it's
harmless but keep it as a safety net), copy the real data in, relaunch:

```bash
# stop first — see Cleanup below
mv ~/.index-0.1.5 ~/.index-0.1.5.empty.bak.$(date +%Y%m%d-%H%M%S)
cp -R ~/.index-0.5 ~/.index-0.1.5   # source = wherever the real data was found
npm run electron:dev > /tmp/index-launch.log 2>&1 & disown
```

A clean load logs `[Device] Loaded device: <name>` (not `Created new
device`) and `[Migration] Already migrated, skipping`.

## Cleanup: leftover processes from prior launches

`electron:dev` doesn't always tear down cleanly if the window is
force-quit or a prior Claude Code session ended mid-task — `vite` and
`surreal` can survive as orphans (reparented to `launchd`, `ppid` 1) and
hold the RocksDB file lock, which then makes the *next* launch fail or
silently point at a locked/stale DB. Before relaunching, check for and
kill anything still touching this workspace or its data dir:

```bash
ps aux | grep -E "index-workspace/0\.1\.5|surreal.*index-0\.1\.5" | grep -v grep
# kill each PID found (SIGTERM, then -9 if it survives 2s)

lsof +D ~/.index-0.1.5 2>/dev/null   # should be empty when nothing's running
```

## Verify visually

```bash
osascript -e 'tell application "Electron" to activate'
sleep 2
screencapture -x /tmp/index-app.png
```

Then read the PNG. Electron's app name in `System Events`/`osascript` is
always `"Electron"` in dev (not `"Index"` — that's only true for the
packaged build).

## Run (human path)

```bash
npm run electron:dev   # opens a real window, Ctrl-C in terminal to quit
```
