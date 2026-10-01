---
author: Claude Opus 4.7
created: 2026-04-19
status: active
completed_stages: [3A, 3B]
remaining_stages: [3C, 3D, 3E, 3F, 3G]
---

# Phase 3 Continuation — Unified Graph Cutover

## Decisions (locked 2026-04-19, dialectical session)

These are the semantic calls that 3C–3G all depend on. A cold agent must
treat these as settled and execute accordingly; do not re-litigate.

### D1. Edge registry: fixed + runtime-creatable

- `SYSTEM_EDGES` is the seed set (classification, field, system, structural).
- **Add a generic `tag` edge** to `SYSTEM_EDGES`
  (`kind: 'generic'`, `display: true`, `editable: true`, `deletable: false`,
  `label: 'Tag'`). This is the home for untyped user tags.
- **Runtime edge creation is supported** (Q1-ii). `createTagType('mood')`
  calls `createEdge(db, 'mood')` — creates a RELATION table + indexes.
- **No separate registry table.** `getAllTagTypes` queries `INFO FOR DB`,
  enumerates RELATION tables, joins with `SYSTEM_EDGES` for seed metadata;
  user-created tables get defaults (`label = name`, `display: true`,
  `editable: true`, `deletable: true`, `kind: 'user'`).
- **`deleteTagType(name)`** runs `REMOVE TABLE <name>` — but only if the
  edge is not in `SYSTEM_EDGES` (system edges are `deletable: false`).

### D2. Twin Objects are removed

`objects:⟨type⟩`, `objects:⟨author⟩`, `objects:⟨medium⟩`, etc. — the edge
twins currently created by `seedSystemEdges` — serve no load-bearing
purpose. Display metadata lives on the registry (Stage 3B). Pill navigation
targets are value Objects, not twins. The only remaining role was schema
references by RecordId, which we replace with edge-name strings.

- `seedSystemEdges` stops creating twins. Only tables + indexes.
- `objects:⟨book⟩`, `objects:⟨document⟩`, `objects:⟨image⟩`,
  `objects:⟨video⟩`, `objects:⟨audio⟩` (the built-in **value** Objects for
  the `type` edge) remain — they are value Objects, not edge twins.
- Schemas on value Objects change from array-of-RecordIds to
  array-of-strings: `schema: ['type', 'author', 'published', 'genre', 'isbn']`.
- Boot-time migration: rewrite `schema` fields to string form, then
  `DELETE objects:⟨X⟩ for X IN SYSTEM_EDGES.map(e => e.name)`. Idempotent.

### D3. `assignTag` signature takes an explicit edge name

- `db:assignTag(objectId, valueObjectId, edgeName)` — caller provides the
  edge. No server-side inference.
- `db:unassignTag(objectId, valueObjectId, edgeName)` — same.
- `db:createTag({ name, edgeName? })` — creates a value Object with
  `tag: true`. If `edgeName` is provided, also RELATEs to an optional
  "home" target (usually absent at creation time).

### D4. Tags exist independently of assignment

- A tag is a value Object in `objects`. Bare tags are allowed.
- **Discovery rule for `getAllTags`:** UNION of
  (a) Objects reachable as `out` of any non-structural edge, and
  (b) Objects with `tag: true`.
- Creating a tag in the library (e.g. "urgent" under the `tag` section) =
  `CREATE objects CONTENT { name, tag: true }`. No edges required until
  first assignment. The `tag: true` marker is the only "type-like" field on
  tag Objects — its purpose is library discovery only, not classification
  (classification is edge membership).
- Value Objects that are *not* library-created (e.g. `objects:⟨andy_weir⟩`
  created as a side effect of setting an author field) do not carry
  `tag: true`. They are discovered via (a).

---

**Stage 3A** (`contains` → `includes` rename) landed and verified 2026-04-19.

**Stage 3B** (new-shape IPC surface) landed 2026-04-19 — additive only, no
renderer call sites yet. Adds:
- `SYSTEM_EDGES` registry metadata (`kind`, `label`, `display`, `editable`,
  `deletable`, `order`) — electron/main/db/edges.js.
- `db:getAllTagTypes` — returns SYSTEM_EDGES entries with display:true
  merged with their twin Object records.
- `db:getAllTags` — returns value Objects reachable via any non-structural
  edge, each annotated with `edges: [edgeName, …]`.
