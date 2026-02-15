---
Author: Claude Code
Created: 2026-02-14
Last Updated: 2026-02-14
---

# Index — Development Backlog

> Features and enhancements derived from the original vision document, tracked for future phases.
> Organized by phase, priority, and dependencies.

---

## Phase 1: Tagging & Relationships

### Core Tagging System

#### 1.1 Tag Definitions Table
**Priority:** High
**Complexity:** Medium
**Dependencies:** None

Create canonical tag records enabling global tag management.

**Requirements:**
- Create `tag_definitions` table (separate from current `tags` table)
- Fields: `id`, `name` (unique), `color` (optional hex), `description` (optional)
- Rename all tags to `tag_definitions`
- Purpose: Global rename propagates everywhere

**Implementation Notes:**
- Database schema change required
- Migration script to convert existing tags
- API: `db:createTagDefinition()`, `db:updateTag()`, `db:deleteTag()`

---

#### 1.2 Tag Assignments (Many-to-Many)
**Priority:** High
**Complexity:** Medium
**Dependencies:** 1.1 (Tag Definitions)

Link tags to objects with explicit assignment table.

**Requirements:**
- Create `tag_assignments` table
- Fields: `id`, `tag_id` (reference), `object_id` (reference)
- Support multiple tags per object
- Maintain referential integrity

**Implementation Notes:**
- Database schema change
- Update UI to show all tags on object
- Update object persistence to include tag_assignments
- API: `db:assignTag(objectId, tagId)`, `db:removeTag(objectId, tagId)`, `db:getObjectTags(objectId)`

---

#### 1.3 Tag UI Components
**Priority:** High
**Complexity:** Medium
**Dependencies:** 1.1, 1.2

Frontend support for tag creation and assignment.

**Requirements:**
- Tag input field with autocomplete (suggests existing tags)
- Tag creation handler (inline creation during assignment)
- Tag list display on objects
- Tag removal UI (X button)
- Tag color visualization in UI

**Implementation Notes:**
- New React component: `TagInput.jsx`
- Update `App.jsx` to include tag management
- Update `App.css` for tag styling (pills, colors)
- Update object edit form to include tag field

---

#### 1.4 Tag Filtering
**Priority:** High
**Complexity:** Medium
**Dependencies:** 1.2, 1.3

Filter object list by tags using AND/OR/NOT logic.

**Requirements:**
- Filter UI component (multi-select with logic options)
- Filter logic: AND (all), OR (any), NOT (none)
- Persist filters (localStorage or database)
- Real-time filtering as tags change

**Implementation Notes:**
- New React component: `TagFilter.jsx`
- Frontend filtering initially (can move to DB query later)
- Display filter state and result count

---

### Relationships System

#### 1.5 Relationship Creation UI
**Priority:** High
**Complexity:** Medium
**Dependencies:** None (relationships table exists)

Frontend for creating and managing relationships between objects.

**Requirements:**
- Link/reference field on object detail
- Object picker to select target
- Relationship type selector (related, derivative, reference)
- Bidirectional toggle
- Optional label/description field

**Implementation Notes:**
- New component: `RelationshipForm.jsx`
- API: `db:createRelationship()` already exists, needs UI binding
- Need to fetch all objects for picker (performance consideration)

---

#### 1.6 Relationship Display
**Priority:** High
**Complexity:** Medium
**Dependencies:** 1.5

Display relationships on object view.

**Requirements:**
- Show outgoing relationships (this object links to others)
- Show incoming relationships (other objects link to this)
- Display link type and label
- Click to navigate to related object

**Implementation Notes:**
- Update object detail view
- Need bidirectional relationship query
- Handle circular references gracefully

---

#### 1.7 Link Type & Direction Implementation
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** 1.5, 1.6

Complete the relationship schema with types and directionality.

**Requirements:**
- Add `type` field to relationships (related, derivative, reference, custom)
- Add `bidirectional` field (boolean)
- Add `label` field (description)
- Update schema in database

**Implementation Notes:**
- Relationship table migration
- Update relationship handlers
- Constraint: ensure type is one of allowed values

