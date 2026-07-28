---
title: Design Concept
authors: Authored by Karter Whitman using Claude Fable 5
date: 2026-07-19
---

# Index — Design Concept

Index is an interface for managing all of one’s information. Files and URL’s are both treated as ‘items’ which may be labelled and organized semantically. Items exist as nodes in a graph, affording a non-hierarchical method for organizing files, opposed to static file/directory structure.


## 1. Vocabulary

The working vocabulary — each word here means one thing. One word is
deliberately absent: **"type"**, whose historical meanings are dispersed
across tag, format, layout, and label.

| Word | Meaning |
|---|---|
| **item** | the atom; one table; no stored categories — roles are emergent |
| **connection** | a directed statement between two items; a record with its own properties |
| **arrow** (→) | an unlabelled connection = belonging; read contextually as "member of" / "tagged as" |
| **label** | the word on a labelled arrow (`—author→`, `—depicts→`); own minimal table; never an endpoint |
| **field** | a scalar name/value statement on an item; carries a value kind (string / number / date) |
| **resource** | an ordered pointer on an item to its actual stuff — one URI + name + cached derivations; a pointer, never custody |
| **device** | the authority segment of a resource URI (`mbp://…`); derived, never stored; the internet is the world computer (`https://…`) |
| **format** | derived from the primary resource (image / markdown / video / book / link / bare); selects the renderer; never stored |
| **set** | *role*: an item that others belong to (via arrows and/or its stored query) |
| **tag** | *role*: an item that is pointed at; its default view is the query over inbound connections |
| **view** | any full rendering: **canvas**, **list**, **timeline** (of a set); **focus** (of an item) |
| **timeline** | a view kind: partition a set's members by date into pages you slide between |
| **layout** | arranges a focus view; selected by the presentation cascade (§5) |
| **renderer** | draws content into its box; selected by format |
| **position** | x/y carried on an arrow — where the item sits in a canvas view of that set |
| **order** | an integer carried on an arrow — the item's manual place in a list view of that set; exists only where the user has reordered |
| **display-name** | an item's short display name, drawn on its node; distinct from its full **name** |
| **store** | the client-side in-memory pool of items and connections; optimistic writes |
| **change** | one user action: a set of `{before, after}` record pairs applied atomically — usually just one pair |
| **history** | the stack of changes; undo puts `before` back, redo the mirror |
| **soft delete / GC** | deletion is a flag; a periodic sweep purges after the retention window |
| **~** | the seeded root set; membership = everything; its timeline is home |
| **public** | the seeded world-facing set; membership = publicness; surfaced in the UI as a make-public toggle rather than tagging |
| **publish** | *(horizon)* the crossing that mirrors the public set's closure into the server's `public` directory |

---

## 2. Truth: the data model

Two record shapes plus a small label table; stored truth stays minimal.

### items

```
item {
  id
  name                    -- full name; may be verbose
  display-name            -- short display name for the node; optional
  date                    -- intrinsic day (YYYY-MM-DD, ISO — lexical order
                          -- is chronological order); the journal semantics:
                          -- the day YOU say it belongs to
  created_at              -- when the record came to exist
  opens?                  -- [PROVISIONAL NAME] presentation override; see §5.
                          -- Absent on almost every item, ever.
  query?                  -- stored query, for items playing the set role
  fields   [ {name, value, kind} ]   -- kind: string | number | date
  resources[ {uri, name, cached…} ]  -- ordered; resources[0] is primary
  deleted_at?             -- soft delete flag
}
```

### connections

```
connection {
  id
  source → target         -- two item ids; directed
  label          	      -- absent = arrow = belonging
  position? {x, y}        -- arrows only: spatial placement, read by the
                          -- target set's canvas view
  order?                  -- arrows only: integer; manual ordering, read by
                          -- the target set's list view. Materializes only
                          -- on manual reorder; a reorder renumbers the
                          -- displaced neighbours within the same change
  created_at              -- for curated sets (public, albums): the inclusion date
  deleted_at?
}
```

