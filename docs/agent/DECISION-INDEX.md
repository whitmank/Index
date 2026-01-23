# Decision Index for Agents

Quick reference mapping code areas to relevant architectural decisions (ADRs).

**Use this when:** You're about to modify code in a specific area and need to understand the "why" behind its design.

---

## By Feature Area

### Objects & Source Management

**When working on:** Object CRUD, import logic, deduplication, source handling

**Relevant ADRs:**
- **ADR-001: URI-Based Sources** — Objects reference sources via URIs (`file://`, `https://`), not filesystem paths
  - Key: Sources are extensible—new schemes only need a handler, no schema changes
  - Key: Type field is denormalized for query performance
  - Check: `backend/source-handlers/handler-registry.js` for how URI schemes are dispatched

**Affected files:**
- `backend/database/routes/objects.js` — Object endpoints
- `backend/services/object-service.js` — Object CRUD & deduplication
- `backend/source-handlers/` — Handler implementations per scheme
- `SCHEMA.md` — Objects table: `source`, `type`, `content_hash` fields

**Critical constraints:**
- ✓ Always include `source` (URI) and `type` fields
- ✓ Use content_hash for deduplication (compare before creating)
- ✗ Don't assume filesystem-only—handlers must work for any scheme
- ✗ Don't parse URI logic outside handler-registry.js

---

### Tags (Definitions & Assignments)

**When working on:** Tag creation, renaming, UI autocomplete, bulk tagging

**Relevant ADRs:**
- **ADR-004: Split Tags into Definitions and Assignments** — Tags have two tables:
  - `tag_definitions` — canonical registry (name, color, description)
  - `tag_assignments` — relationships to objects (which object has which tag)
  - Key: Renaming a definition globally updates all assignments automatically
  - Key: Tag metadata (color, description) lives on definition
  - Check: `SCHEMA.md` for both tables and their relationships

**Affected files:**
- `backend/database/routes/tags.js` — Tag endpoints
- `backend/services/tag-service.js` — Tag CRUD, assignment logic
- `frontend/src/hooks/useTags.js` — Frontend tag fetching
- `SCHEMA.md` — tag_definitions & tag_assignments tables

**Critical constraints:**
- ✓ Always check if TagDefinition exists before creating TagAssignment
- ✓ When renaming: update `tag_definitions.name`, all assignments reflect it
- ✗ Don't create duplicate tag definitions with same name
- ✗ Don't delete tag_definitions with active assignments without cascade logic

---

### Collections (Smart Queries)

**When working on:** Collection creation, query evaluation, collection UI

**Relevant ADRs:**
- **ADR-005: Collection Query Model (AND/OR/NOT)** — Collections filter objects via boolean logic:
  - `all`: Must have ALL tags (AND)
  - `any`: Must have ANY tag (OR)
  - `none`: Must NOT have any tag (NOT)
  - Key: Evaluation: `(hasAll) AND (hasAny OR empty) AND (NOT hasNone)`
  - Key: Empty arrays = no constraint
  - Check: `SCHEMA.md` for collections table and query field

**Query examples:**
```javascript
// Tagged "project" AND ("active" OR "review") AND NOT "archived"
{
  all: ["project"],
  any: ["active", "review"],
  none: ["archived"]
}
```

**Affected files:**
- `backend/database/routes/collections.js` — Collection endpoints
- `backend/services/collection-service.js` — Query evaluation logic
- `frontend/src/pages/CollectionsView.jsx` — UI for query builder
- `frontend/src/components/CollectionModal.jsx` — Create/edit collections
- `SCHEMA.md` — collections table structure

**Critical constraints:**
- ✓ Evaluate collections server-side (not in frontend)
- ✓ Handle empty arrays correctly (they mean "no constraint")
- ✗ Don't change query format—UI depends on `all`, `any`, `none` structure
- ✗ Don't add full SQL query language (ADR explicitly chose simpler AND/OR/NOT)

---

### Database & Persistence

**When working on:** Schema changes, migrations, database setup

**Relevant ADRs:**
- **ADR-002: SurrealDB as Embedded Database** — Uses SurrealDB in embedded mode:
  - Key: SurrealDB handles documents, graphs, and relations well
  - Key: No external setup—users don't install DB separately
  - Key: Accessed via Express API (not directly from Electron/React)
  - Key: Embeddable Rust binary, runs as subprocess
  - Check: Tech Spec Section 2 for data model

**Affected files:**
- `backend/database/db-service.js` — SurrealDB wrapper & queries
- `backend/database/server.js` — Express setup, connection management
- `electron/main/services/database-manager.js` — DB lifecycle in Electron
- `SCHEMA.md` — All table definitions & relationships
- `backend/database/routes/` — All CRUD operations

**Critical constraints:**
- ✓ Route all DB access through Express API (never direct Electron→DB)
- ✓ Use SurrealQL queries via db-service.js wrapper
- ✓ Test migrations on both memory and file-based storage
- ✗ Don't expose SurrealDB port directly to frontend
- ✗ Don't add direct database connections from renderer (security violation)

---

### Desktop Integration & IPC

**When working on:** File dialogs, filesystem watching, opening files, system integration

