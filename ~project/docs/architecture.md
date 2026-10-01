---
title: Architecture — Unified Graph Data Model (Phase 2 Stage B)
author: Claude Opus 4.7
status: current
date: 2026-04-18
precedes: docs/data-model-proposal.md (which describes the end state this migration is converging on)
---

# Architecture

Electron + SurrealDB + React. Main process owns the database and exposes a typed surface over IPC; the renderer is a Zustand store wrapping `window.electronAPI` plus React views.

The data model is mid-migration from a partitioned schema (`objects` / `tag_definitions` / `tag_types` / `devices` with a two-hop `tagged`+`typed` relation) toward a unified graph (one `objects` node table, one RELATION table per edge name). Phase 2 Stage B — this document — makes the new shape **user-facing for reads** while legacy writes remain authoritative via a dual-write policy. Phase 3 will drop the legacy tables.

## Process topology

```
┌───────────────────────┐  IPC   ┌────────────────────────┐
│ Renderer (React)      │ <────> │ Main (Electron)        │
│ - useIndexStore       │        │ - SurrealDB (embedded) │
│ - TagAssignmentSection│        │ - Services + IPC       │
└───────────────────────┘        └────────────────────────┘
         ▲                               │
         │ LIVE SELECT diffs             │
         └───────────────────────────────┘
```

- `electron/preload/index.js` exposes `window.electronAPI.{db, device, fs, …}` and LIVE channels (`onObjectsLive`, `onTaggedLive`, per-edge `onAuthorLive`, …).
- `electron/main/ipc/db-handlers.js` is the IPC façade; it delegates to services in `electron/main/db/services/`.
- `electron/main/db/live-queries.js` opens `LIVE SELECT` subscriptions and forwards diffs over IPC.
- `src/store/index.js` subscribes to those diffs and maintains client-side caches (`objects`, `tags`, `taggedEdges`, `objectTags`, `pillsForObject`, …).

## Data model — current state

Two shapes coexist. Legacy is authoritative; new is kept current by dual-write.

### Legacy shape (writable, still authoritative)

| Table | Role |
|---|---|
| `objects` | leaf records + spaces (`space: true`) |
| `tag_definitions` | tag values (e.g. "Andy Weir", "sci-fi") |
| `tag_types` | tag-type records with `name`, `label`, `schema`, `order`, `display`, `editable` |
| `devices` | device identities |
| `tagged` (RELATION) | `objects -> tag_definitions` |
| `typed` (RELATION) | `tag_definitions -> tag_types` |
| `sourced_from` (RELATION) | `objects -> devices` |
| `contains` / `excludes` (RELATION) | Space membership overrides |

### New shape (readable, grown via dual-write)

| Table | Role |
|---|---|
| `objects` | **everything** — leaf records, spaces, edge Objects, value Objects, device Objects, type Objects |
| per-edge RELATION tables | one table per edge name — `type`, `author`, `genre`, `published`, `isbn`, `publisher`, `creator`, `captured`, `director`, `released`, `duration`, `artist`, `album`, `medium`, `file`, `origin`, `includes`, `excludes`, `sourced_from` |

- **Edge Objects** are records in `objects` whose `id` matches an edge table name, e.g. `objects:⟨author⟩`. They carry display metadata (`label`, `icon`).
- **Type Objects** (e.g. `objects:⟨book⟩`) carry a `schema` array of edge-Object references — this drives pill rendering order.
- **Value Objects** (e.g. `objects:⟨andy_weir⟩`) are the targets of edges. IDs are slugified `[a-z0-9_]+`.

The registry of edges lives in `electron/main/db/edges.js` (`SYSTEM_EDGES`). It is the single source of truth for table creation, migration, and rule-compiler validation.

## Dual-write policy

Every legacy mutation path also writes the new shape:

- `electron/main/ipc/db-handlers.js` — `db:assignTag` / `db:unassignTag` / `db:deleteTag` call `mirrorTaggedRow` / `unmirrorTaggedRow` after the legacy RELATE.
- `electron/main/db/services/object-service.js` — `assignSystemTagsFromSources` uses a `tagAndMirror` helper that RELATEs legacy `tagged` + mirrors to the per-edge table.
- Mirror failures are non-fatal: they warn and continue. Legacy remains authoritative until Phase 3.

`electron/main/db/graph-migration.js` performs the one-time backfill on boot: walks every non-space Object, reads its legacy `tagged`+`typed` pairs, and mirrors each into the corresponding per-edge RELATION table. Idempotent — existing edges are detected and skipped.

## Read paths

### Pill rendering — new shape

`electron/main/db/services/edge-service.js` → `getPillsForObject(db, objectId)`:

1. `SELECT out FROM type WHERE in = <obj>` → type-Object id.
2. `SELECT schema FROM <typeObject>` → ordered array of edge-Object references.
3. For each edge Object: query `SELECT out FROM <edgeName> WHERE in = <obj>` and resolve each target's `name`.
4. Return `[{edge, edgeObjectId, edgeName, targetId, targetName}, …]` in schema order.

The renderer caches this per-object in `store.pillsForObject`. Live channels on pilot edges (`type`, `author`, `genre`, `published`) and the legacy `tagged` channel invalidate the cache on mutation.

### Space membership

`electron/main/db/services/space-service.js` → `evaluateSpace(db, spaceId)`:

```
membership = (rule_or_query_matches ∪ contains_edges) − excludes_edges
```

