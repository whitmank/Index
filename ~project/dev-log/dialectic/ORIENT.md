---
updated: 2026-05-11
session: "016"
mode: inquiry
author: Claude Sonnet 4.6
---

## Conceptual Context
Index is a personal semantic layer over files and URLs on macOS. Users manage what
things mean, not where they are stored. Hierarchical location is replaced by
multi-dimensional relationships and query-defined groups.

The core navigation principle: any entity can be traversed from any perspective —
subject or object. A book has an author; an author has books. The relationship is
bidirectional and the data model reflects that without privileging either direction.

## Technical Context
Stack: Electron + SurrealDB + React + Zustand + LIVE SELECT.

**Data model — three tables:**

```
nodes       — entities: things with independent existence
              files, URLs, groups, Hemingway, Science Fiction, devices
edges       — relationships: { id, in, out, type }
              type references an edge_types record
edge_types  — relational descriptors: author, genre, contains, sourced_from
              only exist as characterizations of connections; never on in/out
              minimal records: { id, name }
```

**Record shapes:**
```js
// node
{ id: nodes:⟨ulid⟩, name, schema, sources, created_at, updated_at }

// edge
{ id: edges:⟨ulid⟩, in: nodes:oldman, out: nodes:hemingway, type: edge_types:author }

// edge_type
{ id: edge_types:author, name: "author" }
```

**`schema` field** — rendering instruction on every node:
- `"object"` — files and URLs; has `sources`
- `"group"` — user-created collections; explicit membership via `contains` edges; optional `query` field for dynamic membership; membership is the union of both
- `"tag"` — descriptive concepts: Hemingway, Science Fiction
- `"device"` — physical machines; provenance of objects

**Node type** expressed as edges (supports multiple types per node):
```js
{ in: nodes:hemingway, out: nodes:person, type: edge_types:is }
{ in: nodes:hemingway, out: nodes:author, type: edge_types:is }
```

`sources` — embedded array on `object`-schema nodes only; intrinsic provenance.

**Replaces the 0.5 model's nine tables.**

Nothing built yet. This is the settled data model for construction.

## Current Synthesis
Three tables derived from first principles. The separation between `nodes` and
`edge_types` reflects a genuine ontological distinction: entities (things that exist)
vs. relations (concepts that only exist as characterizations of connections). Everything
navigable is a node. Everything relational is an edge, typed by an edge_type record.

## Key Decisions
| Decision | Settled |
|---|---|
| `nodes` — entities only; things that can sit on either end of a relationship | Session 001 |
| `edges` — all relationships; `type` references an `edge_types` record | Session 001 |
| `edge_types` — relational descriptors; minimal `{ id, name }`; never on `in`/`out` | Session 001 |
| Node type expressed as edges, not a field — supports multiple types per node | Session 001 |
| `schema` field — rendering instruction: `"object"`, `"group"`, `"tag"`, `"device"` | Session 001 |
| Group membership — explicit `contains` edges union optional `query` field on the node; logic stays on the node, not promoted to a separate schema type | Session 010 |
| Sources embedded on `object`-schema nodes only — not promoted to edges | Session 001 |
| Tag values created eagerly on assignment; dedup is a UI/autocomplete concern | Session 001 |
| Entities vs. relations is a genuine ontological distinction, not arbitrary structure | Session 001 |
