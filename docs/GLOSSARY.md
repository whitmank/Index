---
author: Claude Sonnet 4.6
date: 2026-03-26
version: 0.5
---

# Index — Glossary

> Canonical definitions for Index terminology based on current implementation.
> This document describes what actually exists, not future aspirations.

---

## Core Concepts

### Object

The fundamental entity in Index. An object represents an indexed resource — a file, URL, or any addressable thing. Objects are also the only space primitive: a space is just an object with `space: true`.

**Schema:**
```javascript
{
  id: string,           // Fully-qualified SurrealDB record ID ("objects:abc123")
  name: string,         // Display name
  label?: string,       // Short display label for graph nodes (user-set, optional)
  description?: string, // User-provided description
  sources: Source[],    // Array of source locations (can be empty)
  space?: boolean,      // true = navigable space; absent/false = leaf object
  query?: {             // Tag filter rules for space membership; null = no query
    all: string[],      // Object must have ALL of these tag IDs
    any: string[],      // Object must have at least ONE of these tag IDs
    none: string[],     // Object must have NONE of these tag IDs
  } | null,
  default_view?: string, // 'list' | 'calendar' | 'graph' — view mode when entered
  system?: boolean,     // true for system-seeded objects (objects:root, objects:all)
  order?: number,       // Display order among siblings
  created_at: string,   // ISO timestamp
  updated_at: string,   // ISO timestamp
}
```

**Key Properties:**
- Identity is independent of source location — moving a file doesn't break the object
- An object can have multiple sources (e.g., the same book as a PDF on one device and an EPUB on another)
- Spaces and leaf objects are the same DB primitive. `space: true` is the only affordance marker.

---

### Space

An object with `space: true`. Spaces are navigable views that hold member objects. There is no separate space table — spaces are rows in `objects`.

**Membership formula:** `(query_results ∪ contains_edges) − excludes_edges`

- **query_results** — objects matching the space's tag rules (`all`/`any`/`none`), evaluated server-side
- **contains_edges** — objects explicitly added via `RELATE parent->contains->child`
- **excludes_edges** — objects explicitly removed via `RELATE parent->excludes->child`

A space with no `query` and no `contains` edges is empty by definition. A space with no `query` but explicit `contains` edges is a manual list. A space with both is a hybrid.

**System spaces** have deterministic IDs:

| ID | Constant | Purpose |
|---|---|---|
| `objects:⟨~⟩` | `HOME_SPACE_ID` | Home view. `activeSpaceId` defaults here at rest. Its `contains` edges define the home list. |
| `objects:⟨/⟩` | `ROOT_SPACE_ID` | All-objects view. In-memory filter over all non-system objects; no DB containment query. |

Membership is evaluated server-side via `db:evaluateSpace`. Results are cached in `activeSpaceObjects` (active space) and `rootObjects` (home) in the store.

The active space is the **capture target**: Cmd+I imports the new object into whichever space is currently active.

---

### Source

A single location that an object points to. Each object holds a `sources` array.

**Schema:**
```javascript
{
  uri: string,       // Full URI ("file://", "https://", etc.)
  origin: string,    // Device or context that added this source ("My Laptop", "Web")
  fileType?: string, // Derived file extension ("pdf", "jpg", "url", "unknown")
  added_at: string,  // ISO timestamp when this source was added
}
```

**Supported URI schemes:**
- `file://` — local filesystem paths
- `https://` — web URLs (via paste, capture, or Cmd+I)

---

### Tag

A label applied to objects. Tags are globally defined and can be assigned to any number of objects.

**Schema (`tag_definitions`):**
```javascript
{
  id: string,           // "tag_definitions:abc123"
  name: string,
  color?: string,       // Optional hex color
  description?: string,
  system: boolean,      // true for auto-assigned system tags
  schema?: string[],    // Ordered list of tag type IDs; present on type tag_definition records only
  created_at: string,
}
```

Tag assignment is expressed as a `tagged` edge, not a field: `RELATE objects:x->tagged->tag_definitions:y`. There is no `type` field on `tag_definitions` — tag type membership is expressed as a `typed` edge to a `tag_types` record.

---

### Tag Type

A first-class record in the `tag_types` table that categorizes tags. Type membership is expressed as a `typed` edge (`tag_definitions→typed→tag_types`), not a string field.

