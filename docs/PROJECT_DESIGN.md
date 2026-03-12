---
Author: Claude (Anthropic)
Last Updated: 2026-02-14
---

# Index — Project Design Document

## Executive Summary

Index is a local-first desktop application that creates a semantic layer across digital objects. It addresses the fundamental limitation of hierarchical file systems by allowing information to exist in multiple contexts simultaneously through tagging, collections, and explicit relationships. Users manage *what things mean* rather than *where things are stored*.

---

## Problem Statement

### The Core Issue

Traditional file systems organize information hierarchically—a document lives in one folder, a bookmark in a browser, notes in an app. This organizational model forces a critical choice: *where should this thing go?* when it actually belongs in multiple contexts.

A research paper, for example, relates to:
- A project folder (location)
- Bookmarks (source type)
- Notes and annotations (metadata)
- Multiple other papers (relationships)
- Several tags (context)

Yet hierarchical systems allow only one storage location. This creates friction: users either duplicate content (creating maintenance headaches) or accept that they must remember *where* they put something to find it, not *what it's about*.

### Why This Matters

As individual users accumulate thousands of files across devices, projects, and time periods, hierarchical organization breaks down. The human mental model—rhizomatic, associative, multi-contextual—doesn't map to strict folder trees. File discovery becomes archaeologically difficult. Information silos form (notes in one app, bookmarks in a browser, files on disk).

---

## Design Principles

Index is built on six core design principles that inform every architectural and UI decision:

### 1. Objects Over Locations

An object represents any indexable resource—a file, URL, or future source type. Objects have identity independent of their physical storage location or source type.

**Implication:** Users think in terms of "what is this?" not "where did I put it?" An object remains the same whether its source file is moved to a new folder or a URL is bookmarked multiple times. The object's identity persists; its source may change.

### 2. Tags Over Folders

Multi-dimensional tagging replaces single-hierarchy folder organization. An object can have unlimited tags, placing it simultaneously in many contexts without duplication.

**Implication:** Organization is flexible and extends naturally as new contexts emerge. A document can be tagged `project-alpha`, `research`, and `to-read` without living in three separate folders. Tags can be renamed globally, and the system reflects that change across all objects.

### 3. References Over Copies

Index points to sources; it never duplicates or moves content. Files remain in their original locations. URLs remain at their source servers. Index holds metadata and relationships; the actual content stays untouched.

**Implication:** Complete data integrity—users never lose or corrupt files through Index. Safe to use alongside other tools. Source files can be edited externally, and Index's references remain valid. Deduplication becomes possible through content hashing.

### 4. Queries Over Navigation

Collections are saved queries defined by tag logic, not static folder lists. As objects are tagged or untagged, collections update automatically.

**Implication:** Collections stay relevant without maintenance. Create a collection `all: ["active"], none: ["archived"]` and it remains correct even as new objects are added. Users can think in terms of logical filters rather than folder hierarchies.

### 5. Local-First Foundation

All data resides on the user's machine by default. No cloud servers, no sync, no accounts, no privacy concerns. The application is self-contained and operates fully offline.

**Implication:** Complete data ownership and offline operation. Faster performance. No subscription or external dependencies. Users control backup and data portability. Future iterations can add optional, explicit sync mechanisms if needed, but the core remains local.

### 6. Intent-Driven Interface

The interface responds to intent, not input method. Whether a user is browsing, searching, creating, or connecting, the system provides appropriate affordances. The cognitive task determines the interaction style naturally.

**Implication:** No interaction mode is privileged. Browsing may feel visual and spatial; rapid entry may feel direct and fast; linking may feel spatial and visual. The system adapts to what the user is trying to accomplish.

---

## Capabilities and Scope

### Core Capabilities

Index provides these primary capabilities:

1. **Index Objects** — Add any resource with a URI (files, URLs) to the system
2. **Tag and Organize** — Apply unlimited tags to objects; tags have optional colors and descriptions
3. **Create Collections** — Define saved tag queries that automatically group objects
4. **Link Objects** — Create explicit relationships between objects with typed link categories
5. **Search and Filter** — Find objects by meaning (tags, content, metadata) rather than file location
6. **Visualize Relationships** — View objects as nodes and links in a graph representation

