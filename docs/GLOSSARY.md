---
Author: Claude Code
Last Updated: 2026-03-11
Version: 0.4
---

# Index — Glossary

> Canonical definitions for Index terminology based on current implementation.
> This document describes what actually exists, not future aspirations.

---

## Core Concepts

### Object

The fundamental entity in Index. An object represents an indexed resource — a file, URL, or any addressable thing.

**Current Schema (v2):**
```javascript
{
  id: string,                        // Fully-qualified SurrealDB record ID ("objects:abc123")
  name: string,                      // Display name (derived from source on creation)
  label?: string,                    // Short display label for graph nodes (user-set, optional)
  description?: string,              // User-provided description
  sources: Source[],                 // Array of sources (can be empty)
  user_metadata: { notes?: string }, // User-provided metadata
  created_at: string,                // ISO timestamp
  updated_at: string,                // ISO timestamp
}
```

**Key Properties:**
- Identity is independent of source location — moving a file doesn't break the object
- An object can have multiple sources (e.g., the same book as a PDF on this device and an EPUB on another)
- Sources are append-only; removing a source is tracked, not erased

---

### Source

A single location that an object points to. Each object holds a `sources` array of these.

**Schema:**
```javascript
{
  uri: string,        // Full URI (file://, https://, etc.)
  origin: string,     // Device or context that added this source ("My Laptop", "Web")
  added_at: string,   // ISO timestamp when this source was added
  fileType?: string,  // Derived file extension ("pdf", "jpg", "url", "unknown")
}
```

**Supported URI schemes:**
- `file://` — local filesystem paths
- `https://` — web URLs (via paste, capture, or Cmd+I)

**Origin values:**
- Device name (e.g., "My Laptop", "iPad") — set on first launch via device naming dialog
- `"Web"` — automatically assigned to http/https sources

**Note:** `sources` replaces the v1 `source_local`/`source_remote` fields. An object with no sources is valid (metadata-only object, note, placeholder).

---

### System Tags

Tags automatically derived from an object's sources. Three types exist, defined in `electron/main/domain/tag-types.js`:

| Type | Scope | Displayed in UI | Description | Example values |
|---|---|---|---|---|
| `media_type` | Object-level (one) | Yes | What the object fundamentally is | `document`, `image`, `video`, `audio` |
| `file_type` | Per-source (many) | No | File format of each source | `pdf`, `epub`, `jpg`, `url` |
| `origin` | Per-source (many) | No | Which device/context each source came from | `My Laptop`, `Web` |

System tags cannot be deleted, but their value can be changed by the user (e.g. correcting a wrongly-inferred `media_type`). `file_type` and `origin` are queryable via collections but not shown in the tag UI on individual objects.

---

### Tag

A label applied to objects. Tags are globally defined and can be assigned to any number of objects.

**Schema:**
```javascript
{
  id: string,           // Fully-qualified SurrealDB record ID ("tag_definitions:abc123")
  name: string,
  type: string | null,  // 'media_type', 'file_type', 'origin', or null (user tag)
  system: boolean,      // true for auto-assigned system tags
  color?: string,       // Optional hex color
  description?: string,
  created_at: string,
}
```

Tags are many-to-many with objects via `tag_assignments`. Tag assignment records store fully-qualified IDs for both `object_id` and `tag_id`.

---

### Collection

A saved tag query that groups matching objects. Collections are defined by AND/OR/NOT rules over tag IDs.

**Schema:**
```javascript
{
  id: string,           // Fully-qualified SurrealDB record ID ("collections:abc123")
  name: string,
  query: {
    all: string[],      // Object must have ALL of these tag IDs
    any: string[],      // Object must have at least ONE of these tag IDs
    none: string[],     // Object must have NONE of these tag IDs
  },
  order?: number,       // Display order in sidebar
  pinned: boolean,
  created_at: string,
  updated_at: string,
}
```

Collection evaluation is implemented server-side via `db:evaluateCollection`. **Note:** As of v0.4, collection filtering in the UI is not yet wired — selecting a collection sets `activeCollectionId` in `useIndexStore` but does not currently filter displayed objects. See BACKLOG.md.

---

### Device

Each installation of Index identifies itself with a device name chosen by the user on first launch.

**Stored at:** `~/.index/.device-id`
```javascript
{
  id: string,        // UUID
  name: string,      // User-chosen name ("My Laptop", "iPad")
  created_at: string,
  last_seen: string,
}
```

The device name becomes the `origin` value for all locally-added file sources.

---

## System Concepts

### Indexing (the Action)

The process of adding an object to Index. When you index a file or URL, Index:

1. Constructs a `sources` array entry with URI, device origin, and timestamp
2. Normalizes the URI (`cleanUri`)
3. Creates an object record in SurrealDB
4. Auto-assigns system tags (`media_type`, `file_type`, `origin`) from sources
5. Schedules an async export to `~/.index/export/` (debounced, 5 seconds)

