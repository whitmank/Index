---
session: 015
timestamp: 2026-04-02T23:33:09Z
authored_by: Claude Sonnet 4.6
---

## Type system synthesis

`kind` is dropped entirely. Object type is expressed as an edge tuple:

```
object  ==type=>  'book'
object  ==type=>  'song'
```

The tag type formerly named `kind` is renamed `type`. All tag assignments share the same structural form — `type` is privileged only in that its target tag definition carries a UI schema (an ordered list of suggested tag fields).

Schema lives in the interface layer, not the data model. The object stays flat. The detail pane reads the Type, renders the schema as guided fields, but imposes no data constraint. Objects remain queryable and relational without structural change.

Type is singular by convention, not enforced at the data level. Multiple `type` edges on one object are a UI conflict, not a schema violation.

## decision — 05:10 UTC

Session 015 was full implementation of the type system synthesis. `kind` renamed to `type` at all layers (tag_types registry, IPC, store, UI). `schema` field added to type tag_definitions — an ordered list of tag type IDs. Standard schemas seeded for book, document, image, video, audio on boot.

## synthesis — 05:12 UTC

Schema fields and tag types are the same thing. A book schema is `[tag_types:author, tag_types:published, ...]` — not a new data structure. Tag types are the field system. This resolved the question of where schema metadata lives: it's already in the tag type table, used for both field definition and schema reference.

## decision — 05:14 UTC

`TypeField` unified with `createTag` flow. Previously used `findOrCreateSystemTag` (system-only lookup, null placeholder on unassign) — now uses the same `createTag({ name, system: true, typeId })` path as the tag assignment system. Null placeholder pattern removed from TypeField.

## observation — 05:15 UTC

`TagAssignmentSection` was maintaining its own local `assignedTags` state via direct IPC, bypassing the store. This caused `typeTag` derivation in `ObjectDetailPane` to go stale after tag mutations. Fixed by replacing local state with `store.objectTags[objectId]` and `loadTagsForObject` — all components now read from one source.

## decision — 05:16 UTC

TagsView: Types surfaced as a pinned first-row tab, selected by default. Type values (book, song) show a three-column master-detail with schema editor in the third column. Schema "Add field" input creates new tag types if the name doesn't exist — unified with tag type creation.
