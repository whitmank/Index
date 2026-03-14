---
updated: 2026-03-14
session: "016"
authored_by: Claude Sonnet 4.6
---

## Conceptual Context

Index is a semantic layer over a file system. The organizing principle is *meaning over location*: objects exist in multiple contexts simultaneously through tags and spaces rather than a single folder hierarchy. The app manages references, never copies. Local-first means data lives with the user — organized around user identity, not a single machine.

A space is a named subset of [all] defined by tag conditions. Spaces have read and write semantics: entering a space shows objects that satisfy its query; placing an object in a space assigns the space's defining (`query.all`) tags to it. Any space can be viewed through any lens — list, calendar, or graph. The Finder analogy: same directory, multiple view types.

## Technical Context

v0.4 backend is settled: persistent SurrealDB at `~/.index/surreal/` (table: `spaces`, formerly `collections`), LIVE SELECT reactivity, single Zustand store (`useIndexStore`), async debounced export, centralized system tag domain logic. Fully-qualified SurrealDB IDs throughout all layers.

Frontend is functional. The app has three top-level views — Spaces, Tags, Settings — navigated via command palette (CMD+K) and number shortcuts (CMD+1/2/3). Inside any space, three view types are available: list (ObjectListView), calendar (CalendarView/DayView), graph (GraphView). The AddressBar is always visible. The back chevron is always rendered, disabled when there is no prior context. CMD+A enters the All space directly.

## Current Synthesis

Backend and frontend both functional. The space model is fully implemented with live reactivity. Session logs 009–015 authored retrospectively; unified dev log written at `docs/dev-logs/2026-03-14_frontend-rebuild.md`. The dialectical record is complete.

## Key Decisions

- Persistent SurrealDB over ephemeral.
- LIVE SELECT over polling.
- Single store (`useIndexStore`) over fragmented stores.
- `scheduleExport()` everywhere mutations happen.
- System tag registry centralized in `domain/tag-types.js`.
- Fully-qualified SurrealDB IDs — normalization at emission point and IPC boundary.
- `spaces` table (renamed from `collections`) — total rename at all layers.
- Space write rule: `query.all` tags only. `any`/`none` ignored for write.
- Views architecture: spaces hold objects, views are a lens. Any space, any view type.
- `default_view` on space records; `activeView` in store; store-level only for system spaces.
- Command palette (CMD+K) as primary top-level navigation; no persistent nav chrome.
- All top-level destinations are full pages (Spaces, Tags, Settings). No modals in top-level navigation.

## Open Contradictions

- **`display: false` system tags in space builder** — `file_type` and `origin` tags are domain-hidden but appear in CreateSpaceModal's tag pool (raw `tags` array, no display filter).
- **Graph edges absent** — links modeled in data layer, not rendered. Blocked on relationship data model design.
- **Object row click is a no-op** — ObjectListView rows have no click handler. Object detail view not yet designed.
- **`addObjectToSpace` has no UI surface** — write semantic exists in the store; no user-facing affordance to invoke it.
