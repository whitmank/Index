# Index - Glossary

> Canonical definitions for Index terminology.
> Use these terms consistently in code, documentation, and UI.

---

## Core Concepts

### Object
The fundamental entity in Index. An object represents anything that can be indexed—a file, a URL, or any other addressable resource.

**Key properties:**
- Has a unique identity (ID)
- Points to a source via URI
- Can have tags, links, and metadata
- Exists independently of its source location

**Replaces:** "Node" (v0.2 terminology), "File" (too narrow)

**Example:** A PDF on your desktop, a webpage you bookmarked, a video file in your downloads folder—each becomes an object when indexed.

---

### Source
The actual location or resource that an object points to. Expressed as a URI.

**Supported sources (v0.3):**
- `file://` — local filesystem paths
- `https://` — web URLs

**Future sources:**
- `notion://` — Notion pages
- `obsidian://` — Obsidian notes
- Custom URI schemes

**Key insight:** The source is where the thing *lives*; the object is how Index *knows about it*.

---

### URI (Uniform Resource Identifier)
The standard format for expressing sources. Every object's source is stored as a URI string.

**Format:** `scheme://path`

**Examples:**
- `file:///Users/karter/documents/report.pdf`
- `https://example.com/article/intro`

**Why URI:** Standard format, parseable, extensible to new source types without schema changes.

---

### Source Type
The category of source, derived from the URI scheme. Stored as a denormalized `type` field on objects for fast filtering.

**Values:** `file`, `url`, (future: `notion`, `obsidian`, etc.)

**Use case:** "Show me all my web bookmarks" → filter where `type = "url"`

---

### Source Handler
A module that knows how to work with a specific source type. Handles operations like metadata extraction, content hashing, watching for changes, and opening in native apps.

**Examples:**
- File handler: reads filesystem, calculates SHA-256, watches for changes
- URL handler: fetches metadata (title, favicon), caches content

**Interface:** All handlers implement the same interface, making new source types pluggable.

---

## Tagging System

### Tag
A label that can be applied to objects. Tags enable flexible, multi-dimensional organization without hierarchies.

**Properties:**
- Simple string name (e.g., "important", "project-alpha", "to-read")
- Optional color for visual distinction
- Optional description

**Key insight:** An object can have many tags. Tags answer "what is this about?" not "where does this go?"

---

### Tag Definition
The canonical record of a tag's existence and properties. Lives in the `tag_definitions` table.

**Fields:**
- `id` — unique identifier
- `name` — the tag string (unique)
- `color` — optional hex color
- `description` — optional explanation

**Purpose:** Enables global tag management—rename once, applies everywhere. Supports tag colors and metadata.

---

### Tag Assignment
A record linking a tag to an object. Lives in the `tag_assignments` table.

**Fields:**
- `id` — unique identifier
- `tag_id` — reference to TagDefinition
- `object_id` — reference to Object

**Purpose:** Many-to-many relationship between tags and objects.

---

## Collections

### Collection
A saved query that dynamically groups objects based on tag criteria. Collections are "smart folders" that stay up-to-date automatically.

**Key properties:**
- Defined by a query (tag logic), not a static list
- Objects appear/disappear as their tags change
- Can be pinned to sidebar for quick access

**Replaces:** Static folders, manual groupings

---

### Collection Query
The tag-based filter that defines which objects appear in a collection.

**Structure:**
```javascript
{
  all: ["tag1", "tag2"],   // Must have ALL (AND)
  any: ["tag3", "tag4"],   // Must have ANY (OR)
  none: ["tag5"]           // Must NOT have (NOT)
}
```

**Logic:** `(all AND any) AND NOT none`

**Example:**
- `all: ["project-alpha"]` + `none: ["archived"]`
- Shows: objects tagged "project-alpha" that are not tagged "archived"

---

## Links

### Link
An explicit relationship between two objects. Links create the edges in the object graph.

**Properties:**
- Connects a source object to a target object
- Has a type (category) and optional label (description)
- Can be directional or bidirectional

**Use cases:**
- "This paper references that dataset"
- "This design is derived from that mockup"
- "These two articles are related"

---

### Link Type
A predefined category for links. Helps classify relationships.

**Standard types:**
- `related` — general association
- `derivative` — target was created from source
- `reference` — source cites or links to target

**Extensible:** Additional types can be added as needed.

---

### Link Direction
Whether a link is visible from one side or both.

- **Directional** (`bidirectional: false`): A → B, only visible from A
- **Bidirectional** (`bidirectional: true`): A ↔ B, visible from both A and B

---

## Metadata

### Source Metadata (`source_meta`)
Information extracted automatically from the source. Read-only—Index derives this, users don't edit it.

**Common fields:**
- `size` — file size in bytes
- `mime_type` — content type (e.g., "application/pdf")

**Source-specific fields:**
- File: `extension`, `permissions`
- URL: `title`, `description`, `favicon`

---

### User Metadata (`user_meta`)
Information added by the user. Editable and extensible.

**Standard fields:**
- `notes` — free-text notes about the object

**Custom fields:** Users can add arbitrary key-value pairs for their own purposes.

---

## System Concepts

### Index (the action)
The process of adding an object to the system. When you "index" a file or URL, Index creates an object record pointing to that source.

**Steps:**
1. Parse the source URI
2. Extract source metadata via handler
3. Calculate content hash (if applicable)
4. Create object record in database
5. Apply any specified tags

---

### Content Hash
A SHA-256 fingerprint of an object's content. Used for deduplication—if two sources have the same content hash, they're duplicates.

**Format:** `sha256:abc123...`

**Note:** Not all sources support content hashing (e.g., dynamic web pages).

---

### Deduplication
The process of detecting when the same content exists at multiple sources. Index uses content hash comparison to identify duplicates.

**Behavior:** When importing, if content hash matches an existing object, Index warns about the duplicate rather than creating a new record.

---

## UI Concepts

### Detail Panel
The right sidebar that shows information about the selected object. Displays metadata, tags, notes, and links.

---

### Object List
The main table view showing indexed objects. Supports sorting, filtering, multi-select, and keyboard navigation.

---

### Graph View
A visual representation of objects (nodes) and links (edges). Uses force-directed layout for automatic positioning.

---

### Pinned Collection
A collection marked for quick access, appearing in the sidebar. Pinned state is stored in the database, not localStorage.

---

*Glossary created: January 2026*
*Update as terminology evolves*
