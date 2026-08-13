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

## Phase 3 — store, changes, history

The record pool with its selectors, the full §3.3 change catalog, the
optimistic apply path with revert-on-error, and session history on
`⌘Z`/`⇧⌘Z` with the text-input guard. The debug panel replaces phase 2's
bridge check and does what the plan asked for: it drives create → rename
→ tag → place → delete and then undoes each in turn, checking after every
single step that the pool, the database (read back through the same
bridge paths a view uses) and the history stack still agree. Seventeen
checks, all green, and the panel leaves the database with nothing but its
two seeds.

**Pinned here:**

- **The pool is versioned, not snapshotted.** Subscription is a counter;
  views read what they need from the map on render. At personal scale a
  re-render on any change is cheaper than per-selector memoisation, and
  far less machinery to be wrong.
- **The pool holds only what is live.** A record arriving with
  `deleted_at` — from a load or from a write's own answer — is removed
  rather than stored.
- **A change that fails to persist is not recorded in history.** The
  stack has to describe the database; a change that never landed
  describes nothing. A failed undo or redo is pushed back where it came
  from for the same reason.
- `changes/catalog.ts` is the only place in the renderer that decides what
  a gesture *means*. Constructors ask the pool for the live arrow before
  making one, which is what keeps the upsert rule true from this side.
- `lib/ids.ts` and `lib/derive.ts` mirror their counterparts in
  `app/database` rather than importing them — ARCHITECTURE's dependency
  rule says the renderer takes types from that package, not values. If the
  format ladder changes, both change. Same for the seed ids in
  `lib/seeds.ts`.

**Surprised us:** the soft delete undid itself. `applyPairs` correctly
removed the record from the pool, and then `send` merged the write's
answer — which, for a soft-deleted record, is the record — and put it
straight back. Two functions each doing something reasonable, adding up
to a delete that didn't. It only showed up because the panel checks the
pool *and* the database after every step rather than at the end; a
final-state check would have missed it entirely. That is the argument for
keeping this panel around.

The other stumble was self-inflicted: StrictMode fires effects twice, so
the autorun ran two interleaved sequences over shared state and reported
nonsense history depths. The panel now refuses to run re-entrantly.

## Phase 4 — the views

Four views, each usable before the next was started, all against the real
database, every mutation undoing cleanly. Verification is a set of
synthetic-gesture UI checks (`VITE_INDEX_UICHECK=1`) that drive the live
interface — a real drag, a real click, real typing into the composer —
and then ask the pool *and* the database what happened: 28 checks, all
green, covering the done-when of every view.

**Canvas.** A set's members as spatial nodes; images from the thumbnail
derivation, hover previews bounded and kept clear of the edges, drag to
place, click to open, right-click for the shared item menu, a `+` that
creates on the day. The physics is ported from the parent repo's settled
decisions — one spring per node toward `centre + offset`, no node-to-node
forces — but runs its own rAF loop, so d3 never entered the tree.

**Timeline.** Day pages over any set, each page a canvas of that day's
members, so placing on a day writes the same arrow as placing anywhere.
Swipe / arrows / calendar turn the page; empty days are skipped and today
is always reachable; the two reachable days are prefetched. The pager,
its swipe recogniser, and its slide transition are ported wholesale. This
is the launch surface.

**Focus.** Layout × renderer, the two machines that never override each
other: the renderer is chosen by format, the layout by the presentation
cascade. Renderers for image / markdown / video / book / link / file /
bare; layouts for default / movie / photo / note / video. The editing
surface commits on settle and a new-but-empty item is discarded untracked
on dismissal.

**List.** Rows sortable by their intrinsic columns; a drag-handle reorder
writes `order` onto the arrows and raises the "sorted manually" chip,
whose ✕ clears every one of them in a single change.

**Pinned here:**

- **Two mirrors grew a third.** `lib/derive.ts` already mirrored the
  format ladder; the views also needed the seed ids (`lib/seeds.ts`) and
  client-side ULIDs (`lib/ids.ts`), each mirrored from `@index/database`
  for the same reason — the renderer takes types from that package, never
  values. Three files now restate database constants. If that ever grows
  a fourth, a shared value-only package is the answer; it is not worth one
  yet.
