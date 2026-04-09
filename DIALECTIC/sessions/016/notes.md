---
session: 016
timestamp: 2026-04-06T00:56:41Z
authored_by: Claude Sonnet 4.6
---

## 2026-04-05

**Decision** — Drag-and-drop and CMD+V paste implemented for adding objects to a space.
`ObjectListView` is now a drop target (files and URLs from Finder/desktop). Drop and paste
share `addUrisToSpace()` helper in App.jsx. Dedup by URI against store; adds `contains`
edge to active space. Empty state text updated to "Drop files or links to add".

**Decision** — OG metadata fetch deferred. URL stored raw on drop/paste; enrichment
(og:title, og:type) planned as a future feature distinct from direct browser capture.

**Decision** — Full URL used as default object name for dropped/pasted URLs (not hostname).