### Integration Philosophy

Index is designed to complement existing tools rather than replace them. It acts as a semantic layer above the file system, browser bookmarks, and other information sources. Users continue working with native tools (Finder, text editors, browsers) while Index provides organization, connection, and discovery across them all.

### Supported Source Types

**Current (v0.3):**
- `file://` — local filesystem paths
- `https://` — web URLs

**Future (v0.4+):**
- `notion://` — Notion pages
- `obsidian://` — Obsidian notes
- Custom URI schemes via source handler interface

---

## Technical Properties

### Architecture

Index uses a client-server architecture where the Electron application runs the server locally:

- **Main Process** — SurrealDB instance running in-memory, file watchers, IPC handlers
- **Renderer Process** — React UI with Zustand state management
- **Context Bridge** — Secure IPC boundary enforcing principle of least privilege
- **Persistence Layer** — Objects, tags, relationships stored as JSON files in `~/.index/`

### Data Model

**Objects** have:
- Unique ID
- Name, optional label (short graph display name), optional description
- `sources[]` array — each source has a URI, device origin, and timestamp
- User metadata (notes)
- System tags (auto-derived: `media_type`, `file_type`, `origin`)
- User tags (many-to-many via `tag_assignments`)
- Links (relationships to other objects)
- Timestamps (created, updated)

**Collections** are:
- Saved queries with AND/OR/NOT tag logic
- Auto-updating as tags change
- Optionally pinned to sidebar

**Links** are:
- Explicit relationships between objects
- Typed (e.g., "references", "derivative", "related")
- Optionally bidirectional
- With optional labels/descriptions

**Tags** have:
- Unique name
- Optional color for visual distinction
- Optional description
- Global reach—renaming applies everywhere

### Data Persistence

- Objects stored individually as JSON files in `~/.index/objects/`
- Tag definitions in `~/.index/tag_definitions/`
- Tag assignments in `~/.index/tag_assignments.json`
- Collections in `~/.index/collections/`
- Device identity in `~/.index/.device-id`
- Format designed for external inspection and version control

### Non-Destructiveness

Index never modifies source files or URLs. All changes are confined to metadata and the `~/.index/` directory. Users can safely delete the entire `.index/` directory and re-index; originals remain untouched.

---

## User Model and Use Cases

### Target User Profile

The primary user is a "digital collector"—someone who:
- Accumulates files, bookmarks, references, and resources across projects
- Works with information across multiple domains simultaneously
- Values ownership and privacy
- Is comfortable with keyboard-driven interfaces
- Needs to see connections between disparate information

### Primary Use Cases

1. **Research Organization** — Gather papers, articles, datasets, and notes around a topic. Use tags like `[ml-papers]`, `[january-reading]`, `[to-understand]` and collections to filter by relevance level.

2. **Project Management** — Track assets, references, and deliverables across projects. Link related documents, tag by status (`[in-progress]`, `[reviewed]`, `[archived]`), and create project-specific collections.

3. **Personal Knowledge Base** — Build an interconnected web of everything you've collected. Use relationships to show how ideas connect, create collections for different domains, and search by topic rather than remember where you filed something.

4. **Creative Work** — Organize inspiration, references, and works-in-progress. Tag by material type, project, mood, or source. Visualize relationships between references and final work.

---

## Success Criteria

The application succeeds when users can consistently:

1. **Add without friction** — Index a file or URL with minimal interaction
2. **Find by meaning** — Locate objects using tags or search, not file paths
3. **See connections** — Understand how objects relate through links and visualizations
4. **Trust the system** — Confidence that data won't be lost, moved, or corrupted
5. **Work at speed** — Keyboard-driven workflows that don't slow down thinking

---

## Development Roadmap

### v0.3 (Current)

