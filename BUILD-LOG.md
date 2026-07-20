---
title: Build Log
authors: Authored by Karter Whitman using Claude Opus 4.8
date: 2026-07-20
---

# Index — Build Log

One paragraph per phase: what was built, what was pinned, what surprised
us. The design-log habit from the parent repo, kept.

## Phase 0 — Scaffold

The monorepo per ARCHITECTURE: root `package.json` with the three
workspaces, TS strict everywhere (plus `noUncheckedIndexedAccess`),
React 19 + Vite 6 for the renderer, Electron 39 for the main process.
`npm run dev` builds the backend with esbuild, starts Vite on 5273, waits
for it, then launches Electron; the window opens on a placeholder and
quitting takes everything down. **Pinned:** the main process is bundled
ESM (`dist/main.js`) and the preload bundled CJS (`dist/preload.cjs`) — a
sandboxed preload has no module loader, so it cannot be ESM; devtools
open only when `INDEX_DEVTOOLS` is set, because a detached inspector on
every launch buries the window. **Surprised us:** npm 11's `allowScripts`
gate meant Electron never unpacked; its bundled `extract-zip` then
extracted one file and silently stopped, so the binary was laid down with
`unzip` and `path.txt` written by hand. If `node_modules` is ever blown
away, expect to repeat that.

## Phase 1 — app/database

`types.ts` (the wire shapes), `schema.surql` (§1.1–1.3), the connection
lifecycle (spawn / poll / connect / stop, Electron-free so tests can use
it), the repository under `records/` with soft-delete filtering baked
into every read, `changes.ts` (all pairs in one transaction, undo = the
same change with pairs swapped), idempotent seeds, and the query-predicate
compiler. `npm run test:db` spins up a throwaway store on port 8499 and
walks create → rename → tag → place → delete → undo → undo → undo,
asserting the reads at each step: 20 assertions, all green.

**Pinned here:**

- The wire shape calls a connection's endpoints `source`/`target`
  (the glossary's words); only the repository knows they are stored as
  SurrealDB's `in`/`out`.
- `format` predicates are **not** compiled to SurrealQL. The format ladder
  (§1.6) has one authoritative implementation in `derive.ts`, and writing
  it a second time in SurrealQL would guarantee drift; format predicates
  filter in JS over rows the other predicates already narrowed. Personal
  scale makes this free — DESIGN-CONCEPT §8 blesses full scans.
- Query-matched membership skips `system` items, so `~` (`{ all: true }`)
  does not list itself and `public` among the user's things. An explicit
  arrow still admits them.
- The timeline parameters on a set live in fields named
  `timeline_partition` (`date` | `created_at`) and `timeline_direction`
  (`forward` | `backward`), matching §1.4's table.
- Labels sit outside the change model. They carry no user-visible state
  of their own, so there is nothing about one to undo; `ensureLabel`
  upserts on first use.

**Surprised us:** three places where SurrealDB 3.0.4 disagrees with the
spec's SurrealQL, none of them design changes —

1. `FLEXIBLE` must follow `TYPE`, not precede it (`TYPE option<object>
   FLEXIBLE`). The spec's 2.x ordering is a parse error.
2. `query` needs `FLEXIBLE` at all. Without it a `SCHEMAFULL` object field
   silently drops the predicate's contents; the spec only marks
   `resources.*.cached`.
3. A relation record must be *born* a relation. `UPSERT connections:x
   CONTENT {…}` mints an ordinary record and then fails the table's
   `TYPE RELATION … ENFORCED` check, so creation goes through
   `INSERT RELATION INTO connections`, and updates through
   `UPDATE … CONTENT`. `changes.ts` tells the two apart by `before ===
   null`, which it already knows.

`created_at` survives an UPSERT that re-sends it, so `READONLY` stayed in
the schema as written.
