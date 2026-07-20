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

## Phase 2 — app/backend

The main process end to end: directories and device config, the SurrealDB
child, `res://` and `thumb://`, the §2.2 handlers behind a typed preload,
and the services — resolver, derivations (sharp thumbnails; the
kwhitman.xyz link scrape ported with the spec's 10 s / 1 MB caps), intake,
gc. Verified from the renderer: intake stamps a uri and derives
`thumbnail, mime`; a change applies and reads back through
`sets.members`; `res://` streams 9.3 MB of a real photo and `thumb://`
mints and serves a 20 KB cache file; the launch sweep logs; quitting
SIGTERMs the database and everything exits.

**Pinned here:**

- **`res://uri/<encoded>`, not `res://<encoded>`.** The spec's form puts
  the encoded uri in the URL's authority. That cannot work: a scheme must
  be registered `standard` for the renderer to `fetch()` it at all (a
  non-standard scheme is blocked by CORS outright), a standard scheme
  requires a non-empty host, and Chromium normalises hosts — while
  resource paths are case-sensitive. A fixed `uri` host with the encoded
  uri in the path survives normalisation. The handler still accepts the
  spec's shape.
- `pathsToResources` also takes an http(s) url. A pasted link is the same
  gesture as a dropped file, and §2.2 gives the renderer exactly one way
  to turn something handed over into a resource; overloading it beat
  inventing a second handler. It also *awaits* derivations rather than
  only warming them, so §2.4's "written into `resources[].cached` by the
  same change" holds.
- `intake.pathForFile` was added to the bridge. Electron removed
  `File.path`, so only the preload (via `webUtils`) can turn a dropped
  File into a path — phase 5's OS drop needs it and nothing else can
  provide it.
- The device table is a hand-rolled ~30-line TOML reader. It parses one
  `self` key and a `[mounts]` section of strings, which is shorter and
  easier to trust than a dependency, and it ignores anything it doesn't
  understand.
- Only workspace code is bundled into `dist/main.js`; third-party packages
  stay external. Bundling them put cheerio's CommonJS `iconv-lite` inside
  an ESM bundle, where its dynamic `require` died on load.
- Renderer console messages are forwarded to the main process's stdout in
  development, so one log tells the whole story.

**Surprised us:**

1. **A websocket connect never settles in Electron's main process when
   nothing is listening yet.** The readiness poll from §2.1 — open a
   throwaway SDK connection, catch, retry — hung forever instead of
   timing out after 10 s: no window, no error, nothing in the log.
   Readiness is now polled over plain HTTP against `/health`, which is
   what that endpoint is for.
2. **`items:⟨public⟩` is really `items:public`.** SurrealDB brackets only
   the ids that need it, and the wire id has to be what the SDK renders
   or ids silently stop matching across the bridge. `~` keeps its
   brackets; `public` does not. The test now asserts both. (Confusingly,
   the `surreal` CLI prints these same ids with backticks — a different
   renderer, not a different id. That cost a detour.)
3. `~/.index/surreal` already holds 0.6's store, so 0.7 shares a
   RocksDB directory with the previous version. Different table names, so
   nothing collides today — but it is worth a decision before this is
   anyone's real data.
