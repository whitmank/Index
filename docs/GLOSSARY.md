---
author: Claude Opus 4.7
date: 2026-04-19
version: 0.6
---

# Index — Glossary

> Canonical definitions for Index terminology. 0.6 is mid-migration from a partitioned legacy schema
> to a unified graph. Both shapes are described below; where they differ, the section notes which
> shape is authoritative. Legacy shape remains authoritative for writes through Phase 2.

---

## Core Concepts

### Object

The fundamental entity in Index. Every navigable thing is an Object in the `objects` table. In the unified graph, this includes leaf records, spaces, value Objects, edge Objects, type Objects, and device Objects. A space is just an Object with `space: true` — there is no separate space table.

**Schema:**
```javascript
{
  id: string,           // Fully-qualified SurrealDB record ID ("objects:abc123" or "objects:⟨slug⟩")
  name: string,         // Display name
  label?: string,       // Short display label for graph nodes (user-set, optional)
  description?: string, // User-provided description
  sources?: Source[],   // Array of source locations (leaf objects + spaces-as-locations)
  space?: boolean,      // true = navigable space; absent/false = leaf object
  rule?: object,        // Space membership rule (new shape); see Rule Grammar below
  query?: {             // Legacy space membership query (tag-id based); fallback when rule absent
    all: string[],
    any: string[],
    none: string[],
  } | null,
  schema?: string[],    // type-Objects: ordered array of edge-Object IDs driving pill rendering
  icon?: string,        // Display icon (geometric SVG key string)
  system?: boolean,     // true for system-seeded objects (non-deletable via UI)
  default_view?: string,// 'list' | 'graph' — view mode when entered
  order?: number,       // Display order among siblings
  created_at: string,   // ISO timestamp
  updated_at: string,   // ISO timestamp
}
```

**Key roles in the unified graph:**

| Role | Example ID | Distinguishing field |
|---|---|---|
| Leaf object | `objects:abc123` | `sources` array present |
| Space | `objects:⟨~⟩` | `space: true` |
| Value Object | `objects:⟨andy_weir⟩` | target of semantic edges |
| Edge Object | `objects:⟨author⟩` | ID matches an edge table name |
| Type Object | `objects:⟨book⟩` | `schema` array present |
| Device Object | `objects:⟨web⟩` | target of `sourced_from` edges |

---

### Space

An Object with `space: true`. Spaces are navigable views that hold member objects. No separate table — spaces are rows in `objects`.

**Membership formula:** `(rule_or_query_results ∪ contains_edges) − excludes_edges`

- **rule_or_query_results** — Objects matching the space's predicate. `rule` (new shape) takes precedence over legacy `query` if both are present.
- **contains_edges** — Objects explicitly pinned via `RELATE parent->contains->child`
- **excludes_edges** — Objects explicitly excluded via `RELATE parent->excludes->child`

**System spaces:**

| ID | Constant | Purpose |
|---|---|---|
| `objects:⟨~⟩` | `HOME_SPACE_ID` | Home view. `activeSpaceId` defaults here at rest. Its `contains` edges define the home list. |
| `objects:⟨/⟩` | `ROOT_SPACE_ID` | All-objects view. In-memory filter over all non-system objects; no DB containment query. |

The active space is the **capture target**: Cmd+I imports the new object into whichever space is currently active.

#### Rule Grammar (new shape)

```json
{
  "all":  [ { "edge": "type",   "to": "objects:⟨book⟩" } ],
  "any":  [],
  "none": [ { "edge": "genre",  "to": "objects:⟨textbook⟩" } ]
}
```

- `all` → AND of predicates.
- `any` → OR of predicates (omitted if empty).
- `none` → NOT (OR of predicates) (omitted if empty).
- `to === "*"` or absent → "has any outbound edge on this relation".
- Edge names are validated against `SYSTEM_EDGES` in `edges.js`; unknown names throw (prevents SurrealQL injection).

Compiled to SurrealQL by `electron/main/db/rule-compiler.js`. Legacy `query` (tag-id arrays) is evaluated by `space-service.js` as a fallback for spaces not yet migrated to `rule`.

---

### Source

A single location that an Object points to. Each leaf Object holds a `sources` array.

**Schema:**
```javascript
{
  uri: string,       // Full URI ("file://", "https://", etc.)
  origin: string,    // Device or context that added this source ("My Laptop", "Web")
  fileType?: string, // Derived file extension ("pdf", "jpg", "url", "unknown")
  added_at: string,  // ISO timestamp when this source was added
}
```

