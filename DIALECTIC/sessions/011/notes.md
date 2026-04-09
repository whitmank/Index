---
session: 011
timestamp: 2026-03-26T23:34:58Z
authored_by: Claude Sonnet 4.6
---

## decision — 23:40 UTC

Settings "General" tab renamed to "Devices" and replaced entirely with a live list of device records from the Zustand store. Current device marked with inline badge matched via `deviceOrigin`. "About" / version section removed from settings entirely.

## decision — 23:50 UTC

Tag types and tags are case-insensitive for deduplication and lookup, but casing is preserved on write. Implementation: `string::lowercase(name) = string::lowercase(input)` in SurrealDB queries on create; no normalization of stored values. Covers `createTag`, `createTagType`, and `findOrCreateSystemTag`.

## synthesis — 00:10 UTC

Appearance settings persistence moved from localStorage-only to IPC-backed file storage (`~/.index/appearance.json`). Root cause of regression: Chromium's localStorage LevelDB writes are async to disk; renderer process kill before flush loses data. Fix follows the existing `window-settings.json` pattern — main process reads/writes file synchronously, `initAppearance()` made async and awaited in `main.jsx` before React renders. localStorage retained as in-session fallback and synced from file on load.

## observation — 00:15 UTC

Attempted preload-based approach (reading file via `require('fs')` in preload) failed: Electron v20+ sandboxes renderers by default, limiting preload `require` to `electron`, `events`, `timers`, `url`. Top-level `require('fs')` crashed the preload, producing a transparent window rather than a missing one. Partial revert left dangling references (`_appearance`, `fs`) in the contextBridge body, compounding the issue. IPC-to-main-process is the correct pattern.

## decision — 00:20 UTC

Added `bgA <= 0` guard in `loadFromStorage()` — opacity of zero makes the app invisible and unrecoverable without keyboard access. Treated as invalid data; resets to default (0.75).