---

## Phase 2: Collections & Smart Filtering

### Collections System

#### 2.1 Collections Table & Schema
**Priority:** High
**Complexity:** Medium
**Dependencies:** 1.2 (Tag Assignments must exist)

Create collections (saved tag queries).

**Requirements:**
- New `collections` table
- Fields: `id`, `name`, `query` (JSON with all/any/none), `pinned` (boolean)
- Query structure: `{ all: ["tag1"], any: ["tag2"], none: ["tag3"] }`
- Persistence to `~/.index/collections/`

**Implementation Notes:**
- Database schema
- IPC handlers: `db:createCollection()`, `db:updateCollection()`, `db:deleteCollection()`
- Logic: `(all AND any) AND NOT none`

---

#### 2.2 Collection Query Engine
**Priority:** High
**Complexity:** High
**Dependencies:** 2.1, 1.2

Implement collection filtering logic.

**Requirements:**
- Execute collection queries against objects and tags
- Handle AND/OR/NOT logic correctly
- Return filtered object list
- Update when tags change

**Implementation Notes:**
- Could be frontend (simple, slow) or backend (complex, fast)
- Recommend backend for performance
- SurrealDB query generation for tag filters

---

#### 2.3 Collections UI
**Priority:** High
**Complexity:** Medium
**Dependencies:** 2.1, 2.2

Frontend for creating and managing collections.

**Requirements:**
- Collection creation modal (name + query builder)
- Visual query builder (all/any/none with tag pickers)
- Collections list/sidebar
- Pin/unpin to sidebar
- Click collection to view results

**Implementation Notes:**
- New component: `CollectionBuilder.jsx`
- Update sidebar to show pinned collections
- Collections persist across sessions

---

## Phase 3: Metadata & Source Handlers

### Source Type System

#### 3.1 Denormalized Source Type on Objects
**Priority:** Medium
**Complexity:** Low
**Dependencies:** None

Add `source_type` field to objects for fast filtering.

**Requirements:**
- Add `source_type: "file" | "url"` field to objects
- Derive from URI scheme (`file://` → `file`, `https://` → `url`)
- Use in filtering and queries

**Implementation Notes:**
- Migration: populate `source_type` on existing objects
- Update object creation to set source_type
- Add filter UI: "Show me all URLs" or "Show me all files"

---

#### 3.2 Source Handler Architecture
**Priority:** Medium
**Complexity:** High
**Dependencies:** 3.1

Refactor metadata derivation into pluggable handlers.

**Requirements:**
- Abstract handler interface (init, deriveMetadata, watch, open)
- File handler implementation
- URL handler implementation
- Handler registry/factory pattern
- Route to appropriate handler by source_type

**Implementation Notes:**
- Create `electron/main/handlers/` directory
- `handlers/Handler.js` (base class)
- `handlers/FileHandler.js` (current file logic)
- `handlers/UrlHandler.js` (current URL logic)
- Update metadata.js to use handler system

---

#### 3.3 Extended URL Metadata
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** 3.2

Fetch and store metadata from URLs (title, description, favicon).

**Requirements:**
- Parse page title from HTML `<title>` tag
- Extract description from `<meta name="description">`
- Fetch favicon from standard locations
- Handle metadata caching
- Update source_metadata schema

**Implementation Notes:**
- Use `fetch()` + HTML parsing library (cheerio or similar)
- Cache favicon locally (avoid repeated fetches)
- Add timeout for slow sites
- Update source_metadata: add `title`, `description`, `favicon_url`

---

#### 3.4 Extended File Metadata
**Priority:** Low
**Complexity:** Medium
**Dependencies:** 3.2

Extract file-specific metadata.

**Requirements:**
- Extract `extension` from filename
- Get `permissions` from fs.statSync()
- Derive `created_at`, `modified_at` from file stats
- Handle special files (symlinks, directories)

**Implementation Notes:**
- Update FileHandler
- Add to source_metadata: `extension`, `permissions`, `created_at`, `modified_at`
- Consider performance impact on large directories

---

### User Metadata Extensibility