- If `space.rule` is present, `electron/main/db/rule-compiler.js` → `compileRule(rule)` translates it to a SurrealQL WHERE fragment; `rule` takes precedence over legacy `query`.
- Legacy `space.query` (tag-id lists + device filters) remains as a fallback for un-migrated spaces.
- `contains` / `excludes` edges are applied as explicit overrides on top of the rule match.

### Rule grammar

```json
{
  "all":  [ { "edge": "type",  "to": "objects:⟨book⟩" } ],
  "any":  [],
  "none": [ { "edge": "genre", "to": "objects:⟨textbook⟩" } ]
}
```

- `all` → AND of predicates.
- `any` → OR of predicates (omitted if empty).
- `none` → `NOT (OR of predicates)` (omitted if empty).
- `to === "*"` or missing → "has any outbound edge on this relation".
- Edge names are validated against `SYSTEM_EDGES`; unknown edges throw (prevents SurrealQL injection via predicate).

Compiled output example:

```sql
(id IN (SELECT VALUE in FROM type WHERE out = objects:⟨book⟩))
AND NOT (id IN (SELECT VALUE in FROM genre WHERE out = objects:⟨textbook⟩))
```

## Write paths

All mutations still flow through legacy IPCs:

- Add tag: `db:createTag` (if new) → `db:assignTag` → RELATE `tagged` + mirror via `mirrorTaggedRow`.
- Remove tag: `db:unassignTag` → DELETE `tagged` + unmirror.
- Rename: `db:findOrCreateSystemTag(typeName, newName)` → `db:assignTag(new)` → `db:unassignTag(old)`.
- Space rule: `db:updateSpace(spaceId, { rule })`.

`TagAssignmentSection.jsx` bridges the two shapes: it renders from `pillsForObject` (new) but resolves each pill back to its legacy `tag_definition` via name + edge-name lookup to drive unassign/edit through the existing IPCs.

## Live subscriptions

| Channel | Source table | Primary consumer |
|---|---|---|
| `live:objects` | `objects` | store.objects |
| `live:tagged` | `tagged` | store.taggedEdges, invalidates `objectTags` + `pillsForObject` |
| `live:typed` | `typed` | store.typedEdges |
| `live:tag_definitions` | `tag_definitions` | store.tags |
| `live:contains` / `live:excludes` | structural edges | active-space re-evaluation |
| `live:sourced_from` | structural edge | active-space re-evaluation |
| `live:devices` | `devices` | store.devices |
| `live:type` / `live:author` / `live:genre` / `live:published` | pilot per-edge tables | invalidate `pillsForObject`, re-evaluate active space |

## File map

### Main process

| Purpose | File |
|---|---|
| SurrealDB init + bootstrap data | `electron/main/db/connection.js` |
| Edge registry (`SYSTEM_EDGES`, `addEdge`, `removeEdge`) | `electron/main/db/edges.js` |
| One-time backfill to new shape + dual-write helpers | `electron/main/db/graph-migration.js` |
| Rule → SurrealQL compiler | `electron/main/db/rule-compiler.js` |
| LIVE SELECT plumbing | `electron/main/db/live-queries.js` |
| Legacy migration + schema patches | `electron/main/db/migration.js` |
| Space evaluator (rule + contains − excludes) | `electron/main/db/services/space-service.js` |
| Object creation + system-tag assignment | `electron/main/db/services/object-service.js` |
| Edge reads + `getPillsForObject` | `electron/main/db/services/edge-service.js` |
| System-tag lookup / create | `electron/main/db/services/system-tags.js` |
| Device identity edges | `electron/main/db/services/device-service.js` |
| IPC façade | `electron/main/ipc/db-handlers.js` |
| Preload surface | `electron/preload/index.js` |

### Renderer

| Purpose | File |
|---|---|
| Unified Zustand store (data + live + cache) | `src/store/index.js` |
| Per-object pill UI | `src/components/TagAssignmentSection.jsx` |
| Tag add input | `src/components/TagAddInput.jsx` |
| Space rule editor (stub; Stage B+) | `src/components/SpaceRulesSection.jsx` |

## Phasing

- **Phase 1** (complete): scaffold `SYSTEM_EDGES`, book-only pilot backfill, `getPillsForObject` available behind `debug.*`, live channels on pilot edges.
- **Phase 2 Stage A** (complete): registry expanded to all 19 edges, full-object-set backfill, dual-write on every mutation hot path.
- **Phase 2 Stage B** (current): rule compiler + `space.rule` evaluation, pill rendering cut over to the new shape in the detail pane, `getPillsForObject` promoted to `db.*`.
- **Stage B+** (deferred): rule editor UI, pill-click navigation into edge/value Objects.
- **Phase 3** (deferred): stop dual-writing, drop `tag_definitions` / `tag_types` / `devices` / `tagged` / `typed`, rename `contains` → `includes`.

## Invariants worth knowing

- Legacy IPCs are authoritative through Phase 2. If you see drift between a pill list and the legacy tag list, dual-write failed — check `[ObjectService] mirror failed` / `[GraphMigration]` warnings.
- `rule` wins over `query` on spaces that carry both. This is deliberate — it matches the Phase 3 end state.
- `SYSTEM_EDGES` in `edges.js` must stay in lockstep with `TYPE_SCHEMAS` in `graph-migration.js`. Adding a new edge requires both.
- Type-Object `schema` arrays drive both pill order and "what edges does this type care about". An Object with a pill on an edge absent from its type's schema is today invisible in pills — Stage B+ will expose it under an "OTHER" group.
- Edge names flow into SurrealQL table positions in `compileRule`; they must pass the `KNOWN_EDGE_NAMES` check to prevent injection.