- **Nodes carry no id in the DOM.** The simulation addresses them by
  index, so a node's `<div>` gets a `data-item` only for the checks (and,
  soon, whatever else needs to find a node by its item). Position is
  written straight to the element transform each tick, never through
  React state.
- **The canvas adopts positions it did not write.** A node stays where a
  drag put it, but an undo, a redo, or another view moving the same item
  changes the arrow without this canvas doing it — so `syncPlacements`
  reconciles the ring against the set's opinion on every position change,
  and can tell its own write (already matching) from a foreign one.
- The view-kind switcher lives in the shell already, ahead of phase 5: a
  view nobody can reach isn't finished. The set switcher, undo indicators
  and `⌘N` are still phase 5's.

**Surprised us:** the soft-delete-undoes-itself shape from phase 3 has a
sibling in the pool's merge, and the same discipline fixed both — the
pool holds only what is live, so a record arriving with `deleted_at`, from
any direction, is removed rather than stored. The canvas found the other
half: a view has to *follow* a change it didn't make, not just hold the
data. A final-state assertion would have missed both; checking the pool
and the database after every single step is what caught them, which is
the whole argument for how these checks are written.

**A note on tooling, not the app:** the UI checks and screenshots are
driven headlessly. `osascript`-based window control needs macOS
accessibility permission this environment doesn't grant, and reaching for
it once popped a permission dialog over unrelated apps — so the checks
dispatch synthetic DOM events instead, and screenshots use a dev-only
always-on-top flag (`INDEX_TOP`). None of that is shipped behaviour.

## Phase 9 — The ingestor

**What was built:** the module that reads an attached resource, decides
what kind of thing it is, and fills in what it says about itself — as one
pipeline instead of three passes that each opened the file for themselves.
A **probe** opens a resource once and memoizes what it read: `head` is a
bounded 64 KB and always paid, `bytes()` is opt-in, `hash()` streams
unless the whole file is already in memory. Intake sniffs first and hashes
last for exactly that reason, and a test counts the reads. Urls are probed
the same way, absorbing the fetch the link scrape used to keep to itself.

Classification became content-based through a channel that already
existed: the probe writes `cached.mime`, and the format ladder consults it
before falling back to the extension. Extraction was split into readers
that report **observations** in the format's own words and one function
that joins them to the type's declared fields — a four-rule ladder (exact
name, label, synonym-to-name, synonym-to-label), with the schema's `kind`
winning and its first field taken as the item's name.

**Pinned:** a sniffed media type outranks a filename. No inferred web
rules — only what a page declares in JSON-LD, because `og:type` reads
"website" on a Wikipedia article and an `<article>` element appears on the
BBC's front page. A page is never hashed: its bytes change under a stable
url, which is the opposite of the identity relink searches by.
`type_source` records who chose a type, and a guess is never allowed to
overrule a person. `fields[0]` names the item, the way `resources[0]` is
primary — reordering is the same gesture in both places.