#### 3.5 Custom User Metadata Fields
**Priority:** Low
**Complexity:** Medium
**Dependencies:** None

Allow users to add arbitrary metadata fields.

**Requirements:**
- Expand `user_metadata` from `{ notes }` to support custom key-value pairs
- UI for adding custom fields (key: value pairs)
- Display custom fields on object view
- Edit custom fields

**Implementation Notes:**
- Update object schema: `user_metadata: { notes, ...custom }`
- New component: `CustomMetadataEditor.jsx`
- Validate field names (alphanumeric + underscore)
- No schema enforcement (schemaless by design)

---

## Phase 4: Advanced UI & Visualization

### Detail Panel

#### 4.1 Object Detail Panel
**Priority:** High
**Complexity:** Medium
**Dependencies:** 1.2, 1.5

Right sidebar showing full object information.

**Requirements:**
- Split-pane layout (list on left, detail on right)
- Display all object fields (name, source, metadata)
- Show tags with colors
- Show relationships (outgoing and incoming)
- Edit inline (name, notes, source)

**Implementation Notes:**
- Redesign App layout with detail panel
- New component: `DetailPanel.jsx`
- Update CSS for two-pane layout
- Select object from list to show detail

---

#### 4.2 Source Metadata Display
**Priority:** Medium
**Complexity:** Low
**Dependencies:** 4.1, 3.3

Show derived metadata in detail panel.

**Requirements:**
- Display file metadata (size, extension, modified date, permissions)
- Display URL metadata (favicon, title, description)
- Format sizes human-readable (1.2 MB not 1234567)
- Show file status (exists/missing)

**Implementation Notes:**
- Metadata display formatting utilities
- Conditional display based on source_type
- Handle missing/null values gracefully

---

### Graph Visualization

#### 4.3 Graph View Component
**Priority:** Medium
**Complexity:** High
**Dependencies:** 1.5, 1.6

Visualize objects as nodes and relationships as edges.

**Requirements:**
- Render objects as nodes (circles with labels)
- Render relationships as edges (lines with direction)
- Force-directed layout (nodes repel, edges attract)
- Interactive: pan, zoom, click to select
- Color nodes by source type or tag

**Implementation Notes:**
- Use library: D3.js, Three.js, or Vis.js
- Recommend: Vis.js (built for network visualization)
- Performance: limit graph size (100-500 nodes max initial)
- Consider: rendering optimization for large graphs

---

#### 4.4 Graph Navigation
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** 4.3

Interact with graph to explore relationships.

**Requirements:**
- Click node to select and show detail
- Highlight related nodes (distance 1)
- Double-click to navigate to object
- Filter graph by tag or type
- Export graph visualization

**Implementation Notes:**
- Sync selection between list and graph
- Highlight-on-hover for edge exploration
- Consider: expand/collapse nodes to manage complexity

---

### Advanced List Features

#### 4.5 Sorting
**Priority:** Medium
**Complexity:** Low
**Dependencies:** None

Sort object list by various fields.

**Requirements:**
- Sort by name (A-Z)
- Sort by date created/modified
- Sort by source type (files first, then URLs)
- Sort by tag count
- Multi-column sort

**Implementation Notes:**
- Add sort UI (arrows or dropdown)
- Persist sort preference
- Frontend sorting initially (move to DB query if performance needed)

---

#### 4.6 Multi-Select & Bulk Operations
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None

Select multiple objects and perform actions.

**Requirements:**
- Checkbox to select objects
- Select all / deselect all
- Bulk operations: delete, tag, link, move to collection
- Show selection count
- Bulk edit form (apply changes to all selected)

**Implementation Notes:**
- Update list item UI with checkbox
- New component: `BulkActionsBar.jsx`
- Handle large selections (100+) gracefully

---

#### 4.7 Advanced Keyboard Navigation
**Priority:** Low
**Complexity:** Medium
**Dependencies:** None

Navigate and operate on objects via keyboard.

**Requirements:**
- Arrow keys to move up/down in list
- Enter to select/open detail
- Escape to close detail
- Ctrl/Cmd+A to select all
- Number keys for quick tagging (1-9 = predefined tag shortcuts)

