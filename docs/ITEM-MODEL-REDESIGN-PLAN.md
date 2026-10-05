---
title: Item/Schema Data Model Redesign — Implementation Plan
authors: Authored by Karter Whitman using Claude Sonnet 5
date: 2026-08-17
---

# Item/schema data model redesign — implementation & migration

For the implementing agent, in a fresh session. This plan is self-contained
— everything decided is written out below, including the final shapes — but
skim `docs/ARCHITECTURE.md` and `docs/PRODUCT-SPEC.md` §1 first for the
surrounding database/package conventions this plan builds on (SCHEMAFULL,
the repository pattern in `app/database/src/records/`, the change-catalog
pattern in `app/frontend/src/changes/catalog.ts`). When this plan and the
spec disagree, treat this plan as newer and correct — it supersedes the
relevant parts of `PRODUCT-SPEC.md` §1.1 (`items`) and §1.5 (set queries),
which have not yet been updated to match.

## Context

Over an extended design conversation with Karter, the `Item` and `Schema`
data models were reshaped around three ideas: (1) an item's classification
(`type`) and its provenance (`type_source`) are one atomic fact, not two
fields that can drift apart; (2) every value attached to an item — a named
fact like `author` or a freeform tag — is the same kind of thing, differing
only in whether it has a name, and should carry provenance too, so the
item-modeler can finally know who owns a value instead of guessing; (3)
"field," "hidden," and the `name`/`label` split are retired everywhere in
favor of vocabulary the data model actually uses now (`attribute`,
`metadata`, `display`), per Karter's standing rule that the data model is
authoritative and everything downstream derives its terms from it, not the
other way around.

Two exploration passes (same session) produced a complete file-by-file
inventory of every touch point. The change is broad but shallow: almost
everything downstream of `@index/database/types` is a mechanical rename;
the two places with real logic changes are
`app/item-modeler/src/application/apply-modeling-result.ts` and
`ownership-policy.ts`, both of which were written with comments explicitly
anticipating this exact change.

This also folds in the still-unrun `date_added`/`date_created` split from
earlier the same session (`scripts/migrate-date-fields.ts` exists but was
never executed) and the `date_added`/`created_at` merge decided later —
per Karter's explicit direction, everything gets migrated and tested
together, once, at the end, not incrementally per change.

**Before starting:** confirm with Karter that this plan still reflects what
he wants — it was written from a long conversation and hasn't been executed
or re-reviewed since. Don't assume silent approval just because it's
written down.

## Final shapes

```ts
export type Provenance = "auto" | "user";
export type AttributeKind = "string" | "number" | "date" | "list";

export interface ItemType { value: string; prov: Provenance }
export interface MetadataEntry {
  attribute: string | null;   // null = freeform tag
  value: string | string[];
  kind: AttributeKind;
  prov: Provenance;
}
export interface Resource { uri: string; name: string; contentHash?: string; size?: number; cached?: CachedDerivations }

export interface Item {
  id: string; name: string; display_name: string | null; description: string | null;
  date_added: string;        // ISO datetime, immutable, absorbs old created_at
  date_created: string | null; // ISO datetime, mutable, intrinsic to the resource
  opens: string | null; query: SetQuery | null; system: boolean; is_set: boolean;
  type: ItemType | null;
  metadata: MetadataEntry[];
  resources: Resource[]; deleted_at: string | null;
}

export interface SchemaAttribute { attribute: string; kind: AttributeKind; display: boolean } // no label
export interface Schema { id: string; name: string; attributes: SchemaAttribute[] }           // no label

export interface MetadataPredicate { attribute?: string; kind: AttributeKind; gte?: string; lte?: string; eq?: string }
export type Predicate = { date: DateRange } | { device: string } | { format: Format } | { arrowTo: string } | { metadata: MetadataPredicate };
```

## Phase 1 — Database layer (`app/database/src`)