### labels

```
label { id, name }        -- "author", "depicts", … ; minimal; never an endpoint
```

### Statements

A statement about an item generally takes one of three forms:

1. **Points at a thing → connection.** `novel —author→ hemingway`.
2. **Points at a value → field.** `year: 1999 (number)`.
3. **Belongs → arrow.** `photo → album`, `photo → movie`. One relation;
   the reading (member of / tagged as) belongs to the endpoints, not the record.

**Promotion paths** (doors that open on demand, not in advance):

- a field value earns traversability → mint the item, the field becomes an arrow
- a hot freeform field → graduates to an intrinsic (indexed) column
- a specific day earns identity → mint the day item
- a device earns statements → mint the device item; resource strings unchanged

### The derivation ladder

Everything below the line is computed at read time rather than written down:

```
stored:   uri, name, cached previews, fields, arrows
──────────────────────────────────────────────────────
derived:  device   (authority segment of the uri)
          format   (extension / mime / URL shape)
          roles    (set, tag — from connections and query)
          membership of query-sets, day partitions, layout choice
```

### Instincts

> Arrows tend to hold opinions and categories; fields hold facts and
> measurements. Things worth sorting live in fields; things worth a screen
> sit at the end of arrows. Where a file lives is a fact (resource string);
> where you placed it is an opinion (arrow).

---

## 3. Belonging: sets, tags, membership