- `db:getAllDevices` — returns device Objects reachable via `sourced_from`.
- Preload bindings: `db.getAllTags`, `db.getAllTagTypes`, `db.getAllDevices`.

**Contradiction surfaced during 3B** — Stage 3C's scope was understated.
The original plan listed 3 view files; grep shows **8 renderer components**
depend on legacy `tags` / `tagTypes` / `typedEdges` shape:

  TagsView, TagEditModal, TagAssignmentSection, TypeSchemaSection,
  ObjectDetailPane, ObjectListView, ImportModal, CreateSpaceModal

New-shape value Objects have **different IDs** than legacy `tag_definitions`
records, so `typedEdges[].in === tag.id` mappings break. The shape-swap in
the store is not transparent. 3C is a real UI refactor, not a store rewiring.

Remaining stages below may be executed in any order that respects their
stated dependencies, but the plan sequence (3C → 3G) minimizes churn.

---

## Stage 3C — Cut renderer reads to new shape

**Larger than original plan.** 8 components depend on legacy shape:
`TagsView`, `TagEditModal`, `TagAssignmentSection`, `TypeSchemaSection`,
`ObjectDetailPane`, `ObjectListView`, `ImportModal`, `CreateSpaceModal`.

**Key semantic shift** — in legacy, `tag.id` is a `tag_definitions:…` ID and
tag-type membership is a `typed` edge row (`in = tag.id, out = tag_types:…`).
In new shape, tag = value Object in `objects`, tag-type = edge *name*. The
IDs are different and the grouping logic must change.

All decisions (D1–D4) above are locked. Execute accordingly; do not re-open.

**Prerequisite — finish 3B model to match D1:**
1. Add `tag` entry to `SYSTEM_EDGES` in `electron/main/db/edges.js`
   (`kind: 'generic'`, `label: 'Tag'`, `display: true`, `editable: true`,
   `deletable: false`, `order: 1`, `description: 'Untyped tag'`).
2. Rewrite `db:getAllTagTypes` (db-handlers.js) to query `INFO FOR DB` for
   RELATION tables; union with `SYSTEM_EDGES` metadata. User-created edges
   get defaults as in D1.
3. Add `db:createTagType(name)` → `createEdge(db, name)`. Idempotent.
4. Add `db:deleteTagType(name)` → guard against `SYSTEM_EDGES`, then
   `REMOVE TABLE <name>`.

**Store (`src/store/index.js`)**:
- Repoint `tags` to `db.getAllTags()` — entries carry `edges: [edgeName, …]`.
- Repoint `tagTypes` to `db.getAllTagTypes()` — entries carry `name`,
  `label`, `editable`, `deletable`, `kind`, `order`. `id` is just the edge
  name string (twins are gone per D2).
- Repoint `devices` to `db.getAllDevices()`.
- Drop `typedEdges`, `taggedEdges` from state.
- Legacy live subscriptions (`onTaggedLive`, `onTagDefinitionsLive`,
  `onTypedLive`, `onDevicesLive`) are removed here — they reference tables
  that 3D will drop. Replace with a debounced `reloadNewShape()` triggered
  by per-edge live subs. Extend preload to expose live channels for every
  edge in `SYSTEM_EDGES` (generic wrapper in live-queries.js that iterates).

**Component rework — group by `tag.edges`, not `typedEdges`** (ids are edge
name strings, not twin Object ids):
- `TagsView.jsx` — replace `systemByTypeId` grouping (line 30) with
  `tag.edges.includes(tagType.name)`. Sections iterate over
  `tagTypes.filter(t => t.display)`. "Types" section = tagType where
  `name === 'type'`; its tags are value Objects with `edges` containing
  `'type'` (book, document, image, etc.).
- Type schema editor — `schema` is now `['type', 'author', 'published', …]`
  (strings). Picker pool = `tagTypes` (name strings as keys). Add/remove
  writes strings.
- `TagAssignmentSection.jsx` — pool from `tags`; group headers from
  `tagTypes`. Same grouping shift.
- `TypeSchemaSection.jsx` — reads `tagTypes` and the active value's
  `schema` (now strings). Resolve each string against `tagTypes` for label.
- `ObjectDetailPane.jsx:53-54, 427-428` — drop `typedEdges`-based fallback;
  rely on `pillsForObject`.
- `ObjectListView.jsx:110-113` — drop `taggedEdges`/`typedEdges`; use
  `pillsForObject[id]` for tag chips.
