---
updated: 2026-03-12
session: "005"
authored_by: Claude Sonnet 4.6
---

## Conceptual Context

Index is a semantic layer over a file system. The organizing principle is *meaning over location*: objects exist in multiple contexts simultaneously through tags and collections rather than a single folder hierarchy. The app manages references, never copies. Local-first means data lives with the user — organized around user identity, not a single machine.

## Technical Context

v0.4 is a complete rebuild from v0.3. The architecture is settled: persistent SurrealDB at `~/.index/surreal/`, LIVE SELECT reactivity, single Zustand store (`useIndexStore`), async debounced export, centralized system tag domain logic. IDs are fully-qualified SurrealDB strings (`"table:localId"`) throughout all layers — normalization applied at `live-queries.js` emission and IPC handler boundary. Codebase structure: `db/services/`, `dialogs/`, `db/connection.js`. All documentation reflects current state.

## Current Synthesis

The v0.4 foundation is structurally clean and ready for feature development. The ID normalization refactor completed what the architecture promised. Documentation (BACKLOG, GLOSSARY, PROJECT_DESIGN, ABOUT, QUICKSTART) has been audited and updated to reflect actual current state. Two open contradictions define the next meaningful work.

## Key Decisions

- Persistent SurrealDB over ephemeral.
- LIVE SELECT over polling.
- Single store (`useIndexStore`) over fragmented stores.
- `scheduleExport()` everywhere mutations happen.
- System tag registry centralized in `domain/tag-types.js`.
- Fully-qualified SurrealDB IDs (`"table:localId"`) throughout — normalization at emission point and IPC boundary.

## Open Contradictions

- Collection filtering is a no-op — `_evaluateCollectionLocally()` ignores its query argument; `activateCollection` never calls `db:evaluateCollection`. Server-side evaluator exists with no caller.
- Graph edges absent — links modeled in data layer, not rendered in GraphView. Blocked until relationship data model is designed.
