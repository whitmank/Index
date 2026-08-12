---
title: Product Specification
authors: Authored by Karter Whitman using Claude Fable 5
date: 2026-07-20
---

# Index — Product Specification

The technical contract for the initial build. DESIGN-CONCEPT.md owns the
vocabulary and intent; ARCHITECTURE.md owns the package structure; this
document states exactly what gets built, precisely enough to derive the
implementation plan. Where the design concept left something open, this
spec pins a value and marks it **[pinned here]** — each is a default, not
a re-litigation.

Scope: the private Electron application. Publishing appears only as
constraints it imposes on the present (soft delete, closure cheapness).

---

## 1. Database

SurrealDB, RocksDB storage at `~/.index/surreal/`, namespace `index`,
database `main`. Three tables. All access goes through the repository in
`app/database`; every read filters soft-deleted records unless explicitly
asked otherwise.

### 1.1 `items`

```surql
DEFINE TABLE items SCHEMAFULL;
DEFINE FIELD name         ON items TYPE string DEFAULT "";
DEFINE FIELD display_name ON items TYPE option<string>;
DEFINE FIELD date         ON items TYPE string;           -- YYYY-MM-DD
DEFINE FIELD created_at   ON items TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD opens        ON items TYPE option<string>;   -- presentation override
DEFINE FIELD query        ON items TYPE option<object>;   -- set-role predicate, §1.5
DEFINE FIELD system       ON items TYPE bool DEFAULT false;
DEFINE FIELD fields       ON items TYPE array<object> DEFAULT [];
DEFINE FIELD fields.*.name  ON items TYPE string;
DEFINE FIELD fields.*.value ON items TYPE string;
DEFINE FIELD fields.*.kind  ON items TYPE string DEFAULT "string"
    ASSERT $value IN ["string", "number", "date"];
DEFINE FIELD resources    ON items TYPE array<object> DEFAULT [];
DEFINE FIELD resources.*.uri    ON items TYPE string;
DEFINE FIELD resources.*.name   ON items TYPE string;
DEFINE FIELD resources.*.cached ON items FLEXIBLE TYPE option<object>;
DEFINE FIELD deleted_at   ON items TYPE option<datetime>;
DEFINE INDEX items_date    ON items FIELDS date;
DEFINE INDEX items_created ON items FIELDS created_at;
```

Semantics:

- `id` — ULID record ids (`items:01J…`), except the two seeds (§1.4).
- `name` may be empty (a just-created item); `display_name` is the node
  caption when present, else `name` is drawn.
- `date` is the intrinsic journal day, assigned at creation from the local
  clock, user-editable. ISO `YYYY-MM-DD` so lexical order is chronological.
- `opens` holds a layout key (`"movie"`) for items, or a view kind
  (`"canvas" | "list" | "timeline"`) for items playing the set role.
  Absent means: infer (presentation cascade, §3.6). **[pinned here:** the
  provisional field name `opens` is now the name.**]**
- `fields[].value` is always stored as a string; `kind` governs comparison
  and editing UI: `number` compares numerically (parse float), `date`
  expects `YYYY-MM-DD` and compares lexically, `string` compares lexically.
- `resources` is ordered; `resources[0]` is primary. `cached` is an open
  bag of derivations, current keys: `mime`, `thumbnail`, `preview_image`,
  `favicon`, `card_title`, `card_extract`. All disposable; absence is
  never an error.
- `system: true` on the two seeds; system items refuse deletion and GC.

### 1.2 `connections`

```surql
DEFINE TABLE connections SCHEMAFULL TYPE RELATION IN items OUT items ENFORCED;
DEFINE FIELD label      ON connections TYPE option<record<labels>>;
DEFINE FIELD position   ON connections TYPE option<object>;
DEFINE FIELD position.x ON connections TYPE float;
DEFINE FIELD position.y ON connections TYPE float;
DEFINE FIELD order      ON connections TYPE option<int>;
DEFINE FIELD created_at ON connections TYPE datetime DEFAULT time::now() READONLY;
DEFINE FIELD deleted_at ON connections TYPE option<datetime>;
DEFINE INDEX conn_in    ON connections FIELDS in;
DEFINE INDEX conn_out   ON connections FIELDS out;
DEFINE INDEX conn_label ON connections FIELDS label;
```

Semantics:

- `in` is the source, `out` is the target; the arrow reads `in → out`
  ("photo → album", "novel —author→ hemingway").
- `label` absent ⇒ arrow (belonging). `label` present ⇒ labelled arrow;
  `position`/`order` are meaningful only on unlabelled arrows.
