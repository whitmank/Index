---
session: "001"
date: 2026-04-19
author: Claude Sonnet 4.6
---

## Notes

### Tag values are first-class nodes; creation is eager
Tag assignment creates a node if one doesn't exist. Deduplication is a UI/autocomplete concern, not a data model concern. User explicitly rejected treating dedup as an architectural blocker.

### Unified graph model — settled
Three tables replace nine.

- `nodes` — entities: files, URLs, spaces, Hemingway, Science Fiction, devices. Things that have independent existence and can sit on either end of a relationship.
- `edge_types` — relational descriptors: author, genre, contains, sourced_from. Concepts that only exist as characterizations of connections — never on `in` or `out`. Minimal records: `{ id, name }`.
- `edges` — relationships: `{ id, in, out, type }` where `type` references an `edge_types` record.

```js
{ id: edges:⟨ulid⟩, in: nodes:oldman, out: nodes:hemingway, type: edge_types:author }
```

**Key distinctions:**
- Entities vs. relations: the separation between `nodes` and `edge_types` reflects a genuine ontological distinction, not an arbitrary structural one.
- Node type (what a node is) expressed as edges: `{ in: nodes:hemingway, out: nodes:author, type: edge_types:is }` — supports multiple types per node.
- `schema` field on nodes — rendering instruction: `"object"`, `"group"`, `"tag"`, `"device"`.
- `sources` — embedded array on object-schema nodes; intrinsic provenance, not promoted to edges.
- `space: true` replaced by `schema: "group"`.

