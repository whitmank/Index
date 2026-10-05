---
title: Unified Graph Data Model — Development Proposal
author: Claude Opus 4.7 (transcribing a dialectic with Karter Whitman)
status: proposal
date: 2026-04-18
---

# Unified Graph Data Model

## Framing

This is not a rewrite. It completes a migration the codebase is already mid-way through: collapsing the `objects` / `tag_definitions` / `tag_types` / `devices` distinctions into a single node table, and promoting the two-hop `tagged`+`typed` relation into first-class edge tables — one per edge name.

Most of the architectural vocabulary already exists. Type-Objects with `schema` arrays drive pill rendering today (`connection.js:228–270`). Space membership is already `(rule ∪ includes) − excludes`. The proposal extends those patterns uniformly rather than introducing new ones.

## Vocabulary

- **Object** — a record in `objects`. Every navigable entity.
- **edge** — a relation category (e.g. `author`, `genre`, `includes`). Represented as a SurrealDB RELATION table.
- **edge table** — the SurrealDB RELATION table that stores edge instances.
- **edge Object** — the twin record in `objects` sharing the edge's name. Holds display metadata.
- **edge name** — the string identifier shared by the edge table and the edge Object.

## Core principles

1. Every navigable entity is an Object. One node table.
2. Every semantic relation is an edge. One RELATION table per edge name.
3. Every edge has a twin edge Object in `objects`. Twin is mandatory; fields on it are optional.
4. UI behavior is data-driven. An Object's `type` edge points to a type-Object whose `schema` lists which edges render as pills on its instances.

## Schema

### Node table

```sql
DEFINE TABLE objects SCHEMALESS;
```

| Field | Type | Role |
|---|---|---|
| `id` | `record<objects>` | custom IDs for anchors and edge Objects |
| `name` | `string` | display label; pill text |
| `sources` | `array` | `[{uri, fileType, mime, mtime}]` — embedded |
| `rule` | `object` | Space-playing Objects: predicate tree |
| `schema` | `array<record<objects>>` | type-Objects: which edges render as pills |
| `icon` | `string` | display icon |
| `system` | `bool` | non-deletable |
| `created_at` / `updated_at` | `datetime` | timestamps |

Fields are role-dependent. Collapses today's `tag_definitions` + `tag_types` + `devices` into this single table.

### Edge tables

One RELATION table per edge name, created via helper:

```js
createEdge(name, { icon, description, system } = {}) {
  // 1. DEFINE TABLE <name> TYPE RELATION FROM objects TO objects;
  // 2. DEFINE INDEX <name>_unique  ON <name> FIELDS in, out UNIQUE;
  // 3. DEFINE INDEX <name>_reverse ON <name> FIELDS out;
  // 4. CREATE objects:⟨<name>⟩ SET name=<name>, icon?, description?, system?;
}
```

`(1)` forward index enforces uniqueness and speeds `->edge->` traversal. `(2)` reverse index speeds `<-edge<-` traversal. Every edge gets both.

Exception: `includes` additionally gets
```sql
DEFINE INDEX includes_order ON includes FIELDS in, order;
```
to keep ordered-list retrieval cheap. `includes` rows carry an optional `order: number` field.

### Bootstrap edges

| Edge | Role |
|---|---|
| `type` | Object's primary kind |
| `includes` | manual Space membership (with `order`) |
| `excludes` | manual Space exclusion |
| `sourced_from` | capture provenance (points at device Object) |
| `author`, `genre`, `published`, `isbn`, `publisher`, `creator`, `captured`, `director`, `released`, `duration`, `artist`, `album` | field edges used by built-in type schemas |
| `medium`, `file`, `origin` | legacy system tag types, promoted |

All seeded at first boot with `createEdge()`.

### Per-row edge data

Edges can carry arbitrary per-row fields beyond `in`/`out`:

```sql
RELATE objects:⟨phm⟩->author->objects:⟨andy_weir⟩
  SET added_at   = time::now(),
      added_by   = objects:⟨karter⟩,
      source     = 'safari:og:author',
      confidence = 1.0;
```

Per-row fields describe a specific relation instance (provenance, timestamp, annotation). Per-edge metadata (label, icon, schema membership) lives on the edge Object.

## Worked example — Project Hail Mary