**Schema (`tag_types`):**
```javascript
{
  id: string,         // "tag_types:medium", "tag_types:kind", etc.
  name: string,       // Internal key ('medium', 'kind', 'file', 'origin', or user-defined)
  label: string,      // Display label ('Medium', 'Kind', etc.)
  description?: string,
  system: boolean,    // true for system-defined types
  display: boolean,   // Show this type and its tags in the tag UI
  editable: boolean,  // User can edit tag values of this type
  deletable: boolean, // User can delete tags of this type
  order: number,      // Display order
}
```

**System tag types**, defined in `electron/main/domain/tag-types.js`:

| ID | Label | Scope | Displayed | Description |
|---|---|---|---|---|
| `tag_types:medium` | Medium | Object | Yes | Signal format of the content (audio, video, image, text). Derived at capture; auto-assignment is backlog. |
| `tag_types:type` | Type | Object | Yes | Object type (book, song, document, etc.). Governs the schema of guided fields shown in the detail pane. |
| `tag_types:file` | File | Source | No | File extension per source. Derived at capture. |
| `tag_types:origin` | Origin | Source | No | Device or host that provided the source. Derived at capture. |

A tag with no `typed` edge is untyped — valid and grouped under `∅` in TagsView. User-defined types are created freely (`system: false`, all flags true).

System types are seeded via `UPSERT` on every boot from `SYSTEM_TAG_TYPES` in `domain/tag-types.js`.

**Object Type and schema:** A type value (e.g. "book") is a `tag_definitions` record whose tag type is `type`. That record carries a `schema` field — an ordered array of tag type IDs — that the UI uses to render guided metadata fields. The object data model is flat; the schema is an interface concern. `seedTypeSchemas()` in `connection.js` writes standard schemas on every boot (book, document, image, video, audio). Field tag types (`author`, `published`, `genre`, etc.) have `display: false`. Tag types are the field system — no separate schema data structure exists.

---

### Device

Each installation of Index identifies itself with a device name chosen by the user on first launch. Devices are first-class records in the `devices` table — not just embedded strings.

**Local identity stored at:** `~/.index/.device-id`
```javascript
{
  id: string,        // UUID
  name: string,      // User-chosen name ("My Laptop")
  created_at: string,
  last_seen: string,
}
```

**DB record (`devices` table):**
```javascript
{
  id: string,   // "devices:⟨My Laptop⟩" or "devices:⟨web⟩"
  name: string, // Display name
}
```

`devices:⟨web⟩` is seeded at boot for HTTP/HTTPS origins. All other devices are created
via `getOrCreateDevice(name)` in `device-service.js`.

Objects are related to their origin device via a `sourced_from` RELATE edge. This edge
is written when objects are created and updated, and is covered by LIVE SELECT. On first
boot, a backfill migration creates `sourced_from` edges for all existing objects that
only have a `source.origin` string.

Devices can be used in space rules via `from_any` and `from_none` arrays in `evaluateSpace()`.
The store holds all device records in `devices`; the preload exposes `getDevices` and
`onDevicesChanged`.

---

## Edges

SurrealDB `RELATE` edges are the primary mechanism for expressing relationships between records. They are a distinct record kind, declared `TYPE RELATION`, with their own `id`, `in` (source), and `out` (target) fields, and can carry additional data.

**Edge tables:**

| Table | Direction | Data | Meaning |
|---|---|---|---|
| `tagged` | `objects → tag_definitions` | — | Object has this tag |
| `contains` | `objects → objects` | `order: number` | Space explicitly includes this object |
| `excludes` | `objects → objects` | — | Space explicitly excludes this object |
| `typed` | `tag_definitions → tag_types` | — | Tag belongs to this type |
| `sourced_from` | `objects → devices` | — | Object originated from this device |

**Edge queries follow the `in`/`out` field pattern:**
```sql
-- Tags for an object:
SELECT out FROM tagged WHERE in = objects:abc

-- Members explicitly pinned to a space:
SELECT out, `order` FROM contains WHERE in = objects:⟨~⟩

-- Type of a tag:
SELECT out FROM typed WHERE in = tag_definitions:xyz

-- Device an object came from:
SELECT out FROM sourced_from WHERE in = objects:abc
```

All five edge tables have LIVE SELECT subscriptions. The store handles each event channel individually — no full-table rescans on mutation.

---

## System Concepts

### Indexing (the Action)