- **`types.ts`**: apply all renames above (`Field`→`MetadataEntry`, `FieldKind`→`AttributeKind`, `FieldPredicate`→`MetadataPredicate`, `SchemaField`→`SchemaAttribute`), `Item.type`→`ItemType`, `Item.fields`→`Item.metadata`, `Schema.fields`→`Schema.attributes`, drop `Schema.label`/`SchemaAttribute.label`, `hidden`→`display` (inverted, default `true`).
- **`schema.surql`**: `type`/`type.value`/`type.prov` object fields; `metadata`/`metadata.*.attribute` (`option<string>`)/`.value`/`.kind`/`.prov`; `schemas.name` (no label); `attributes`/`attributes.*.attribute`/`.kind`/`.display` (`DEFAULT true`); `date_added` → `TYPE datetime DEFAULT time::now() READONLY` (absorbing `created_at`); `date_created` → `TYPE option<datetime>`. Drop the old `date`/`type_source` field defs and the `items_created` index — unlike the earlier `date_added`/`date_created` split, `type` and `fields` are reshaped *in place* (same field name, new shape), so there's no additive "leave the old one alongside" grace period; the migration (Phase 6) must run before this schema is ever applied to real data.
- **`records/serialize.ts`**: `ItemRow`/`SchemaRow` field renames; `serializeItem`/`serializeSchema`/`itemContent`/`schemaContent` all rebuild their objects field-by-field (per the existing "rebuilds rather than passes through" pattern) — each needs the new keys plus `prov` added to every constructed `MetadataEntry`/`ItemType`.
- **`records/query.ts`**: `compilePredicate`'s last branch — destructure `predicate.metadata` instead of `predicate.field`; `attribute` is now optional, so the `string::lowercase(attribute) = ...` term is only added when `attribute !== undefined` (mirrors the existing `date` branch's `terms.length ? ... : null` pattern for "no bounds given"); scan target becomes `metadata[WHERE ...]`.
- **`records/items.ts`**: `TIMELINE_PARTITION_FIELD`/`TIMELINE_DIRECTION_FIELD` are stored as sentinel entries *inside* `Item.metadata` (a config value masquerading as metadata, not real item content) — `timelinePartitionOf` reads `set.metadata.find(entry => entry.attribute === TIMELINE_PARTITION_FIELD)`; these sentinel entries get `prov: "auto"`.
- **`seed.ts`**: the four sentinel field literals (`timeline_partition`/`timeline_direction` × 2 sets) → `attribute`/`prov: "auto"`; the raw `CREATE ... CONTENT` SurrealQL and bound params rename `fields`→`metadata`, `date`→`date_added`.
- **`records/schemas.ts`**: `SchemaInput` renames `fields`→`attributes`.
- **`test/records.test.ts`**: update per the inventory — `blankItem` helper, all `Field`/`SchemaField` literal fixtures, both query-predicate test blocks (`{field: {name...}}`→`{metadata: {attribute...}}`), the three `upsertSchema` calls and their assertions, the `hidden`/`display` inversion in the `withHidden` test.

## Phase 2 — Backend (`app/backend/src`)

- **`bridge.ts`**: `parse` IPC verb's return type `{ fields: Field[] }` → `{ metadata: MetadataEntry[] }` (a cross-process contract — frontend callers in Phase 4 must track this).
- **`ipc/validate.ts`**: `asFieldKind`→`AttributeKind`; `asSchemaField` (explicitly commented "a new property has to be added here too or it silently never arrives") rebuilds `{ attribute, kind, display }`, no `label`.
- **`services/ingest/extract.ts`** — the real logic change:
  - `asField`/the inline literal in `toFields()` both become `{ attribute: observation.key, value, kind, prov: "auto" }` (everything this file produces is machine-derived).
  - `RULES` currently has 4 match rules; rules 2 and 4 match against `field.label`, which no longer exists. **Drop those two rules.** The built-in `SYNONYMS` dictionary (hardcoded, e.g. `isbn: ["isbn13","isbn10"]`) is untouched and independent of `label` — it still provides synonym coverage. What's genuinely lost: a schema attribute named one thing (`code`) matching an observation called something unrelated (`ISBN`) purely via a manually-set label. Under the new model, you'd just name the attribute `ISBN` directly — this is the exact tradeoff already confirmed earlier in the design conversation.
  - `Observation`/`coerce`/`asText` are type-only touches (`Field["value"]`→`MetadataEntry["value"]`, `FieldKind`→`AttributeKind`).