```sql
-- Edge Objects and value Objects
CREATE objects:⟨book⟩      SET name='book';
CREATE objects:⟨andy_weir⟩ SET name='Andy Weir';
CREATE objects:⟨sci_fi⟩    SET name='sci-fi';
CREATE objects:⟨y2022⟩     SET name='2022';

-- Type-Object declares pill schema
UPDATE objects:⟨book⟩ SET schema = [
  objects:⟨type⟩, objects:⟨author⟩, objects:⟨genre⟩, objects:⟨published⟩
];

-- The PHM Object
CREATE objects:⟨project_hail_mary⟩
  SET name='Project Hail Mary',
      sources=[{ uri:'file:///...', fileType:'epub' }];

-- Pills
RELATE objects:⟨project_hail_mary⟩->type     ->objects:⟨book⟩;
RELATE objects:⟨project_hail_mary⟩->author   ->objects:⟨andy_weir⟩;
RELATE objects:⟨project_hail_mary⟩->genre    ->objects:⟨sci_fi⟩;
RELATE objects:⟨project_hail_mary⟩->published->objects:⟨y2022⟩;
```

## Pill rendering

When displaying an Object:

1. Traverse `->type->` to find the type-Object.
2. Read `type-Object.schema` → array of edge Objects in display order.
3. For each edge Object in `schema`, query the matching edge table for outbound edges from the current Object.
4. Render each relation as a pill: **[edge Object's `name`] : [target Object's `name`]**.
5. Any outbound edges not in `schema` render in a secondary "related" section.

## Pill-click navigation

Every pill is two Objects separated by a colon. Both clickable.

- **Click a value** (`Andy Weir`) → navigate to `objects:⟨andy_weir⟩`. Detail view shows inbound edges grouped by edge table.
- **Click a label** (`AUTHOR`) → navigate to `objects:⟨author⟩`. Detail view enumerates the edge's graph-wide activity (`SELECT * FROM author`).
- **Click a type value** (`book`) → navigate to `objects:⟨book⟩`. Detail view shows `SELECT <-type<-objects`.

No conditional logic. Every pill resolves to an Object; every Object has a detail view driven by graph traversal.

## Name collisions

`name` is display-only; uniqueness is not enforced. Two Objects both named "Python" (the snake, the language) coexist under distinct IDs. The UI disambiguates via metadata — their type pills, sources, and context make them obviously different.

## Spaces

A Space is an Object with a `rule` field. Membership:

```
members(S) = evaluate(S.rule)
             ∪ (S ->includes-> objects)   -- manual inclusions
             \ (S ->excludes-> objects)   -- manual exclusions
```

Manual inclusions override rule absence; manual exclusions override rule match. The rule is a starting point; the user has the final say.

### Rule grammar

Flat structure, three quantifiers, uniform predicate shape:

```json
{
  "all":  [ { "edge": "type",   "to": "objects:⟨book⟩" },
            { "edge": "author", "to": "objects:⟨andy_weir⟩" } ],
  "any":  [],
  "none": [ { "edge": "genre",  "to": "objects:⟨textbook⟩" } ]
}
```

Every predicate is `{ edge, to }`. `to` can be a specific Object ID or `"*"` (any target — "has any author at all").

Compiled to SurrealQL by a single evaluator:

```sql
SELECT * FROM objects
WHERE (all predicates match)
  AND (any predicates match OR "any" is empty)
  AND NOT (any none predicates match);
```

### UX affordances

- Space detail view shows the rule (editable), plus lists of manual includes and manual excludes.
- Any Object view offers "Pin to Space" → creates an `includes` edge.
- "Remove from Space" creates an `excludes` edge if the Object matches the rule; otherwise removes the `includes` edge.

## LIVE SELECT

```sql
LIVE SELECT * FROM objects;        -- single node stream
LIVE SELECT * FROM <edge_name>;    -- one per edge table, subscribed lazily by active UI
```

Renderer subscribes to edge tables only while rendering them. Book detail view subscribes to `type`, `author`, `genre`, `published`. Other edges stay silent. Subscription count scales with active UI, not graph vocabulary.

## Deletion

**Block by default.** Deleting an Object with inbound/outbound edges, or referenced in any `schema` or rule, returns an error:

```
Can't delete objects:⟨author⟩ — 247 edges still use it. Delete the edges first, or use Force Delete.
```

**Force Delete cascades.** Removes the Object, all its edges, and strips references from schemas and rules. System Objects (`system: true`) cannot be force-deleted without an explicit override.

