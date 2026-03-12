---
session: 002
timestamp: 2026-03-12T02:00:46Z
session_id: 1b1247ff-16f1-44b0-8ff0-5fa60a6b1aa0
cwd: /Users/karter/files/dev/index-workspace/0.4
dev_log: 002_log.md
---

# Human

<command-message>orient</command-message>
<command-name>/orient</command-name>

---

# Human

Read DIALECTIC/ORIENT.md in the project root. Return a concise summary in this form:

**Conceptual** — philosophical and design state of the project
**Technical** — architectural and developmental state
**Synthesis** — what is currently settled
**Key Decisions** — settled choices anchoring the work
**Open** — bulleted unresolved contradictions

Comprehensive enough for the user to confirm alignment, not verbose.

---

# Model

> **[tool: Read]** {"file_path": "/Users/karter/files/dev/index-workspace/0.4/DIALECTIC/ORIENT.md"}

> **[result]** 1→---
     2→updated: 2026-03-11
     3→session: "002"
     4→---
     5→
     6→## Conceptual Context
     7→
     8→Index is a semantic layer over a file system. The organizing principle is *meaning...

---

# Model

**Conceptual** — Index is a semantic layer over the filesystem. Meaning over location; objects exist in multiple tag/collection contexts simultaneously. Local-first is a hard constraint. The app manages references, never copies.

**Technical** — v0.4 rebuild is complete and running. Architecture: persistent SurrealDB (`~/.index/surreal/`), LIVE SELECT reactivity, single Zustand store, async debounced export, centralized system tag domain, `normalizeRecord()` at the IPC boundary. v0.3 migration runs on first boot.

**Synthesis** — Foundation is stable. Last session was orientation + docs (ABOUT.md). No new features were built. System is ready for feature development.

**Key Decisions**
- Persistent SurrealDB over ephemeral
- LIVE SELECT over polling
- `useIndexStore` as single store
- `scheduleExport()` on all mutations
- System tags owned by `domain/tag-types.js`
- ID normalization at IPC boundary only

**Open**
- Graph edges are unrendered — links exist in the DB but GraphView shows nodes only; core value proposition (relationships) is structurally absent from the UI
- `device-naming-dialog.js` reads v0.3 path (`~/.index/objects/`) — consistency gap, marked acceptable but not resolved