---

### Content Hash

A SHA-256 fingerprint of file contents, used for file recovery and future deduplication.

**Format:** `sha256:{64-character hex}`
**Use:** When a file is missing from its original path, Index searches nearby directories and matches by hash.

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
├── surreal/                  ← SurrealDB data files (primary source of truth)
├── export/                   ← Auto-exported JSON (debounced, human-readable)
│   ├── objects/              ← One JSON file per object ({name}_{id}.json)
│   ├── tag_definitions/      ← One JSON file per tag definition
│   ├── collections/          ← One JSON file per collection
│   └── tag_assignments.json  ← All object↔tag mappings (single file)
├── .device-id                ← Device identification
├── .version                  ← Written on first v0.4 boot; gates v0.3 migration
└── window-settings.json      ← Window geometry and profile
```

**Primary storage:** SurrealDB at `~/.index/surreal/`. All reads and writes go through SurrealDB.

**Export:** JSON files in `~/.index/export/` are written asynchronously via `scheduleExport()` after every mutation and on app quit. They are human-readable backups, not the source of truth.

**v0.3 Migration:** On first v0.4 boot, if `~/.index/.version` does not exist, Index imports all objects from the old `~/.index/objects/` JSON files into SurrealDB and writes `.version` to mark migration complete.

---

## IPC API

All renderer↔main communication goes through `window.electronAPI` (exposed via context bridge in `electron/preload/index.js`). All returned records have fully-qualified string IDs.

**Database:**
- `db.getAll(table)` — Fetch all records from a table
- `db.getTagTypes()` — Get the system tag type registry from `domain/tag-types.js`
- `db.createObject(data)` — Create object with auto system tag assignment
- `db.updateObject(id, data)` — Update object fields
- `db.deleteObject(id)` — Delete an object
- `db.createTag(data)` — Create a user tag definition
- `db.updateTag(id, data)` — Update a tag definition
- `db.deleteTag(id)` — Delete a tag (system tags with `deletable: false` are guarded)
- `db.assignTag(objectId, tagId)` — Assign tag to object
- `db.unassignTag(objectId, tagId)` — Remove tag from object
- `db.getTagsForObject(objectId)` — Get all tags for an object
- `db.getObjectsForTag(tagId)` — Get all objects for a tag
- `db.findOrCreateSystemTag(type, name)` — Find or create a system tag
- `db.repairMissingSystemTags(objectId)` — Repair auto-assigned tags for an object
- `db.createCollection(data)` — Create a saved query collection
- `db.updateCollection(id, data)` — Update collection query or name
- `db.deleteCollection(id)` — Delete a collection
- `db.evaluateCollection(id)` — Run collection query, return matching objects

**Device:**
- `device.getOrigin()` — Get current device name
- `device.getId()` — Get device UUID
- `device.isNamed()` — Check if device has been named
- `device.ensureNamed()` — Show naming dialog if needed

**File system:**
- `fs.pickFile()` — Open native file picker
- `fs.getPathForFile(file)` — Get filesystem path from a File object (webUtils)
- `app.openSource(uri)` — Open file or URL in native app

**Window:**
- `window.getProfile()` — Get current window profile (`overlay` or `window`)
- `window.setProfile(profile)` — Switch window profile

**Events (push from main via LIVE SELECT):**
- `onObjectsLive(cb)` — Object created, updated, or deleted; `{ action, result }`
- `onTagAssignmentsLive(cb)` — Tag assignment created or deleted; `{ action, result }`
- `onCollectionsLive(cb)` — Collection created, updated, or deleted; `{ action, result }`

---

## UI

### Graph View

The main view. Objects appear as force-directed nodes (D3.js). Click a node to open the detail sidebar. Cmd+Click to open the source file/URL. Nodes currently have no edge rendering — relationship edges are not yet implemented.

### Object Detail Sidebar

Right panel. Shows the selected object's name, graph label, sources, tags, and delete action. Supports inline editing of name and label. Tags are grouped by type (system tags first, then user tags).

### Collections Sidebar

Left panel. Lists all collections including the system "ALL" collection. Supports drag-to-reorder and inline create/edit/delete. Collapse toggle and resizable width.

### Settings Modal

Opened with Cmd+,. Contains: device name display, window profile toggle (overlay/window), appearance controls (light/dark theme, HSLA background color sliders).

### Undo Toast

Appears after destructive actions (delete object, delete collection, remove tag). Offers a timed undo. Implemented via `useHistoryStore`.

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+` | Toggle window visibility |
| Cmd+I | Capture frontmost browser tab (Safari supported) |
| Cmd+, | Toggle settings modal |
| Cmd+; | Toggle object detail sidebar |
| Cmd+Z | Undo last destructive action |

---

*Glossary v0.4 — Updated March 2026*
