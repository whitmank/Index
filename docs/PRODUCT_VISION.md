# Index - Product Vision

> The north star document for Index development.

---

## Why Index Exists

**The Problem:**
Our digital lives are fragmented. Files live in folders, bookmarks live in browsers, notes live in apps, and links live in documents. Traditional hierarchies force us to choose *one* location for things that belong in *many* contexts. Finding something means remembering where you put it, not what it's about.

**The Insight:**
Information wants to be connected, not siloed. A research paper relates to a project folder, a set of bookmarks, and a chain of thought—but no existing tool lets you see those relationships or navigate between them fluidly.

**The Solution:**
Index is a personal information manager that creates a semantic layer across your digital objects. Instead of managing *where* things are stored, you manage *what* things mean—through tags, collections, and links—while Index handles the rest.

---

## What Index Is

Index is a **local-first desktop application** for indexing, organizing, and visualizing information objects from multiple sources.

**Core Capabilities:**
- **Index anything with a URI** — files, URLs, and future source types
- **Tag freely** — apply multiple labels without moving the original
- **Collect dynamically** — create smart views based on tag logic (AND/OR/NOT)
- **Link explicitly** — draw relationships between objects
- **Visualize connections** — see your information as a navigable graph

**Core Properties:**
- **Local-first** — your data stays on your machine, no cloud required
- **Source-agnostic** — files and URLs today, extensible to other sources tomorrow
- **Non-destructive** — Index references objects, never moves or modifies originals
- **Keyboard-friendly** — power users can work without touching the mouse

---

## What Index Is Not

- **Not a file manager** — it doesn't replace Finder/Explorer; it adds a layer on top
- **Not cloud storage** — no sync, no remote servers, no accounts
- **Not a note-taking app** — notes are metadata on objects, not first-class entities
- **Not a database GUI** — the database is an implementation detail, not a user-facing feature
- **Not collaborative** — single-user by design (for now)

---

## Who Index Is For

**Primary User: The Digital Collector**

Someone who:
- Accumulates files, bookmarks, references, and resources across projects
- Feels overwhelmed by folder hierarchies and browser bookmark chaos
- Wants to see connections between disparate pieces of information
- Values ownership and privacy (local-first resonates)
- Is comfortable with keyboard shortcuts and power-user workflows

**Use Cases:**
1. **Research organization** — gather papers, articles, datasets, and notes around a topic
2. **Project management** — track assets, references, and deliverables across a project
3. **Personal knowledge base** — build a interconnected web of everything you've collected
4. **Creative work** — organize inspiration, references, and works-in-progress

---

## Design Principles

### 1. Objects Over Locations
The mental model is "what is this thing" not "where did I put it." Objects have identity independent of their source location.

### 2. Tags Over Folders
Multiple tags replace single-folder hierarchies. An object can belong to many contexts simultaneously.

### 3. References Over Copies
Index points to sources; it doesn't duplicate content. Your files stay where they are.

### 4. Queries Over Navigation
Collections are saved queries, not static folders. They stay up-to-date as you add matching objects.

### 5. Local Over Cloud
Your data, your machine, your control. No accounts, no sync complexity, no privacy concerns.

### 6. Keyboard Over Mouse
Core workflows should be achievable without touching the mouse. Speed matters.

---

## Success Criteria

Index succeeds when a user can:

1. **Import effortlessly** — add files or URLs with minimal friction
2. **Find by meaning** — locate objects by what they're about, not where they're stored
3. **See connections** — visualize relationships that were previously invisible
4. **Trust the system** — know that Index won't lose, move, or corrupt their data
5. **Return quickly** — pick up where they left off after days or weeks away

---

## Long-Term Vision

**Near-term (v0.3):**
- Solid architecture with file:// and https:// sources
- Refined tagging and collection system
- Clean, keyboard-driven UI

**Medium-term (v0.4+):**
- Additional source types (Notion, Obsidian, custom URIs)
- Full-text search within indexed content
- Richer graph visualization and navigation

**Long-term:**
- Plugin/extension system for custom sources
- Import/export and backup workflows
- Potential for optional sync (local-first, sync-optional)

---

*Vision drafted: January 2026*
*Living document — update as the product evolves*
