# Quick Glossary

One-line definitions for agent reference. Full glossary: `docs/0 - CORE/GLOSSARY.md`

---

## Core Entities

| Term | Definition |
|------|-----------|
| **Object** | Fundamental entity representing something indexed (file, URL, future sources). Has ID, source URI, metadata, tags, links. |
| **Source** | Actual location/resource (file system, web URL, future: Notion, Obsidian). Expressed as URI. |
| **URI** | Uniform Resource Identifier: `scheme://path`. Examples: `file:///path/to/file`, `https://example.com`. |
| **Source Type** | Category: `file`, `url`, etc. Derived from URI scheme. Used for filtering. |
| **Source Handler** | Module that knows how to work with specific URI scheme (metadata extraction, hashing, opening, watching). |

---

## Tagging System

| Term | Definition |
|------|-----------|
| **Tag** | Label applied to objects. Flexible multi-dimensional organization. Examples: `important`, `project-alpha`, `to-read`. |
| **Tag Definition** | Canonical record of tag: name, color, description. Enables global rename and bulk operations. |
| **Tag Assignment** | Link between tag and object. Many-to-many relationship (object has many tags, tag has many objects). |

---

## Collections & Queries

| Term | Definition |
|------|-----------|
| **Collection** | Saved query that dynamically groups objects by tags. Smart folder that updates automatically. |
| **Collection Query** | Tag logic: `{all: [...], any: [...], none: [...]}`. Result = (all AND any) AND NOT none. |
| **Query Resolution** | Process of finding all objects matching collection query. |

---

## Relationships

| Term | Definition |
|------|-----------|
| **Link** | Explicit relationship between two objects. Has type (`related`, `derivative`, `reference`) and optional label. |
| **Link Type** | Category: `related`, `derivative`, `reference`. Classifies relationship nature. |
| **Bidirectional** | Link visible from both objects (true) or only from source (false). |

---

## Metadata

| Term | Definition |
|------|-----------|
| **Source Metadata** | Auto-extracted info from source (size, MIME type, title, favicon, etc.). Read-only. |
| **User Metadata** | User-provided info (notes, custom fields). Editable. |
| **Content Hash** | SHA-256 fingerprint: `sha256:...`. Used for deduplication. |

---

## Operations

| Term | Definition |
|------|-----------|
| **Index** | Process of adding object to system. Parse URI → extract metadata → create object → apply tags. |
| **Deduplication** | Detecting duplicate content via hash comparison. Warns user instead of creating duplicate. |
| **Metadata Extraction** | Handler operation: read source, return metadata. Different for files (size, type) vs URLs (title, description). |

---

## UI Concepts

| Term | Definition |
|------|-----------|
| **Detail Panel** | Right sidebar showing object: metadata, tags, notes, links, actions. |
| **Object List** | Main table: objects with sort, filter, multi-select, keyboard nav. |
| **Graph View** | Visual representation: objects as nodes, links as edges. Force-directed layout. |
| **Pinned Collection** | Collection in sidebar for quick access. State stored in database. |

---

## System

| Term | Definition |
|------|-----------|
| **Electron** | Desktop shell providing IPC bridge between main process and React renderer. |
| **IPC** | Inter-Process Communication. Main process ↔ Renderer process (file dialogs, source operations). |
| **Preload Script** | Secure context bridge. Exposes `window.electronAPI` to renderer. |
| **SurrealDB** | Embedded document database. Tables: `objects`, `tag_definitions`, `tag_assignments`, `collections`, `links`. |

---

**Source:** docs/0 - CORE/GLOSSARY.md
**Last Updated:** January 2026