- `position` is an offset from the canvas viewport center (viewport-
  independent; the canvas renders at `center + offset`).
- `order` is a plain integer; a manual reorder rewrites the displaced
  neighbours' `order` values inside the same change. Sparse: only rows
  the user has manually ordered carry it.
- At most one live arrow per (in, out) pair with the same `label`
  (including absent); the repository upserts rather than duplicates.

### 1.3 `labels`

```surql
DEFINE TABLE labels SCHEMAFULL;
DEFINE FIELD name ON labels TYPE string;
DEFINE INDEX labels_name ON labels FIELDS name UNIQUE;
```

Created on first use (typing a new label in the connection composer);
never deleted automatically. `id` is the slugified name (`labels:author`).

### 1.4 Seeds

Created idempotently at every launch:

| id | name | system | query | opens |
|---|---|---|---|---|
| `items:⟨~⟩` | `~` | true | `{ all: true }` | `timeline` |
| `items:⟨public⟩` | `public` | true | — (explicit membership only) | `timeline` |

Timeline parameters (stored as fields on the seed items, editable):
`~` partitions by item `date`, walks forward (newest page = today);
`public` partitions by arrow `created_at`, walks backward.

### 1.5 Set queries **[pinned here]**

`query` is a structured predicate object, not raw SurrealQL. v1 grammar:

```
query := { all: true }
       | { and: [pred, …] }
pred  := { date:   { gte?, lte? } }          -- against item.date
       | { device: string }                   -- resource uri authority match
       | { format: string }                   -- derived format equals
       | { arrowTo: itemId }                  -- has arrow → that item
       | { field:  { name, kind, gte?, lte?, eq? } }
```

The repository compiles predicates to SurrealQL; `format` and `device`
compile to uri/extension pattern matches. Extending the grammar is a
schema-free change (it lives in code).

### 1.6 Membership, roles, derivations

- **Members of set S** = items matching `S.query` (if any) ∪ items with a
  live arrow `→ S`. Duplicates collapse; arrow-carried `position`/`order`
  apply regardless of which side admitted the item.
- **Roles are computed**: set-role = has `query` or inbound arrows;
  tag-role = has inbound connections of any kind. Never stored.
- **Device** of a resource = URI authority: scheme `http`/`https` ⇒ `web`;
  otherwise the scheme is the device id (`mbp://Users/k/x.jpg` ⇒ `mbp`).
  URI form for machines: `<device>://<absolute path>`.
- **Format** of an item = first match on the primary resource:

| test (on `resources[0]`) | format |
|---|---|
| none present | `bare` |
| `cached.mime` starts `image/`, or extension jpg/jpeg/png/gif/webp/heic | `image` |
| extension md/markdown, or mime `text/markdown` | `markdown` |
| extension epub, or mime `application/epub+zip` | `book` |
| http(s) uri matching YouTube watch/short/embed patterns | `video` |
| any other http(s) uri | `link` |
| anything else | `file` (generic; renderer shows name + open-externally) |

### 1.7 Changes, soft delete, GC