The process of adding an object to Index. When you index a file or URL, Index:

1. Constructs a `sources` array entry with URI, device origin, and timestamp
2. Normalizes the URI (`cleanUri`)
3. Creates an object record in SurrealDB
4. Auto-assigns system tags (`kind`, `file`, `origin`) via `RELATE` edges
5. Schedules an async export to `~/.index/export/` (debounced, 5 seconds)

---

### Content Hash

A SHA-256 fingerprint of file contents, used for file recovery and future deduplication.

**Format:** `sha256:{64-character hex}`

---

### File Recovery

When a source file is no longer found at its original path, Index attempts recovery:
1. Check original path
2. Search original directory and up to 2 parent levels by content hash
3. Update the source URI if found; mark missing if not

---

## Data Persistence

### Storage Layout

```
~/.index/
├── surreal/                   ← SurrealDB data files (primary source of truth)
├── export/                    ← Auto-exported JSON (debounced, human-readable backup)
│   ├── objects/               ← One JSON file per object
│   ├── tag_definitions/       ← One JSON file per tag definition
│   ├── tag_types/             ← One JSON file per tag type
│   ├── tagged_edges.json      ← All object→tag edges
│   ├── contains_edges.json    ← All containment edges
│   ├── excludes_edges.json    ← All exclusion edges
│   └── typed_edges.json       ← All tag→type edges
├── .device-id                 ← Device identification
├── .version                   ← Written on first v0.4 boot; gates v0.3 migration
├── appearance.json            ← Appearance settings (IPC-backed; localStorage is in-session cache)
└── window-settings.json       ← Window geometry and profile
```

---

## IPC API

All renderer↔main communication goes through `window.electronAPI` (context bridge in `electron/preload/index.js`). All returned records have fully-qualified string IDs. Edge `in`/`out` fields are also stringified.

**Objects:**
- `db.getAll(table)` — Fetch all records from a table (`'objects'`, `'tag_definitions'`, `'tag_types'`, `'tagged'`, `'contains'`, `'excludes'`, `'typed'`)
- `db.createObject(data)` — Create object with auto system tag assignment
- `db.updateObject(id, data)` — Update object fields
- `db.deleteObject(id)` — Delete an object (also used to delete spaces)

**Tags:**
- `db.getTagTypes()` — Get all tag type records, sorted by order
- `db.createTag(data)` — Create a tag definition; optional `data.typeId` wires a `typed` edge
- `db.updateTag(id, data)` — Update tag; optional `data.typeId` reassigns the typed edge
- `db.deleteTag(id)` — Delete tag (guards system tags with `deletable: false`)
- `db.assignTag(objectId, tagId)` — Create a `tagged` edge
- `db.unassignTag(objectId, tagId)` — Delete the `tagged` edge
- `db.getTagsForObject(objectId)` — Traverse `tagged` edges to fetch tag records
- `db.getObjectsForTag(tagId)` — Traverse `tagged` edges to fetch object records
- `db.findOrCreateSystemTag(type, name)` — Find or create a system tag by type and value

**Tag Types:**
- `db.createTagType(data)` — Create a user-defined tag type
- `db.updateTagType(typeId, data)` — Update a tag type record
- `db.deleteTagType(typeId)` — Delete a tag type and all its `typed` edges

**Spaces:**
- `db.createSpace(data)` — Create a space object
- `db.updateSpace(id, data)` — Update space fields (name, query, default_view, order)
- `db.evaluateSpace(id)` — Run membership formula, return member object records

**Edges:**
- `db.addContains(parentId, childId, order?)` — Create a `contains` edge
- `db.removeContains(parentId, childId)` — Delete a `contains` edge
- `db.addExcludes(parentId, childId)` — Create an `excludes` edge
- `db.removeExcludes(parentId, childId)` — Delete an `excludes` edge

**Devices:**
- `db.getDevices()` — Get all device records
- `device.getOrigin()` — Get current device name
- `device.getId()` — Get device UUID
- `device.isNamed()` — Check if device has been named
- `device.ensureNamed()` — Show naming dialog if needed

**File system:**
- `fs.pickFile()` — Open native file picker
- `fs.getPathForFile(file)` — Get filesystem path from a File object
- `fs.readFolder(path)` — Read folder tree recursively; returns flat list with `path`, `name`, `type`, `relativePath`; dirs before contents; dotfiles skipped
- `app.openSource(uri)` — Open file or URL in native app

