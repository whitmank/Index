---
Author: Claude Code
Date: 2026-02-18
Status: Final Specification
---

# Data Model - Final Specification

This document defines the complete data model for system tags in Index.

---

## Table Definitions

### OBJECTS TABLE

The core entity representing indexed resources.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── name: string (required, human-readable label)
├── source_local: string | null (file path if local source exists)
├── source_remote: string | null (URL if remote source exists)
├── created_at: ISO8601 (required, when object was indexed)
└── updated_at: ISO8601 (required, last modification timestamp)

Constraints:
└── None (both sources can be null)

Indexes:
├── id (PRIMARY)
└── created_at (for temporal queries)

Notes:
├── High-cardinality metadata (file paths, URLs) stored as properties, not tags
├── Low-cardinality metadata (type, category) stored as tags
└── At least name is required; sources optional
```

---

### TAG_DEFINITIONS TABLE

Defines all tags in the system: both auto-generated system tags and user-created tags.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── name: string (required, the tag value)
├── type: string | null (tag category)
│   ├── System tags use: "media_type", "file_extension"
│   ├── User key:value pairs use: any user-defined string (e.g., "priority", "client")
│   └── Simple user tags use: null
├── system: boolean (required, true if auto-generated, false if user-created)
├── description: string | null (explanation of tag's purpose)
└── created_at: ISO8601

Uniqueness Constraints:
├── UNIQUE (type, name) where system = true
│   └── System tags are scoped by type; no duplicate media_type:pdf
├── UNIQUE (type, name) where system = false AND type IS NOT NULL
│   └── User key:value tags are scoped by type; no duplicate priority:high
└── UNIQUE (name) where system = false AND type IS NULL
    └── Simple user tags are globally unique; no duplicate "research"

Indexes:
├── id (PRIMARY)
├── (type, name) (for uniqueness and lookups)
└── system (for filtering)

Data Constraints:
├── Tags with system = true:
│   ├── Cannot be modified by users (enforced in application layer)
│   ├── Cannot be deleted by users
│   ├── type must be one of: "media_type", "file_extension"
│   └── description is optional but recommended
├── Tags with system = false:
│   ├── Can be created, modified, and deleted by users
│   ├── type can be any string (user-defined) or null
│   └── description is optional

Examples:
├── System tag (simple): {name: "pdf", type: "file_extension", system: true}
├── System tag (simple): {name: "image", type: "media_type", system: true}
├── User tag (key:value): {name: "high", type: "priority", system: false}
├── User tag (key:value): {name: "acme", type: "client", system: false}
└── User tag (simple): {name: "research", type: null, system: false}
```

---

### TAG_ASSIGNMENTS TABLE

Junction table representing the many-to-many relationship between objects and tags.

```
Field Definitions:
├── id: string (SurrealDB RecordId, PRIMARY KEY)
├── object_id: string (FOREIGN KEY → objects.id, required)
├── tag_id: string (FOREIGN KEY → tag_definitions.id, required)
└── created_at: ISO8601

Constraints:
├── FOREIGN KEY: object_id → objects.id (ON DELETE CASCADE)
├── FOREIGN KEY: tag_id → tag_definitions.id (ON DELETE CASCADE)
└── UNIQUE (object_id, tag_id)
    └── An object cannot have the same tag assigned twice

Indexes:
├── object_id (find all tags for an object)
├── tag_id (find all objects with a tag)
└── (object_id, tag_id) (enforces uniqueness)

Purpose:
└── Records which tags apply to which objects
    ├── System tags are auto-assigned during object creation
    └── User tags are manually assigned by users
```

---

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
├── pinned: boolean (default: false, whether to show in sidebar)
├── order: number (sort order in UI)
├── created_at: ISO8601
└── updated_at: ISO8601

Notes:
├── Collections query works across both system and user tags
├── Tags in query are referenced by name (string)
├── Query logic: (all AND (any OR none)) - evaluated per object
└── Results update dynamically as objects are tagged
```

---

## Relationships & Cardinality

```
objects ──1──→ N ──── tag_assignments ──1──→ N ──── tag_definitions
                           │
                           └─ (bidirectional many-to-many)

objects
  └─ 1 object → N tag_assignments → N tags

tag_definitions
  └─ 1 tag → N tag_assignments → N objects

collections
  └─ References tag_definitions by name (implicit relationship)