**Implementation Notes:**
- Extend `useKeyboardShortcuts` hook
- Display keyboard hints in UI
- Customizable shortcuts in settings

---

## Phase 5: Deduplication & Data Integrity

#### 5.1 Deduplication Detection
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None

Warn when creating duplicate objects.

**Requirements:**
- On object creation, check if content_hash matches existing
- Display warning: "This content already exists at [path]"
- Offer options: Create new, Update existing, Cancel
- Track deduplication events

**Implementation Notes:**
- Query on creation: `SELECT * FROM objects WHERE source_metadata.content_hash = ?`
- Handle multiple matches (same content in multiple places)
- Consider: merge strategy (which to keep?)

---

#### 5.2 Deduplication Management
**Priority:** Low
**Complexity:** High
**Dependencies:** 5.1

Merge or consolidate duplicate objects.

**Requirements:**
- Identify duplicate sets (same content_hash)
- Merge metadata (combine tags, consolidate notes)
- Update relationships (point to canonical object)
- Delete duplicates
- Audit trail (log merges)

**Implementation Notes:**
- Complex state management
- User confirmation required
- Irreversible operation - add undo capability or backups

---

## Phase 6: Import/Export & Backup

#### 6.1 Import Objects
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None

Bulk import objects from various sources.

**Requirements:**
- Import from `.index/` directory (restore from backup)
- Import from CSV (name, source, tags, notes)
- Import from JSON export
- Handle duplicate resolution during import
- Progress reporting

**Implementation Notes:**
- New handler: import logic
- File picker for import source
- Transform CSV/JSON to object format
- Validate before inserting

---

#### 6.2 Export Objects
**Priority:** Medium
**Complexity:** Low
**Dependencies:** None

Bulk export objects and metadata.

**Requirements:**
- Export to CSV (filterable, all fields)
- Export to JSON (complete object structure)
- Export filtered results (by tag, collection, type)
- Include relationships and tags

**Implementation Notes:**
- Simple query → CSV/JSON transform
- Download dialog
- Format: standardized, importable elsewhere

---

#### 6.3 Backup & Restore
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None

Backup and restore entire Index database.

**Requirements:**
- Zip entire `~/.index/` directory
- Scheduled backups
- Restore from backup file
- Verify backup integrity (checksums)

**Implementation Notes:**
- System background task (Node.js scheduling)
- Storage: local or cloud (future)
- UI: backup/restore in settings
- Consider: differential backups for efficiency

---

## Phase 7: Settings & Customization

#### 7.1 Settings Panel
**Priority:** Medium
**Complexity:** Low
**Dependencies:** None

User-facing settings UI.

**Requirements:**
- Settings modal/page
- Categorized settings (display, keyboard, backup, source handlers)
- Persistent storage
- Reset to defaults option

**Implementation Notes:**
- New component: `SettingsPanel.jsx`
- Store settings in database or localStorage
- Hot-reload settings (no restart required)

---

#### 7.2 Keyboard Shortcut Customization
**Priority:** Low
**Complexity:** Medium
**Dependencies:** 7.1

Allow users to rebind keyboard shortcuts.

**Requirements:**
- List all shortcuts in settings
- Rebind by clicking and pressing new key
- Conflict detection (warn if key already used)
- Persist custom bindings

**Implementation Notes:**
- Settings stored in database
- Validate key combinations
- Export/import keybindings

---

#### 7.3 Source Handler Configuration
**Priority:** Low
**Complexity:** Medium
**Dependencies:** 7.1, 3.2

Configure behavior of individual handlers.

**Requirements:**
- File handler: watched directories, ignore patterns
- URL handler: metadata fetch timeout, favicon caching
- Per-handler settings

**Implementation Notes:**
- Settings per source type
- Reload handlers when settings change
- Document all options

---

## Phase 8: Plugin System

#### 8.1 Plugin Architecture
**Priority:** Low
**Complexity:** High
**Dependencies:** 3.2

Support third-party source handlers.

