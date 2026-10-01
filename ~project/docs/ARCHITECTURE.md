---
title: Architecture
authors: Authored by Karter Whitman using Claude Fable 5
date: 2026-07-19
---

# Index — Architecture

How the project is structured. Companion to DESIGN-CONCEPT.md, which owns
the vocabulary and the ideas; this document places them in packages.

Index is an **Electron app** — it organizes files on the machine, so it
lives on the machine: native filesystem access, file watching, drag-and-drop
that carries real paths, OS shell integration, and the database run as a
managed child process. The repo keeps the three-workspace split proven in
kwhitman.xyz — a **database** package that owns truth, a **backend** that
serves it, a **frontend** that renders it — with the backend running as the
Electron main process and the frontend as its renderer.

A fourth package sits beside them: **item-modeler**, which owns one
concern end to end rather than a layer of the stack. It is a library, not
a process — nothing runs it but a caller.

```
index/
├── package.json            -- workspaces + dev runner
├── app/
│   ├── database/           -- schema, repository, shared shapes
│   ├── item-modeler/       -- sources → an expanded Item: evidence,
│   │                          claims, reconciliation, validation, and
│   │                          an audited change set  (see its SPEC.md)
│   ├── backend/            -- Electron main process: db lifecycle, IPC,
│   │                          resolver, derivations, GC  (+ thin preload)
│   └── frontend/           -- the renderer: views, store, layouts, renderers
└── (user data lives in ~/.index/ — SurrealDB store, derivation caches,
    device config; the repo holds code only)
```

Dependencies point one way; the two processes meet only at the bridge:

```
frontend ──(type-only imports)──► database ◄──(runtime imports)── backend
frontend ──(IPC bridge + resource protocol)──────────────────────► backend
item-modeler ──(type-only imports)──► database
backend ──(runtime imports)──► item-modeler
```

---

## app/database

Owns truth. Every SurrealQL query in the project lives here; nothing else
speaks to the database.

```
schema.surql        -- items, connections (relation table), labels
records/            -- the repository: read/write items, connections, labels;
                       soft-delete filtering baked into every read
changes.ts          -- apply a change: its {before, after} pairs written in
                       one transaction; the inverse operation for undo
types.ts            -- the wire shapes (item, connection, label, change);
                       single source of truth for every layer
index.ts            -- the package's public surface
```

Conventions carried from kwhitman.xyz: the repository absorbs every
database-ism (record ids, NONE coercion, serialization) so callers speak
only in the wire shapes; the frontend imports `types` type-only, so nothing
of the package reaches the renderer bundle.

## app/item-modeler

Owns one question: given an Item and the sources attached to it, what can
be said about it, and on what evidence? Its own specification is `SPEC.md`
in the package.

```
contracts/          -- claims, provenance, change set, warnings, conflicts,
                       options, result. The vocabulary a caller reads.
classifier/         -- a resource's type: a deterministic trad/ ladder
                       (mime, pdf signals, host/url rules, schema.org)
                       first, an ai/ (LFM2) fallback only when trad has
                       no opinion. A sibling entry point, called by the
                       app at intake — not part of modelItem's own flow.
collector/          -- evidence/: resources → bounded, normalized
                       SourceEvidence, the SourceGateway port; formats/:
                       readers (epub, pdf, filename) reporting
                       observations in each format's own words, never
                       deciding what they mean; stated-facts.ts:
                       transcribing what a format declares outright;
                       language-model/: LFM2 synthesis for whatever is
                       still unsettled
composer/           -- normalization/: one fact, one spelling
                       (identifiers, dates, names); validation/: may
                       this be written at all, including grounding a
                       synthesized value against the evidence;
                       application/: ownership precedence, and the Item
                       and change set it produces
```

Three properties are load-bearing:

- **Pure with respect to persistence.** An Item goes in, an Item comes
  out, and nothing is saved. The caller decides when a result is worth
  writing down, which is what makes a run cheap to preview, retry and
  background.
- **No Electron, no database.** `@index/database` is imported type-only,
  and reaching a source is a port (`SourceGateway`) the app fills in with
  its own resolver. So the package tests under plain `tsx`.