```

---

## System Tags Specification

System tags are auto-generated during object creation. Two types are defined:

### media_type

**Purpose:** Classify content by high-level media category

**Values:**
- `image` — Image files (jpg, png, gif, webp, svg, etc.)
- `pdf` — PDF documents
- `text` — Plain text files (txt, md, rst, etc.)
- `video` — Video files (mp4, mkv, mov, etc.)
- `audio` — Audio files (mp3, wav, flac, etc.)
- `document` — Office documents (docx, xlsx, pptx, etc.)
- `other` — Anything not fitting above categories

**Extraction:** Determined from MIME type or file extension of source

**Cardinality:** Low (~10 values)

**Examples:**
- `{name: "pdf", type: "media_type", system: true}`
- `{name: "image", type: "media_type", system: true}`

---

### file_extension

**Purpose:** Track original file extension for precise format identification

**Values:** Any file extension found in sources (jpg, pdf, md, txt, mp3, docx, etc.)

**Extraction:** Extracted from filename of local source or URL of remote source

**Cardinality:** Medium (~50-200 possible values)

**Examples:**
- `{name: "pdf", type: "file_extension", system: true}`
- `{name: "jpg", type: "file_extension", system: true}`
- `{name: "md", type: "file_extension", system: true}`

---

## User Tags Specification

Users can create two types of tags:

### Simple Tags

Single-word values with no type/category.

```
Examples: "research", "important", "urgent", "archived"
Storage: {name: "research", type: null, system: false}
Query: Look for objects tagged "research"
```

### Key:Value Tags

User-defined categories with specific values.

```
Examples:
  priority:high
  priority:medium
  priority:low
  client:acme
  client:google
  status:in-progress
  status:completed

Storage: {name: "high", type: "priority", system: false}
Query: Look for objects tagged "priority:high"
```

---

## Data Flow: Object Creation

```
User initiates object creation
  Input: {name, source_local?, source_remote?}

  Step 1: Validate
  ├─ name is provided
  └─ At least one source exists (or both null for special cases)

  Step 2: Create object record
  └─ INSERT objects (name, source_local, source_remote, created_at, updated_at)

  Step 3: Extract system tags
  ├─ For media_type:
  │   ├─ Determine from MIME type or extension
  │   └─ Find or CREATE tag_definitions record
  └─ For file_extension:
      ├─ Extract from source filename/URL
      └─ Find or CREATE tag_definitions record

  Step 4: Assign system tags
  └─ For each system tag:
      ├─ INSERT tag_assignments (object_id, tag_id)
      └─ Handle duplicates gracefully (if both sources have same extension)

  Result: Object created with system tags auto-assigned
```

---

## Data Flow: User Tag Assignment

```
User adds tag to object
  Input: object_id, tag_name, tag_type? (optional for simple tags)

  Step 1: Validate
  ├─ object exists
  └─ tag does not already exist on object

  Step 2: Find or create tag definition
  ├─ Query tag_definitions WHERE name = tag_name AND type = tag_type
  └─ If not found: CREATE tag_definitions (name, type, system: false, ...)

  Step 3: Assign tag to object
  ├─ Check if assignment already exists
  └─ If not: INSERT tag_assignments (object_id, tag_id)

  Result: User tag assigned to object
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

---

## Example Data

### Sample Objects

```
obj:1
├── name: "Claude Research Paper"
├── source_local: null
├── source_remote: "https://arxiv.org/pdf/2024-12345.pdf"
├── created_at: "2026-02-18T10:30:00Z"
└── updated_at: "2026-02-18T10:30:00Z"

obj:2
├── name: "Meeting Notes"
├── source_local: "/Users/karter/documents/notes.md"
├── source_remote: null
├── created_at: "2026-02-18T11:00:00Z"
└── updated_at: "2026-02-18T11:00:00Z"

obj:3
├── name: "Research Backup"
├── source_local: "/Users/karter/backup/paper.pdf"
├── source_remote: "https://arxiv.org/pdf/2024-12345.pdf"
├── created_at: "2026-02-18T11:30:00Z"
└── updated_at: "2026-02-18T11:30:00Z"
```

### Sample Tag Definitions

```
System Tags:
tag:1
├── name: "pdf"
├── type: "file_extension"
├── system: true
└── description: "PDF file format"

tag:2
├── name: "pdf"
├── type: "media_type"
├── system: true
└── description: "PDF document type"

tag:3
├── name: "md"
├── type: "file_extension"
├── system: true
└── description: "Markdown file format"

tag:4
├── name: "text"
├── type: "media_type"
├── system: true
└── description: "Plain text file type"

User Tags (Simple):
tag:5
├── name: "research"
├── type: null
├── system: false
└── description: "Research materials"

tag:6
├── name: "important"
├── type: null
├── system: false
└── description: "Marked as important"

User Tags (Key:Value):
tag:7
├── name: "high"
├── type: "priority"
├── system: false
└── description: "High priority item"

tag:8
├── name: "ml"
├── type: "project"
├── system: false
└── description: "Machine learning project"
```