- A **change** is `{ description: string, pairs: [{ before, after }] }`
  where `before`/`after` are full records (item or connection) or `null`
  (creation has `before: null`; deletion's `after` carries `deleted_at`).
- The repository applies all pairs of a change in **one SurrealDB
  transaction**; it applies `after` states blind (single writer). Undo
  applies the same change with pairs swapped.
- **Delete is always soft**: set `deleted_at`, never `DELETE`, from any
  user-facing path. Deleting an item also soft-deletes its live
  connections (in the same change, as explicit pairs, so undo restores
  them symmetrically).
- **GC** **[pinned here]**: retention 30 days. Sweep at launch and every
  6 hours: hard-delete records with `deleted_at` older than retention;
  then drop derivation cache files whose uri no longer appears in any
  live record.

---

## 2. Backend (Electron main process)

### 2.1 Lifecycle

1. Ensure `~/.index/{surreal,cache}` exist; load `~/.index/devices.toml`.
2. Spawn `surreal start --bind 127.0.0.1:8422 rocksdb://~/.index/surreal`,
   poll readiness (100 ms interval, 10 s timeout), connect, run schema
   DDL (idempotent `DEFINE … IF NOT EXISTS` / `OVERWRITE`), seed §1.4.
3. Register protocols (§2.3), register IPC handlers (§2.2), open the
   window (Vite dev URL in dev, bundled files in prod).
4. On quit: close connection, SIGTERM the db child, SIGKILL after 5 s.

### 2.2 Bridge surface (preload → `window.index`)

All handlers validate their inputs against the shapes in
`@index/database/types` and return either `{ ok: data }` or
`{ err: message }`. The renderer sees only this surface:

```ts
index.sets.members(setId, opts?)       → { items, arrows }
   // opts.partition?: { date } — one timeline page; server-side filter
index.items.get(id)                    → { item, inbound, outbound }
   // connections resolved with their endpoint items' {id, name, display_name}
index.items.search(prefix, limit=20)   → { items }        // name/display_name prefix
index.labels.list()                    → { labels }
index.changes.apply(change)            → { records }      // §1.7; transactional
index.intake.pathsToResources(paths[]) → { resources }    // absolute paths → uris + names
index.shell.reveal(uri)                                    // Finder reveal, local uris only
index.shell.openExternal(uri)
```

Renderer-bound events: `index.on("intake:dropped", paths ⇒ …)` (from OS
drag-in when the drop target isn't a component), `index.on("gc:swept", …)`
(informational).

### 2.3 Protocols

- `res://<encodeURIComponent(uri)>` — streams the resource's bytes.
  Local device: `fs.createReadStream` with Range support (video/audio
  scrubbing). `web`: 302-style proxy fetch, 10 s timeout. Unknown device
  or unreachable path: 404; renderers show their placeholder state.
- `thumb://<encodeURIComponent(uri)>` — returns the cached thumbnail,
  minting it on first request (§2.4); 404 while minting fails, renderer
  falls back to `res://`.

### 2.4 Services

**resolver** — uri → { stream | filepath }; device table from config;
v1 supports the local machine and `web`; other device ids resolve only if
config maps them to a mounted path prefix. **[pinned here:** remote
device network fetch is out of v1; the URI format already carries it.**]**

**derivations** — cache at `~/.index/cache/<sha1(uri)>.<kind>`:
thumbnails via sharp, max dimension 480, JPEG; link metadata (favicon,
og:image, title/extract — the kwhitman.xyz scrape, 1 MB HTML cap, 10 s
timeout, Wikipedia REST fallback) fetched once at resource creation and
written into `resources[].cached` by the same change.

**intake** — `pathsToResources`: absolute path → `mbp://…` uri (current
machine's device id from config, default `local`), `name` = basename;
runs the ingest pipeline below and returns the resource with its
observations, derivations, type guess and extracted fields attached. No
file watching in v1 **[pinned here]** — a stale pointer 404s gracefully
instead.

**ingest** — one **probe** per resource: a handle that opens it once and
memoizes what was read. For a file, `head` is a bounded 64 KB and always
paid, `bytes()` is opt-in, and `hash()` streams unless the whole file is
already in memory, in which case it signs that. For a url, the body is
fetched once under the same 1 MB cap and 10 s timeout the link scrape
used, and `text()` hands it to both the metadata parse and the
classifier — the fetch that used to be private to the scrape.

Only a file is hashed **[pinned here]**: a page's bytes change under a
stable url, which is the opposite of the identity relink searches by.
`mime` is always sniffed from the bytes, never taken from a server's
Content-Type, so a jpeg served as `octet-stream` is still a jpeg; html
sniffs to nothing, which is correct, since a url is what places a page.

Order inside `pathsToResources` is load-bearing: the probe's sniffed
`mime` goes onto `resources[].cached` *before* derivations and
classification, since both consult the format ladder and the ladder reads
`mime` before falling back to the extension; hashing goes last, after
anything that needed the whole file has loaded it.

- **classify** — the type guess. Its own ladder, not a proxy for
  `format`. For files, content-based via the sniffed `mime`, so an epub
  is identified by the media type its first zip entry declares rather
  than by its extension. For urls, host rules first (Spotify → album,
  Wikipedia `/wiki/` → article) and then the page's own schema.org
  JSON-LD `@type`. **[pinned here]** No inferred web rules: measured
  across real pages, `og:type` reads `website` on a Wikipedia article
  and `object` on a GitHub repo, and an `<article>` element appears on
  the BBC's front page and on a repo's README. Only a declaration the
  page volunteers is trusted; declaring nothing earns no opinion, which
  costs nothing because a null guess never overwrites a type.
- **extract** — type-specific readers returning **observations** (a key
  in the format's own vocabulary), joined to the type's declared fields
  by one function, `toFields(observations, schema?)`. No extractor knows
  a schema exists.

  **`schema.fields[0]` is the item's name**, the same way
  `resources[0]` is the primary resource — ordered, and reordering is
  how the user says which one it is (the type manager drags them, as the
  resources list does). Whatever matches the leading field becomes
  `IntakeResult.name` instead of a row, beating the basename or url that
  `nameFor` derived, and the layout draws only `fields.slice(1)` — the
  name is already on screen above them.

  Positional rather than a per-field flag **[pinned here]**: the word is
  no guide, since a `person` type's `title` means Dr. or a job, and a
  flag adds a second way to express an order the list already has. Used
  only when minting an item — extraction never runs against one that
  already exists, so there is no name of the user's to overwrite. A
  leading field that matches nothing leaves the derived name standing.

  A field marked **`hidden`** is left out of that laid-out block too. It
  is not a secret and not a deletion: the value is still extracted, still
  stored, and still drawn by the generic field list below, which takes
  whatever the layout did not claim. A flag here rather than a position,
  because where a field sits says which matters most — a different
  question from whether it earns room up front.

  The join is four ordered rules, and the order decides ties: exact
  field name, then field `label`, then a synonym of the observation's
  key against a name, then against a label. Names are compared with
  case, spaces, underscores and hyphens stripped, so `Release Date`,
  `release_date` and `releaseDate` are one name. Synonyms are a claim
  about the ingestor's own vocabulary (`author` may be called `writer`),
  never about what a schema means by a word; a synonym that fires
  wrongly hides a value where an unmatched one stays visible.

  Three pinned choices **[pinned here]**: the schema's **kind** wins and
  the value is reshaped to fit (a schema is the declaration of what a
  type carries); an observation matching nothing is **kept** as its own
  row, since the file really did say it; and a declared field matching
  nothing writes **no row**, because the layout already draws a type's
  fields from the schema. With no schema, every key passes through
  verbatim. Extractors report the shape they found — one value, or
  several — so the join can widen a lone value for a `list` field and
  join several back for a `string` one.

**classification lifetime** — the guess is stored (`items.type`) with its
provenance (`items.type_source`: `"auto"` | `"user"`), never recomputed
as a live derivation. It re-runs only when `resources[0]` changes —
attached to an empty item, promoted by a reorder, or exposed by a
removal — and never over a `"user"` source. A null guess leaves an
existing type alone. Resources appended past position 0 never classify:
the primary resource is the subject, the rest are references about it.

**gc** — §1.7 cadence; refuses `system` records; logs a summary line.

---

## 3. Frontend (renderer)

### 3.1 Shell

One window. The shell renders exactly one **view** at a time plus overlay
surfaces (focus view, palette). Top bar: current set's name (click: set
switcher — `~`, `public`, recent sets, search), view-kind switcher
(canvas / list / timeline, showing the set's current choice), undo/redo
indicators. Launch state: `~` in timeline view, today's page.

### 3.2 Store & history

- `store.records`: `Map<id, Item | Connection>` — the pool. Views subscribe
  to derived selectors (set members, page partitions, focus item).
- Loads are per-set (`sets.members`) and per-item (`items.get`), merged
  into the pool; timeline prefetches the two adjacent populated pages.
- Every mutation flows through `changes/`: build change → apply to pool
  optimistically → `index.changes.apply` → on `err`, revert pairs and
  surface the message in the active view.
- `history`: session-scoped stack **[pinned here:** persistence deferred**]**,
  cap 100. `⌘Z` undo / `⇧⌘Z` redo, suppressed while focus is in a text
  input (native editing owns it there). Entries described for a future
  history UI ("Rename to 'Dune'").

### 3.3 The changes catalog

One constructor per user intention; each returns a complete change.

| intention | pairs touched |
|---|---|
| createItem(date) | item: null → blank (name "", date) |
| rename / setDisplayName / setDate / setOpens | item swap |
| setFields(next) | item swap (blank name+value rows dropped) |
| addResource / removeResource / reorderResources | item swap |
| tag(item, target) | arrow: null → (item → target); creates target item first if composing a new tag (two pairs, one change) |
| untag | arrow → deleted |
| place(item, set, x, y) | arrow upsert with position (materializes arrow if query-admitted) |
| reorder(item, set, index) | arrow(s): moved row + displaced neighbours' order |
| connect(item, label, target) / disconnect | labelled connection null→rec / rec→deleted |
| setPublic(item, bool) | arrow (item → public): null→rec / rec→deleted |
| deleteItem | item + its live connections → deleted (one change) |

### 3.4 Views — UX and affordances

**Timeline** (of any set; home = `~`)
- Horizontal filmstrip of day pages; the centered page is interactive.
- Navigation: trackpad swipe, ←/→ arrows, calendar popover (dates with
  members are marked). Turning skips empty days; today is always
  reachable. Slide transition ≤ 300 ms; adjacent pages prefetched.
- Each page is a canvas of that day's members (below). Page header shows
  the date; empty today shows a quiet "nothing yet" state.

**Canvas** (a set, or one timeline page)
- Nodes: circle, radius 72; shows the item's best image derivation
  (`thumb://` of primary resource, else favicon/preview, else plain
  circle); caption = display_name ?? name, hidden if blank.
- Hover: image-bearing nodes grow into a bounded preview (max 230×180,
  clamped inside the viewport). Drag: moves the node, clamped to edges;
  drop commits `place()` — position is offset-from-center. Unplaced nodes:
  physics ring around center, single spring force, no node-node forces.
- Click: opens the focus view. Right-click: context menu (open, reveal in
  Finder, make public/private, delete…).
- Empty-area affordance: `+` button (bottom right) creates a blank item on
  the current day and opens its focus view in edit state; OS file drop
  anywhere creates one item per file (name from basename, resource
  attached) on the current page's date.

**List** (of any set)
- Columns: node thumbnail (24 px), name, date, tags (arrow targets),
  device (derived). Header click sorts by that column; default sort is
  the set's timeline date semantics.
- Row drag-handle reorder switches the list to manual order (writes
  `order`; a "sorted manually" chip with an ✕ reverts by clearing orders —
  one change). Double-click opens focus. Same context menu as canvas.

**Focus** (an item; overlay above the current view)
- Composition: top bar + content slot + editing surface, arranged by the
  resolved layout (§3.6). Backdrop click, `Esc`, or close affordance
  dismisses; a brand-new still-empty item is discarded on dismiss
  (delete change, not undo-tracked).
- Top bar: opens-as chip (shows resolved layout source: tag-inferred vs
  overridden; click to override — writes `opens`), make-public toggle,
  delete (two-step confirm inline).
- Content slot: the renderer's box; fit per registry (§3.5).
- Editing surface: name (autofocused when new), fields editor (name/value
  rows, kind picker on the value cell, blank rows vanish on commit),
  resources list (add via file dialog / paste URL / drop; reorder; first
  is primary; each row: name, device chip, reveal/open), connection
  composer (tag search-or-create; labelled connections rendered as
  `—label→ target` chips, target navigates).
- Commit-on-settle everywhere: blur or Enter commits (one change per
  settled edit); no per-keystroke writes; unchanged values do not commit.

### 3.5 Renderer registry (v1)

| format | component | fit |
|---|---|---|
| image | full image via `res://` | contain |
| markdown | fetched, rendered (marked + DOMPurify) | flow, 640 px measure |
| video | YouTube embed | aspect 16:9 |
| book | epub cover + reader (epubjs) | aspect 3:4 |
| link | favicon/preview card, click-through | contain |
| file | name, device, open-externally | — |
| bare | nothing (layout still renders) | — |

### 3.6 Layout registry & presentation cascade (v1)

Layouts: `default` (single column, editor below content), `movie`
(two-column; claims `—author→`/`—director→` connections and `year`
field into a dedicated block), `photo` (two-column; claims an `exif`
field group), `note` (content only, editor collapsed behind an edit
affordance), `video` (full-width player, editor below).

Resolution: `item.opens` → else first tag (by arrow `created_at`) whose
name matches a registry key → else `default`. The renderer is always
format-selected; layouts never override it.

### 3.7 Keyboard

`⌘Z`/`⇧⌘Z` undo/redo · `Esc` dismiss/close · `←`/`→` timeline pages ·
`⌘N` new item on current page · `Enter` commit field · `⌘F` set switcher
/ search. All suppressed appropriately inside text inputs.

---

## 4. Decisions pinned by this spec

| decision | value | revisit trigger |
|---|---|---|
| override field name | `opens` | never, probably |
| set query grammar | §1.5 structured predicates | a predicate the grammar can't say |
| GC retention / cadence | 30 days / launch + 6 h | disk pressure or regret |
| history persistence | session-scoped, cap 100 | wanting undo across launches |
| remote devices | URI-ready, resolution deferred | second machine actually in use |
| file watching | none; stale pointers 404 softly | broken pointers annoying in practice |
| thumbnail | sharp, 480 px max, JPEG cache | retina complaints |
| db port | 127.0.0.1:8422 | collision |
