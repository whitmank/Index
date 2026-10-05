---
title: Item Data Model — App State vs. Resource Data — Implementation Plan
authors: Authored by Karter Whitman using Claude Sonnet 5
date: 2026-08-19
---

# Item data model: separating app state from resource data — implementation & migration

For the implementing agent, in a fresh session. This plan is self-contained —
everything decided is written out below, including the final shapes — but
skim `docs/ARCHITECTURE.md`, `docs/PRODUCT-SPEC.md` §1, and
`docs/ITEM-MODEL-REDESIGN-PLAN.md` first for the surrounding conventions this
plan builds on (SCHEMAFULL, the repository pattern in
`app/database/src/records/`, the change-catalog pattern in
`app/frontend/src/changes/catalog.ts`). This plan supersedes the shapes in
`ITEM-MODEL-REDESIGN-PLAN.md` and the relevant parts of `PRODUCT-SPEC.md`
§1.1, which have not yet been updated to match.

## Context

Over an extended design conversation with Karter (2026-08-19), it became
clear the `Item` record mixed two different kinds of thing in one flat list
of root fields: state the *app* needs to function (bookkeeping, presentation
choices, set machinery) and content that's actually *about the resource* and
gets displayed (its name, description, classification, extracted
attributes, tags). The redesign draws that line explicitly: everything
resource-descriptive moves into one bucket, `data`, and the root of `Item`
is left with only app state.

Several sub-decisions came out of the same conversation, each with real
consequences, each confirmed with Karter directly — not assumed:

- `data` is a plain **object**, keyed by attribute name — not an array like
  the `metadata[]` it replaces. Karter wanted object-lookup performance
  (`data.author`, not `data.find(...)`) and wanted the database itself, not
  a translation layer, to be the source of truth for this shape — no
  facade in `serialize.ts` reshaping columns into an object on the way out.
- Freeform tags (no name, just content) still exist, keyed under a
  **generated id** rather than their own value — chosen specifically to
  avoid two failure modes of using the tag's value as its own key: colliding
  with a real attribute name, and silently losing a duplicate tag.
- `name` must always exist. This is enforced twice: an explicit
  `readonly name: DataEntry` property on the `Data` interface (alongside its
  index signature) gives a compile-time guarantee at every construction
  site, and a SurrealDB `ASSERT` backstops it against anything that bypasses
  TypeScript (migration scripts, manual edits). **Both were tested directly
  against a live SurrealDB 3.0.4 instance during this conversation and
  confirmed working** — see the field defs below, they're not speculative.
- `opens` is renamed `layout`, and its "no override" state is the literal
  string `"default"` instead of `null` — Karter's call: a raw dump of the
  field should be self-explanatory without knowing null means "compute a
  default."
