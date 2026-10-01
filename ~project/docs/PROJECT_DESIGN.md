---
author: Claude Opus 4.7
date: 2026-04-19
version: 0.6
based_on: 0.5/docs/PROJECT_DESIGN.md (Claude Code, 2026-03-17)
---

# Index — Project Design

## Concept

Index is a local-first desktop application that creates a semantic layer across digital objects. It addresses the fundamental limitation of hierarchical file systems by allowing information to exist in multiple contexts simultaneously through edges, spaces, and explicit relationships. Users manage *what things mean* rather than *where things are stored*.

---

## Problem Statement

### The Core Issue

Traditional file systems organize information hierarchically — a document lives in one folder, a bookmark in a browser, notes in an app. This organizational model forces a critical choice: *where should this thing go?* when it actually belongs in multiple contexts.

A research paper, for example, relates to:
- A project folder (location)
- Bookmarks (source type)
- Notes and annotations (metadata)
- Multiple other papers (relationships)
- Several tags (context)

Yet hierarchical systems allow only one storage location. This creates friction: users either duplicate content (creating maintenance headaches) or accept that they must remember *where* they put something to find it, not *what it's about*.

### Why This Matters

As individual users accumulate thousands of files across devices, projects, and time periods, hierarchical organization breaks down. The human mental model — rhizomatic, associative, multi-contextual — doesn't map to strict folder trees. File discovery becomes archaeologically difficult. Information silos form: notes in one app, bookmarks in a browser, files on disk.

---

## Design Principles

### 1. Objects Over Locations

An object represents any indexable resource — a file, URL, or future source type. Objects have identity independent of their physical storage location or source type.

**Implication:** Users think in terms of "what is this?" not "where did I put it?" An object remains the same whether its source file is moved to a new folder or a URL is bookmarked multiple times. The object's identity persists; its source may change.

### 2. Edges Over Folders

Multi-dimensional semantic edges replace single-hierarchy folder organization. An object can have unlimited relationships, placing it simultaneously in many contexts without duplication. Edges are first-class records — they can carry provenance, confidence, and annotation data.

**Implication:** Organization is flexible and extends naturally as new contexts emerge. A document can be related to an author, a genre, a publisher, and a project without living in three separate folders. Relationships can be renamed globally; the graph reflects that change across all objects.

### 3. References Over Copies

Index points to sources; it never duplicates or moves content. Files remain in their original locations. URLs remain at their source servers. Index holds metadata and relationships; the actual content stays untouched.

**Implication:** Complete data integrity — users never lose or corrupt files through Index. Source files can be edited externally, and Index's references remain valid. Deduplication becomes possible through content hashing.

### 4. Queries Over Navigation

Spaces are saved queries defined by edge predicates, not static folder lists. As objects are tagged or related, space membership updates automatically.

**Implication:** Spaces stay relevant without maintenance. Create a space `all: [{ edge: "type", to: "objects:⟨book⟩" }], none: [{ edge: "genre", to: "objects:⟨textbook⟩" }]` and it remains correct even as new objects are added. Users think in terms of logical filters rather than folder hierarchies.

### 5. Local-First Foundation

All data resides on the user's machine by default. No cloud servers, no sync, no accounts, no privacy concerns. The application is self-contained and operates fully offline.

**Implication:** Complete data ownership and offline operation. No subscription or external dependencies. Users control backup and portability. Future iterations can add optional, explicit sync mechanisms, but the core remains local.

### 6. Intent-Driven Interface

The interface responds to intent, not input method. Whether a user is browsing, searching, creating, or connecting, the system provides appropriate affordances. The cognitive task determines the interaction style naturally.

**Implication:** No interaction mode is privileged. Browsing may feel visual and spatial; rapid entry may feel direct and fast; linking may feel spatial and visual. The system adapts to what the user is trying to accomplish.

---

## User Model

### Target User Profile

The primary user is a "digital collector" — someone who:
- Accumulates files, bookmarks, references, and resources across projects
- Works with information across multiple domains simultaneously
- Values ownership and privacy
- Is comfortable with keyboard-driven interfaces
- Needs to see connections between disparate information

### Primary Use Cases

1. **Research Organization** — Gather papers, articles, datasets, and notes around a topic. Use edges like `author`, `genre`, `published` and spaces to filter by relevance level.

2. **Project Management** — Track assets, references, and deliverables across projects. Link related documents; create project-specific spaces with rule predicates.

3. **Personal Knowledge Base** — Build an interconnected web of everything you've collected. Use relationships to show how ideas connect, create spaces for different domains, and search by meaning rather than file location.

4. **Creative Work** — Organize inspiration, references, and works-in-progress. Use type schemas to ensure consistent metadata per content category. Visualize relationships between references and final work.

---

## Success Criteria

The application succeeds when users can consistently:

1. **Add without friction** — Index a file or URL with minimal interaction
2. **Find by meaning** — Locate objects using edges, spaces, or search — not file paths
3. **See connections** — Understand how objects relate through links and visualizations
4. **Trust the system** — Confidence that data won't be lost, moved, or corrupted
5. **Work at speed** — Keyboard-driven workflows that don't slow down thinking

---

## Design Rationale

### Why Local-First?

Index is organized around the user, not the machine. A person's collection of knowledge spans many devices and contexts — local-first means that data lives with the user, travels with the user, and belongs to the user. Each device is a participant in a single coherent index of meaning. This keeps the architecture simple and performant, eliminates external dependencies, and gives users complete ownership and control of their data.

### Edges and Spaces as Complement to Folders

Folders are limited by their single-hierarchy constraint. Semantic edges provide flexibility — a document can be relevant to multiple projects without duplication. Spaces (saved queries) serve the role folders traditionally play, but they update automatically and can express complex logic. Index doesn't prevent folder use; it augments thinking about organization with multi-dimensional options.

### References Enable Flexibility

By pointing to sources rather than copying content, Index remains lightweight and lets users manage their actual files however they want. The single source of truth stays with the original file or URL. Index can index the same source from multiple perspectives without duplicating data.

### Why Explicit Edges?

Edges are the graph of the information — sparse and intentional, unlike full-text associations which are dense and ambient. "This book was written by this author" is different from "both contain the word 'author'." Explicit edges capture semantic meaning; spaces built on those edges are meaningful and maintainable.

### One Table, One Mechanism

In the unified graph, everything is an Object and every relationship is an edge. No special-casing: the same node table holds leaf files, tag values, type categories, and devices. The same edge mechanism connects them all. This uniformity means the UI, query compiler, and data model share the same primitives — and every concept in the application is navigable.

---

*Living document — update as vision evolves.*