---

### Edge

A named relation category. In the unified graph, each edge has:
1. A SurrealDB RELATION table (e.g. `author`) — stores edge instances: `in` (Object), `out` (Value Object).
2. A twin **edge Object** in `objects` (e.g. `objects:⟨author⟩`) — carries display metadata (`name`, `icon`, `description`).

Edges are the single mechanism for all semantic relations between Objects. The full registry lives in `electron/main/db/edges.js` (`SYSTEM_EDGES`).

**Bootstrap edges:**

| Edge | Role |
|---|---|
| `type` | Object's primary kind |
| `includes` | manual Space membership (with `order`) |
| `excludes` | manual Space exclusion |
| `sourced_from` | capture provenance → device Object |
| `author`, `genre`, `published`, `isbn`, `publisher`, `creator`, `captured`, `director`, `released`, `duration`, `artist`, `album` | field edges used by built-in type schemas |
| `medium`, `file`, `origin` | legacy system tag types, promoted to edges |

---

### Pill

The UI representation of a single edge instance on an Object's detail pane. Format: **[edge label] : [target name]**.

Pill data is computed by `edge-service.js` → `getPillsForObject(db, objectId)`:
1. `SELECT out FROM type WHERE in = <obj>` → type-Object id.
2. `SELECT schema FROM <typeObject>` → ordered array of edge-Object references.
3. For each edge Object in `schema`: query `SELECT out FROM <edgeName> WHERE in = <obj>` and resolve each target's `name`.
4. Return `[{ edge, edgeObjectId, edgeName, targetId, targetName }, …]` in schema order.

Cached in `store.pillsForObject`. Invalidated by live channels on `tagged` and the pilot per-edge tables (`type`, `author`, `genre`, `published`).

---

### Tag *(legacy shape)*

A label applied to objects. Globally defined; assignable to any number of objects. Equivalent to a **value Object** in the new shape.

**Schema (`tag_definitions`):**
```javascript
{
  id: string,           // "tag_definitions:abc123"
  name: string,
  color?: string,       // Optional hex color
  description?: string,
  system: boolean,      // true for auto-assigned system tags
  schema?: string[],    // Ordered list of tag type IDs; on type tag_definition records only
  icon?: string,        // Geometric icon key; present on type records
  created_at: string,
}
```

Tag assignment is a `tagged` edge: `RELATE objects:x->tagged->tag_definitions:y`. Type membership is a `typed` edge: `tag_definitions:y->typed->tag_types:z`. No `type` field on the record itself.

---

### Tag Type *(legacy shape)*

A first-class record in `tag_types` that categorizes tags. Equivalent to an **edge Object** in the new shape.

**Schema (`tag_types`):**
```javascript
{
  id: string,         // "tag_types:medium", "tag_types:type", etc.
  name: string,       // Internal key
  label: string,      // Display label
  description?: string,
  system: boolean,
  display: boolean,   // Show in tag UI
  editable: boolean,
  deletable: boolean,
  order: number,
}
```

**System tag types** (defined in `electron/main/domain/tag-types.js`):

| ID | Label | Description |
|---|---|---|
| `tag_types:medium` | Medium | Signal format (audio, video, image, text). Auto-assignment is backlog. |
| `tag_types:type` | Type | Object type (book, song, etc.). Governs schema of guided fields in detail pane. |
| `tag_types:file` | File | File extension per source. Derived at capture. Not displayed in tag UI. |
| `tag_types:origin` | Origin | Device or host that provided the source. Not displayed in tag UI. |

Seeded via UPSERT on every boot from `SYSTEM_TAG_TYPES`. A tag with no `typed` edge is untyped — grouped under `∅` in TagsView. User-defined types have `system: false`.

---

### Device

Each installation of Index identifies itself with a device name chosen by the user on first launch. In the unified graph, devices are Objects (`objects:⟨my_laptop⟩`). In the legacy shape they are `devices` table records.

**Legacy DB record:**
```javascript
{
  id: string,   // "devices:⟨My Laptop⟩" or "devices:⟨web⟩"
  name: string,
}
```

Local identity stored at: `~/.index/.device-id` (`{ id, name, created_at, last_seen }`).

`devices:⟨web⟩` is seeded at boot for HTTP/HTTPS origins. All others created via `getOrCreateDevice(name)` in `device-service.js`.

Objects relate to their origin device via a `sourced_from` RELATE edge — legacy: `objects → devices`; new shape: `objects → objects` (device Objects).