**Surprised us:** three claims made it into commit messages before they
were true. The single-read probe still read an epub twice until `hash()`
learned to sign bytes already in memory. The mime sniff was never
consulted, because the format ladder's `extension === "epub" || mime ===
…` could be persuaded by a sniff but never dissuaded by one — caught only
by driving the real app. And a handle's `cursor: grab` was being taken
straight back by a more specific rule declared later, caught only by
rendering against the whole stylesheet instead of the slice just written.
The pattern is the same each time: the unit test asserted the layer under
the claim rather than the claim.

**The one that was invisible:** a schema's identity is its slugified,
lowercase id while its `name` is stored as typed — so a type created as
`Song` was never found by the lowercase `"song"` the Spotify import
writes. Every imported song had been quietly losing its schema fields.
Nothing failed; a lookup simply returned nothing, three times over. It
surfaced only because a *cosmetic* bug — the types list reordering itself
after the first edit — shared the root cause.

## Phase 10 — Reading pdfs

**What was built:** the pdf rung of the ingestor, so a paper, a book scan
or a lease arrives with what it says about itself already filled in. A pdf
is unlike every format read so far in two ways, and both showed up in the
design. Its index is at the *end*, which the 64 KB head can never reach —
so the probe grew `tail()`, a bounded 256 KB read from the far end, and a
half-gigabyte scan is now classified and read for its metadata without
ever being held in memory. And its media type does not name the thing: the
same bytes carry a novel, a paper and a receipt, so the classifier's pdf
rung reads inside the file and asks what it declared (doi or journal ⇒
article, isbn ⇒ book, 50+ pages ⇒ book, else document).

The reader takes both places a pdf keeps metadata — the Info dictionary
the trailer points at, and the XMP packet the catalog names — preferring
XMP, since Info predates unicode and producers keep it for compatibility.
It parses object syntax directly rather than taking a dependency: strings
in three encodings, dates in two, deflated object streams for the pdf 1.5
producers that hide the Info dictionary inside one. Extraction split along
the seam this exposed: a *type* decides whether a file is worth opening, a
*file* decides how it is read — `book` now has two readers and one pdf
reader serves book, article and document alike.

**Pinned:** two bounded reads, never the file. A pdf that keeps its
metadata in the unread middle reports nothing, the same answer every other
derivation gives when it cannot see — three of the sixty-three real files
this was measured against do exactly that, and give up only their page
count. `document` is not a guess about the contents but a statement of
what a pdf is, which is why the ladder's last rung always answers.

**Surprised us:** the fixtures all passed and the real files were wrong.
A journal article came back titled `CROSSMARK_BW_txt_100x100.eps` and
authored by a typesetting job number, because an embedded logo carries its
own XMP packet and the producer writes it a hundred kilobytes *ahead* of
the document's. Nothing about a packet's contents says which one it is;
what says so is the catalog naming one, and `dc:format` on the other
admitting it is postscript. The same file then classified correctly as an
article, with its doi and journal — the fix and the feature were one
change. A generated fixture can only contain what the person writing it
already knew to put in.

## Phase 11 — The parse verb

**What was built:** `parse` — read this item's resource and fill in the
fields its type declares. Said three ways over one implementation: the
command bar, a button in Focus's toolbar, the context menu.

The premise is a concession. Classifying a file will always be a guess,
and a guess is a poor thing to hang extraction on; but *given* a type,
finding the values that belong to its fields is deterministic. So the
reliable half got the verb, and the user supplies the half that isn't —
which also means parsing confirms the type, because asking for a book's
fields is saying it is a book.

Two things fell out of it. Extraction's table was keyed by *type* and
re-dispatched on media type inside every entry; it is now keyed by media
type alone, with the type gate reduced to what it always was — a gate.
Naming your own `textbook` used to turn extraction off silently. And a
second **source** arrived beside the file readers: the filename, which
outranks them.

**Pinned:** a field carrying a value is never overwritten — undo makes
that recoverable, not acceptable. The name is replaced only while it is
still the resource's own, which keeps the old promise (extraction never
overwrites a name the user chose) by a narrower rule now that extraction
runs against items that already exist. Only the type's declared fields
are written, unlike intake: someone filling in a curated item did not ask
for loose rows. And the filename claims a title or an author only from a
shape it recognises, because a wrong author costs more than a missing
one.

**Surprised us:** the book the feature was built for declares nothing
about itself. No title, no author, no keywords, no XMP — and the one
thing it does declare, a creation date, is when somebody re-wrapped the
scan five years after Yale published it. Reading the file harder was
never going to work; everything was in the name it was saved under. The
guard rules then came from the corpus rather than from thinking about it:
a CIA document number reads as a valid-length isbn until you check the
check digit, and `IMG_2024.pdf` is frame 2024, not a year, so a bare
four-digit run stopped counting as a date.

**The one that cost three runs:** the feature worked and the harness
said otherwise. `clickAt` synthesises pointer events for canvas nodes,
and a `<button onClick>` never hears them — so every assertion after the
click failed, in the shape a broken feature fails. Before that, a stale
`surreal` still holding 8422 meant one whole run was measuring the
previous run's database. Both were minutes of reading logs that looked
exactly like a bug in the thing under test.