**Requirements:**
- Plugin API (Handler interface)
- Plugin discovery and loading
- Plugin sandbox/isolation
- Plugin configuration UI

**Implementation Notes:**
- Recommend: Node.js dynamic require or import
- Security: review plugins before loading
- Plugin marketplace (future)

---

#### 8.2 Custom Source Handler Plugins
**Priority:** Low
**Complexity:** High
**Dependencies:** 8.1

Enable plugins for new source types (Notion, Obsidian, etc.).

**Requirements:**
- Notion handler plugin
- Obsidian handler plugin
- Custom handler template/scaffold

**Implementation Notes:**
- Plugin examples/docs
- Testing framework for plugins
- Distribution mechanism

---

## Architecture Improvements

#### A.1 Query Optimization
**Priority:** Medium
**Complexity:** High
**Dependencies:** None

Optimize database queries as complexity grows.

**Requirements:**
- Index frequently-queried fields (source_type, tag_id)
- Pagination for large result sets
- Query caching strategy
- Performance monitoring

**Implementation Notes:**
- Profile current queries
- Add SurrealDB indexes
- Implement pagination in UI
- Measure before/after improvements

---

#### A.2 Error Handling & Recovery
**Priority:** Medium
**Complexity:** Medium
**Dependencies:** None

Graceful error handling throughout app.

**Requirements:**
- React error boundaries
- Try-catch on all IPC calls
- User-friendly error messages
- Recovery suggestions
- Error logging

**Implementation Notes:**
- New component: `ErrorBoundary.jsx`
- Centralized error handler
- Dev vs. production error detail levels

---

#### A.3 Testing Infrastructure
**Priority:** Low
**Complexity:** Medium
**Dependencies:** None

Unit and integration tests.

**Requirements:**
- Unit tests for utilities (metadata, file-recovery, etc.)
- Integration tests for IPC handlers
- Component tests for React UI
- End-to-end scenarios

**Implementation Notes:**
- Test framework: Jest
- Test utilities: React Testing Library
- Mock Electron APIs for testing
- Coverage targets: 70%+ critical paths

---

## Performance & Scale

#### P.1 Large Dataset Handling
**Priority:** Low
**Complexity:** High
**Dependencies:** A.1

Optimize for 10,000+ objects.

**Requirements:**
- Virtual scrolling in list (render only visible items)
- Pagination for queries
- Lazy-load relationships
- Chunk large operations

**Implementation Notes:**
- React Window library for virtual scrolling
- Implement pagination in IPC handlers
- Profile with realistic data

---

#### P.2 Real-Time Sync
**Priority:** Low
**Complexity:** High
**Dependencies:** None

Sync changes across multiple windows (future: devices).

**Requirements:**
- Detect changes from external processes
- Broadcast updates to all windows
- Conflict resolution (last-write-wins or user choice)

**Implementation Notes:**
- Extend file watcher
- Electron IPC between windows
- Future: WebSocket sync to cloud

---

## Documentation

#### D.1 Developer Guide
**Priority:** Low
**Complexity:** Low
**Dependencies:** None

Document architecture for contributors.

**Requirements:**
- Architecture diagram
- Handler interface specification
- IPC API reference
- Data model ERD
- Development setup guide

---

#### D.2 User Guide
**Priority:** Low
**Complexity:** Low
**Dependencies:** None

Document features for end users.

**Requirements:**
- Getting started tutorial
- Feature walkthroughs (tagging, collections, relationships)
- Keyboard shortcuts reference
- Troubleshooting guide

---

---

## Notes on Prioritization

**High Priority:** Foundation for other features, frequently requested, Phase 1-2
**Medium Priority:** Enhances core experience, Phase 2-3
**Low Priority:** Nice-to-have, advanced features, Phase 4+

**Complexity Indicators:**
- Low: 1-2 hours, isolated change
- Medium: 4-8 hours, touches multiple files
- High: 2+ days, architectural change

**Dependencies:** Features listed should complete predecessor features first

---

*Last updated: February 14, 2026*
*Review and update estimates as implementation progresses*
