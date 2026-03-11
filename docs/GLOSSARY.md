---
Author: Claude Code
Last Updated: 2026-03-10
Version: 0.3
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
  id: string,                      // SurrealDB record ID (plain string after normalization)
  name: string,                    // Display name (derived from source on creation)
  label?: string,                  // Short display label for graph nodes (user-set, optional)
  description?: string,            // User-provided description
  sources: Source[],               // Array of sources (can be empty)
  user_metadata: { notes?: string }, // User-provided metadata
  created_at: string,              // ISO timestamp
  updated_at: string,              // ISO timestamp
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
  uri: string,        // Full URI (file://, https://, smb://, etc.)
  origin: string,     // Device or context that added this source ("My Laptop", "Web")
  added_at: string,   // ISO timestamp when this source was added
  fileType?: string,  // Derived file extension ("pdf", "jpg", "url", "unknown")
}
```

**Supported URI schemes (v0.3):**
- `file://` — local filesystem paths
- `https://` — web URLs (via paste, capture, or Cmd+I)

**Origin values:**
- Device name (e.g., "My Laptop", "iPad") — set on first launch
- `"Web"` — automatically assigned to http/https sources

**Key Insight:** `sources` is the v2 replacement for the old single `source_local`/`source_remote` fields. An object with no sources is valid (metadata-only object, note, placeholder).

---

### System Tags

Tags automatically derived from an object's sources. Three types:

| Type | Scope | Description | Example values |
|---|---|---|---|
| `media_type` | Object-level (one) | What the object fundamentally is | `document`, `image`, `video`, `audio` |
| `file_type` | Per-source (many) | File format of each source | `pdf`, `epub`, `jpg`, `url` |
| `origin` | Per-source (many) | Which device/context each source came from | `My Laptop`, `Web` |

System tags are read-only in the sense that they cannot be deleted — but their value can be changed by the user (e.g. correcting a wrongly-inferred `media_type`).

Only `media_type` is displayed in the tag UI by default. `file_type` and `origin` are queryable via collections but not shown on individual objects.

---

### Tag

A label applied to objects. Tags are globally defined and can be assigned to any number of objects.

**Schema:**
```javascript
{
  id: string,
  name: string,
  type: string | null,     // 'media_type', 'file_type', 'origin', or null (user tag)
  system: boolean,         // true for auto-assigned system tags
  color?: string,          // Optional hex color
  description?: string,
  created_at: string,
}
```

Tags are many-to-many with objects via `tag_assignments`.

---

### Collection

A saved tag query that automatically groups matching objects. Collections update live as objects and tags change.

**Schema:**
```javascript
{
  id: string,
  name: string,
  query: {
    all: string[],   // Object must have ALL of these tag IDs
    any: string[],   // Object must have at least ONE of these tag IDs
    none: string[],  // Object must have NONE of these tag IDs
  },
  order?: number,    // Display order in sidebar
  pinned: boolean,
  created_at: string,
  updated_at: string,
}
```

Collections are evaluated in the backend (`db:evaluateCollection`) and reflected in the frontend via the `useCollectionsStore`.

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
5. Persists to `~/.index/` JSON files

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
├── objects/                  ← One JSON file per object ({name}_{id}.json)
├── tag_definitions/          ← One JSON file per tag definition
├── tag_assignments.json      ← All object↔tag mappings (single file)
├── collections/              ← One JSON file per collection
├── .device-id                ← Device identification
└── window-settings.json      ← Window geometry
```

**Format:** Human-readable JSON. The `objects/` directory is safe to inspect and version-control.

**Persistence behavior (v0.3):** Written synchronously after every mutation. In v0.4 this will become async/background.

---

## IPC API

All renderer↔main communication goes through `window.electronAPI` (exposed via context bridge).

**Database:**
- `db.getAll(table)` — Fetch all records from a table
- `db.createObject(data)` — Create object with auto system tag assignment
- `db.updateObject(id, data)` — Update object fields
- `db.createTag(data)` — Create a user tag definition
- `db.assignTag(objectId, tagId)` — Assign tag to object
- `db.unassignTag(objectId, tagId)` — Remove tag from object
- `db.getTagsForObject(objectId)` — Get all tags for an object
- `db.createCollection(data)` — Create a saved query collection
- `db.updateCollection(id, data)` — Update collection query or name
- `db.deleteCollection(id)` — Delete a collection
- `db.evaluateCollection(id)` — Run collection query, return matching objects
- `db.findOrCreateSystemTag(type, name)` — Find or create a system tag
- `db.repairMissingSystemTags(objectId)` — Repair auto-assigned tags for an object

**Device:**
- `device.getOrigin()` — Get current device name
- `device.getId()` — Get device UUID
- `device.isNamed()` — Check if device has been named
- `device.ensureNamed()` — Show naming dialog if needed

**File system:**
- `fs.pickFile()` — Open native file picker
- `app.openSource(uri)` — Open file or URL in native app

**Window:**
- `window.getProfile()` — Get current window profile (`overlay` or `window`)
- `window.setProfile(profile)` — Switch window profile

**Events (push from main):**
- `onObjectsChanged(cb)` — File system change detected; reload objects

---

## UI

### Graph View

The main view. Objects appear as force-directed nodes (D3.js). Click a node to open the detail sidebar. Cmd+Click to open the source file/URL.

### Object Detail Sidebar

Right panel. Shows the selected object's name, graph label, sources, tags, and delete action. Supports inline editing of name and label.

### Collections Sidebar

Left panel. Lists all collections. Click to filter the graph to matching objects. Supports reordering and pinning.

### Settings Modal

Opened with Cmd+. Contains: device name display, window profile toggle (overlay/window), appearance (light/dark mode).

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| Cmd+` | Toggle window visibility |
| Cmd+I | Capture frontmost browser tab (Safari supported) |
| Cmd+. | Toggle settings modal |
| Cmd+; | Toggle object detail sidebar |
| Cmd+Z | Undo last destructive action |

---

*Glossary v0.3 — Updated March 2026*