- `ImportModal.jsx:187` — tag-picker pool from `tags`; apply grouping shift.
- `CreateSpaceModal.jsx:18` — same.
- `TagEditModal.jsx:16-18` — same.
- `SpaceRulesSection.jsx:23-24` — shape-compatible (`tag.id/name`,
  `device.id/name`). Confirm after store repoint.
- `SettingsView.jsx:69` — shape-compatible. Confirm after store repoint.

**Create / delete / assign — IPC rewrite** (per D3, D4):
- `db:createTag({ name, edgeName?, icon?, description? })` — `CREATE
  objects CONTENT { name, tag: true, icon?, description? }`. If `edgeName`
  provided, ensure the edge table exists but do NOT auto-relate. Return the
  created value Object.
- `db:updateTag(id, updates)` — plain `UPDATE <id> MERGE {…}` on the value
  Object. `name`, `icon`, `description`, `schema` (for type Objects),
  `color` if kept.
- `db:deleteTag(id)` — `DELETE <id>`. LIVE SELECT on `objects` drives state.
- `db:assignTag(objectId, valueObjectId, edgeName)` — `RELATE
  <objectId>-><edgeName>-><valueObjectId>`. Idempotent via `unique(in, out)`
  index created by `createEdge`.
- `db:unassignTag(objectId, valueObjectId, edgeName)` — `DELETE FROM
  <edgeName> WHERE in = <objectId> AND out = <valueObjectId>`.
- `db:getTagsForObject(objectId)` — iterate `SYSTEM_EDGES` + user-created
  edges, SELECT out per edge, fetch value Objects. Shape matches
  `getAllTags` output per row.

**Verification:** full UI smoke — tag list, tag assignment, type schema
editor, space rules editor all render and mutate. Create + assign a brand
new tag type via the UI ("mood"), add a tag under it, apply it to an
object, restart app, verify persistence.

---

## Stage 3D — Stop dual-writing, drop legacy tables + twins

**Dependency:** 3C must be fully complete. 3D drops the legacy tables, so
any component still reading them will 500 at runtime.

Do it in a branch with a fresh `~/.index/` snapshot backed up.

**Boot-time migration (electron/main/db/connection.js, top of
`initializeTables`, idempotent):**
1. Before removing twins, rewrite `schema` fields on value Objects from
   RecordId arrays to string arrays:
   `UPDATE objects SET schema = schema.map(|s| type::thing('objects', s).id())` —
   or equivalent: extract the identifier portion from each RecordId. In
   practice iterate in JS: read `schema`, emit the stringified edge name.
2. `DELETE objects:⟨X⟩` for every `X` in `SYSTEM_EDGES.map(e => e.name)`.
   This removes the edge twins (D2).
3. `REMOVE TABLE tag_definitions`, `tag_types`, `tagged`, `typed`,
   `devices` — all wrapped in try/catch for "does not exist".

All three steps run once on boot; safe thereafter.

**`electron/main/db/edges.js`:**
- `createEdge` stops creating the twin Object (step 4 in `createEdge`).
  Only tables + indexes.
- `seedSystemEdges` unchanged — still iterates, but per the above no twins
  are made.
- Add `tag` entry to `SYSTEM_EDGES` (if not already added in 3C prereq).

**`electron/main/db/graph-migration.js`:**
- Delete `mirrorTaggedRow`, `unmirrorTaggedRow`, legacy-walk portion of
  `runGraphMigration`. Keep `seedBuiltinTypeObjects` but rewrite: the
  `schema` it writes to book/document/etc. becomes a string array, not
  RecordId array.
- Rename file to `type-seeding.js`.

**`electron/main/ipc/db-handlers.js`:**
- Delete legacy `db:getTagTypes`, `db:getDevices`, legacy `db:getTagsForObject`,
  legacy `db:createTag`, `db:createTagType`, `db:updateTagType`,
  `db:deleteTagType`, legacy `db:assignTag`/`db:unassignTag`/`db:deleteTag`.
