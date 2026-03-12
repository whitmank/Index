---
updated: 2026-03-11
session: "005"
authored_by: Claude Sonnet 4.6
---

## Conceptual Context

Index is a semantic layer over a file system. The organizing principle is *meaning over location*: objects exist in multiple contexts simultaneously through tags and collections rather than a single folder hierarchy. The app manages references, never copies. Local-first is a first-class constraint, not a deployment detail.

## Technical Context

v0.4 is a complete rebuild from v0.3. The architecture is settled: persistent SurrealDB, LIVE SELECT reactivity, single Zustand store, async debounced export, centralized system tag domain logic, ID normalization at the IPC boundary. The rebuild was completed in a single session (2026-03-11). The app runs; v0.3 migration is handled on first boot.

## Current Synthesis

The v0.4 foundation is stable. This session was orientation: studying docs and codebase, writing ABOUT.md. No new implementation was done. The system is ready for feature development.

## Key Decisions

- Persistent SurrealDB over ephemeral.
- LIVE SELECT over polling.
- Single store (`useIndexStore`) over fragmented stores.
- `scheduleExport()` everywhere mutations happen.
- System tag registry centralized in `domain/tag-types.js`.
- `normalizeRecord()` at IPC boundary, not scattered in UI.

## Open Contradictions

- Links are modeled in the data layer but not rendered in GraphView — the graph shows nodes with no edges. The app's core value proposition (relationships) is structurally incomplete at the UI level.
- `device-naming-dialog.js` still reads the v0.3 path (`~/.index/objects/`) for first-run name detection. Noted as acceptable but is a consistency gap.
