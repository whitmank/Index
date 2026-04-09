---
session: 019
timestamp: 2026-04-08T23:28:10Z
authored_by: Claude Sonnet 4.6
---

## synthesis — 23:45 UTC

Thumbnail pipeline unblocked by a one-line CSP fix: `img-src 'self' data:` added to `index.html`. Root cause was that `default-src 'self'` does not cover `data:` URIs — the IPC handler and renderer wiring from session 017 were correct throughout. PDF thumbnails added via Quick Look (append `pdf` to `IMAGE_TYPES`).

## decision — 23:50 UTC

Navigation keyboard model unified: WASD and arrow keys only, no CMD modifier for directional nav. W/↑ = up in list, S/↓ = down, A/← = back, D/→ = forward. CMD+A reserved for select-all (OS convention). Shift+W/S/arrows extend list selection from anchor (Finder pattern).

## synthesis — 23:55 UTC

CMD+L expanded from space navigator to general search. Empty query shows spaces only; typed query shows matching spaces (○) then matching objects (●). Selecting an object navigates to `/` in graph view and opens the detail pane — graph view chosen because objects have no single home space; it is the natural interface for relational context. Edge rendering (ego-graph) remains a future task.

## synthesis — 00:15 UTC

Objects are now first-class navigable locations. `onSelectObject` in App.jsx previously called `enterSpace(ROOT_SPACE_ID)`, flooding the graph with all objects; it now calls `enterSpace(id)`, making the selected object the active location. `activeSpace` lookup dropped the `&& o.space` filter so the address bar label resolves for non-space objects. Objects and spaces are treated identically by the navigation system — the data model symmetry is now reflected in the UI.

## decision — 00:20 UTC

CMD+E tag edit modal is context-sensitive: single space → SpaceRulesSection (tag/device rules); single object → TagAssignmentSection (typed/untyped tag input); multiple objects → batch tag UI. `TagAddInput` extracted to its own file as it is now shared between the detail pane and the modal. Modal uses dark-mode CSS overrides scoped to `.tag-edit-body` for both SpaceRulesSection and TagAddInput light-theme defaults.

## observation — 00:25 UTC

`selectedIds` was lifted from ObjectListView local state to App.jsx to enable the CMD+E modal to read the current selection. ObjectListView now accepts `selectedIds` and `onSelectionChange` as controlled props; `anchorId` (range-select anchor) remains local. This pattern mirrors how `detailObjectId` is managed.

