---
session: 014
timestamp: 2026-03-31T22:55:29Z
authored_by: Claude Sonnet 4.6
---

## 2026-04-01 — Finder Import Flow

**Synthesis:** Session 014 implemented the Finder → Index import flow end-to-end.

**What landed:**
- `FinderSyncExtension/` — Swift .appex adds "Add to Index" to the top-level Finder context menu
- `IndexSync.app` — minimal host app wrapping the .appex for development registration
- `index://` URL scheme registered in Electron; `open-url` handler reads folder tree and triggers `main:importFolder` event
- `electron/main/ipc/fs-handlers.js` — `fs:readFolder` IPC handler, recursive, dirs-first, skips dotfiles
- `ImportModal` — per-folder tag rows, already-indexed detection, space creation (contains or rule), progress state
- `build-host.sh` — repeatable build + sign script for development iteration

**Obstacles resolved:**
- `@objc(FinderSyncExtension)` stripped module prefix, breaking Info.plist principal class lookup — removed attribute
- Sandboxed `NSHomeDirectory()` returns container path, not real home — switched to `URL(fileURLWithPath: "/")`
- `codesign --deep` re-signed embedded .appex and stripped its entitlements — removed `--deep`, sign host and binary separately
- Ad-hoc signing rejected by pkd — required free Apple Developer account cert
- `t.name` null in tag store (system tags) caused crash in `resolveTagId` — guarded with `?.`

**Open:** Import flow works; space creation and already-indexed tag-merging untested at scale.
