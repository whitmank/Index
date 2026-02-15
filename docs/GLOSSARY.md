---
Author: Claude Code
Last Updated: 2026-02-14
Version: 0.3 (Implementation)
---

# Index — Glossary (v0.3)

> Canonical definitions for Index terminology based on current implementation.
> This document describes what actually exists in the system, not future aspirations.

---

## Core Concepts

### Object

The fundamental entity in Index. An object represents an indexed resource—a file or URL.

**Current Schema:**
```javascript
{
  id: RecordId,                    // SurrealDB record ID (nested: id.id contains string value)
  name: string,                     // Display name
  source: string,                   // URI pointing to the resource
  source_metadata: Object,          // Auto-derived metadata about the source
  user_metadata: Object,            // User-provided metadata (e.g., notes)
  created?: timestamp,              // (future)
  updated?: timestamp               // (future)
}
```

**Key Properties:**
- Identity is independent of source location (can move the file, object remains valid)
- Each object points to a single source via URI
- Contains both system-derived and user-provided metadata

**Example:** A PDF file indexed from your desktop, a bookmarked webpage, a downloaded video.

---

### Source

The actual location or resource that an object points to. Expressed as a URI string.

**Supported Schemes (v0.3):**
- `file://` — local filesystem paths (e.g., `/Users/karter/documents/report.pdf`)
- `https://` — web URLs (e.g., `https://example.com/article`)

**Future Sources:**
- `notion://` — Notion pages
- `obsidian://` — Obsidian notes
- Custom URI schemes via source handlers

**Key Insight:** The source is where the actual content lives; the object is how Index knows about it and tracks it.

---

### Source Metadata (`source_metadata`)

Information extracted automatically from the source at time of indexing. System-maintained, not user-editable.

**Current Fields:**
- `exists` — boolean, whether the source is currently accessible
- `type` — MIME type or content type (e.g., `image/jpeg`, `application/pdf`)
- `size` — file size in bytes (for files; content-length for URLs)
- `content_hash` — SHA-256 hash of file contents (hex string, no prefix); null for URLs
- `timestamp_accessed` — ISO timestamp when metadata was last derived

**File-Specific:** Source metadata is derived via `fs.statSync()` for local files.

**URL-Specific:** Derived via `fetch(..., { method: 'HEAD' })` using response headers.

**Example:**
```javascript
{
  exists: true,
  type: "application/pdf",
  size: 2048576,
  content_hash: "sha256:abc123def456...",
  timestamp_accessed: "2026-02-14T22:00:00Z"
}
```

---

### User Metadata (`user_metadata`)

Information added and maintained by the user. Editable and extensible.

**Current Structure:**
```javascript
{
  notes: string | null    // Free-text notes about the object
}
```

**Design:** Simple object structure allowing future fields to be added.

---

## Relationships and Linking

### Relationship

An explicit connection between two objects, stored in the `relationships` table.

**Current Schema:**
```javascript
{
  id: RecordId,
  source_id: string,       // ID of the source object
  target_id: string,       // ID of the target object
  type?: string,           // (future) Relationship type/category
  label?: string,          // (future) Optional description
  bidirectional?: boolean  // (future) Whether visible from both directions
}
```

**Note:** v0.3 has the table structure; relationship creation/deletion handlers exist but UI and filtering not yet implemented.

**Future Use Cases:**
- "This paper references that dataset"
- "This design is derived from that mockup"
- "These two articles are related"

---

## Tags (Future Implementation)

### Tag

A label that can be applied to objects. Tags are planned but not yet implemented in Phase 0.

**Planned Schema:**
```javascript
{
  id: RecordId,
  name: string,            // Unique tag name
  color?: string,          // Optional hex color (#RGB or #RRGGBB)
  description?: string     // Optional explanation
}
```

**Planned Capability:** Objects can have many tags; tags are globally managed.

**Note:** The `tags` table exists; tag creation handler exists; tag filtering UI does not.

---

## Collections (Future Implementation)

### Collection

A saved query that groups objects based on criteria. Not yet implemented.

**Planned Schema:**
```javascript
{
  id: RecordId,
  name: string,
  query: Object,           // Filter definition
  pinned?: boolean         // Visible in sidebar
}
```

**Planned Query Structure:**
```javascript
{
  all: ["tag1", "tag2"],   // Must have ALL (AND)
  any: ["tag3", "tag4"],   // Must have ANY (OR)
  none: ["tag5"]           // Must NOT have (NOT)
}
```

---

## System Concepts

### Index (the Action)

