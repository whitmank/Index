---
session: 027
session_timestamp: 2026-03-16T22:10:02Z
transcript: transcript.md
authored_by: Claude Sonnet 4.6
---

# Session 027 — Log

## Contradictions Surfaced

**Type as field vs. type as edge** — The existing `type: string` field on `tag_definitions` worked for system-managed tag types but foreclosed user-defined types. A string cannot reference a first-class record; it can only name one. The contradiction: the system wanted type to be both a label and a pointer.

**Double-add on tag creation** — After adding a LIVE SELECT subscription for `tag_definitions`, the store's `createTag` action manually pushed to `tags` state AND the live event fired a second push. Two sources of truth for the same mutation.

**`in`/`out` as opaque objects** — `normalizeRecord` only stringified `id`. Edge records' `in` and `out` fields remained SurrealDB `RecordId` objects. The `typedEdges.find(e => e.in === tagId)` comparison silently failed — no match, no error, tags just didn't group.

## Contradictions Resolved

**Type as edge** — `type: string` on `tag_definitions` removed. A new `tag_types` table holds type records with deterministic IDs (`tag_types:kind`, etc.). A `typed` edge table relates `tag_definitions → typed → tag_types`. A tag may have 0 or 1 type edge. Zero = untyped. The string field is migrated to edges on first boot via `renameTagTypes()`, then unset. `SYSTEM_TAG_TYPES` in `domain/tag-types.js` remains the authority; `seedTagTypes(db)` upserts from it on every startup. System tags use `findOrCreateSystemTag` which now queries via typed edge subquery instead of `WHERE type = '...'`.

**Single source of truth for tags state** — Removed manual `set(state => ({ tags: [...] }))` from `createTag`, `deleteTag`, `updateTag`. LIVE SELECT on `tag_definitions` is now the sole writer to `tags` state, matching the pattern already established for `objects`.

**Edge normalization** — Extended `normalizeRecord` to stringify `in` and `out` fields when present. All edge records (typed, tagged, contains, excludes) now arrive at the renderer with plain string IDs. Existing inline `?.toString?.()` workarounds become harmless no-ops.

## Current Synthesis

Tag types are first-class records. The `tag_types` table carries `name`, `label`, `description`, `system`, `display`, `editable`, `deletable`, `order`. System types are seeded from `SYSTEM_TAG_TYPES`; user types are created freely (non-system, all flags true). Type membership is expressed as a graph edge, not a field — consistent with how all other relationships are represented in this schema.

TagsView groups by traversing `typedEdges` in the store. Untyped tags (no edge) fall under the `∅` section. Typed tags group under their `tag_types` record. The nav column has a single "Types" section label; `∅` is the first entry, typed sections follow, `+ New type` at the bottom.

LIVE SELECT now covers `tag_definitions` and `typed` in addition to the existing five tables. The store is reactive to all tag and type mutations without manual state synchronization.

## Open Contradictions

- **Descriptions not showing until restart** — `description` was added to `SYSTEM_TAG_TYPES` after the initial seed run. `seedTagTypes` uses `UPSERT` so the field will be written on next boot, but cannot be backfilled without a restart. No mechanism to detect a stale seed.
- **`display: false` system tags in space builder** — carried forward from prior session.
- **"All" not appearing at root** — carried forward.
- **Graph edges not rendered** — carried forward.
- **Object detail view not built** — carried forward.
- **`addContains` UI surface** — carried forward.
