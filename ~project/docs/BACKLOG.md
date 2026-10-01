---
Author: Claude Code
Updated: 2026-03-10
---

# Index — Backlog

Items not yet implemented, organized by theme.
See `docs/feature-dev/ARCHITECTURE_v0.4.md` for the v0.4 architectural plan.

---

## Architecture (v0.4 Priority)

These are structural changes that unblock many of the features below.
See `ARCHITECTURE_v0.4.md` for full detail and phase plan.

- **Persistent SurrealDB storage** — Point SurrealDB at `~/.index/surreal/` instead of temp dir; data survives restarts natively
- **LIVE SELECT reactivity** — Subscribe to SurrealDB live queries; eliminate full-reload pattern from mutation handlers
- **Async JSON export** — Move `persistToIndex()` out of critical path; run debounced in background and on quit
- **ID normalization at IPC boundary** — Centralize `RecordId` unwrapping in handlers; remove `id?.id || id` from components
- **Domain centralization** — Tag type registry in backend (`tag-types.js`); remove hardcoded system tag rules from UI

---

## Tags

- **Tag filtering in graph** — Filter visible graph nodes by tag with AND/OR/NOT logic (collections do this, but ad-hoc filtering does not)
- **Tag autocomplete** — Fuzzy search when assigning tags; show color swatches
- **Tag color in graph** — Color-code graph nodes by their primary tag
- **Show file_type and origin system tags** — Currently hidden; expose as readable metadata in detail sidebar
- **Global tag rename** — Rename a tag definition and have it update across all assignments
- **Tag merge** — Combine two tags into one, re-assigning all objects

---

## Relationships

- **Relationship UI** — Create, view, delete links between objects from the detail sidebar
- **Relationship display in graph** — Show links as edges in the force-directed graph
- **Relationship types** — Typed links ("references", "derived from", "related to") with optional label
- **Bidirectional traversal** — Navigate from an object to everything it links to and from

---

## Collections

- **Collection builder UI** — Visual query builder (currently requires knowing tag IDs)
- **Ad-hoc filtering** — Filter graph without saving as a collection

---

## Sources & Capture

- **Chrome/Arc/Firefox capture** — Extend Cmd+I capture beyond Safari
- **Source type indicators** — Visual distinction in graph between file objects and URL objects
- **Additional URI schemes** — `notion://`, `obsidian://`, `smb://` source handling
- **Source copying** — Copy a remote source to local device (download + add as new source)
- **Deduplication detection** — Warn when a URI or content hash already exists; offer to merge or link

---

## Graph & Visualization

- **Relationship edges** — Render typed links as edges between nodes
- **Graph filtering by collection** — Already partially implemented; polish and persist filter state
- **Node grouping** — Cluster nodes by tag or collection visually
- **Zoom to selected** — Auto-center and zoom on selected node
- **Performance** — Virtual rendering for 1,000+ node graphs

---

## Object Detail

- **Notes editing** — Inline editing of `user_metadata.notes`
- **Relationship panel** — Show and create links from detail sidebar
- **Source file metadata** — Display file size, type, last modified for local sources
- **URL metadata** — Display fetched title, description, favicon for web sources

---

## Data Integrity

- **Deduplication management** — Merge duplicate objects, consolidate tags and relationships
- **Source repair UI** — Surface objects with missing/broken sources; allow manual re-linking
- **Export data** — Write current state to `~/.index/export/` on demand (Settings action)
- **Import / restore** — Re-import from JSON export files or zip backup

---

## Settings & Customization

- **Keyboard shortcut customization** — Rebind standard shortcuts
- **Appearance** — Light/dark already done; add accent color, font size
- **Data directory** — Allow changing `~/.index/` location

---

## Quality & Infrastructure

- **Error boundaries** — React error boundaries around graph and sidebar
- **Testing suite** — Unit tests for stores, IPC handlers, domain logic
- **Virtual scrolling** — Handle 10,000+ objects in collections sidebar
- **Windows/Linux parity** — Vibrancy fallback, capture system for non-macOS

---

*Prioritize based on user impact. Architecture items unlock the most downstream value.*
