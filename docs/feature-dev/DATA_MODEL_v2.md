---
Author: Claude Code
Date: 2026-02-23
Status: Design Specification (v2)
---

# Data Model v2 - Multi-Device Sources Architecture

This document defines the updated data model for Index supporting multi-device sync with device-agnostic source management.

**Key Changes from v1:**
- `source_local` and `source_remote` fields replaced with single `sources: Source[]` array
- Each source includes `origin` metadata (device identifier)
- System tags based on URI scheme and origin
- Objects sync across devices; source content does not
- Users explicitly copy sources between devices, creating new entries

---

## Core Concept: Sources as Device-Agnostic References

An object's sources list represents **all known ways to access it across all devices**. Each source entry explicitly records:
- **What** — The URI (file path, URL, network path)
- **Where** — The device/origin it came from (`myLaptop`, `myTablet`, `web`)

When viewing an object on a device:
- Sources from that origin are **locally accessible**
- Sources from other origins are **remotely accessible** (stream/download) or **not accessible** (requires user action)
- User can **create new sources** by copying from remote origins

---

## Table Definitions

### OBJECTS TABLE

Core entity representing indexed resources.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── name: string (required, human-readable label)
├── description: string | null (optional, user-provided notes)
├── sources: Source[] (required, at least one source)
│   └── Source object:
│       ├── uri: string (required, any valid URI: file://, https://, smb://, etc.)
│       ├── origin: string (required, device identifier where source lives)
│       └── added_at: ISO8601 (when this source was added to object)
├── created_at: ISO8601 (when object was first indexed)
└── updated_at: ISO8601 (last modification timestamp)

Constraints:
├── At least one source required
├── UNIQUE (uri, origin) - same source from same origin cannot appear twice
└── sources array is immutable except for appending new sources

Indexes:
├── id (PRIMARY)
├── created_at (temporal queries)
└── (future) sources.origin (device queries)

Notes:
├── Objects metadata (name, description, sources list) syncs across all devices
├── Source content (file bytes, web page HTML) does NOT automatically sync
├── User explicitly decides whether to copy source content to their device
└── Presence of origin in sources array indicates availability on that device
```

### TAG_DEFINITIONS TABLE

Defines all tags: system-generated and user-created.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── name: string (required, the tag value)
├── type: string | null (tag category)
│   ├── System tags use: "media_type", "file_type", "origin"
│   ├── User key:value pairs use: any user-defined string (e.g., "priority", "client")
│   └── Simple user tags use: null
├── system: boolean (required, true if auto-generated, false if user-created)
├── description: string | null (explanation of tag's purpose)
└── created_at: ISO8601

Uniqueness Constraints:
├── UNIQUE (type, name) where system = true
│   └── System tags are scoped by type; no duplicate media_type:document or origin:myLaptop
├── UNIQUE (type, name) where system = false AND type IS NOT NULL
│   └── User key:value tags are scoped by type
└── UNIQUE (name) where system = false AND type IS NULL
    └── Simple user tags are globally unique

Indexes:
├── id (PRIMARY)
├── (type, name) (for uniqueness and lookups)
└── system (for filtering)

Data Constraints:
├── Tags with system = true:
│   ├── Cannot be modified by users (enforced in application layer)
│   ├── Cannot be deleted by users
│   ├── type must be one of: "media_type", "file_type", "origin"
│   └── Examples: {name: "document", type: "media_type"}, {name: "pdf", type: "file_type"}, {name: "myLaptop", type: "origin"}
└── Tags with system = false:
    ├── Can be created, modified, and deleted by users
    ├── type can be any string or null
    └── description is optional
```

### TAG_ASSIGNMENTS TABLE

Junction table for many-to-many object-tag relationships.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── object_id: string (FOREIGN KEY → objects.id, required)
├── tag_id: string (FOREIGN KEY → tag_definitions.id, required)
└── created_at: ISO8601

Constraints:
├── FOREIGN KEY: object_id → objects.id (ON DELETE CASCADE)
├── FOREIGN KEY: tag_id → tag_definitions.id (ON DELETE CASCADE)
└── UNIQUE (object_id, tag_id) - object cannot have same tag twice

Indexes:
├── object_id (find all tags for an object)
├── tag_id (find all objects with a tag)
└── (object_id, tag_id) (enforces uniqueness)

Purpose:
└── Records which tags apply to which objects
    ├── System tags auto-assigned based on sources array
    └── User tags manually assigned by users
```

### COLLECTIONS TABLE

Saved queries that filter objects by tag criteria.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── name: string (required, display name)
├── description: string | null (explanation of collection purpose)
├── query: object (tag filtering logic)
│   ├── all: string[] (tag names that ALL must be present)
│   ├── any: string[] (tag names where ANY one can be present)
│   └── none: string[] (tag names that NONE can be present)
├── pinned: boolean (default: false)
├── order: number (sort order in UI)
├── created_at: ISO8601
└── updated_at: ISO8601

Notes:
├── Collections query works across both system and user tags
├── Tags in query are referenced by name (string)
├── Query logic: (all AND (any OR none))
└── Results update dynamically as objects are tagged
```

---

## System Tags Specification

System tags are auto-generated when objects are created or modified. Three types:

### media_type (Fundamental Content Type)

**Purpose:** Classify what the object fundamentally IS (determined once per object)

**Values:**
- `document` — Documents (PDF, Word, Text, Markdown, etc.)
- `image` — Images (JPG, PNG, SVG, GIF, etc.)
- `video` — Videos (MP4, MKV, MOV, AVI, etc.)
- `audio` — Audio files (MP3, WAV, FLAC, M4A, etc.)
- `spreadsheet` — Spreadsheets (XLS, XLSX, CSV, etc.)
- `presentation` — Presentations (PPT, PPTX, etc.)

**Assignment Logic:**
- Inferred from file extension of **first source only**
- Applied to entire object (all sources are the same media type)
- Assigned once per object, never changes

**Cardinality:** Low (6 defined values)

**Examples:**
```
Object with sources: [book.pdf, book.epub, https://example.com/book.pdf]
└── Auto-assigned tags: media_type:document (from first source)

Object with sources: [image.jpg, image.png, https://example.com/image.jpg]
└── Auto-assigned tags: media_type:image
```

### file_type (File Format)

**Purpose:** Track specific format/extension of each source

**Values:**
- Common formats: `pdf`, `epub`, `docx`, `txt`, `md`, `jpg`, `png`, `gif`, `mp4`, `mp3`, `xlsx`, `pptx`, etc.
- Any file extension can become a file_type tag

**Assignment Logic:**
- Extract file extension from each source URI
- Auto-assign tag for each unique file type found across all sources
- Multiple file types per object (if sources have different extensions)

**Cardinality:** Medium (~50-200 possible values)

**Examples:**
```
Object with sources: [file.pdf, file.epub, https://example.com/file.pdf]
└── Auto-assigned tags: file_type:pdf, file_type:epub

Object with sources: [image.jpg, https://example.com/image.png]
└── Auto-assigned tags: file_type:jpg, file_type:png
```

### origin (Device Origin)

**Purpose:** Track which devices/sources provide this object and implicitly encode URI scheme

**Values:**
- `myLaptop` — Local file on primary laptop (implies file://)
- `myTablet` — Local file on tablet (implies file://)
- `web` — Web/public sources (implies https:// or http://)
- `nas` — Network attached storage (implies smb://)
- `ftp-server` — FTP server (implies ftp://)
- User-defined device/service identifiers

**Assignment Logic:**
- Inspect sources array for all unique `origin` values
- Auto-assign tag for each unique origin present
- If object has sources from laptop AND tablet AND web, gets all three tags
- When user copies source to new device, that device's origin tag is added
- URI scheme is stored in the URI itself; origin implicitly encodes it

**Cardinality:** Medium (~5-20 values per setup)

**Examples:**
```
Object indexed on laptop, web source:
└── Auto-assigned tags: origin:myLaptop (file://), origin:web (https://)

Same object synced to tablet (metadata only, no file copy yet):
└── Auto-assigned tags: origin:myLaptop, origin:web (same)

User copies laptop source to tablet:
└── Auto-assigned tags: origin:myLaptop, origin:myTablet, origin:web (NEW)
```

---

## User Tags Specification

### Simple Tags

Single-word values with no type/category.

```
Examples: "research", "important", "urgent", "archived"
Storage: {name: "research", type: null, system: false}
```

### Key:Value Tags

User-defined categories with specific values.

```
Examples:
  priority:high
  client:acme
  status:in-progress
  project:ml

Storage: {name: "high", type: "priority", system: false}
```

---

## Data Flow: Object Creation

```
User adds local file or URL
  Input: {name, uri, origin}

  Step 1: Validate
  ├─ name is provided
  └─ uri and origin are provided

  Step 2: Create object record
  └─ INSERT objects (name, sources: [{uri, origin, added_at}], created_at, updated_at)

  Step 3: Extract system tags from sources array
  ├─ For each source.uri:
  │   ├─ Extract scheme (file://, https://, etc.)
  │   └─ Find or CREATE tag_definitions with type: "scheme"
  └─ For each unique source.origin:
      ├─ Origin value
      └─ Find or CREATE tag_definitions with type: "origin"

  Step 4: Assign system tags
  └─ For each extracted tag:
      ├─ INSERT tag_assignments (object_id, tag_id)
      └─ Handle duplicates gracefully

  Result: Object created with system tags auto-assigned
```

---

## Data Flow: Copying Source to Local Device

```
User copies remote source to their device
  Input: object_id, source_to_copy (from sources array), local_path, current_origin

  Step 1: Validate
  ├─ object exists
  ├─ source_to_copy exists in sources array
  ├─ local_path is writable
  └─ No existing source with (uri: local_path, origin: current_origin)

  Step 2: Copy file/content
  └─ Retrieve source content and write to local_path

  Step 3: Add new source to object
  ├─ Create new source entry:
  │   {
  │     uri: local_path,
  │     origin: current_origin,
  │     added_at: now()
  │   }
  └─ Append to sources array

  Step 4: Update object
  └─ UPDATE objects SET sources = [..., new_source], updated_at = now()

  Step 5: Update system tags
  ├─ Recalculate file_type tags (might need new type if different format)
  ├─ Check if origin:current_origin tag already exists (usually yes)
  └─ If new origin, CREATE tag and ASSIGN to object

  Result: New source added, object now has local copy, tags updated if needed
```

---

## Data Flow: Object Sync Across Devices

```
Device A creates object, Device B syncs

  Device A (Laptop):
  ├─ Creates object with sources: [{uri: file://..., origin: myLaptop}]
  ├─ Auto-assigns tags: media_type:document, file_type:pdf, origin:myLaptop
  ├─ Persists to ~/.index/
  └─ Broadcasts sync event

  Device B (Tablet):
  ├─ Receives sync (objects list + metadata)
  ├─ Creates object with SAME sources array: [{uri: file://..., origin: myLaptop}]
  ├─ Auto-assigns SAME tags: media_type:document, file_type:pdf, origin:myLaptop
  ├─ Loads tag definitions from sync
  └─ Hydrates tag assignments

  Now on Device B (Tablet):
  ├─ User sees object has source from myLaptop
  ├─ Can attempt to access myLaptop::file:// (if network available)
  ├─ OR decides to copy: retrieves file from myLaptop and creates myTablet source
  └─ Result: new source added, origin:myTablet tag assigned
```

---

## Data Flow: Collection Query Evaluation

```
User activates collection
  Input: collection with query {all: [...], any: [...], none: [...]}

  Step 1: Load all objects
  └─ SELECT * FROM objects

  Step 2: For each object
  ├─ Load all tags via tag_assignments
  │   └─ SELECT tag_definitions.name FROM tag_assignments
  │       JOIN tag_definitions WHERE object_id = ?
  │
  ├─ Evaluate query logic:
  │   ├─ Check: object has ALL of query.all tags
  │   ├─ Check: object has ANY of query.any tags (if any provided)
  │   └─ Check: object has NONE of query.none tags
  │
  └─ Include object if all conditions met

  Result: Filtered list of matching objects
```

### Example Queries

```
Collection: "All Documents"
query: {all: ["media_type:document"]}
Result: All document objects

Collection: "Web Sources"
query: {all: ["origin:web"]}
Result: All objects with web sources

Collection: "Laptop Files"
query: {all: ["origin:myLaptop", "media_type:document"]}
Result: Documents indexed on laptop

Collection: "Available Everywhere"
query: {all: ["origin:myLaptop", "origin:myTablet", "origin:web"]}
Result: Objects accessible from all three origins

Collection: "Multi-Device"
query: {any: ["origin:myLaptop", "origin:myTablet"]}
Result: Objects indexed on either device
```

---

## Example Data: Multi-Device Scenario

### Initial State: Object on Laptop

User indexes a local file and adds web source:

```
object:1
├── id: "obj:1"
├── name: "Siddhartha"
├── description: "Hermann Hesse novel"
├── sources: [
│   {
│     uri: "file:///Users/karter/Documents/siddhartha.pdf",
│     origin: "myLaptop",
│     added_at: "2026-02-23T10:00:00Z"
│   },
│   {
│     uri: "https://example.com/siddhartha.pdf",
│     origin: "web",
│     added_at: "2026-02-23T10:05:00Z"
│   }
│ ]
├── created_at: "2026-02-23T10:00:00Z"
└── updated_at: "2026-02-23T10:05:00Z"

Auto-assigned tags:
├── media_type:document (from first source, pdf)
├── file_type:pdf (has .pdf sources)
├── origin:myLaptop (source from laptop)
└── origin:web (source from web)
```

### Synced to Tablet (Metadata Only)

Tablet receives sync. Object exists with same sources array and tags—but file is not copied:

```
object:1 (on tablet)
├── sources: [
│   {uri: "file:///Users/karter/Documents/siddhartha.pdf", origin: "myLaptop", ...},
│   {uri: "https://example.com/siddhartha.pdf", origin: "web", ...}
│ ]
├── Tags: media_type:document, file_type:pdf, origin:myLaptop, origin:web
└── Tablet user sees: can access web URL directly, can try to access laptop file over network

Tablet file system:
└── /Users/karter/Documents/ does NOT contain siddhartha.pdf
```

### User Copies Laptop Source to Tablet

User decides to make file locally available on tablet:

```
1. App copies file from myLaptop to tablet:
   /Users/karter/iPad/Documents/siddhartha.pdf

2. New source entry created and appended:
   {
     uri: "file:///Users/karter/iPad/Documents/siddhartha.pdf",
     origin: "myTablet",
     added_at: "2026-02-23T14:30:00Z"
   }

3. Object updated:

object:1 (updated)
├── sources: [
│   {uri: "file:///Users/karter/Documents/siddhartha.pdf", origin: "myLaptop", ...},
│   {uri: "file:///Users/karter/iPad/Documents/siddhartha.pdf", origin: "myTablet", ...},
│   {uri: "https://example.com/siddhartha.pdf", origin: "web", ...}
│ ]
├── updated_at: "2026-02-23T14:30:00Z"
└── Tags: media_type:document, file_type:pdf, origin:myLaptop, origin:myTablet, origin:web
└──       (new origin:myTablet tag auto-assigned)

4. Changes sync back to laptop:
   Laptop now also sees object with all three sources and updated tags
```

### Sample Tag Definitions

```
System Tags - Media Type:
tag:1 {name: "document", type: "media_type", system: true, description: "Document (PDF, Word, Text, Markdown, etc.)"}
tag:2 {name: "image", type: "media_type", system: true, description: "Image (JPG, PNG, SVG, GIF, etc.)"}
tag:3 {name: "video", type: "media_type", system: true, description: "Video file (MP4, MKV, MOV, AVI, etc.)"}

System Tags - File Type:
tag:4 {name: "pdf", type: "file_type", system: true, description: "PDF format"}
tag:5 {name: "epub", type: "file_type", system: true, description: "EPUB format"}
tag:6 {name: "jpg", type: "file_type", system: true, description: "JPEG image"}

System Tags - Origin:
tag:7 {name: "myLaptop", type: "origin", system: true, description: "Local file on primary laptop (file://)"}
tag:8 {name: "myTablet", type: "origin", system: true, description: "Local file on tablet (file://)"}
tag:9 {name: "web", type: "origin", system: true, description: "Public web source (https://)"}

User Tags - Simple:
tag:10 {name: "research", type: null, system: false}
tag:11 {name: "fiction", type: null, system: false}

User Tags - Key:Value:
tag:12 {name: "high", type: "priority", system: false}
tag:13 {name: "2026", type: "year", system: false}
```

### Sample Tag Assignments

```
object:1 → tag:1 (media_type:document) [system, auto-assigned]
object:1 → tag:4 (file_type:pdf) [system, auto-assigned]
object:1 → tag:7 (origin:myLaptop) [system, auto-assigned]
object:1 → tag:9 (origin:web) [system, auto-assigned]
object:1 → tag:8 (origin:myTablet) [system, auto-assigned after copy]
object:1 → tag:11 (fiction) [user-assigned]
object:1 → tag:12 (priority:high) [user-assigned]
```

---

## Key Design Decisions

### 1. Flattened Sources Array

**Decision:** Single `sources: Source[]` instead of separate `source_local` and `source_remote` fields.

**Why:**
- Future-proof for multi-device sync (what's "local" depends on current device)
- Handles multiple sources of same type (e.g., file on laptop AND tablet)
- Extensible to arbitrary URI schemes (file://, https://, smb://, etc.)
- Simpler to reason about (one unified structure)

**Tradeoff:** Requires more care in querying/indexing compared to simple null checks

### 2. Origin as Explicit Metadata

**Decision:** Each source includes `origin` field identifying which device/context it came from.

**Why:**
- Two devices can have identical file paths—origin disambiguates
- Enables querying "which devices have this object?"
- Makes sync logic clear (metadata syncs everywhere, content doesn't)
- Users understand their device's context

**Tradeoff:** More metadata per source, requires device identifier management

### 3. System Tags for Media Type, File Type, and Origin

**Decision:** Auto-generate system tags for media type, file type, and origin (URI scheme implicit in origin).

**Why:**
- Consistent with existing tag architecture
- Enables rich filtering via collections (e.g., "documents available on tablet")
- Flexible—new file types/origins auto-handled without schema migration
- Queryable alongside user tags
- Media type determined once (object-level), file type per-source (can vary)
- Origin implicitly encodes URI scheme; no redundant scheme tags

**Tradeoff:** Tags must be kept in sync with sources array (handled during object modification)

### 4. Sources Array is Append-Only

**Decision:** Sources can be added but not removed (logically). Removal would require data cleanup.

**Why:**
- Preserves history of where content came from
- Prevents accidental loss of reference information
- Users can delete source files separately from their reference in Index
- Simpler than "remove source" logic

**Future:** Could add soft-delete or archival if needed

### 5. Device Identifiers are User-Facing Strings

**Decision:** Origins are human-readable strings (`myLaptop`, `myTablet`, `web`) not UUIDs.

**Why:**
- Easier for users to understand and configure
- More readable in logs and debugging
- Collections queries are intuitive: "show origin:myTablet"

**Future:** Could add UUIDs for authentication/security if sync becomes peer-to-peer

### 6. No Automatic Content Sync

**Decision:** Objects metadata syncs; source content does not.

**Why:**
- Bandwidth efficient (users only copy what they need)
- Storage efficient (devices keep their own copies)
- Gives users control and agency
- Simpler sync logic (don't need to track "needs sync" state)
- Aligns with design philosophy

**Tradeoff:** Users must explicitly decide to make content available locally

---

## Migration Path from v1

**Breaking Changes:**
- `source_local` and `source_remote` fields removed
- New `sources` array structure
- System tags now based on media_type, file_type, and origin (origin implicit encodes scheme)

**Migration Strategy:**
1. On app startup (v1→v2), scan existing objects
2. For each object, convert:
   - `source_local` → `sources[{uri, origin: "myLaptop", added_at}]`
   - `source_remote` → `sources[{uri, origin: "web", added_at}]`
3. Recalculate all system tags based on new sources
4. Preserve all user tags
5. Backup original v1 data before migration

---

## Implementation Considerations

### Hydration

On startup, load from `~/.index/`:
1. Load tag_definitions (both system and user)
2. Load objects with full sources array
3. Load tag_assignments
4. Load collections

### Persistence

Persist to `~/.index/`:
- `objects/` — individual object files
- `tag_definitions/` — individual tag files
- `tag_assignments.json` — all assignments
- `collections/` — individual collection files

### Querying Examples (Backend)

```javascript
// Find all objects with local file sources on this device
SELECT * FROM objects
WHERE sources.@.origin == "myLaptop"
AND sources.@.uri LIKE "file://%"

// Find objects accessible from multiple devices
SELECT * FROM objects
WHERE (count(SELECT DISTINCT origin FROM sources) >= 2)

// Find objects with web backup
SELECT * FROM objects
WHERE sources.@.origin == "web"
```

### Frontend UI Implications

**Object Detail View:**
- Display sources list with origin label
- Show icon/indicator for accessibility on current device
- "Copy to this device" button for remote sources
- Highlight default source (prefer local)

**Collections:**
- Filter by scheme: "show all PDFs" (scheme:file)
- Filter by origin: "show laptop files" (origin:myLaptop)
- Filter by combo: "PDFs with web backup" (all: [scheme:file, origin:web])

**Search/Discovery:**
- "Show objects available on tablet" (origin:myTablet)
- "Show only web sources" (all: [scheme:https])

---

## Success Criteria

Implementation is complete when:
- [ ] Objects store sources as array with origin metadata
- [ ] Old v1 objects migrated to new structure
- [ ] System tags auto-generated for scheme and origin
- [ ] Objects sync metadata across devices (design only, not implementation)
- [ ] Users can manually copy source content to local device
- [ ] New source entries created when content is copied
- [ ] Tags update automatically when sources change
- [ ] Collections queries work with scheme: and origin: tags
- [ ] No existing user data lost or corrupted

---

*Data Model v2 - Multi-Device Source Architecture*
*Created: 2026-02-23*
*Status: Ready for Implementation Planning*
