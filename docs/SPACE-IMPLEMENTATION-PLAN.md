---
title: Space — Implementation Plan
authors: Authored by Karter Whitman using Claude Sonnet 5
date: 2026-08-22
---

# Space: dynamic, rule-based sets — implementation plan

For the implementing agent, in a fresh session. This plan is self-contained —
everything decided is written out below — but skim `docs/ARCHITECTURE.md`,
`docs/DESIGN-CONCEPT.md` §3 and §6, and `docs/ITEM-DATA-MODEL-PLAN.md` first
for the surrounding conventions this builds on (the repository pattern in
`app/database/src/records/`, the change-catalog pattern in
`app/frontend/src/changes/catalog.ts`, commit-on-settle in
`app/frontend/src/components/SettleInput.tsx`).

Written from an extended design conversation with Karter (2026-08-22), each
decision confirmed with him directly. **Before starting: confirm with Karter
that this plan still reflects what he wants** — per his standing instruction
(`feedback-batch-schema-changes-before-testing` in memory), don't run the
full test suite or any destructive step mid-sequence; check in before
running anything beyond a quick typecheck.

## Context

"Space" is the user-facing name for a feature that already exists underneath:
`Item.set`, a stored predicate that makes an item a dynamic container —
membership = **query ∪ arrows** (DESIGN-CONCEPT §3's union rule, unchanged).
"Books" is a Space whose query is `type = book`; "Music" is `type ∈
{album, song, artist}`; a Space still accepts manual drag-in curation exactly
like any set does today, because it *is* the same mechanism.

What's missing is not the concept but the surface: no UI anywhere constructs
a query-bearing `set`, the grammar can't express OR/NOT (only a flat AND),
and matching logic is currently split across two independent, hand-written
SQL code paths (the set-query compiler in `records/query.ts`, and
`searchItems`'s own `string::contains` query) — a third would fragment it
further. This plan:

1. Extends the grammar to a fully nestable AND/OR/NOT boolean tree.
2. Replaces both existing SQL-filtering code paths with **one JS evaluator**
   that every "does this item match" question routes through — sets,
   search, and timeline-partition slicing alike.
3. Builds the rule-builder UI and wires ⌘⇧N as Space's creation gesture.

### Decisions, each confirmed directly (not assumed)

- **Space is UI copy only.** Internal code keeps `set`, `SetQuery`,
  `blankSet`, `listSets`, `PLAYS_SET_ROLE`, etc. exactly as named — no
  code-level renaming sweep. Only user-facing strings say "Space."
- **Grammar becomes a recursive boolean tree**, not a flat AND-list —
  needed for cases like J-rock = `genre:rock AND lang:Japanese`, or
  excluding something with NOT. Nesting objects inside objects makes
  grouping syntactic (however deep you nest the JSON) rather than relying
  on operator-precedence rules, so `(A AND B) OR (C AND D)` is directly
  expressible and there's no ambiguous case to resolve.
- **Execution moves entirely into JS/TS**, off SurrealQL compilation.
  Only two of five predicate kinds were ever indexed to begin with
  (`date_added`, `data.name.value`); `format` was *already* JS-only,
  specifically to avoid a second implementation of format detection
  drifting from `derive.ts`. Arbitrary OR/NOT breaks the old
  "SQL narrows, then AND a JS format-filter on top" split — OR doesn't
  decompose that way. Personal scale (DESIGN-CONCEPT §8) already blesses
  full scans for exactly this kind of freeform matching.
- **One evaluator replaces two independent SQL filters.** `searchItems`'s
  bespoke `string::contains` query and the set-query compiler become the
  same `matches()` call — `contains` becomes a `data`-predicate operator so
  search *is* a `SetQuery`, not a parallel mechanism. Ranking (exact >
  prefix > substring, shorter-first) stays a distinct JS sort step applied
  *after* matching — a display-order concern, not a matching concern.
- **Timeline-partition slicing folds into the same evaluator** by
  composing an extra predicate onto the stored query at call time
  (`{ and: [storedQuery, dateOrDataPredicate] }`), replacing the bespoke
  `.filter()` pass currently in `listByQuery`. `public`'s arrow-`created_at`
  partitioning stays separate — it's "which arrows were drawn on this day"
  (curation history), not "does this item's content match a rule," a
  different question entirely.
- **List-kind attributes match "any element."** `genre: ["rock",
  "alternative"]` satisfies `genre eq "rock"` — matches how people actually
  think about multi-valued tags.
- **Attribute entry autocompletes** from schema-declared attributes ∪
  attribute names already in use across items, but still accepts freeform
  typing for a new one.
- **Creation is direct-enter, not Focus.** ⌘⇧N mints a blank Space
  (`blankSet("")` — already the bootstrap `set: true` state) and enters it
  directly as a place, skipping the Focus/"About" overlay entirely. Its
  bootstrap empty state (`set === true`, no query yet) shows the rule
  builder inline in place of the ordinary "nothing yet" message — you land
  ready to build the rule with no extra click. Once a real query exists,
  later visits show members (or a plain empty state), and the builder
  moves behind a toolbar "Edit rule" action.
- **Edits commit on settle** — one undoable `Change` per condition
  add/edit/remove, the same discipline as every other field in this app
  (`SettleInput`, DESIGN-CONCEPT §6). Nothing is written for an
  incomplete/invalid row, mirroring `FieldsEditor`'s blank-row-drop rule.
- **Discard-on-abandon extends to entered places.** Today only a trail
  entry reached via `open(id, true)` (Focus-opened) is eligible for
  discard-if-still-blank (`App.tsx`'s `arriveAt`); an *entered* place never
  is. Since Space creation now enters directly, this needs generalizing —
  see Phase 5.

## Final shapes

```ts
// app/database/src/types.ts

export interface DataPredicate {
  /** Absent matches any attribute — a freeform-tag search. */
  attribute?: string;
  kind: AttributeKind;
  eq?: string;
  /** Substring match, case-insensitive — what unifies `searchItems` into
   * this grammar instead of its own SQL. */
  contains?: string;
  gte?: string;
  lte?: string;
}

export type Predicate =
  | { date: DateRange }        // targets date_added
  | { device: string }
  | { format: Format }
  | { arrowTo: string }
  | { data: DataPredicate };

/** Recursive: each combinator's children are `SetQuery` itself, not a flat
 * `Predicate[]` — arbitrary nesting, arbitrary depth. */
export type SetQuery =
  | { all: true }
  | { and: SetQuery[] }
  | { or: SetQuery[] }
  | { not: SetQuery }
  | Predicate;
```

`SetState = true | SetQuery` and `Item.set: SetState | false` are unchanged.

```ts
// app/database/src/query/evaluate.ts — replaces the whole SQL compiler

export interface MatchContext {
  /** targetId -> ids with a live `member of` arrow into it. Built once per
   * evaluation pass (buildContext), not per item — the one predicate kind
   * that needs data beyond the item being tested. */
  arrowSources: Map<string, Set<string>>;
}

export function matches(query: SetQuery, item: Item, ctx: MatchContext): boolean {
  if ("all" in query) return true;
  if ("and" in query) return query.and.every((sub) => matches(sub, item, ctx));
  if ("or" in query) return query.or.some((sub) => matches(sub, item, ctx));
  if ("not" in query) return !matches(query.not, item, ctx);
  return matchesPredicate(query, item, ctx);
}
```

## Phase 1 — Database layer (`app/database/src`)

Module layout for this phase — `records/` stays entity-shaped (one module
per stored record type, exactly what it already is); `query/`, `sets/`,
`search/` are new, top-level, *functional* siblings of `derive.ts`/
`changes.ts`/`seed.ts`/`db.ts` — none of the three is a record type (a
Space isn't a table, it's an item with a field set), so none belongs
inside `records/`. `query/` is the shared foundation; `sets/` and
`search/` both consume it and never depend on each other:

```
app/database/src/
  records/
    items.ts        -- trimmed; gains listLiveItems
    connections.ts   -- gains one small lookup for query/'s arrowTo predicate
    labels.ts
    schemas.ts
    serialize.ts
    sweep.ts
    index.ts
  query/             -- NEW: the shared matching primitive
    evaluate.ts        -- matches, matchesPredicate, matchesData, matchesEntry, valueSatisfies (pure)
    context.ts          -- buildContext, collectArrowTargets (calls records/, runs no SurrealQL itself)
    index.ts
  sets/              -- NEW: Space-specific — roles, membership, partitioning
    membership.ts       -- listSets, listMembers, listByQuery, listMemberDates,
                            listArrowsInto, listPlacesAmong, PLAYS_SET_ROLE
    index.ts
  search/            -- NEW
    search.ts            -- searchItems, listDataAttributes, ranking helpers
    index.ts
```

- **`types.ts`**: apply the grammar shapes above. `DataPredicate` gains
  `contains`; `SetQuery` becomes the five-variant recursive union. Nothing
  else in `Item`/`Data`/`SetState` changes.

- **`records/items.ts`**: delete `PLAYS_SET_ROLE`, `listSets`,
  `listMembers`, `listMemberDates`, `listArrowsInto`, `listPlacesAmong`,
  `listByQuery`, `queryOf`, `searchItems`, `matchRank`/`nameOf`/
  `displayNameOf`/`captionOf` (all move out — see `sets/` and `search/`
  below; `captionOf` is used by both, so it becomes an exported helper
  from `search/search.ts` and `sets/membership.ts` imports it from there,
  or lands in a small shared spot if that gets awkward — check during
  implementation). What's left (`getItem`, `getItemDetail`,
  `getItemIncludingDeleted`, `listItems`, `listItemsWithResources`,
  `timelinePartitionOf`, `TIMELINE_*_FIELD`) is plain per-item CRUD/reads,
  the same character as `connections.ts`/`labels.ts`/`schemas.ts`. Add:
  ```ts
  /** Every live item, unfiltered otherwise — the candidate set query/
   * and search/ scan in JS. The one remaining SQL query underneath both;
   * soft-delete exclusion stays cheap and in SQL, everything else moves
   * to matches(). */
  export async function listLiveItems(): Promise<Item[]> {
    const db = getDb();
    const [rows] = await db.query<[ItemRow[]]>(`SELECT * FROM items WHERE ${LIVE}`).collect();
    return rows.map(serializeItem);
  }
  ```

- **`records/connections.ts`**: add one small lookup, kept narrowly scoped
  so `query/` never has to depend on `sets/` for it:
  ```ts
  /** Source ids with a live `member of` arrow into `targetId` — what a
   * `{ arrowTo }` predicate (query/) needs. Distinct from listArrowsInto
   * (sets/membership.ts), which returns full Connection records for
   * position/order display; this returns just the ids a boolean check
   * needs. */
  export async function listArrowSourcesInto(targetId: string): Promise<string[]> {
    const db = getDb();
    const [rows] = await db
      .query<[unknown[]]>(
        `SELECT VALUE in FROM connections WHERE out = $target AND label = ${MEMBER_OF_LABEL_ID} AND ${LIVE}`,
        { target: recordId(targetId) },
      )
      .collect();
    return rows.map(idToString);
  }
  ```

- **`query/evaluate.ts`** — the pure evaluator, no DB access at all:
  - `matches(query, item, ctx)`, recursive, as shown in Final Shapes above.
  - `matchesPredicate(predicate, item, ctx)`: one branch per leaf kind.
    - `date`: `item.date_added.slice(0, 10)` compared lexically against
      `gte`/`lte` (unchanged target field, now a JS string compare instead
      of a SurrealQL slice).
    - `device`: `item.resources.some(r => r.uri.startsWith(devicePrefix(predicate.device)))`
      — same "any resource, not just primary" semantics the old SQL had.
      Reuse `devicePrefix` from `../derive.js` (already imported there
      today).
    - `format`: `formatOf(item) === predicate.format`, reusing
      `formatOf` from `../derive.js` — no behavior change, just relocated
      from a post-filter into the tree.
    - `arrowTo`: `ctx.arrowSources.get(predicate.arrowTo)?.has(item.id) ?? false`.
    - `data`: delegates to `matchesData`.
  - `matchesData(predicate, item)`: attribute given → single lookup
    `item.data[predicate.attribute.toLowerCase()]` (O(1), an improvement
    over the old array scan); attribute absent → scan
    `Object.values(item.data)` (freeform-tag search, same as today).
  - `matchesEntry(predicate, entry)`: `Array.isArray(entry.value) ?
    entry.value : [entry.value]`, then `.some(value => valueSatisfies(...))`
    — the "any element" semantics for list-kind attributes, confirmed with
    Karter. A scalar entry is just a one-element array of itself, so no
    special-casing needed between scalar and list kinds.
  - `valueSatisfies(predicate, kind, value)`: AND together every operator
    actually present on the predicate (`eq`, `contains`, `gte`, `lte`) —
    same `number`/`duration` numeric-vs-lexical comparison rule the old
    `compareTerm` SQL helper used, ported to JS (`Number(value)` compare
    for those two kinds, string compare otherwise). `contains` is
    case-insensitive substring, mirroring `searchItems`'s old
    `string::lowercase`/`string::contains`.

- **`query/context.ts`** — the one piece of `query/` that touches the DB,
  and only by calling into `records/`, never with raw SurrealQL of its
  own:
  ```ts
  export async function buildContext(query: SetQuery): Promise<MatchContext> {
    const targets = new Set<string>();
    collectArrowTargets(query, targets);
    const arrowSources = new Map<string, Set<string>>();
    for (const target of targets) {
      arrowSources.set(target, new Set(await listArrowSourcesInto(target)));
    }
    return { arrowSources };
  }

  function collectArrowTargets(query: SetQuery, into: Set<string>): void {
    if ("and" in query) { query.and.forEach((q) => collectArrowTargets(q, into)); return; }
    if ("or" in query) { query.or.forEach((q) => collectArrowTargets(q, into)); return; }
    if ("not" in query) { collectArrowTargets(query.not, into); return; }
    if ("arrowTo" in query) into.add(query.arrowTo);
  }
  ```
  Called once per `listMembers`/`searchItems` invocation, not once per
  item — this is what keeps the one genuinely indexed predicate kind
  cheap even though everything else now scans in JS.

- **`query/index.ts`**: re-export `matches`, `MatchContext` (from
  `evaluate.ts`), `buildContext` (from `context.ts`).

- Delete `records/query.ts` entirely (`compileQuery`/`compilePredicate`/
  `CompiledQuery`/`Bindings`/`compareTerm`) — search the workspace for
  `compileQuery` to confirm nothing outside it still references the old
  compiler after this phase.

- **`sets/membership.ts`** — everything that moved out of `items.ts`,
  largely unchanged in shape, now calling `matches`/`buildContext`/
  `listLiveItems` instead of the SQL compiler:
  - `PLAYS_SET_ROLE` retires as a SQL fragment; `listSets` becomes a JS
    filter over `listLiveItems()` (`item.set !== false || <has an inbound
    member-of arrow>` — the arrow check needs one more small connections
    lookup, or reuse `listArrowSourcesInto` per-candidate isn't practical
    at scale here, so add a `listMemberOfTargets(): Promise<Set<string>>`-
    style bulk read to `records/connections.ts` alongside
    `listArrowSourcesInto` if a per-item check turns out too chatty —
    verify during implementation).
  - `listByQuery` (moves here from `items.ts`) rewrite: build the composed
    query (`query` alone, or `{ and: [query, partitionPredicate] }` when a
    `partitionDate` is given — `partitionPredicate` is `{ date: { gte,
    lte: partitionDate } }` when `dateField === "date_added"`, else
    `{ data: { attribute: "date_created", kind: "date", gte:
    partitionDate, lte: partitionDate } }`), `await buildContext(composed)`,
    `await listLiveItems()`, filter with `matches(composed, item, ctx)`
    plus the existing `id !== home && id !== public` exclusion. This
    collapses the old clause-building/binding code to a handful of lines.
  - `listMembers`: the manual post-filter block (`if (partition &&
    partitionBy !== "created_at") { items = items.filter(...) }`) is
    superseded by the composed-query approach above and can be deleted —
    `listByQuery` now does that filtering itself, for both
    `date_added`- and `date_created`-partitioned sets.
  - `listMemberDates`, `listArrowsInto`, `listPlacesAmong` move over
    unchanged in logic, just relocated and re-pointed at the new imports.

- **`search/search.ts`**:
  ```ts
  export async function searchItems(term: string, limit = 20): Promise<Item[]> {
    const needle = term.trim().toLowerCase();
    if (!needle) return [];
    const query: SetQuery = {
      or: [
        { data: { attribute: "name", kind: "string", contains: needle } },
        { data: { attribute: "display_name", kind: "string", contains: needle } },
      ],
    };
    const ctx = await buildContext(query); // no arrowTo leaves here; cheap no-op
    const items = (await listLiveItems()).filter((item) => matches(query, item, ctx));
    return items
      .sort((a, b) => { /* unchanged: matchRank, then length, then localeCompare */ })
      .slice(0, limit);
  }
  ```
  `matchRank`/`captionOf`/`nameOf`/`displayNameOf` (local helpers) move
  here with it, unchanged in logic. New:
  ```ts
  export async function listDataAttributes(): Promise<string[]> {
    const [schemas, items] = await Promise.all([listSchemas(), listLiveItems()]);
    const names = new Set<string>();
    for (const schema of schemas) for (const attr of schema.attributes) names.add(attr.attribute);
    for (const item of items) for (const entry of Object.values(item.data)) {
      if (entry.attribute) names.add(entry.attribute);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }
  ```
  Freeform-tag entries (`attribute: null`) are correctly excluded by the
  `if (entry.attribute)` guard — only named attributes are suggestion
  candidates.

- **`records/index.ts`**: drop `compileQuery`/`CompiledQuery` and the
  moved-out `items.ts` exports (`listArrowsInto`, `listMemberDates`,
  `listMembers`, `listPlacesAmong`, `listSets`, `searchItems`); add
  `listLiveItems` (from `./items.js`) and `listArrowSourcesInto` (from
  `./connections.js`).

- **`app/database/src/index.ts`** (the package's top-level public
  surface): add `export * from "./query/index.js";`, `export * from
  "./sets/index.js";`, `export * from "./search/index.js";` alongside the
  existing `export * from "./records/index.js";`.

- **`test/records.test.ts`**: this is the file with the most real coverage
  work — every existing set-query test needs an AND/OR/NOT case added, not
  just a rename, plus splitting/relocating alongside the source move. At
  minimum: an `or` across two `data` predicates (the Music case), a `not`
  wrapping a `data` predicate, a three-level nested tree (the
  J-rock-with-exclusion shape), a `contains` search-equivalent query, a
  list-kind attribute matched by `eq`/`contains` against one of several
  values, and confirmation that `searchItems` and set-query matching
  agree on the same item (same evaluator, so this should be close to a
  tautology once wired — worth asserting anyway as a regression guard).

## Phase 2 — Backend (`app/backend/src`)

- **`ipc/channels.ts`**: add `dataAttributesList: "data:attributes:list"`.
- **`ipc/index.ts`**: `handle(CHANNELS.dataAttributesList, async () => ({
  attributes: await listDataAttributes() }));`, importing
  `listDataAttributes` alongside the existing `@index/database` imports.
- **`bridge.ts`**: add a `data: { attributes: { list(): Promise<Result<{
  attributes: string[] }>> } }` (or fold under an existing namespace if a
  better one already exists by the time this is implemented — check
  current `IndexBridge` shape) branch to `IndexBridge`.
- **`preload.ts`**: `data: { attributes: { list: () =>
  invoke(CHANNELS.dataAttributesList) } }`, one line, matching every other
  entry's shape.

No other backend changes — `matches`/`buildContext` are pure additions
inside `@index/database`, called from the same existing
`listMembers`/`itemsSearch` handlers with no signature changes.

## Phase 3 — Frontend: grammar plumbing (`app/frontend/src`)

- **`store/load.ts`**: `loadDataAttributes(): Promise<string[]>` — thin
  wrapper over `window.index.data.attributes.list()`, mirroring
  `loadSets`'s error-surfacing shape (no pool merge needed — attribute
  names aren't records).

- **`changes/catalog.ts`**:
  - `export function setQuery(item: Item, query: SetQuery): Change` —
    ```ts
    export function setQuery(item: Item, query: SetQuery): Change {
      return swap(item, { ...item, set: query }, `Edit ${describe(item)}'s rule`);
    }
    ```
    One `Change` per commit — the rule builder calls this once per
    settled condition edit (add/edit/remove a row, or restructure a
    group), each independently undoable, never a single change covering
    every edit in one session.
  - `isBlankDraft`-equivalent extension: this function currently lives in
    `App.tsx`, not here (see Phase 5), but note the one-line addition it
    needs: a Space with a real query (`typeof item.set === "object"`) is
    never blank, however empty its name/data/resources look — only
    `item.set === false` or the bootstrap `item.set === true` (no rule
    yet) leave it eligible for the existing blank checks.

## Phase 4 — Frontend: rule builder UI

New directory `app/frontend/src/views/space/` (or alongside the existing
view directories at whatever level `canvas`/`list` sit — match that
convention):

- **`RuleBuilder.tsx`**: renders/edits a `SetQuery` bound to a Space item.
  Nested-group interaction model (Gmail/Notion/Airtable-style — the
  standard shape for this exact problem, not invented fresh): a group is
  an AND/OR toggle over its child rows; each row is `[NOT toggle] [field
  picker] [operator, by kind] [value input] [remove ×]`; `+ condition` /
  `+ group` at each group's level, recursively nestable. The field picker
  offers `Format`/`Device`/`Linked to` as special options alongside
  data-attribute autocomplete (`loadDataAttributes`, Phase 3) plus
  freeform entry for a brand-new attribute name.
  - Operators shown depend on the field's kind: `string`/`list` → `eq`,
    `contains`; `number`/`date`/`duration` → `eq`, `gte`, `lte` (a
    "between" affordance is just showing both `gte` and `lte` inputs at
    once, no new grammar); `format` → a fixed dropdown of the `Format`
    union; `device` → free text (device ids aren't enumerable up front);
    `arrowTo` → the same item-search/picker pattern `ConnectionComposer.tsx`
    already uses for picking a target item.
  - Each row/group edit calls `changes.setQuery` (Phase 3) through
    `apply()` once it settles into a valid state — mirrors
    `SettleInput`'s draft-then-commit discipline, just applied to a
    structured value instead of a text field. An incomplete row (field
    chosen, value not yet entered) writes nothing, same as
    `FieldsEditor`'s blank-row-drop rule.
  - Also renders the Space's name as a `SettleInput` bound to
    `changes.rename` — the only other field a Space needs to edit besides
    its rule.

- **Wiring into the stage** (`App.tsx`, alongside the existing `viewMode ===
  "canvas"`/`"list"` branches around line 768):
  ```tsx
  {currentSet?.set === true ? (
    <RuleBuilder item={currentSet} />
  ) : editingRule ? (
    <RuleBuilder item={currentSet} onDone={() => setEditingRule(false)} />
  ) : viewMode === "canvas" ? (
    <Canvas ... />
  ) : (
    <List ... />
  )}
  ```
  `editingRule` is a small piece of local state toggled by the toolbar
  button below — the builder always replaces the stage entirely rather
  than overlaying it, consistent with "one surface at a time on the
  stage" (this file's own header comment).

- **"Edit rule" toolbar button**: in the header's `.bar-icon` group
  (`App.tsx`, next to the existing view-mode toggle around line 753),
  rendered only when `typeof currentSet?.set === "object"` (a Space with
  a real query already — the bootstrap case doesn't need this button
  since it's already showing the builder). Toggles `editingRule`.

## Phase 5 — Frontend: creation & discard-on-abandon (`App.tsx`)

- **⌘⇧N handler**: add to the existing global-shortcut `useEffect` (the
  one already handling ⌘K/⌘F/⌘L/⌘,/⌘/ with no "are you typing" guard,
  around line 619) — `else if (key === "n" && event.shiftKey) { event.preventDefault();
  const space = changes.blankSet(""); void apply(changes.createSet(space)).then((ok) => { if (ok) enter(space.id, true); }); }`.
  Exact call shape depends on what `apply`'s return value actually is by
  implementation time (check `apply`'s current signature) — the intent is
  "create, then enter with isNew so discard-on-abandon can see it."

- **`enter()` gains an `isNew` parameter**, mirroring `open()`'s existing
  signature (`App.tsx`, around line 222):
  ```ts
  const enter = useCallback(
    (id: string, isNew = false) => {
      const at = path.findIndex((entry) => entry.id === id && !entry.open);
      const trail = at === -1 ? [...path, { id, open: false, isNew }] : path.slice(0, at + 1);
      arriveAt(trail);
    },
    [arriveAt, path],
  );
  ```
  (Confirm the exact current body during implementation — this mirrors
  the shape already used by `open`.)

- **`arriveAt`'s discard condition generalizes** from entries that were
  *opened*-and-new to entries that are simply new, regardless of
  open/entered:
  ```diff
  - if (!entry.open || !entry.isNew) continue;
  + if (!entry.isNew) continue;
  ```
  This is safe precisely because `isNew` already gates it to "created by
  the very gesture that made this trail entry" — widening from `open &&
  isNew` to just `isNew` doesn't risk discarding something a normal
  `enter()` (isNew defaults `false`) ever produces.

- **`isBlankDraft` gains the one-line guard** discussed in Phase 3: a
  Space with a real query is never blank.
  ```diff
    function isBlankDraft(item: Item): boolean {
      const misc = Object.keys(item.data).filter((key) => key !== "name" && key !== "description" && key !== "date_created");
      return (
        (item.data.name.value as string).trim() === "" &&
        misc.length === 0 &&
        item.resources.length === 0 &&
  -     pool.connectionsTouching(item.id).length === 0
  +     pool.connectionsTouching(item.id).length === 0 &&
  +     typeof item.set !== "object"
      );
    }
  ```
  A Space that's still `set === true` (no rule defined) or `set === false`
  can still be judged blank by the existing checks; one with an actual
  `SetQuery` never is, however sparse its name/data look.

## Phase 6 — Vocabulary sweep (UI copy only)

Per Karter's call, this is presentation-only — find and update
user-facing strings that currently say "set" and should say "Space" (the
bootstrap empty-state copy, the "Edit rule" button's title, any tooltip
referencing "the set"), **without** touching identifiers, file names, CSS
class names, or the vocabulary in code comments/docs. Do this pass last,
once the feature works, so it's a pure find-and-replace over rendered
strings rather than something entangled with the functional changes
above.

## Phase 7 — Verification

Typecheck freely during implementation. Hold off on the full `npm test`
suite until every phase above is complete and Karter has confirmed no
more changes are coming (per his standing instruction). At that point:
`npm run typecheck` across all workspaces, then `npm test`, then manual
verification in the running app (per his standing preference — rebuild
and let him drive it himself rather than Playwright-driving Electron):

- ⌘⇧N creates and enters a blank Space; the rule builder shows
  immediately.
- Building `type = book` and navigating away, then back, shows the right
  members.
- Building the Music case (`type` OR across album/song/artist) and the
  J-rock case (`genre` AND `lang`, plus a NOT-excluded case) both produce
  correct membership.
- A list-kind attribute (multi-genre item) matches on any element.
- Abandoning a freshly-created, still-nameless, still-ruleless Space
  (immediate ⌘⇧N then navigate elsewhere) leaves no stray item behind;
  abandoning one after a rule has been given does *not* discard it.
- The command bar's search still ranks/orders results exactly as before
  (regression check on the `searchItems` rewrite).
- Timeline-partition paging (`~`'s day-by-day walk) still shows the
  right members per day after the `listByQuery` rewrite.