- **`services/intake.ts`**: `IntakeResult.fields: Field[]` → `.metadata: MetadataEntry[]`.
- **`test/ingest.test.ts`**: heaviest backend test file — `field()`/`said()`/`valueOf()`/`namesOf()` helpers and ~15 assertion call sites, per inventory.
- **`test/relink.test.ts`**: `fields: []` → `metadata: []` in the item fixture.

## Phase 3 — item-modeler (`app/item-modeler/src`)

The pipeline is well-insulated: collectors → evidence → extraction → normalization → `resolve-values.ts` all operate on an intermediate `ResolvedValue { field: string; value; kind; provenance }` shape that never touches `Field`/`MetadataEntry` directly. Only one file constructs the final shape:

- **`application/apply-modeling-result.ts`** — the real logic change:
  - All three `writes.set(entry.field, { name: entry.field, value: entry.value, kind: entry.kind })` sites → `{ attribute: entry.field, value: entry.value, kind: entry.kind, prov: "auto" }` (modeler writes are always machine-provenance).
  - `writeFields()`/`sameField()` read `field.name` off *existing* `item.metadata` entries to find a match — since `attribute` can now be `null` (a tag), `sameField` needs a null-guard (a null-attribute entry never matches a named target, so it should just pass through unchanged in the `replaced` map, never compared).
- **`application/ownership-policy.ts`** — this file's own comments predict this exact change ("When provenance is eventually persisted, this is the one function that has to learn about it"). `valueOf()` currently does `entry.name.toLowerCase()` directly — needs the same null-guard, and once `entry.prov` is real, `ownershipOf()` can read it directly instead of falling back to "any non-blank field is the user's." **Recommend keeping the existing `userFields`/`modeledFields` override mechanism intact for this pass** (don't remove `ModelingOptions.userFields` — it's still a valid override, just no longer the *only* signal) rather than expanding scope to a full simplification pass.
- **Type-only renames** (no logic change): `contracts/resolved-value.ts`, `contracts/changes.ts`, `normalization/normalize-value.ts`, `extraction/language-model/extraction-schemas.ts` — all just track `FieldKind`→`AttributeKind` / `Field["value"]`→`MetadataEntry["value"]`.
- **`normalization/field-hints.ts`**, **`validation/resolve-values.ts`**: reference `SchemaField.name`/`.kind` — rename to `SchemaAttribute.attribute`/`.kind` (these were always non-null schema-declaration reads, no nullability concern).
- **Tests**: `test/item.ts` (shared fixture builder — `fields: []`→`metadata: []`), `test/modeling.test.ts` (`Field`-typed `valueOf` helper + 3 literal constructions + ~15 read sites), `test/evaluation/{score,corpus,run}.ts` and `test/survey.ts` (each has its own local `valueOf`-style helper reading `item.fields`/`.name` — same null-guard pattern applies to each).

## Phase 4 — Frontend (`app/frontend/src`)