**Window:**
- `window.getProfile()` — Get current window profile (`overlay` or `window`)
- `window.setProfile(profile)` — Switch window profile

**Events (push from main via LIVE SELECT):**
- `onObjectsLive(cb)` — Object created, updated, or deleted; `{ action, result }`
- `onTaggedLive(cb)` — `tagged` edge created or deleted; `{ action, result }`
- `onContainsLive(cb)` — `contains` edge created or deleted; `{ action, result }`
- `onExcludesLive(cb)` — `excludes` edge created or deleted; `{ action, result }`
- `onTagDefinitionsLive(cb)` — Tag definition created, updated, or deleted; `{ action, result }`
- `onTypedLive(cb)` — `typed` edge created or deleted; `{ action, result }`
- `onDevicesChanged(cb)` — Device record created or updated; full devices array

---

## UI

### Home View (`~`)

Shows objects explicitly pinned to `objects:⟨~⟩` via `contains` edges, rendered by `ObjectListView`. `activeSpaceId` is always `HOME_SPACE_ID` at rest — never null. Creating a space auto-pins it here.

### All-Objects View (`/`)

`objects:⟨/⟩` — an in-memory filter over all non-system objects. Not evaluated via `evaluateSpace`; the store filters the full `objects` array client-side. No `contains` edges are written here.

### ObjectListView

List of objects inside the active space. Handles both spaces (double-click to enter) and leaf objects (double-click to open source URI). Single-click selects and opens `ObjectDetailPane`. Type indicated by ●/○ icon (object/space) in the first grid column. Filter button (top-left) cycles `filterSide` (objects/spaces) on click and toggles `filterCombined` on hold (300 ms); bound to `` ` `` key with the same tap/hold logic.

### ObjectDetailPane

Finder-style sidebar that opens on single-click selection in both list and graph views. Sections: name (editable), TypeField (object type badge; editable), TypeSchemaSection (guided metadata fields driven by the type's schema — shown only when the type has a schema), source badge (origin, full URI on hover), "Added" date, tag assignment (`TagAssignmentSection` — excludes schema fields already shown in TypeSchemaSection), and either space rules (`SpaceRulesSection`) for spaces. Pin button (◈) toggles containment in `~`; hidden for system objects.

### GraphView

D3 force-directed visualization. Nodes use ●/○ visual language matching the list view. Click-to-select opens `ObjectDetailPane` in the same `content-with-detail` layout as the list. Simulation lifecycle is split: mount effect (once, never tears down), data effect (position reconciliation on `objects` change), resize effect (center nudge only). Edges are not yet rendered.

### AddressBar

Persistent navigation strip. Shows the current location (`~`, space name, or `/`). CMD+L focuses an in-place navigation input with Tab/Arrow/Enter keyboard navigation. `+` dropdown creates Object or Space in the active context.

### Command Palette (CMD+K)

Global command interface. Accepts free-text input to navigate between top-level views and spaces.

### TagsView

Tag management view. "Types" is pinned as the first nav item (selected by default) and shows all type tag values. Selecting a type value opens a schema editor in a third panel — showing the ordered field list and an Add field input (creates new tag types if the name doesn't exist). Below the Types row, remaining tag types are grouped under a "Tag Types" divider (∅ for untyped). Supports tag creation, editing, and deletion. New types can be created from the bottom of the nav.

### Settings

Opened with CMD+,. Tabs: Devices (live list of all device records; current device marked with "this device" badge), Appearance (light/dark, HSLA background; settings persisted to `~/.index/appearance.json`), Keybinds (static keyboard shortcut reference). Escape restores the prior view and space context rather than defaulting to home.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+Shift+Space | Toggle main window visibility |
| Cmd+\` | Navigate to `~` (home) |
| Cmd+/ | Navigate to `/` (all objects) |
| Cmd+I | Capture frontmost browser tab |
| Cmd+K | Open command palette |
| Cmd+L | Focus address bar / space navigator |
| Cmd+, | Open settings |
| V | Toggle list / graph view |
| `` ` `` | Cycle list filter (hold 300 ms for combined) |
| Cmd+A / Cmd+← | Navigate back |
| Cmd+D / Cmd+→ | Navigate forward |
| Escape | Close / restore prior context |

---

*Glossary v0.5 — Updated 2026-04-03*
