---
updated: 2026-04-19
session: "004"
---

## Conceptual Context

Index is a local-first desktop application that creates a semantic layer over files and URLs. The organizing principle: every navigable entity is an Object; every relationship is an edge. Users manage what things mean, not where they are stored. Hierarchical location is replaced by multi-dimensional edges and query-defined spaces.

The unified graph model is the settled end state: one `objects` node table, one RELATION table per edge name, and a data-driven UI where type-Object `schema` arrays govern pill rendering order. Every concept in the application — tags, tag types, devices, spaces — collapses into Objects connected by edges.

## Technical Context

Electron + SurrealDB + React. Main process owns the database and exposes a typed surface over IPC. Renderer is a Zustand store wrapping `window.electronAPI` plus React views. LIVE SELECT subscriptions push diffs from main to renderer; no polling.

The codebase is at **Phase 2 Stage B** of a migration from a partitioned legacy schema (`objects` / `tag_definitions` / `tag_types` / `devices` + `tagged`/`typed` two-hop relation) toward the unified graph. Legacy shape remains authoritative for writes. New shape is readable, grown via dual-write on every mutation path. Boot-time backfill (`graph-migration.js`) is idempotent. The rule compiler (`rule-compiler.js`) translates `all`/`any`/`none` + `{ edge, to }` predicates to SurrealQL and is live. `getPillsForObject` is user-facing. `TagAssignmentSection` renders from the new shape while driving mutations through legacy IPCs.

Phase 3 — dropping legacy tables and renaming `contains` → `includes` — is deferred.

## Current Synthesis

The documentation set has been established for 0.6: ABOUT, GLOSSARY, PROJECT_DESIGN, QUICKSTART, BACKLOG, COMMENT-CONVENTION, plus the architecture deep-dive and data model proposal already in `docs/`. ORIENT.md is now populated. The project is oriented and ready to continue.

## Key Decisions

- One `objects` table; one RELATION table per edge name. No separate node types.
- Every edge has a twin edge Object in `objects` (mandatory; display metadata optional).
- `schema` arrays on type-Objects drive pill rendering order and are data, not code.
- Legacy shape authoritative for writes through Phase 2; mirror failures non-fatal.
- `rule` takes precedence over legacy `query` on spaces that carry both.
- `SYSTEM_EDGES` in `edges.js` is the single source of truth for edge table creation and rule-compiler validation.
- Sources are embedded arrays on Objects; not promoted to first-class.
- Deletion blocks by default; force cascades. System Objects protected.
- No per-edge permission fields; UI handles accident-prevention.

## Open Contradictions

—
