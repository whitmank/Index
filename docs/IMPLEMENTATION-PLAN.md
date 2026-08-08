---
title: Implementation Plan
authors: Authored by Karter Whitman using Claude Fable 5
date: 2026-07-20
---

# Index — Implementation Plan

For the implementing agent, next session. You are building Index 0.7 in
this directory. Everything you need is in three documents beside this one —
read them in this order before writing any code:

1. **DESIGN-CONCEPT.md** — the vocabulary and intent. The glossary is
   canon: use its words exactly, in code, comments, and conversation.
2. **ARCHITECTURE.md** — the package structure (Electron; three
   workspaces: `app/database`, `app/backend`, `app/frontend`).
3. **PRODUCT-SPEC.md** — the contract. Schemas, bridge surface, change
   catalog, view affordances. When this plan and the spec disagree, the
   spec wins; when the spec and the concept seem to disagree, stop and
   surface it to Karter rather than resolving silently.

## Ground rules

- **Vocabulary discipline.** Never introduce the word "type" for anything.
  Item, connection, arrow, label, field, resource, format, set, tag, view,
  layout, renderer, position, order, change, history — these mean exactly
  what the glossary says, nothing else does.
- **Attribution.** Every file you create starts with a comment (or
  frontmatter): `Authored by Karter Whitman using <model>` — user first,
  model second.
- **Commits.** Karter's preference (from the parent repo): no
  `Co-Authored-By: Claude` trailer. Small commits per milestone, imperative
  subjects.
- **When under-specified, pin and flag.** Follow PRODUCT-SPEC §4's
  pattern: pick a sensible default, mark it clearly, tell Karter. Don't
  block on questions a default can absorb; don't silently invent design.
- **Out of v1, do not build:** publishing, remote-device resolution, file
  watching, persistent history. The spec already shaped their doorways.

## Phases

Each phase ends with its **done-when** demonstrably true before the next
begins. Suggested first session: phases 0–2.

### Phase 0 — Scaffold

`git init` this directory (the docs stay at the root). Monorepo
`package.json` with the three workspaces; Electron + Vite + React + TS
wiring per ARCHITECTURE (dev script: Vite serving the renderer, Electron
loading it; `main.ts` skeleton); `typecheck` script per workspace and at
the root. Pin: TS strict, React 19, surrealdb SDK v2.x, sharp, epubjs,
marked, dompurify (versions from the parent repos are known-good).

**Done when:** `npm run dev` opens a window rendering a placeholder;
quitting exits cleanly; `npm run typecheck` passes.

### Phase 1 — `app/database`

`types.ts` (wire shapes: Item, Connection, Label, Change, the query
predicate object — PRODUCT-SPEC §1); `schema.surql` verbatim from spec
§1.1–1.3; connection lifecycle (spawn/poll/connect/stop — spec §2.1 steps
1–2, callable outside Electron for tests); repository (`records/`:
reads always filtering `deleted_at`, arrow upsert rule; `changes.ts`:
transactional apply, pairs swapped = undo); seed `~` and `public`
idempotently; query-predicate compiler (§1.5).

**Done when:** a node test script (no Electron) spins up the db, applies
a create→rename→tag→delete→undo sequence of changes, and asserts reads
at each step, including soft-delete invisibility and seed presence.

### Phase 2 — `app/backend`

Main-process lifecycle (spec §2.1 complete); typed preload bridge
exposing exactly the §2.2 surface; `res://` and `thumb://` protocols;
services: resolver (local device + web), derivations (sharp thumbnails,
link-metadata scrape with caps — port the kwhitman.xyz previews code,
it's proven), intake (`pathsToResources`), gc (retention sweep).

**Done when:** from the renderer devtools console, `window.index` can
apply a change and read it back; an `<img src="res://…">` of a local
photo renders; `thumb://` mints and serves a cache file; gc logs a sweep.

### Phase 3 — store, changes, history

`store/` (record pool + selectors), `changes/` (every constructor in
spec §3.3, one intention each), optimistic apply with revert-on-err,
session history with `⌘Z`/`⇧⌘Z` and the text-input guard.

**Done when:** a temporary debug panel can run create / rename / tag /
place / delete and undo each; the pool, the db, and history agree after
every step (verify via Phase 1's read paths).

### Phase 4 — views

Build in this order, each usable before the next starts:

1. **Canvas** — nodes with image derivations, hover preview, drag → place,
   click stub. Port the parent repo's physics decisions (single spring,
   offset-from-center, clamping) — they are settled, not exploratory.
2. **Timeline** — day pages over `~`, swipe/arrows/calendar, skip-empty,
   prefetch. This becomes the launch surface.
3. **Focus** — layout × renderer with `default` layout + image/link/file
   renderers first; editing surface (name, fields, resources, connection
   composer); commit-on-settle; empty-new-item discard; then remaining
   renderers (markdown, video, book) and layouts (movie, photo, note,
   video); opens-as chip; make-public toggle; delete-confirm.
4. **List** — columns, sorts, manual reorder → order, revert chip.

**Done when (per view):** the affordances in spec §3.4 for that view work
against the real database, and every mutation made through it undoes
cleanly.

### Phase 5 — shell & polish

Set switcher and `+` / `⌘N` creation, OS file drop → items via intake,
context menus, keyboard map (§3.7), empty states, error surfacing.

**Done when:** the full loop feels like the product: drop a file on
today, tag it, place it, open it, make it public (toggle only — the set
exists, nothing publishes), walk back a week, undo everything.

## Verification habits

- The Phase 1 test script is the regression anchor — extend it as the
  change catalog grows; run it before every commit that touches
  database or changes code.
- UI phases: manual smoke per the done-whens, plus keep the Phase 3
  debug panel behind a dev flag — it stays useful forever.
- After each phase, a one-paragraph note appended to `BUILD-LOG.md`
  (create it): what was built, what was pinned, what surprised you. The
  parent repo's design-log habit earned its keep; keep it.

## Hand-back

When phases 0–2 are done (or sooner if something structural surprises
you), summarize state and pinned defaults for Karter before continuing —
the design partnership continues; the plan is the leash, not the owner.