---

## Edges

### Legacy edge tables (authoritative for writes)

| Table | Direction | Data | Meaning |
|---|---|---|---|
| `tagged` | `objects → tag_definitions` | — | Object has this tag |
| `contains` | `objects → objects` | `order: number` | Space explicitly includes this object |
| `excludes` | `objects → objects` | — | Space explicitly excludes this object |
| `typed` | `tag_definitions → tag_types` | — | Tag belongs to this type |
| `sourced_from` | `objects → devices` | — | Object originated from this device |

### New per-edge RELATION tables (readable; dual-write from Phase 2 Stage A)

One table per edge name — see `SYSTEM_EDGES` in `electron/main/db/edges.js` for the full list. Each table has:
- `DEFINE INDEX <name>_unique ON <name> FIELDS in, out UNIQUE`
- `DEFINE INDEX <name>_reverse ON <name> FIELDS out`

`includes` additionally has `DEFINE INDEX includes_order ON includes FIELDS in, order` and carries an optional `order: number` per-row field.

---

## System Anchors (reserved Object IDs)

| ID | Role |
|---|---|
| `objects:⟨~⟩` | Home space |
| `objects:⟨/⟩` | Root / all-objects view |
| `objects:⟨type⟩`, `objects:⟨medium⟩`, `objects:⟨file⟩`, `objects:⟨origin⟩` | System edge Objects |
| `objects:⟨author⟩`, `objects:⟨genre⟩`, `objects:⟨published⟩`, … | Seeded field edge Objects |
| `objects:⟨book⟩`, `objects:⟨document⟩`, `objects:⟨image⟩`, `objects:⟨video⟩`, `objects:⟨audio⟩` | Seeded type-Objects with schemas |
| `objects:⟨web⟩` | Default capture device |
| `objects:⟨includes⟩`, `objects:⟨excludes⟩`, `objects:⟨sourced_from⟩` | Structural edge Objects |

All flagged `system: true`; non-deletable via UI without explicit override.

---

## Data Persistence

```
~/.index/
├── surreal/                   # SurrealDB data files (primary source of truth)
├── export/                    # Auto-exported JSON (debounced; human-readable backup)
│   ├── objects/               # One JSON file per object
│   ├── tag_definitions/       # One JSON file per tag definition
│   ├── tag_types/             # One JSON file per tag type
│   ├── tagged_edges.json
│   ├── contains_edges.json
│   ├── excludes_edges.json
│   └── typed_edges.json
├── .device-id                 # Device identification
├── .version                   # Written on first v0.4 boot; gates v0.3 migration
├── appearance.json            # Appearance settings (IPC-backed; localStorage is in-session cache)
└── window-settings.json       # Window geometry and profile
```

Export paths reflect legacy table names and will be updated when Phase 3 drops those tables.

---

## IPC API

All renderer↔main communication goes through `window.electronAPI` (context bridge in `electron/preload/index.js`). All returned records have fully-qualified string IDs. Edge `in`/`out` fields are also stringified.

**Objects:**
- `db.getAll(table)` — Fetch all records from a table
- `db.createObject(data)` — Create object with auto system tag assignment
- `db.updateObject(id, data)` — Update object fields
- `db.deleteObject(id)` — Delete an object

**Tags (legacy):**
- `db.getTagTypes()` — Get all tag type records, sorted by order
- `db.createTag(data)` — Create a tag definition; optional `data.typeId` wires a `typed` edge
- `db.updateTag(id, data)` — Update tag; optional `data.typeId` reassigns the typed edge
- `db.deleteTag(id)` — Delete tag (guards system tags)
- `db.assignTag(objectId, tagId)` — Create a `tagged` edge + mirror to per-edge table (dual-write)
- `db.unassignTag(objectId, tagId)` — Delete the `tagged` edge + unmirror
- `db.getTagsForObject(objectId)` — Traverse `tagged` edges to fetch tag records
- `db.getObjectsForTag(tagId)` — Traverse `tagged` edges to fetch object records
- `db.findOrCreateSystemTag(type, name)` — Find or create a system tag by type and value

**Tag Types (legacy):**
- `db.createTagType(data)` — Create a user-defined tag type
- `db.updateTagType(typeId, data)` — Update a tag type record
- `db.deleteTagType(typeId)` — Delete a tag type and all its `typed` edges

