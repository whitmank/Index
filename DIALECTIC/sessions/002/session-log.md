---
session: 002
session_timestamp: 2026-03-18T00:26:55Z
authored_by: Claude Sonnet 4.6
status: complete
---

# Session 002 — Log

## Work

Complete unification of "container" → "space" across the entire codebase.

The terminology split had accumulated over v0.4 development: the data/IPC layer used
"container" (`container: true`, `db:createContainer`, `evaluateContainer`,
`container-service.js`) while the UI/store layer used "space" (`activeSpaceId`,
`enterSpace`, `spaceObjects`). The user resolved the split: "space" is correct at all
layers.

### Executed

**Deleted dead code:**
- `CreateContainerModal.jsx` / `.css`
- `QuickContainerView.jsx`

**Renamed and updated:**
- `container-service.js` → `space-service.js`; `evaluateContainer` → `evaluateSpace`
- `connection.js`: `ROOT_CONTAINER_ID` → `ROOT_SPACE_ID`, `ALL_CONTAINER_ID` →
  `ALL_SPACE_ID`, `seedSystemContainers` → `seedSystemSpaces`, `container: true` →
  `space: true` in seeded records; idempotent DB migration added:
  `UPDATE objects SET space = true UNSET container WHERE container = true`
- `db-handlers.js`: IPC channels `db:createContainer`, `db:updateContainer`,
  `db:evaluateContainer` → `db:createSpace`, `db:updateSpace`, `db:evaluateSpace`
- `preload/index.js`: API surface renamed to match
- `object-service.js`: field references `objectData.container` → `objectData.space`
- `store/index.js`: all action names, constants, field filters, local variables renamed
- `App.jsx`, `ObjectListView.jsx`, `AddressBar.jsx`, `CreateSpaceModal.jsx`: props,
  field access, comments
- All five docs updated

**Bug fixed (discovered during audit):**
- `ObjectListView.css` had `is-container` selectors; `ObjectListView.jsx` was emitting
  `is-space` class. Space rows were unstyled. Fixed selectors to `is-space`.

**Follow-on renames (same session):**
- `spaceObjects` → `activeSpaceObjects` across store, App.jsx, DayView.jsx, and docs —
  more descriptive, eliminates ambiguity with other space-related state.

### No contradictions surfaced

The rename was unambiguous. No edge cases required resolution. `contains` and `excludes`
edge table names were kept — semantically neutral verbs; renaming them carries DB migration
cost with no clarity benefit.

---

## State at Close

- Codebase is conceptually unified. "Container" does not appear as a domain term anywhere
  in source, docs, or comments (excluding the intentional DB migration query and
  layout-CSS uses in archived/dialog files).
- ORIENT.md authored.
- Dev log written covering sessions 001–002.
- Sessions 001–002 constitute the v0.5 starting point — ground-clearing before feature
  development. v0.5 is open.