- A **set** is any item others belong to. Membership = **query ∪ arrows**
  (the union rule): query-heavy sets feel like categories ("all photos on
  mbp"), arrow-heavy sets feel like curation (an album, public). Both at once
  is legal and useful.
- A **tag** is any item pointed at — by arrows *or* labelled ones.
  "Hemingway" is a tag by virtue of inbound `—author→` arrows; nothing
  belongs to him. Tag-ness and set-ness are roles read off the graph, never
  stored categories; an item can grow into either without migration.
- **Position** (spatial, canvas) and **order** (ordinal, list) are two
  independent opinions written on the arrow to *the set being viewed* when
  the user places or reorders an item; each view kind reads only its own.
  Query-membership needs no arrow until there's an opinion to record —
  then one materializes, additively. A list with no manual order sorts by
  intrinsic fields, the way a canvas with no positions lets physics
  settle the nodes.
- **Devices don't need to be sets in the graph.** "Files on mbp" is a query
  over resource URI prefixes — correct by construction, nothing to maintain.

---

## 4. Views

A **view** is any full rendering of an item.

| view | of | what it shows |
|---|---|---|
| **canvas** | a set | members as spatial nodes; positions from arrows; physics settles the unplaced |
| **list** | a set | members as rows; sortable by intrinsic fields |
| **timeline** | a set | members partitioned by date into pages you slide between |
| **focus** | an item | the item opened up: layout + renderer + editing surface |

- Sets store a **default view** (with a dormant override, like all
  presentation preferences).
- The **timeline** view takes two parameters, stored on the set: *partition
  date* — the item's intrinsic `date` (journal sense) or the arrow's
  `created_at` (inclusion/blog sense) — and *direction* (journal walks
  forward, blogs walk backward).
- **Days are partitions of a timeline view rather than sets of their own.**
  An item has one intrinsic date, so it appears on one page; positions scope
  to the viewed set, and a corrected date carries the item's position to the
  right page on its own.
- Every set gains time-walking for free: "open `reading` as a timeline."

---

## 5. The focus view: layout × renderer

Two independent machines compose every focus view:

- The **renderer** draws the content. Selected by **format**; each renderer
  declares its fit (letterbox to natural aspect / lock to ratio / flow at a
  reading measure). Registry lives in code.
- The **layout** arranges the screen: shape, which fields and labelled
  arrows are claimed into dedicated slots (the movie layout surfaces
  `—author→` and `year:` prominently; the unclaimed fall to the generic
  list), the identity line, whether the editing surface shows. Registry
  lives in code.

**The presentation cascade** (derived with a dormant override):

```
explicit `opens` field on the item        ← exists only when you disagreed
  → else: first tag with a registered layout
  → else: the default layout               (renderer still picked by format)
```

Tagging something "movie" is the user experience of choosing its layout —
one action, inference does the rest. The override field materializes only
when the inference is wrong or ambiguous (multiple layout-bearing tags),
via an "opens as" affordance in the focus view. Tags state what a thing is;
the override states how it looks; they agree by default and the field
exists only to record disagreement.

---

## 6. Change: one primitive

- A user action becomes one **change** — a small set of `{before, after}`
  record pairs applied together. Most changes touch a single record (rename
  = swap item, drag = swap arrow, tag = create arrow); a few, like
  reordering a list, touch a handful.
- A change is data. The **history** stacks them; undo writes the `before`s
  back, redo the mirror. Undo-after-delete comes free, because deletion is
  a **soft delete** and the **GC** purges only after the retention window.
- The **store** holds the client's live records; writes are optimistic
  (swap in store → persist → on failure, swap back and surface the error).
- Editing discipline: **commit on settle** — autosave on
  blur/Enter, never per keystroke; drafts are the only state outside the
  store, and a still-empty new item is discarded on dismissal.

---

## 7. Seeded records

Two items exist before the user does anything:

- **~** — the root set. Query: everything. Its timeline view (partitioned by
  intrinsic `date`, walking forward) is the application's home. Launching
  the app *is* opening `~`; the home screen is not special.
- **public** — the world-facing set. Explicit membership only. Timeline
  partitioned by inclusion date, walking backward. Private in the initial
  project; becomes the publication boundary at the horizon (§9).

Making an item public should feel like flipping a switch, not applying a
tag — publishing is a decision, not a categorization. Underneath, the
toggle writes or retires the `item → public` arrow: one mechanism, read
differently by the gesture.

---

## 8. Substrate assumptions

- **SurrealDB**, local, single-user (both parent projects; the connection
  record maps to a relation table, `label` to a small reference table).
- Device **reachability and credentials** (addresses, sync secrets, liveness)
  live in local config keyed by namespace, kept out of the database, which
  has a publish pipeline in its future.
- Personal scale is a design input: thousands of items, not millions. Full
  scans over freeform fields are acceptable; intrinsic fields (`date`,
  `created_at`, `name`) are indexed columns. The promotion paths are the
  answer to growth, not premature indexing.

---

## 9. Horizon: publishing

Out of scope for the initial project; shape settled so the core can be
built without closing any doors:

- **Membership in public is publicness.** The `item → public` arrow is the
  act of publication, written by the make-public toggle: its `created_at`
  is the publication date, its position/order the public arrangement.
  Toggling private retires the arrow; undo restores it.
- **Publish mirrors the closure.** For each member of the public set, copy
  its record, its relevant connections, and the bytes its resources point
  at into the server's **`public`** directory (which mints its own
  thumbnails). The world sees the public set's timeline and its members'
  focus views.
- The GC generalizes: public copies whose arrows are gone get swept after
  the window, same as everything else.
- Prerequisite kept warm meanwhile: an item's closure (record + connections
  + resource bytes) stays cheap to compute — true by construction.

---

## 10. Open items

| # | Item | Status |
|---|---|---|
| 1 | The system's one name (two faces already named: `~` inside, `public` outside) | open, unhurried |
| 2 | Name of the presentation-override field (`opens` used provisionally; candidates: opens / face) | open |
| 3 | Migration mapping from the two parent codebases (xyz's `Source.label` → resource `name`; `types[]` → arrows; `layout` table → positions on arrows; Index device nodes → URI namespaces) | to be drafted when construction starts |
| 4 | History persistence: per-session (xyz today) or persistent (changes are just records; cheap) — leaning persistent, undecided | open |
| 5 | Whether layouts/renderers ever become data instead of code registries | deferred until a third registry entry hurts |