**Graph-native (new shape):**
- `db.getPillsForObject(id)` — Walk `type` edge → type-Object schema → per-edge tables; return ordered pill array `[{ edge, edgeObjectId, edgeName, targetId, targetName }]`

**Spaces:**
- `db.createSpace(data)` — Create a space object
- `db.updateSpace(id, data)` — Update space fields (name, rule, query, default_view, order)
- `db.evaluateSpace(id)` — Run membership formula; return member object records

**Edges:**
- `db.addContains(parentId, childId, order?)` — Create a `contains` edge
- `db.removeContains(parentId, childId)` — Delete a `contains` edge
- `db.isContainedBy(parentId, childId)` — Check containment
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
- `fs.readFolder(path)` — Read folder tree recursively
- `fs.thumbnail(filePath, size)` — Return `data:image/png;base64,...` thumbnail via Quick Look
- `fs.epubCover(filePath, size)` — Return epub cover data URL via `qlmanage`
- `fs.readFile(filePath)` — Read a file's raw contents
- `app.openSource(uri)` — Open file or URL in native app

**Window:**
- `window.getProfile()` / `window.setProfile(profile)` — Get/set window profile (`overlay` | `window`)

**Appearance:**
- `appearance.get()` / `appearance.set(values)` — Get/set appearance settings (persisted to `~/.index/appearance.json`)

**Events (LIVE SELECT push from main):**
- `onObjectsLive(cb)` — Object created/updated/deleted
- `onTaggedLive(cb)` — `tagged` edge created/deleted
- `onContainsLive(cb)` — `contains` edge created/deleted
- `onExcludesLive(cb)` — `excludes` edge created/deleted
- `onTagDefinitionsLive(cb)` — Tag definition created/updated/deleted
- `onTypedLive(cb)` — `typed` edge created/deleted
- `onDevicesLive(cb)` — Device record created/updated
- `onSourcedFromLive(cb)` — `sourced_from` edge created/deleted
- `onTypeEdgeLive(cb)` — `type` edge (new shape) created/deleted
- `onAuthorLive(cb)` — `author` edge (new shape) created/deleted
- `onGenreLive(cb)` — `genre` edge (new shape) created/deleted
- `onPublishedLive(cb)` — `published` edge (new shape) created/deleted

---

## UI

### Home View (`~`)

Shows objects explicitly pinned to `objects:⟨~⟩` via `contains` edges, rendered by `ObjectListView`.

### All-Objects View (`/`)

`objects:⟨/⟩` — in-memory filter over all non-system objects. Not evaluated via `evaluateSpace`.

### ObjectListView

List of objects inside the active space. Grid columns: type icon (28px) / name (1fr) / Kind (56px) / date (90px). Keyboard: W/↑ up, S/↓ down, Shift+W/S extend selection, CMD+A select all, A/← back, D/→ enter.

### ObjectDetailPane

Finder-style sidebar opened on single-click. Sections: name (editable), TypeField, TypeSchemaSection (guided metadata fields from type schema), source badge, "Added" date, `TagAssignmentSection` (renders pills from new shape; mutations via legacy IPCs), `SpaceRulesSection` for spaces. Pin button (◈) toggles containment in `~`.

### TagAssignmentSection

Bridges old and new shapes. Renders from `store.pillsForObject` (new shape). Resolves each pill back to its legacy `tag_definition` via name + edge-name lookup to drive unassign/edit through existing IPCs (`db:unassignTag`, `db:findOrCreateSystemTag`).

### AddressBar

Persistent navigation strip. CMD+L focuses search. `+` dropdown creates Object or Space. Empty query shows spaces; typed query shows matching spaces (○) then objects (●).

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+Shift+Space | Toggle main window visibility |
| Cmd+\` | Navigate to `~` (home) |
| Cmd+/ | Navigate to `/` (all objects) |
| Cmd+I | Capture frontmost browser tab |
| Cmd+K | Open command palette |
| Cmd+L | Focus address bar / general search |
| Cmd+E | Edit tags / rules for selected object(s) |
| Cmd+, | Open settings |
| V | Toggle list / graph view |
| `` ` `` | Cycle list filter (hold 300 ms for combined) |
| W / ↑ | Move selection up in list |
| S / ↓ | Move selection down in list |
| A / ← | Navigate back |
| D / → | Navigate forward / enter selected |
| Shift+W/S/↑/↓ | Extend list selection (Finder range) |
| Cmd+A | Select all objects in current view |
| Escape | Close / restore prior context |

---

*Glossary v0.6 — Updated 2026-04-19*