### Sample Tag Assignments

```
obj:1 → tag:2 (pdf, media_type) [system, auto-assigned]
obj:1 → tag:1 (pdf, file_extension) [system, auto-assigned]
obj:1 → tag:5 (research) [user-assigned]
obj:1 → tag:7 (priority:high) [user-assigned]

obj:2 → tag:4 (text, media_type) [system, auto-assigned]
obj:2 → tag:3 (md, file_extension) [system, auto-assigned]
obj:2 → tag:6 (important) [user-assigned]

obj:3 → tag:2 (pdf, media_type) [system, auto-assigned]
obj:3 → tag:1 (pdf, file_extension) [system, auto-assigned]
obj:3 → tag:5 (research) [user-assigned]
obj:3 → tag:8 (project:ml) [user-assigned]
```

### Sample Collections

```
coll:1
├── name: "PDF Research"
├── query: {all: ["pdf"], any: ["research"]}
└── Results: obj:1, obj:3 (both have pdf AND research tag)

coll:2
├── name: "High Priority"
├── query: {all: ["priority:high"]}
└── Results: obj:1 (has priority:high tag)

coll:3
├── name: "All ML Work"
├── query: {all: ["project:ml"]}
└── Results: obj:3 (has project:ml tag)
```

---

## Key Design Decisions

### 1. High-Cardinality Metadata as Properties

File paths and URLs are stored as `source_local` and `source_remote` properties on objects, not as tags.

**Why:**
- Avoids tag explosion (1000 objects = 1000 unique paths)
- Paths and URLs are structural, not organizational
- Queryable via object properties (indexed, fast)
- Tags remain for categorization/organization

### 2. Single TAG_DEFINITIONS Table with system flag

Both system and user tags in one table, distinguished by `system: boolean`.

**Why:**
- Simpler schema than separate tables
- Both serve same conceptual purpose (metadata)
- Unified query interface
- Application layer enforces immutability of system tags

**Tradeoff:**
- Database-level constraints less strict than separate tables
- Mitigated by application validation

### 3. Type-Scoped Uniqueness for System Tags

System tags have `UNIQUE (type, name)` so "pdf" can exist in both media_type and file_extension.

**Why:**
- More precise classification (what *kind* of pdf?)
- Enables richer queries
- Avoids naming conflicts

### 4. Simple Tags + Key:Value Tags in One Table

User tags support both formats via nullable `type` field.

**Why:**
- Flexible, no separate tables needed
- Same tag system for all metadata
- Supports evolution from simple to key:value

### 5. ISO8601 Timestamps Only

No redundant date fields; full precision timestamps throughout.

**Why:**
- Single source of truth
- Can derive date-only when needed
- Simpler schema
- More precise tracking

### 6. No Color Field

Color removed for simplicity; can be added later when UI is ready.

**Why:**
- Data model focused on structure, not presentation
- UI layer can add styling independently
- Keeps scope focused

### 7. Both Sources Can Be Null

Objects can exist with neither source (rare but allowed).

**Why:**
- Handles edge cases (placeholders, future sources)
- More flexible
- Name alone can identify objects

---

## Implementation Considerations

### Database Initialization

On startup:
1. Create tables: objects, tag_definitions, tag_assignments, collections
2. No seeding needed (system tags created on first use)

### Persistence

Persist all tables to `.index/` directory:
- `objects/` — individual object files
- `tag_definitions/` — individual tag files
- `tag_assignments.json` — single file with all assignments
- `collections/` — individual collection files

### Hydration

On startup, load from `.index/`:
1. Load tag_definitions (both system and user)
2. Load objects
3. Load tag_assignments
4. Load collections

### Extraction Functions (Future Implementation)

Two extraction functions needed:
- `extractMediaType(source, sourceMetadata)` → system tag name
- `extractFileExtension(source, sourceMetadata)` → system tag name

---

## Success Criteria

Implementation is complete when:
- [ ] All four tables created and functional
- [ ] Objects can be created and persisted
- [ ] System tags auto-generated on object creation
- [ ] User tags can be created and assigned
- [ ] Tag assignments correctly linked via tag_assignments
- [ ] Collections queries evaluate correctly
- [ ] All data persists to `.index/` and hydrates on startup
- [ ] No existing user data lost or corrupted

---

*Final specification document.*
*Created: 2026-02-18 through collaborative data modeling*