- Replace with the new signatures per D3/D4 (spec'd in Stage 3C).
- Remove `tag_definitions`, `tag_types`, `tagged`, `typed` from the
  `db:getAll` whitelist. `objects`, `includes`, `excludes`, `sourced_from`
  and every edge name remain.
- Strip `mirrorTaggedRow`/`unmirrorTaggedRow` imports.

**`electron/main/db/services/object-service.js:97-137`:**
- `tagAndMirror` → direct per-edge RELATE. Caller passes edge name.

**`electron/main/db/services/space-service.js:56-85`:**
- Delete legacy tag-rule + device-rule branch; `compileRule` is the only
  evaluator.

**`electron/main/db/services/system-tags.js`:**
- Rewrite to query via edge tables (value Object reachable as target of
  edge `X` with matching name).

**`electron/main/db/connection.js`:**
- Delete `renameTagTypes`, `seedTypeSchemas`, `FIELD_TAG_TYPES`,
  `TYPE_SCHEMAS`, `seedTagTypes` import.
- Remove `tag_definitions`, `tag_types`, `devices` from table bootstrap.
- Remove legacy edge tables (`tagged`, `typed`) from DEFINE loop.

**`electron/main/db/live-queries.js`:**
- Remove subscriptions for `tagged`, `typed`, `tag_definitions`, `devices`.

**Preload + renderer:**
- Drop legacy live listener wiring (`onTaggedLive`, `onTypedLive`,
  `onTagDefinitionsLive`, `onDevicesLive`).
- Remove the `db:getAll` whitelist entries for legacy tables.

**Verification:** fresh `~/.index/` boot, pre-populated `~/.index/` boot,
tag CRUD, tag-type CRUD (create "mood", add "happy" under it, assign,
delete), space CRUD, capture, import — full regression pass.
`INFO FOR DB` should show zero tables from { tag_definitions, tag_types,
tagged, typed, devices }, and `SELECT count() FROM objects WHERE id IN [
objects:⟨type⟩, objects:⟨author⟩, … ]` should be 0 for every edge twin.

---

## Stage 3E — Export rewrite

**`electron/main/db/export.js`:** directory layout becomes
```
~/.index/export/
  objects/*.json        (one file per object)
  edges/<edge-name>.json (one file per edge in SYSTEM_EDGES)
```
Drop the per-legacy-table directories. Update `scheduleExport` callers if
the shape of what they write changes (most just trigger; no change).

Delete orphan `~/.index/export/contains_edges.json` from pre-3A exports.

**Verification:** trigger an export; inspect `~/.index/export/` tree.

---

## Stage 3F — Consolidate `SYSTEM_EDGES` / `TYPE_SCHEMAS`

Today `TYPE_SCHEMAS` exists in both `electron/main/db/connection.js:217-223`
and `electron/main/db/graph-migration.js:24-30` (the latter disappears in
3D), and is coupled to `SYSTEM_EDGES` in `electron/main/db/edges.js`. After
3D, only one copy is needed.

Move `TYPE_SCHEMAS` into `electron/main/db/edges.js` (or a new
`schemas.js`); export alongside `SYSTEM_EDGES`. The boot path reads from
one source.

Resolves `docs/BACKLOG.md` item: "SYSTEM_EDGES / TYPE_SCHEMAS sync".

---

## Stage 3G — Documentation + final cleanup

- `DIALECTIC/ORIENT.md` — replace Phase 2 Stage B language; record Phase 3
  complete; note `contains` → `includes`. Move Stage B+ items (rule editor,
  pill nav, OTHER group) into the "Open" section if still deferred.
- `docs/architecture.md:13,176-180` — rewrite data-model paragraph, timeline
  section.
- `docs/ABOUT.md:35,56-69,162,197,230` — remove legacy schema block;
  update export path docs; remove Phase 3 from "Not yet" list.
- `docs/GLOSSARY.md:226-239,280` — strike legacy shape side of tables.
- `docs/BACKLOG.md:14-22` — remove Migration (Phase 3) section; retain
  Stage B+ items.
- `docs/QUICKSTART.md:101-127` — update export path text, project-structure
  file list if renamed.
- Remove any deprecated aliases if any were introduced in 3B–3F (Stage 3A
  introduced none).
- Delete this continuation file.

---

## Quick-reference — original full plan

Archived at: `/Users/karter/.claude/plans/graceful-squishing-chipmunk.md`

Key repeated utilities (unchanged by 3A):
- `escId` in `electron/main/db/surreal-utils.js` for ID interpolation
- `SYSTEM_EDGES` in `electron/main/db/edges.js` — 19 edges, single source
- `normalizeRecord` / `normalizeRecords` in
  `electron/main/utils/surreal-normalize.js` (or `normalize.js`) — flattens
  RecordId at IPC boundary
