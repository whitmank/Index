---
Author: Claude Code
Created: 2026-02-14
---

# Index — Backlog

Features from the original vision not yet implemented in v0.3.

---

## Tagging

- **Tag Definitions** — Global tag records with name, color, description. Enable global rename.
- **Tag Assignments** — Many-to-many relationship between tags and objects. Support multiple tags per object.
- **Tag UI** — Create, view, edit tags. Autocomplete on assignment. Color visualization.
- **Tag Filtering** — Filter objects by tags with AND/OR/NOT logic.

---

## Relationships

- **Relationship UI** — Create, view, delete links between objects. Type selector (related, derivative, reference). Optional labels.
- **Relationship Display** — Show outgoing and incoming relationships on object view. Navigate between linked objects.
- **Link Types & Direction** — Complete relationship schema with type field and bidirectional flag.

---

## Collections

- **Collections** — Saved queries with tag logic (all/any/none). Auto-update as tags change.
- **Collection UI** — Create, edit, delete collections. Query builder. Pin to sidebar for quick access.

---

## Metadata & Sources

- **Source Type Field** — Denormalized `source_type` on objects for fast filtering ("show all URLs").
- **Source Handler Architecture** — Refactor metadata derivation into pluggable handlers by source type. Foundation for extensibility.
- **URL Metadata** — Fetch and cache title, description, favicon from URLs.
- **File Metadata** — Extract extension, permissions, created/modified timestamps.
- **Custom User Fields** — Allow arbitrary key-value pairs in user_metadata beyond notes.

---

## Detail Panel & Visualization

- **Detail Panel** — Right sidebar showing full object info: metadata, tags, relationships, notes. Edit inline.
- **Graph View** — Visualize objects as nodes, relationships as edges. Force-directed layout. Interactive exploration.

---

## List Features

- **Sorting** — Sort by name, date, source type, tag count. Persist preferences.
- **Multi-Select** — Select multiple objects. Bulk operations: delete, tag, link, move to collection.
- **Keyboard Navigation** — Arrow keys, Enter, Escape. Quick tag shortcuts.

---

## Data Integrity

- **Deduplication Detection** — Warn when creating objects with duplicate content (same hash).
- **Deduplication Management** — Merge duplicate objects, consolidate metadata, update relationships.

---

## Import/Export

- **Import** — Restore from backup. Import from CSV/JSON.
- **Export** — Export filtered results to CSV/JSON.
- **Backup & Restore** — Zip `~/.index/`, scheduled backups, restore from file.

---

## Settings & Customization

- **Settings Panel** — UI for user preferences.
- **Keyboard Shortcuts** — Customize keybindings.
- **Handler Configuration** — Per-source-type settings (watched dirs, timeouts, cache behavior).

---

## Architecture & Quality

- **Error Boundaries** — React error boundaries and graceful error handling.
- **Query Optimization** — Indexes, pagination, caching as dataset grows.
- **Virtual Scrolling** — Handle 10,000+ objects without lag.
- **Testing** — Unit tests, integration tests, end-to-end scenarios.

---

## Extensibility

- **Plugin System** — Support third-party source handlers (Notion, Obsidian, custom).
- **Real-Time Sync** — Detect external changes, sync across windows (future: devices).

---

*Track and prioritize based on user needs and developer capacity.*