- **Nothing is guessed.** An item arrives with the type its user chose;
  a value with no evidence behind it is not written, and a disagreement
  is recorded rather than resolved.

Not yet built: `modelItem`'s own `inferType` option is still a hard error
— an item arrives with the type its user chose, or is refused. The
`classifier/` pipeline above answers a related but separate question (a
bare resource's likely type, at intake, before an Item exists); the two
have not been connected.

## app/backend — the Electron main process

Owns the machine. Everything that needs the OS lives here; the renderer
never touches the filesystem directly.

```
main.ts             -- app lifecycle, window management, db child process
                       (spawn SurrealDB, wait ready, stop clean — the 0.6
                       pattern)
ipc/                -- the handlers: records & changes in, records out;
                       thin, like routes — logic lives in services
services/
  resolver.ts       -- resource URI → bytes, exposed as a custom protocol
                       so renderer <img>/<video> tags can stream any
                       device's content by URI; reads device config for
                       remote authorities
  intake.ts         -- native drag-drop and file dialogs → resource URIs;
                       file watching for paths the graph points at
  derivations.ts    -- cached derivations (thumbnails, previews, link
                       metadata) minted on demand into ~/.index, disposable
                       and rebuildable by definition
  gc.ts             -- the sweep: purge soft-deleted records past the
                       retention window; drop orphaned derivations
preload.ts          -- the contextBridge: the narrow, typed surface the
                       renderer sees (records, changes, intake events)
horizon/            -- (empty at first) the publish job: mirror the public
                       set's closure to the server that hosts it
```

Two deliberate carry-overs of intent from the web-era draft:

- **No uploads anywhere.** Resources are pointers; nothing takes custody of
  bytes. Adding a file is recording a URI for a path that already exists.
- **The bridge speaks records and changes**, mirroring the change model —
  a mutation crosses as the change's record pairs and is applied in one
  transaction. Exact handler shapes belong to PRODUCT-SPEC.

## app/frontend — the renderer

React. Renders sets and items through views; turns gestures into changes.
Talks to the machine only through the preload bridge and the resource
protocol.

```
store/              -- the record pool (items + connections), optimistic
                       writes, and the history (undo/redo)
changes/            -- the one place mutations are built: each gesture
                       becomes a change (pairs + description), applied to
                       the store and sent across the bridge together
views/
  canvas/           -- spatial view: nodes, physics for the unplaced,
                       drag → position on the arrow
  list/             -- rows, intrinsic sorts, manual reorder → order
  timeline/         -- date-partitioned pages over any set; the home
                       experience is ~ opened here
  focus/            -- the opened item: layout × renderer + editing surface
layouts/            -- the layout registry + presentation cascade
renderers/          -- the renderer registry, keyed by format
lib/                -- derivations mirrored client-side (format, device,
                       roles), date helpers
```

Conventions carried from kwhitman.xyz: mutation logic lives in one module
(`changes/`), never scattered through components — a gesture handler wires
an intent to a change and handles only its own UI concerns. Views keep the
physics/display seam the ForceGraph established. Editing keeps commit-on-
settle discipline; drafts are the only state outside the store.

---

## Data flow, end to end

```
gesture (drag, rename, toggle public)
  → changes/ builds the change: [{before, after}, …]
  → store applies it optimistically; history records it
  → across the bridge; backend applies the pairs in one transaction
  → on failure: store restores the befores, error surfaces

render (any view)
  → store's records → derivations (format, roles, membership) → view
  → resource content and previews stream over the resource protocol

file arrives (dropped, dialog-picked, watched)
  → intake turns it into a resource URI (+ derivations warm in background)
  → an ordinary change writes the item; nothing was copied
```

Undo is the same flow with `before` and `after` swapped.

---

## Development

One command starts Vite for the renderer and Electron pointed at it (the
0.6 `electron-dev` pattern); the main process spawns and supervises
SurrealDB itself, so there is no separate database step. User data —
the database store, derivation caches, device config — lives in `~/.index/`,
not the repo.