The process of adding an object to the system. When you index a file or URL, Index:

1. Parses the source URI
2. Derives source metadata (size, type, content hash)
3. Creates an object record in the database
4. Persists to `~/.index/` JSON files
5. (Future) Applies specified tags

---

### Content Hash

A SHA-256 fingerprint of file contents. Null for URLs.

**Format:** `sha256:{hex_string}` (self-documenting algorithm prefix + 64-character hex)

**Use Cases:**
- File recovery (find moved/renamed files by content)
- Deduplication (detect duplicate content)
- Future extensibility (supports other algorithms: `blake3:...`, `sha512:...`, etc.)

**Example:** `sha256:abc123def456789abcdef...`

---

### Persistence Layer

Index maintains local files in `~/.index/` structure:

```
~/.index/
├── objects/
│   ├── report_abc123.json
│   ├── website_def456.json
│   └── ...
├── relationships/
│   ├── rel_001.json
│   └── ...
└── tags/
    ├── tag_001.json
    └── ...
```

**Format:** Each entry is a standalone JSON file. Objects get individual files (`{name}_{id}.json`); relationships and tags are individual files with their full structure.

**Behavior:** On mutation (create, update, delete), the entire table is re-persisted to disk, replacing old files.

---

### File Recovery

When a file's original path changes, Index can recover it by content hash.

**Algorithm:**
1. Check if file exists at original path
2. If not, search nearby directories using content hash
3. Update object's source path if found
4. Mark as missing if not recoverable

**Scope:** v0.3 searches original directory and parent directory up to 2 levels deep.

---

## Implementation Details

### Database

- **Engine:** SurrealDB 1.3.2
- **Mode:** In-memory (ephemeral), persisted to `~/.index/` JSON files
- **Startup:** Spawn binary, connect via WebSocket (ws://127.0.0.1:8000)
- **Credentials:** root/root (dev only)
- **Namespace:** `index`
- **Database:** `main`

### IPC API (Renderer ↔ Main)

**Query Operations:**
- `db:query(sql)` — Execute SELECT query
- `db:getAll(table)` — Fetch all records from a table

**Mutation Operations:**
- `db:mutate(sql)` — Execute INSERT/UPDATE/DELETE (auto-persists)
- `db:createObject(data)` — Create object with metadata derivation
- `db:updateObject(id, data)` — Update object, refresh metadata if source changed
- `db:createRelationship(data)` — Create relationship (handler only; not exposed to UI yet)
- `db:createTag(data)` — Create tag (handler only; not exposed to UI yet)

**File Operations:**
- `fs:pickFile()` — Open native file picker, return file path
- `app:openSource(source)` — Open file in native app or URL in browser

**Events:**
- `objects:changed` — Broadcasted when file system changes detected

---

## UI Concepts

### Object List

The main view showing all indexed objects as a list.

**Current Capabilities:**
- View all objects
- Create new objects (inline form)
- Edit objects (inline editing)
- Delete individual objects or all at once
- Drag-and-drop files to create objects
- Paste URIs to create objects

**Not Yet Implemented:**
- Sorting
- Filtering
- Multi-select
- Keyboard navigation beyond shortcuts

---

### File Watchers

Monitors `~/.index/objects/` directory for external changes.

**Behavior:** When files change, triggers reload and broadcasts `objects:changed` to renderer.

**Debounce:** 500ms to prevent excessive reloads during batch operations.

---

## Not Yet Implemented

These concepts from the future vision document are not in v0.3:

- **Tag Definitions & Assignments** — Tag creation handlers exist; filtering and UI don't
- **Collections** — Planned but no implementation
- **Link Types & Direction** — Relationship table exists; these fields are planned
- **Source Type Filtering** — No denormalized `type` field on objects for fast filtering
- **Deduplication** — Content hashes calculated but not used for duplicate detection
- **Detail Panel** — No object detail view
- **Graph View** — No visualization of relationships
- **Full-Text Search** — Can't search file contents
- **Source Handlers** — Metadata derivation is inline; pluggable handlers are future architecture

---

## Consistency Notes

- **RecordId Format:** SurrealDB returns RecordId objects with nested `.id` property. Frontend accesses via `obj.id.id` for the string value.
- **Metadata Derivation:** Happens synchronously for files (fs.statSync), asynchronously for URLs (fetch). Results cached in object.
- **Persistence:** Synchronous after every mutation to ensure durability. Side effect of `db:mutate` and object creation handlers.

---

*Glossary Version 0.3 — Last Updated February 14, 2026*
*Reflects implementation state, not aspirational features*