No orphan state is ever valid.

## Edit policy

No per-edge permission fields in the data model. All edges are equally editable via the same UI paths. The user is the final authority. Any "protect from accidents" behavior (e.g., confirmation dialog on `type` change) lives at the UI layer, not in the schema.

## System anchors (reserved Object IDs)

| ID | Role |
|---|---|
| `objects:⟨~⟩` | Home space |
| `objects:⟨/⟩` | Root / everything |
| `objects:⟨type⟩`, `objects:⟨medium⟩`, `objects:⟨file⟩`, `objects:⟨origin⟩` | System edge Objects |
| `objects:⟨author⟩`, `objects:⟨genre⟩`, `objects:⟨published⟩`, ... | Seeded field edge Objects |
| `objects:⟨book⟩`, `objects:⟨document⟩`, `objects:⟨image⟩`, `objects:⟨video⟩`, `objects:⟨audio⟩` | Seeded type-Objects with schemas |
| `objects:⟨web⟩` | Default capture device |
| `objects:⟨includes⟩`, `objects:⟨excludes⟩`, `objects:⟨sourced_from⟩` | System edge Objects for structural edges |

All flagged `system: true`; non-deletable via UI without explicit override.

## Migration (idempotent, boot-time)

Following the pattern already established in `connection.js`:

1. **Define edge tables.** For each `tag_types` record, `createEdge(<name>)` — which defines the table, indexes, and edge Object.
2. **Copy `tag_types` → `objects`.** Preserving IDs as `objects:⟨<name>⟩`. Merge metadata into the edge Objects from step 1.
3. **Copy `tag_definitions` → `objects`.** Map `schema` arrays to point at new edge Object IDs.
4. **Copy `devices` → `objects`.** Same pattern.
5. **Flatten two-hop edges.** For each `tagged`+`typed` pair `(X --tagged--> Y, Y --typed--> T)`, emit `RELATE X -> <T.name> -> Y`. Delete originals.
6. **Rename `contains` → `includes`.** Rewrite edge table, repoint consumers.
7. **Rewrite `sourced_from`.** Already an edge; repoint endpoints from `devices` to `objects`.
8. **Drop obsolete tables.** `tag_definitions`, `tag_types`, `devices`, `tagged`, `typed`, `contains` removed after verification.

Each step gated by a "has this migration run?" check. Safe to re-run.

## What changes / what stays

**Changes:**
- `tag_definitions` + `tag_types` + `devices` → absorbed into `objects`.
- `tagged` + `typed` two-hop → single `-><edge>->` traversal per edge.
- `contains` → `includes`.
- LIVE channels scale with active UI rather than being fixed.
- Creating a new edge is a runtime operation (`createEdge()`), not a code change.

**Stays:**
- Type-Objects with `schema` arrays driving pill rendering. Same pattern; references shift to Objects.
- Space membership formula. Same three-source shape.
- Most service-layer APIs. `assignTag(object, tag)` becomes `addEdge(object, edgeName, target)` with identical call sites.
- SurrealDB lifecycle, IPC surface, preload surface. Touched only for channel wiring.

## Recommended implementation order

1. Write `createEdge()` helper and the migration scaffold.
2. Pilot end-to-end on `book` (type-Object, schema, all four field edges, Objects, pills) before running the full migration.
3. Cut over the UI's pill rendering and rule evaluator to read from the new shape.
4. Run the full migration on all existing data.
5. Drop legacy tables last, after a version ships reading from the new shape.

## Decisions locked during dialectic

1. **Sources**: embedded array on the Object; not promoted to first-class.
2. **Type hierarchy**: flat; no `type-of-type` chains. Cross-cutting groupings handled by Spaces.
3. **Edge uniqueness**: `(in, out)` unique on every edge. Reordering `includes` mutates the existing row's `order` field.
4. **Deletion**: block by default, explicit force cascades. System Objects protected.
5. **Name collisions**: allowed. UI disambiguates via metadata.
6. **Rule grammar**: flat `all`/`any`/`none` with `{ edge, to }` predicates; `"*"` wildcard for "any target."
7. **Indexes**: two standard per edge table (forward unique, reverse) plus `includes.order`.
8. **Permissions**: none in the data model. UI handles accident-prevention.

Manual membership affordances (`includes`, `excludes`) are orthogonal to rules and coexist with them in the membership formula.