- File (`file://`) and URL (`https://`) indexing
- Multi-source objects — one object, many locations/devices
- Auto-assigned system tags (media_type, file_type, origin)
- User tagging with collections (saved AND/OR/NOT queries)
- Force-directed graph visualization (D3)
- Object detail sidebar (inline editing, sources, tags)
- Global Cmd+I capture (Safari integration)
- File recovery via content hashing
- Device identification (named devices, origin tracking)
- Keyboard-driven interface (Cmd+`, Cmd+I, Cmd+., Cmd+;)
- Transparent overlay + standard window profiles (macOS)

### v0.4 (Planned)

Architecture overhaul — see `docs/feature-dev/ARCHITECTURE_v0.4.md` for the full plan:

- **Persistent SurrealDB** — DB is the source of truth; JSON becomes human-readable export
- **LIVE SELECT reactivity** — UI updates via DB push, no full state reloads
- **Domain centralization** — Tag type rules owned by backend, not UI components
- **ID normalization** — Consistent record ID handling across all layers
- Relationship visualization (edges in graph)
- Chrome/Arc/Firefox capture support
- Tag filtering UI improvements
- Deduplication detection

### Future Possibilities

- Plugin/extension system for custom source handlers
- Backup and restore workflows
- Optional sync (local-first, sync-optional model)
- Mobile companion (read-only or limited functionality)
- Advanced search (faceted, temporal, spatial)

---

## Design Rationale

### Why Local-First?

Local-first design avoids infrastructure costs, data privacy concerns, and sync complexity. It's the simplest possible architecture: one user, one machine, one database. The application can be more aggressive with performance and doesn't need account management. Users maintain complete control.

### Tagging and Collections as Complement to Folders

Folders are limited by their single-hierarchy constraint. Tagging provides flexibility—a document can be relevant to multiple projects without duplication. Collections (saved queries) serve the role folders traditionally play, but they update automatically and can express complex logic. Index doesn't prevent folder use; it augments thinking about organization with multi-dimensional options.

### References Enable Flexibility

By pointing to sources rather than copying content, Index remains lightweight and lets users manage their actual files however they want. The single source of truth stays with the original file or URL. Index can index the same source from multiple perspectives (different tags, different collections) without duplicating data.

### Why Explicit Links?

While tags provide multi-dimensional organization, explicit relationships capture semantic meaning. "This paper references that dataset" is different from "both have tag research." Links are the edges of the information graph. They're sparse and intentional, unlike tags which are abundant and dimensional.

---

## Design Decisions and Future Extensibility

### Current Focus: Single-User

v0.3 is designed for individual use. The local-first architecture makes this simple and performant. If multi-user features become important, they can be added through optional sync mechanisms that don't compromise the core single-user experience.

### Modular Source Handler Architecture

Initial support is limited to `file://` and `https://` URIs. The architecture uses pluggable source handlers, so additional sources (Notion, Obsidian, custom URIs) can be added without rewriting core logic. Future versions can extend this as needed.

### Progressive Search Capabilities

v0.3 supports metadata and tag-based search. Full-text content search is a natural next step that can be added incrementally—users can opt into indexing specific file types without the system attempting to index everything.

---

## Implementation Notes

### Why SurrealDB?

SurrealDB provides schemaless JSON storage, a rich query language, graph traversal, and LIVE SELECT (push-based reactivity). These capabilities are core to Index's long-term direction: dynamic queries, relationship traversal, and live UI updates without polling.

In v0.3, SurrealDB runs ephemerally (temp dir) with JSON files as the source of truth. In v0.4, SurrealDB becomes the persistent store and its live query features drive UI reactivity directly.

### Why Electron + React?

Electron provides cross-platform desktop distribution and native integrations (file dialogs, system hotkeys). React handles UI complexity cleanly. Zustand provides lightweight state management without Redux boilerplate.

### Why `~/.index/` Directory?

Standard Unix convention places configuration and data in home directory hidden folders. Allows external editing, version control, and easy backup. Simple JSON format ensures portability.

---

*Design document created: February 2026*
*Living document—update as architecture and vision evolve*