**Relevant ADRs:**
- **ADR-003: Electron for Desktop Shell** — Uses Electron for cross-platform:
  - Key: Main process has Node.js (system access, subprocess management)
  - Key: Renderer has React UI (no Node.js, for security)
  - Key: IPC bridge connects them safely
  - Key: Context isolation enabled (`contextIsolation: true`)
  - Check: Tech Spec Section 1 for architecture diagram

**Affected files:**
- `electron/main/index.js` — Main process entry, window lifecycle
- `electron/main/ipc/fs-bridge.js` — File system IPC channels
- `electron/main/ipc/source-ipc.js` — Source handler dispatch IPC
- `electron/preload/preload.js` — Context bridge (what renderer can access)
- `frontend/src/` — React renderer (no `require()`, no direct Node.js)
- `IPC_CHANNELS.md` — All available IPC channels

**Critical constraints:**
- ✓ All Node.js code in `electron/main/` or `backend/`
- ✓ All system operations go through IPC channels or API
- ✓ Preload script defines what frontend can call
- ✗ Don't enable `nodeIntegration` in renderer
- ✗ Don't expose sensitive Node.js APIs to preload
- ✗ Don't use `eval()` or dynamic `require()` in main process

---

## By Code Layer

### Frontend (React)

**Relevant ADRs:** ADR-003 (Electron architecture), ADR-005 (collection queries)

**Key constraints from architecture decisions:**
- Cannot access filesystem directly (goes through IPC)
- Cannot query database directly (goes through API)
- Must use preload API for system operations
- Query evaluation happens server-side, frontend just displays results

**Consult:** `IPC_CHANNELS.md`, `API_ENDPOINTS.md`

---

### Backend (Express + Services)

**Relevant ADRs:** ADR-001 (URIs), ADR-002 (SurrealDB), ADR-004 (tags), ADR-005 (collections)

**Key constraints from architecture decisions:**
- All database access through SurrealDB wrapper
- Source handlers dispatch based on URI scheme
- Tag operations must respect definition/assignment split
- Collection queries evaluate using AND/OR/NOT logic

**Consult:** `SCHEMA.md`, `API_ENDPOINTS.md`

---

### Main Process (Electron)

**Relevant ADRs:** ADR-003 (Electron), ADR-001 (sources)

**Key constraints from architecture decisions:**
- Handles system operations (filesystem, file watchers, dialogs)
- Manages SurrealDB subprocess lifecycle
- Exposes limited IPC channels to renderer
- Bridges renderer requests to backend API and system operations

**Consult:** `IPC_CHANNELS.md`, `FILE_REGISTRY.md`

---

## By Task Type

### Adding a New Source Handler

**Relevant ADR:** ADR-001 (URI-Based Sources)

**Steps:**
1. Extend `backend/source-handlers/handler-base.js` (interface)
2. Implement scheme-specific handler (e.g., `notion-handler.js`)
3. Register in `backend/source-handlers/handler-registry.js`
4. Add tests for URI parsing, metadata extraction, hash calculation
5. Update `FILE_REGISTRY.md` with new handler path

**Why this structure:** Allows new schemes without modifying objects schema or routes

---

### Renaming a Tag Globally

**Relevant ADR:** ADR-004 (Split Tags)

**Steps:**
1. Update `tag_definitions` record (just change `.name`)
2. All `tag_assignments` automatically reference the new name
3. UI shows updated tag name everywhere
4. No need to touch objects or collections

**Why this works:** Tag name lives in one place; assignments just reference the ID

---

### Creating a New Collection Type

**Relevant ADR:** ADR-005 (Query Model)

**Steps:**
1. New collection is just a new `collections` record with a query
2. Query uses `all`, `any`, `none` arrays
3. Evaluate server-side in `collection-service.js`
4. Frontend UI builds query in `CollectionModal.jsx`
5. Results auto-update when tags change

**Why this works:** Query model is generic; all collections work the same way

---

### Supporting a New File Type

**Relevant ADR:** ADR-001 (URI-Based Sources)

**Steps:**
1. Add MIME type support to `file-handler.js` (metadata extraction)
2. Add icon/rendering logic in frontend (component-level, not architecture)
3. No schema changes needed
4. No handler changes needed (already handles all file:// URIs)

**Why this works:** Objects are source-agnostic; type is just metadata

---

## Integration Reminders

**When making changes to one area, consider:**

| Change | May Affect | Check |
|--------|-----------|-------|
| Add new field to objects | Schema, API routes, frontend detail panel | SCHEMA.md, API_ENDPOINTS.md |
| Rename tag definition | All assignments, UI, collections | ADR-004, collection-service.js |
| Change query evaluation logic | Collection display, query builder UI | ADR-005, SCHEMA.md |
| Add new IPC channel | Main process, preload, frontend | IPC_CHANNELS.md, preload.js |
| Add new API route | Backend service, frontend hooks | API_ENDPOINTS.md, useObjects.js etc. |
| Add source handler | Registry, handler dispatch, tests | ADR-001, handler-registry.js |

---

**Last Updated:** January 2026 | Index v0.3
**Derived from:** ADRs 001-006, Tech Spec Sections 1-2, FILE_REGISTRY.md, SCHEMA.md