- **`changes/catalog.ts`**: `blankItem` (`fields:`→`metadata:`); `parseItem` (signature, `existing`/`has`/`filled`/`written`/`added` all shift from `.name` to `.attribute` — extraction-produced entries are never null-attribute, so no new null-handling needed here); `setFields`→`setMetadata` — its "blank row" predicate currently treats an empty `name` as "abandon this row"; under the new model that must become an explicit `attribute === ""` check, since `attribute === null` is now a legitimate (tag) state, not an abandoned row.
- **`views/focus/FieldsEditor.tsx`**: full pass per inventory — draft-row state, `commit`/`update`/`addDraft`, rendered rows all move `.name`→`.attribute` and gain `prov: "user"` on anything written through this editor. **Scope decision: this pass does not add new UI for entering a freeform (attribute-less) tag** — the editor stays name-driven, so everything it writes has a non-null `attribute` in practice; the data model supports `null` but nothing produces it yet. That's deliberately downstream work.
- **`views/schemas/SchemaManager.tsx`** (`FieldsList`): `name`→`attribute` throughout; the eye-icon hidden/shown toggle inverts to `display` (flip the click handler and the aria-label/title copy's sense); drop the (already-unused) `label` property from the draft/save literals — no label input exists in this UI today, so nothing to remove there, just the type.
- **`lib/spotify.ts`**, **`lib/intake.ts`**: `item.fields`→`.metadata`, `upsertByName` helper's `.name`→`.attribute`, schema-creation literals drop `label`, all constructed entries get `prov: "auto"` (Spotify/intake are both machine sources).
- **`layouts/parts/KnownFields.tsx`**, **`layouts/types/AlbumLayout.tsx`**, **`views/focus/Focus.tsx`**: three near-identical `item.fields.find(candidate => candidate.name... === "duration")` sites → `.metadata.find(candidate => candidate.attribute?.toLowerCase()...)`.
- **`layouts/registry.tsx`**, **`lib/derive.ts`**: both declare an identical local `KnownField { name; kind }` type populated from `schema.attributes`; rename its `name`→`attribute` for consistency (a judgment call, not one of the core renamed types, but it's fed directly from `SchemaAttribute.attribute` so keeping `.name` here would reintroduce exactly the vocabulary drift this whole pass exists to remove). `resolveLayout`'s `hidden`-filter (`!field.hidden`) inverts to `field.display`.
- **`App.tsx`**: `isBlankDraft`'s `item.fields.length === 0` → `.metadata.length === 0`.
- **`lib/fields.ts`**: pure value-shape helpers (`blankFieldValue`/`isBlankFieldValue`/`coerceFieldValue`) — type-signature-only changes, no logic changes. Leaving the filename as-is (not renaming to `metadata.ts`) unless Karter wants that too — flag it, don't decide it unilaterally.
- **Tests**: `test/parsing.test.ts`, `test/resources.test.ts` — per inventory, both have local `Field`/`SchemaField`-literal-building helpers (`text()`, `bookSchema()`, `declare()`) that need the same renames, after which most call sites follow mechanically.
- **`debug/uiChecks.ts`**: `checkParsing`'s 6-field schema literal (drop `label` from each), the `bare` item override, and 3 read sites (`value()`, `pool.getItem(...)?.fields`, `reverted?.fields`).

## Phase 5 — Migration script

Replace `scripts/migrate-date-fields.ts` (written earlier, never run) with a single combined script — one migration, matching Karter's "migrate once, at the end" direction — that, run once against `~/.index` with the app closed:

1. Backfills `date_added` from the old `date` field (unchanged from the existing unrun script's logic) and repoints `~`'s `timeline_partition` sentinel value.
2. Absorbs `created_at` into `date_added` (copies the existing immutable timestamp forward, since it's strictly more precise than the day-only `date` value).
3. Reshapes every item's `type: "book"` + `type_source: "auto"` → `type: { value: "book", prov: "auto" }`, and `type: null` stays `null`.
4. Reshapes every item's `fields: [{name, value, kind}]` → `metadata: [{attribute, value, kind, prov}]` — **provenance for pre-existing data has no recorded answer** (this is exactly the gap the whole redesign closes going forward); default to `prov: "auto"` for the backfill, since that's the safe direction (a value later shown to be user-owned can still be edited/confirmed through the normal UI, whereas defaulting to `"user"` would make it un-overwritable by the modeler even if it was actually machine-derived).
5. Reshapes every schema's `fields: [{name, label, kind, hidden}]` → `attributes: [{attribute, kind, display}]`, dropping `label`, inverting `hidden`.

**Follow the established pattern exactly** (`scripts/migrate-member-of-label.ts`): idempotent, spawns its own `surreal` against a `--target` directory, header comment instructs running with the app closed. Given this reshape has no additive safety net (unlike the `date` split, `type`/`fields`/`schemas.fields` change shape *in place*), **test it against a copy of `~/.index/surreal`, not the live directory, before running it for real** — copy the directory, point `--target` at the copy, verify the app opens correctly against the copy, only then run against the real one. Karter's real store has months of items in it — treat this step with real caution, confirm with him before running against the live directory.

## Phase 6 — Verification

Typecheck (`npm run typecheck`) is cheap and fine to run after each phase as a sanity check while implementing. Hold off on the full `npm test` suite and the migration script itself until every phase above is complete. At that point: `npm run typecheck` across all four workspaces, `npm test` (full suite), then the migration dry-run against a copy as described above, then — only with Karter's explicit go-ahead — against the real `~/.index` (with the app closed).

Note for whoever picks this up: Karter was explicit earlier in the conversation that he doesn't want verification (full test suite, migrations) run automatically after each incremental change — check in before running anything beyond a quick typecheck.