- `system` is dropped entirely. It was `true` for exactly two fixed, known
  ids (`HOME_SET_ID`, `PUBLIC_SET_ID`) — a stored fact that never varies and
  was always computable, which is inconsistent with this codebase's own
  stated principle that roles are computed, not stored, unless there's a
  genuine bootstrapping gap (there isn't one here, unlike `is_set`). A new
  `isSystemId(id)` helper replaces it, mirroring `isItem`/`isConnection`.
- `type` moves into `data` — it's as resource-descriptive as anything else
  there, and its existing shape (`{value, prov}`) already matches
  `DataEntry` almost exactly.
- `query` and `is_set` collapse into one field, `set: SetState | false`,
  where `SetState = true | SetQuery`. They were never two independent
  facts — `is_set` only ever existed to cover the bootstrapping window
  before a set has a real query — so one field with three states (not a
  set / deliberately a set, no filter yet / has a filter) replaces two
  fields that could previously (harmlessly, but redundantly) both be set at
  once. Karter also chose `false` over `null` for "not a set," for the same
  reason as `layout`'s `"default"` sentinel — keeps the union in one type
  family (`boolean | SetQuery`) and makes `Boolean(item.set)` alone answer
  "does this item carry deliberate set-state."

**Before starting:** confirm with Karter that this plan still reflects what
he wants — it was written from a long conversation and hasn't been executed
or re-reviewed since. Don't assume silent approval just because it's written
down. Per his standing instruction (`feedback-batch-schema-changes-before-testing`
in memory): don't run the full test suite or any migration mid-sequence —
check in before running anything beyond a quick typecheck, and ask if more
schema changes are coming before treating this as final.

## Final shapes

```ts
export type AttributeKind = "string" | "number" | "date" | "list";
export type Provenance = "auto" | "user";

/** A name/value statement. `attribute: null` = a freeform tag — the
 * object key it's stored under is a generated id in that case, never its
 * own value (a value collides with a real attribute name; an id can't). */
export interface DataEntry {
  attribute: string | null;
  value: string | string[];
  kind: AttributeKind;
  prov: Provenance;
}

/**
 * A named entry's key is `attribute.toLowerCase()` — matching is
 * case-insensitive everywhere else in this codebase (search, upserts,
 * ownership policy), and an object key has to pick one case to be that
 * canonical form. The entry's own `attribute` field keeps whatever casing
 * it was actually written with, for display.
 *
 * `name` is the one key guaranteed to exist — enforced at compile time
 * (this property, separate from the index signature) and backstopped by a
 * database ASSERT (schema.surql, below). Everything else is optional:
 * absent means unset, the same way `null` did on the old scalar fields.
 */
export interface Data {
  readonly name: DataEntry;
  [key: string]: DataEntry;
}

/** `true` = deliberately created as a set, no filter defined yet
 * (replaces the old `is_set` flag). A `SetQuery` = has a real filter
 * (replaces the old `query` field). One field, three states with `false`. */
export type SetState = true | SetQuery;
export type SetQuery = { all: true } | { and: Predicate[] };

export interface Item {
  /** `items:01J…` — ULID, minted once. */
  id: string;
  /** ISO datetime, immutable — when the item entered the index. */
  date_added: string;
  /** Presentation override. `"default"` means "use the type's own
   * layout" — never null; the cascade checks the literal value instead
   * of computing meaning from absence. */
  layout: string;
  /** false = not a set. See `SetState` above. */
  set: SetState | false;
  /** Everything resource-descriptive and app-displayed: name,
   * display_name, description, date_created, type, extracted
   * attributes, freeform tags. */
  data: Data;
  /** Ordered; resources[0] is primary. */
  resources: Resource[];
  deleted_at: string | null;
}

/** Replaces the stored `system` field — computed from a fixed, known
 * pair of ids, the same pattern as `isItem`/`isConnection`. */
export function isSystemId(id: string): boolean {
  return id === HOME_SET_ID || id === PUBLIC_SET_ID;
}

export interface DataPredicate {
  attribute?: string;
  kind: AttributeKind;
  gte?: string;
  lte?: string;
  eq?: string;
}
export type Predicate =
  | { date: DateRange }
  | { device: string }
  | { format: Format }
  | { arrowTo: string }
  | { data: DataPredicate };
```

Reserved keys inside `data`, all optional except `name`: `display_name`,
`description`, `date_created` (kind `"date"`, plain ISO date string, not a
SurrealDB `datetime`), `type` (`{attribute: "type", value: <schema name>,
kind: "string", prov}` — replaces the old `ItemType` interface, which can be
retired). Everything else is either a schema-declared attribute (keyed by
its own lowercased name) or a freeform tag (keyed by a generated id,
`attribute: null`).

`EndpointSummary` (`{id, name, display_name}`, used for connection-endpoint
display) keeps its own shape — it's a cheap projection, not `Item` itself —
but is now built by reading `endpoint.data.name.value` /
`endpoint.data.display_name?.value ?? null` instead of direct field access.

### Example row

```json
{
  "id": "items:01M082SDNVVG9F28QMH14NBJYD",
  "date_added": "2026-08-17T14:42:40.956Z",
  "layout": "default",
  "set": false,
  "deleted_at": null,
  "resources": [{ "uri": "file:///Users/karter/Books/dune.epub", "name": "dune.epub" }],
  "data": {
    "name": { "attribute": "name", "value": "Dune", "kind": "string", "prov": "auto" },
    "display_name": { "attribute": "display_name", "value": "Dune (1965)", "kind": "string", "prov": "user" },
    "description": { "attribute": "description", "value": "Reread for the third time", "kind": "string", "prov": "user" },
    "date_created": { "attribute": "date_created", "value": "1965-08-01", "kind": "date", "prov": "user" },
    "type": { "attribute": "type", "value": "book", "kind": "string", "prov": "auto" },
    "author": { "attribute": "author", "value": "Frank Herbert", "kind": "string", "prov": "auto" },
    "01j8xr1q7m2k4t9v6w3n8p5y0z": { "attribute": null, "value": "desert-planet", "kind": "string", "prov": "user" }
  }
}
```

## Phase 1 — Database layer (`app/database/src`)

- **`types.ts`**: apply all renames/shapes above. Drop `MetadataEntry`,
  `MetadataPredicate`, `ItemType`; add `DataEntry`, `Data`, `SetState`,
  `DataPredicate`, `isSystemId`. `Item` drops `name`, `display_name`,
  `description`, `date_added`(keep — unaffected), `date_created`, `opens`,
  `query`, `system`, `is_set`, `type`, `metadata`; gains `layout`, `set`,
  `data`.

- **`schema.surql`**, replacing the current `items` field defs (verified
  against SurrealDB 3.0.4 during this conversation — every construct below
  was actually run, not assumed):

  ```
  DEFINE FIELD OVERWRITE date_added ON items TYPE datetime DEFAULT time::now() READONLY;
  DEFINE FIELD OVERWRITE layout     ON items TYPE string DEFAULT "default";
  DEFINE FIELD OVERWRITE set        ON items TYPE bool | object FLEXIBLE DEFAULT false;
  DEFINE FIELD OVERWRITE data       ON items TYPE object ASSERT $value.name != NONE;
  DEFINE FIELD OVERWRITE data.*         ON items TYPE object;
  DEFINE FIELD OVERWRITE data.*.attribute ON items TYPE option<string>;
  DEFINE FIELD OVERWRITE data.*.value     ON items TYPE string | array<string>;
  DEFINE FIELD OVERWRITE data.*.kind      ON items TYPE string DEFAULT "string"
      ASSERT $value IN ["string", "number", "date", "list"];
  DEFINE FIELD OVERWRITE data.*.prov      ON items TYPE string ASSERT $value IN ["auto", "user"];
  DEFINE FIELD OVERWRITE resources  ON items TYPE array<object> DEFAULT [];
  DEFINE FIELD OVERWRITE resources.*.uri    ON items TYPE string;
  DEFINE FIELD OVERWRITE resources.*.name   ON items TYPE string;
  DEFINE FIELD OVERWRITE resources.*.cached ON items TYPE option<object> FLEXIBLE;
  DEFINE FIELD OVERWRITE resources.*.contentHash ON items TYPE option<string>;
  DEFINE FIELD OVERWRITE resources.*.size        ON items TYPE option<int>;
  DEFINE FIELD OVERWRITE deleted_at ON items TYPE option<datetime>;
  DEFINE INDEX OVERWRITE items_date_added ON items FIELDS date_added;
  DEFINE INDEX OVERWRITE items_name       ON items FIELDS data.name.value;
  ```

  Drop entirely: `name`, `display_name`, `description`, `date_created` (and
  its `items_date_created` index), `opens`, `query`, `system`, `is_set`,
  `type`/`type.value`/`type.prov`, `metadata`/`metadata.*.x`. Order matters
  for `FLEXIBLE`: it must come immediately after `TYPE`, before `DEFAULT`/
  `ASSERT` — got this wrong twice live in testing before finding the right
  order, worth flagging so the implementing pass doesn't repeat it.
  `data.*` (the wildcard) validates every dynamic key's sub-shape exactly
  like the old `metadata.*.x` did for array elements — tested directly,
  rejects a bad `kind` the same way. Verify empirically whether an
  `items_date_created`-equivalent index on `data.date_created.value` is
  worth adding (only `listByQuery`'s partition-by-date_created path reads
  it, and only via an equality-after-slice, not a range scan) — not
  load-bearing, personal-scale full scans are already blessed elsewhere in
  this codebase.

- **`records/serialize.ts`**: `ItemRow` becomes
  `{ id, date_added, layout?, set?, data?, resources?, deleted_at? }`.
  `serializeItem` defaults defensively: `layout: row.layout ?? "default"`,
  `set: row.set ?? false`, `data: row.data ?? { name: { attribute: "name", value: "", kind: "string", prov: "user" } }`
  (the same kind of fallback `row.name ?? ""` provided before — the
  guardrail discussed with Karter, not just the DB ASSERT). `itemContent`
  rebuilds `{ date_added, layout, set, data: <rebuild each entry>, resources, deleted_at }`
  — no more separate `name`/`display_name`/`description`/`type`/`metadata`
  keys. `EndpointSummary` construction moves out of this file into
  `records/items.ts` (`getItemDetail`), since building it now requires
  reading into `data`, which this file doesn't otherwise know the shape of
  beyond round-tripping it opaquely.

- **`records/query.ts`**: `compilePredicate`'s last branch destructures
  `predicate.data` instead of `predicate.metadata`; the scan expression
  becomes `array::len(object::values(data)[WHERE ${terms}]) > 0` in place
  of `array::len(metadata[WHERE ${terms}]) > 0` — **tested directly**: this
  correctly matches a freeform tag by value with no key involved, and a
  direct `data[$attribute].value` dot/bracket lookup for a known attribute
  name works too (faster than the old array scan, not slower). `date`/
  `device`/`format`/`arrowTo` branches are unaffected — `date` still
  targets `date_added`, a real top-level column.

- **`records/items.ts`** — the file with the most real logic changes:
  - `timelinePartitionOf`: `set.metadata.find(entry => entry.attribute === TIMELINE_PARTITION_FIELD)`
    → `set.data.timeline_partition?.value` (direct key lookup; the sentinel
    is still stored inside `data`, just addressed by key now instead of
    scanned for).
  - `PLAYS_SET_ROLE`: `query IS NOT NONE OR is_set = true OR <arrows>` →
    `set != false OR <arrows>` — **tested**: `set != false` correctly
    matches both the bootstrap `true` state and a real query object,
    excludes `false`.
  - `listSets`'s `ORDER BY system DESC, date_added ASC`: `system` no
    longer exists as a column. Bind `$home`/`$public` to `HOME_SET_ID`/
    `PUBLIC_SET_ID` and order by `(id = $home OR id = $public) DESC, date_added ASC`
    — verify this boolean-expression form is accepted by SurrealDB 3.0.4
    during implementation (wasn't tested live); if it isn't, sort in JS
    with `isSystemId` after the fetch instead.
  - `searchItems`'s SQL: `string::contains(string::lowercase(name), $term) OR string::contains(string::lowercase(display_name ?? ""), $term)`
    → `string::contains(string::lowercase(data.name.value), $term) OR string::contains(string::lowercase(data.display_name.value ?? ""), $term)`
    — dot-path WHERE filtering on a nested object field was tested directly
    and works.
  - `captionOf`/`matchRank` (JS helpers, same file): `item.display_name ?? item.name`
    → `item.data.display_name?.value ?? item.data.name.value` (both are
    always kind `"string"`, so the cast is safe; consider a tiny
    `stringValue(entry)` helper if this pattern recurs enough elsewhere to
    be worth naming).
  - `getItemDetail`'s `EndpointSummary` construction:
    `{ id, name: endpoint.name, display_name: endpoint.display_name }` →
    `{ id, name: endpoint.data.name.value, display_name: endpoint.data.display_name?.value ?? null }`.
  - `listByQuery`'s `dateField` slice: when `dateField === "date_created"`,
    the target becomes `data.date_created.value` — and since that value is
    already a plain string (not a SurrealDB `datetime`, per `DataEntry.value`'s
    type), the `<string>` cast this line currently applies only to
    `date_added` is unnecessary for this branch.
  - `listMembers`'s `item[itemDateField]` computed-property JS access
    breaks now that `date_created` isn't a same-named top-level property —
    replace with a small local helper:
    `const dateOf = (item: Item, field: "date_added" | "date_created") => field === "date_created" ? item.data.date_created?.value : item.date_added;`
  - `listMemberDates`'s `dayOf`: `item.date_created?.slice(0, 10)` →
    `item.data.date_created?.value?.slice(0, 10)`.

- **`records/sweep.ts`**: `AND system = false` → `AND id != $home AND id != $public`
  with the two ids bound the same way as `listSets`'s replacement above.

- **`records/schemas.ts`**: no changes. Schemas are a separate table;
  `SchemaAttribute`/`Schema` are untouched by this pass, and
  `attributes[0]`-is-the-naming-attribute stays the convention that decides
  which extracted observation becomes `data.name` — that's `extract.ts`
  and `layouts/registry.tsx`'s concern (Phase 2/4), not this file's.

- **`seed.ts`**: rewrite both `SEEDS` entries and the `CREATE ... CONTENT`
  call to the new shape. `~` (home) has a real query → `set: { all: true }`;
  `public` was deliberately-a-set-with-no-filter → `set: true` (replaces
  its old bare `is_set: true`/`query: undefined`). Both seeds' `metadata: [...]`
  timeline sentinels move into `data`, keyed by their own attribute name
  (`data.timeline_partition`, `data.timeline_direction`), alongside a
  required `data.name` entry built from `record.name`. Drop `system: true`
  from the write entirely — `isSystemId` computes it from these two seeds'
  fixed ids. **Also delete the trailing `UPDATE items SET is_set = true WHERE opens IN [...]`
  backfill block** — it exists to migrate rows from an even earlier
  pre-`metadata` shape, and Phase 5's migration script below fully
  supersedes it for any row that still needs it; leaving it in place after
  this change would reference columns (`opens`, `is_set`) that no longer
  exist in the schema.

- **`test/records.test.ts`**: full sweep — `blankItem`-style fixture
  helper, both query-predicate test blocks (`{data: {attribute...}}`
  instead of `{metadata: {attribute...}}`), `home.system`/`publicSet.system`
  assertions → `isSystemId(home.id)`/`isSystemId(publicSet.id)`, `is_set`-
  related assertions → `.set`, the three `upsertSchema` calls are
  unaffected (schemas untouched).

## Phase 2 — Backend (`app/backend/src`)

- **`bridge.ts`**: `parse` IPC verb's return type
  `Promise<Result<{ name?: string; metadata: MetadataEntry[] }>>` →
  `Promise<Result<{ name?: string; entries: DataEntry[] }>>`. This return
  value is a flat list of *candidate* entries from extraction, not the
  stored `Item.data` object itself — it stays an array here; the frontend
  (Phase 4, `lib/intake.ts`/`catalog.ts`) is what folds it into an object.
  Renamed `metadata`→`entries` deliberately, not just the type: "metadata"
  is being retired as a name for this concept everywhere it appears.

- **`ipc/validate.ts`**: `MetadataEntry`→`DataEntry` type-only touches.
  Whatever validates the parse verb's return shape follows the field
  rename above (`.metadata`→`.entries`). Schema-attribute validation
  (`attribute`/`kind`/`display`) is untouched.

- **`services/ingest/extract.ts`**: `Extracted.metadata: MetadataEntry[]`
  → `Extracted.entries: DataEntry[]`; `asEntry`/`toMetadata` (probably
  worth renaming the latter to `toEntries` for consistency, not load-
  bearing) and every `MetadataEntry`/`AttributeKind` type reference follow.
  Internal logic is unaffected by the item-level array→object change —
  extraction always produces a flat candidate list regardless of how the
  eventual `Item.data` stores things; `RULES`, `SYNONYMS`, the
  attributes-[0]-is-the-name convention are all untouched.

- **`services/intake.ts`**: `IntakeResult.metadata: MetadataEntry[]` →
  `IntakeResult.entries: DataEntry[]`; the `{ name, metadata }` destructure
  in `pathsToResources` → `{ name, entries }`.

- **`test/ingest.test.ts`**: heaviest backend test file — `field()`/
  `said()`/`valueOf()`/`namesOf()` helpers and ~15 assertion sites rename
  `.metadata`→`.entries`.

- **`test/relink.test.ts`**: `fields: []`/`metadata: []` item fixture →
  full `data: { name: {...} }` shape.

## Phase 3 — item-modeler (`app/item-modeler/src`)

The pipeline stays well-insulated: collectors → evidence → extraction →
normalization → `resolve-values.ts` all operate on `ResolvedValue`, which
never touched `MetadataEntry` directly and doesn't need to touch `DataEntry`
either. Two files construct the final shape and have real logic changes:

- **`application/apply-modeling-result.ts`**:
  - `let name = item.name` → `let name = item.data.name.value` (cast to
    `string` — `data.name.value` is typed `string | string[]` on
    `DataEntry`, but `name`'s kind is always `"string"`).
  - `writes: Map<string, MetadataEntry>` → `Map<string, DataEntry>`,
    otherwise unaffected — still a map of attribute → entry built up
    across the loop, same as today.
  - `writeFields(item, name, writes)` — **this genuinely simplifies**, not
    just renames. Today it does a two-pass array rebuild (`replaced` via
    `.map()` over existing entries, `added` via `.filter()` for the rest,
    concatenated). With `data` as an object, upserting by key collapses to
    one loop:
    ```ts
    function writeFields(item: Item, name: string, writes: Map<string, DataEntry>): Item {
      if (writes.size === 0 && name === item.data.name.value) return item;
      const data: Data = { ...item.data, name: { ...item.data.name, value: name } };
      for (const [attribute, entry] of writes) data[attribute.toLowerCase()] = entry;
      return { ...item, data };
    }
    ```
  - `sameField(a, b)`'s null-guard (`a !== null && a.toLowerCase() === b.toLowerCase()`)
    is no longer needed at all: a freeform tag's key is always a generated
    id, never a lowercased attribute name, so it can't collide with a
    named write by construction — the guard existed only because the old
    array had to scan and could hit a null-attribute entry; direct object-key
    access can't.

- **`application/ownership-policy.ts`**:
  - `entryFor(item, field)`: `(item.metadata ?? []).find(entry => entry.attribute !== null && entry.attribute.toLowerCase() === field.toLowerCase())`
    → `item.data[field.toLowerCase()]` — direct lookup, same simplification
    as above, same reasoning (a freeform tag can never be at a named key).
  - `mayRename`: `(item.name ?? "").trim()` → `item.data.name.value.trim()`.
  - Everything else (the `Ownership` precedence logic itself, `userFields`/
    `modeledFields` override mechanism) is unaffected — keep it intact per
    the previous plan's own recommendation, this pass isn't the place to
    also simplify that.

- **Type-only renames** (no logic change): `contracts/resolved-value.ts`,
  `contracts/changes.ts`, `normalization/normalize-value.ts`,
  `extraction/language-model/extraction-schemas.ts` — `MetadataEntry`→
  `DataEntry` / `AttributeKind` references.

- **`normalization/field-hints.ts`, `validation/resolve-values.ts`**:
  reference `SchemaAttribute.attribute`/`.kind` — untouched, schemas
  unaffected by this pass.

- **Tests**: `test/item.ts` (shared fixture builder — full rewrite to the
  new `Item` shape: `layout: "default"`, `set: false`,
  `data: { name: {...} }`, drop `system`/`is_set`/`type`/`opens`/`query`/
  `name`/`display_name`/`description`/`date_created` as root fields),
  `test/modeling.test.ts` (`MetadataEntry`-typed `valueOf` helper + ~15
  read sites), `test/evaluation/{score,corpus,run}.ts` and `test/survey.ts`
  (each has its own local `valueOf`-style helper reading `item.metadata`/
  `.name` — same object-key-lookup rewrite applies to each, and the same
  null-guard-no-longer-needed simplification if any of them replicate
  `sameField`).

## Phase 4 — Frontend (`app/frontend/src`)

- **`changes/catalog.ts`** — the heaviest frontend file, real logic
  throughout:
  - `nameOf(item)`: `item.display_name ?? item.name ?? ""` →
    `item.data.display_name?.value ?? item.data.name.value ?? ""` (the
    trailing `?? ""` is now purely a defensive type-narrowing fallback,
    not a real null case — `data.name` is guaranteed).
  - `blankItem()`:
    ```ts
    export function blankItem(dateAdded = today()): Item {
      return {
        id: itemId(),
        date_added: dateAdded,
        layout: "default",
        set: false,
        data: { name: { attribute: "name", value: "", kind: "string", prov: "user" } },
        resources: [],
        deleted_at: null,
      };
    }
    ```
  - `blankSet(name)`: `{ ...blankItem(), name, is_set: true }` →
    `{ ...blankItem(), data: { ...blankItem().data, name: { attribute: "name", value: name, kind: "string", prov: "user" } }, set: true }`.
    Consider a tiny shared `withName(item, name)` helper since `rename()`
    needs the identical upsert.
  - `rename(item, name)`: `{ ...item, name }` →
    `{ ...item, data: { ...item.data, name: { ...item.data.name, value: name } } }`.
  - `setDisplayName`/`setDescription`/`setDateCreated`: same object-spread
    upsert pattern; clearing (passing `""`/`null`) now means *deleting the
    key* from `data` rather than writing `null` to a scalar field — build
    the next `data` by omitting the key (`const { display_name, ...rest } = item.data; ...`)
    rather than setting it to a null-valued entry.
  - `setOpens(item, opens)` → `setLayout(item, layout: string | null)`:
    `null` input now means "reset to `'default'`" instead of writing
    `null`.
  - `setType`/`confirmType`: build/read `data.type` (`{attribute: "type", value, kind: "string", prov}`)
    instead of the old root `ItemType` field; `confirmType`'s
    `item.type ? {...item.type, prov: "user"} : null` → upsert
    `data.type` with `prov: "user"` if present, no-op if `data.type` is
    absent.
  - `parseItem`: `existing = item.metadata ?? []` → `existing = item.data`;
    `has(name)` becomes `Boolean(item.data[name.toLowerCase()]) && !isBlankFieldValue(item.data[name.toLowerCase()].value)`;
    the `written`/`added` two-array rebuild simplifies to direct object
    writes, same pattern as item-modeler's `writeFields` above.
  - `setMetadata(item, metadata)` → `setData(item, entries: DataEntry[])`:
    still takes an array (that's what `FieldsEditor` edits — a working
    list of rows), but the blank-row-drop rule
    (`entry.attribute !== "" || !isBlankFieldValue(entry.value)`) now
    means *don't write that key into `data` at all*, rather than filtering
    it out of an array after the fact.
  - `deleteItem`/`deleteMany`: `item.system` → `isSystemId(item.id)`.
  - `tag`/`relate`/`tagMany`/`untagMany`/`connect`/`place`/`reorder`/
    `setPublic`: all route name display through `nameOf`/`describe`,
    already covered above — no other changes.

- **`views/focus/FieldsEditor.tsx`**: `item.metadata.filter(...)` (known
  vs. misc split) → `Object.entries(item.data)`, excluding the reserved
  keys (`name`, `display_name`, `description`, `date_created`, `type`)
  plus whatever the `exclude` prop already filters (a layout's claimed
  attributes). Draft-row state, `commit`/`update`/`addDraft` move from
  array-splice logic to object-key logic; row `key={`${entry.attribute}-${index}`}`
  becomes `key={dataKey}` (the object key itself — more stable than an
  index, which changes when a row above it is removed). Everything written
  here still carries `prov: "user"` and stays name-driven (per its own
  existing header comment) — this pass still does not add freeform-tag
  entry UI.

- **`layouts/parts/KnownFields.tsx`**: `item.metadata.find(candidate => candidate.attribute?.toLowerCase() === attribute.toLowerCase())`
  → `item.data[attribute.toLowerCase()]`. `upsertByName` collapses from a
  findIndex/map dance to `{ ...item.data, [attribute.toLowerCase()]: { attribute, value, kind, prov: "user" } }`.

- **`views/schemas/SchemaManager.tsx`**: verify during implementation, but
  likely no change — it operates on `SchemaAttribute`/`Schema.attributes`
  (untouched by this pass), not `Item.metadata`/`Item.data`.

- **`lib/spotify.ts`**: `item.metadata` → `item.data`; `upsertByName`
  collapses the same way as `KnownFields.tsx`'s. `SpotifyExpansion.itemPatch: Pick<Item, "type" | "metadata">`
  → `Pick<Item, "data">` — both the type and the extracted fields now live
  in the one bucket, so the patch target collapses from two keys to one.
  The per-song `Item` literal's `name: track.name, type: {...}, metadata: [...]`
  becomes a single `data: { name: {...}, type: {...}, duration: {...}, artist: {...}, release_date: {...} }`.

- **`lib/intake.ts`**: `draftFrom({ resource, type, entries, name }: ...)`
  (per Phase 2's `IntakeResult.entries` rename) is the one place that
  assembles a full `Data` object from the backend's flat extraction list —
  worth writing out explicitly rather than leaving to inference:
  ```ts
  function dataFrom(entries: DataEntry[], type: string | null, name: string): Data {
    const data: Data = { name: { attribute: "name", value: name, kind: "string", prov: "auto" } };
    if (type) data.type = { attribute: "type", value: type, kind: "string", prov: "auto" };
    for (const entry of entries) {
      const key = entry.attribute ? entry.attribute.toLowerCase() : ulid();
      data[key] = entry;
    }
    return data;
  }
  ```

- **`layouts/registry.tsx`**: the cascade's `item.opens && item.opens in layouts`
  → `item.layout !== "default" && item.layout in layouts`. The
  `schema?.attributes.slice(1)`-drop-the-naming-attribute convention is
  untouched — it's about the *schema's* declared order, unrelated to how
  `Item.data` itself is shaped. `KnownField` type (`{attribute, kind}`) is
  unaffected — it's a schema-attribute projection, not read from `data`.

- **`lib/derive.ts`**: `captionOf`: `item.display_name ?? item.name` →
  `item.data.display_name?.value ?? item.data.name.value`. `looksLikeSet`:
  `item.query !== null` → `item.set !== false`. `knownFieldsFor` is
  unaffected (reads `Schema.attributes`, not `Item.data`).

- **`App.tsx`**: `isBlankDraft` — read the full function body during
  implementation (only line numbers were confirmed here: ~798-805), but
  its shape is `item.name.trim() === "" && ... && !item.type && ... && item.metadata.length === 0`,
  which becomes checking `item.data.name.value.trim() === ""`,
  `!item.data.type`, and `Object.keys(item.data).length === 1` (only the
  required `name` key present, and it's blank). Two `item.system` checks
  (lines ~482, ~815) → `isSystemId(item.id)`.

- **`renderers/ImageRenderer.tsx`, `renderers/VideoRenderer.tsx`**:
  `item.display_name ?? item.name` → `item.data.display_name?.value ?? item.data.name.value`.

- **`views/focus/ConnectionComposer.tsx`**: same pattern, two sites
  (endpoint-match display and lookup).

- **`layouts/types/AlbumLayout.tsx`**: `song.metadata.find(candidate => candidate.attribute?.toLowerCase() === "duration")`
  → `song.data.duration`; `song.display_name ?? (song.name || "untitled")`
  → `song.data.display_name?.value ?? (song.data.name.value || "untitled")`.

- **`components/itemActions.ts`, `views/focus/FocusToolbar.tsx`**:
  `item.system` → `isSystemId(item.id)`.

- **`lib/metadata.ts`**: pure value-shape helpers (`blankFieldValue`/
  `isBlankFieldValue`/`coerceFieldValue`) — type-signature-only changes
  (`MetadataEntry["value"]`→`DataEntry["value"]`), no logic changes.
  Consider renaming the file to `lib/data.ts` for consistency with the
  vocabulary sweep — flag it for Karter rather than deciding unilaterally,
  same call the previous plan made about this file.

- **Tests**: `test/parsing.test.ts`, `test/resources.test.ts` — fixture-
  building helpers (`text()`, `bookSchema()`, `declare()`) rewrite to the
  new `Item`/`Data` shape.

- **`debug/uiChecks.ts`**: full pass needed — per the earlier inventory it
  has roughly a dozen sites reading/writing `.metadata`, `.name`,
  `.display_name`, `.system`, `.opens`, `.type` (smoke-check helpers and
  assertions around lines 654–1300); each follows the same swap already
  established above (`.data.x.value`, `isSystemId`, `.layout`, `.set`).

## Phase 5 — Migration script

One combined script, following the established pattern
(`scripts/migrate-member-of-label.ts`, `scripts/migrate-item-model.ts`):
idempotent, spawns its own `surreal` against a `--target` directory, header
comment instructs running with the app closed. For every existing item row:

1. Build `data` from the old scalar fields plus the old `metadata[]` array:
   - `data.name` from `name`.
   - `data.display_name` from `display_name`, only if not null.
   - `data.description` from `description`, only if not null.
   - `data.date_created` from `date_created` (as a plain ISO date string),
     only if not null.
   - `data.type` from `type`, only if not null:
     `{attribute: "type", value: type.value, kind: "string", prov: type.prov}`.
   - Every old `metadata[]` entry: named entries (`attribute !== null`) go
     under `attribute.toLowerCase()`; freeform entries (`attribute === null`)
     go under a freshly generated ulid.
2. `layout` from old `opens` (`null` → `"default"`, else pass through
   unchanged).
3. `set` from old `query`/`is_set`: `query` present → that query object
   unchanged; else `is_set === true` → `true`; else → `false`.
4. Drop `system` — nothing written, it's computed from `id` going forward.
5. `id`, `date_added`, `resources`, `deleted_at` pass through unchanged.

**No additive grace period** — like the previous redesign's `type`/`fields`
reshape, this changes shape *in place*, so the migration must run before
this schema is ever applied to real data. Given the scope (every item field
is touched, in one pass, with no rollback path once run), **test against a
copy of `~/.index/surreal` first** — copy the directory, point `--target` at
the copy, open the app against the copy and confirm it looks right, only
then run against the real one, and only with Karter's explicit go-ahead.
His real store has months of items in it.

## Phase 6 — Verification

Typecheck (`npm run typecheck`) freely during implementation as a sanity
check after each phase. Hold off on the full `npm test` suite and the
migration script itself until every phase above is complete and Karter has
confirmed no more schema changes are coming — per his standing instruction,
don't run either automatically. At that point: `npm run typecheck` across
all four workspaces, `npm test` (full suite), then the migration dry-run
against a copy as described above, then — only with explicit go-ahead —
against the real `~/.index` (app closed).
