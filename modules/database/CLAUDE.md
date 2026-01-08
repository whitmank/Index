# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack Node.js application managing a SurrealDB instance lifecycle. The backend spawns and manages SurrealDB as a child process, serves REST API endpoints, and serves a React frontend for database interaction. All data persists to local file storage.

## Development Commands

### Running in Development Mode
Two terminals required:
```bash
# Terminal 1 - Backend (Express + SurrealDB)
npm run dev:backend

# Terminal 2 - Frontend (Vite dev server with hot reload)
npm run dev:frontend
```
Frontend accessible at `http://localhost:5173` (Vite proxies API calls to backend on port 3000)

### Running in Production Mode
```bash
npm run build:start    # Builds frontend and starts server
# OR
npm run build          # Build frontend only
npm start              # Start production server only
```
Production server accessible at `http://localhost:3000`

### Prerequisites
SurrealDB CLI must be installed and available in PATH:
```bash
# macOS
brew install surrealdb/tap/surreal

# Check installation
which surreal
```

## Architecture

### Three-Layer Process Model
1. **Node.js Server** (`server.js`) - Main process
2. **SurrealDB Process** - Spawned child process managed by Node.js
3. **React Frontend** - Served by Express in production, Vite dev server in development

### Backend Components

#### `server.js` - Application Entry Point
- Spawns SurrealDB as child process with `spawn('surreal', [...])`
- Monitors stdout for "Started web server" to detect DB readiness
- Connects to DB via `dbService.connect()` after DB ready
- Serves REST API endpoints
- Serves built frontend from `frontend/dist/` in production
- Graceful shutdown: SIGTERM/SIGINT handlers stop DB before exit

#### `db-service.js` - Database Abstraction Layer
- Single SurrealDB connection instance shared across requests
- Connection details: `http://127.0.0.1:8000/rpc`, namespace/database: `test/test`
- **CRITICAL**: Must use raw queries for UPDATE/DELETE operations
  - SDK methods `db.update()` and `db.merge()` return empty arrays
  - Use: `db.query('UPDATE records:id SET ...')` instead
  - Query results nested: `result[0][0]` to access first record

**Available Methods** (Phase 1):

*Connection*:
- `connect()` - Connect to SurrealDB
- `disconnect()` - Close connection

*Records (Legacy)*:
- `getAllRecords()` - Get all records
- `createRecord(data)` - Create record
- `updateRecord(id, data)` - Update record (raw query)
- `deleteRecord(id)` - Delete record (raw query)

*Nodes*:
- `getAllNodes()` - Get all nodes (ordered by timestamp_created DESC)
- `getNodeById(id)` - Get single node
- `getNodeByContentHash(hash)` - Find by content hash (for duplicate detection)
- `getNodeBySourcePath(path)` - Find by source path (for rescan detection)
- `createNode(data)` - Create node (uses SDK method)
- `updateNode(id, data)` - Update node (raw query)
- `deleteNode(id)` - Delete node (raw query)

*Links*:
- `getAllLinks()` - Get all links
- `createLink(data)` - Create link
- `updateLink(id, data)` - Update link (raw query)
- `deleteLink(id)` - Delete link (raw query)

*Tags*:
- `getAllTags()` - Get all tags (ordered by tag_name)
- `getTagsForNode(nodeId)` - Get tags for specific node
- `createTag(data)` - Create tag
- `deleteTag(id)` - Delete tag (raw query)

*Queries*:
- `getNodesByDateRange(start, end)` - Filter nodes by timestamp_created
- `getNodesByType(type)` - Filter by MIME type (partial match with CONTAINS)
- `getNodesByLocation(pathPrefix)` - Filter by source_path (partial match with CONTAINS)

### Frontend (`frontend/` directory)

#### Key Behaviors
- Loads all records on mount via `useEffect(() => loadRecords(), [])`
- After create/update/delete mutations, **always reloads all data** from server
- No optimistic UI updates - relies on server as source of truth
- Vite config proxies `/api` and `/health` to `http://localhost:3000` during dev

## Data Persistence

### File-Based Storage
- Location: `./data/database.db` (gitignored)
- Created automatically on first startup
- SurrealDB spawned with `file://./data/database.db` argument
- Data survives server restarts

### Database Schema

**Table: `records` (Legacy - Phase 0)**
- `id` - Auto-generated (format: `records:xxxxx`)
- `name` - String
- `value` - String
- `created_at` - ISO timestamp
- `updated_at` - ISO timestamp (on updates only)

**Table: `nodes` (Phase 1 - Primary)**
- `id` - Auto-generated (format: `nodes:xxxxx`)
- `content_hash` - SHA-256 hash with prefix (e.g., `sha256:abc123...`)
- `name` - Filename only (no path)
- `size` - File size in bytes
- `type` - MIME type (e.g., `image/png`)
- `source_path` - Absolute path to file
- `timestamp_created` - ISO timestamp (file birthtime)
- `timestamp_modified` - ISO timestamp (file mtime)
- `metadata` - JSON blob (extensible, contains extension, permissions, etc.)

**Table: `links` (Phase 1 - Relationships)**
- `id` - Auto-generated (format: `links:xxxxx`)
- `source_node` - Node ID (e.g., `nodes:abc123`)
- `target_node` - Node ID (e.g., `nodes:def456`)
- `type` - Link type (`derivative|temporal|semantic|spatial|project`)
- `strength` - Float 0.0-1.0 (nullable)
- `timestamp_created` - ISO timestamp
- `timestamp_modified` - ISO timestamp
- `metadata` - JSON blob (extensible)

**Table: `tags` (Phase 1 - Organization)**
- `id` - Auto-generated (format: `tags:xxxxx`)
- `tag_name` - Tag label (indexed)
- `node_id` - Node ID reference
- `timestamp_created` - ISO timestamp

## API Endpoints

### Health & Status
- `GET /health` - Health check (returns `{status: 'ok', database: 'running'}`)
- `GET /api/status` - Server and DB status

### Records (Legacy - Phase 0)
- `GET /api/records` - List all records
- `POST /api/records` - Create record (body: `{name, value}`)
- `PUT /api/records/:id` - Update record (body: `{name, value}`)
- `DELETE /api/records/:id` - Delete record

### Nodes (Phase 1 - Primary Data Model)
- `GET /api/nodes` - List all nodes (ordered by timestamp_created DESC)
- `GET /api/nodes/:id` - Get single node by ID
- `POST /api/nodes` - Create node with duplicate detection (see schema below)
- `PUT /api/nodes/:id` - Update node
- `DELETE /api/nodes/:id` - Delete node

**POST /api/nodes Duplicate Detection**:
- If `content_hash` exists → 409 Conflict with `{error, existing_node}`
- If `source_path` exists → 200 OK with updated node (rescans)
- Otherwise → 201 Created with new node

**Node Schema**:
```json
{
  "content_hash": "sha256:...",
  "name": "file.png",
  "size": 73264,
  "type": "image/png",
  "source_path": "/absolute/path",
  "timestamp_created": "2025-08-25T17:25:53.955Z",
  "timestamp_modified": "2025-08-25T17:25:53.957Z",
  "metadata": {}
}
```

### Links (Phase 1 - Relationships)
- `GET /api/links` - List all links
- `POST /api/links` - Create link (body: `{source_node, target_node, type, strength?, metadata?}`)
- `PUT /api/links/:id` - Update link
- `DELETE /api/links/:id` - Delete link

**Link Types**: `derivative`, `temporal`, `semantic`, `spatial`, `project`

### Tags (Phase 1 - Organization)
- `GET /api/tags` - List all tags
- `GET /api/nodes/:id/tags` - Get tags for specific node
- `POST /api/tags` - Create tag (body: `{tag_name, node_id}`)
- `DELETE /api/tags/:id` - Delete tag

### Query Endpoints (Phase 1 - Filtered Searches)
- `GET /api/query/nodes/by-date?start=ISO&end=ISO` - Filter by date range
- `GET /api/query/nodes/by-type?type=image` - Filter by MIME type (partial match)
- `GET /api/query/nodes/by-location?path=/Users/...` - Filter by path (partial match)

## Critical Implementation Details

### SurrealDB SDK Import
Must destructure:
```javascript
const { Surreal } = require('surrealdb');  // ✓ Correct
const Surreal = require('surrealdb');      // ✗ TypeError: not a constructor
```

### Express 5.x Catch-All Routes
Wildcard syntax changed in Express 5:
```javascript
app.use((req, res) => {                    // ✓ Correct for Express 5
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('*', (req, res) => { ... });       // ✗ Throws PathError in Express 5
```

### SurrealDB Update/Delete Pattern
SDK methods unreliable - use raw queries:
```javascript
// ✗ Don't use - returns empty array
const result = await db.update(id, data);

// ✓ Use raw queries
const result = await db.query(`UPDATE ${id} SET name = $name, value = $value`, {
  name: data.name,
  value: data.value
});
return result[0]?.[0];  // Access nested result
```

### Database Lifecycle
1. `startDatabase()` spawns process - waits for stdout "Started web server"
2. `dbService.connect()` establishes SDK connection
3. `stopDatabase()` sends SIGTERM, waits for graceful exit, force kills after 5s timeout
4. Shutdown handlers ensure `dbService.disconnect()` called before `stopDatabase()`

## Frontend Development

### State Management Pattern
After any mutation (add/edit/delete):
```javascript
await fetch('/api/records', { method: 'POST', ... });
await loadRecords();  // Always reload - don't manually update state
```

This ensures UI matches database state despite SurrealDB SDK return value quirks.

### Vite Configuration
`frontend/vite.config.js` must proxy API calls:
```javascript
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
    '/health': { target: 'http://localhost:3000', changeOrigin: true }
  }
}
```

## Common Issues

### "Surreal is not a constructor"
Fix: Change `const Surreal = require('surrealdb')` to `const { Surreal } = require('surrealdb')`

### Edit/Delete not working
Check if using raw queries in `db-service.js`. SDK methods `update()`/`merge()`/`delete()` may return empty arrays.

### Frontend not loading in production
Ensure `npm run build` executed before `npm start`. Express serves from `frontend/dist/`.

### SurrealDB not starting
Verify `surreal` CLI in PATH: `which surreal`. Install if missing.

## When Adding New Features

### Adding API Endpoints
1. Add route in `server.js`
2. Create method in `db-service.js` (use raw queries for UPDATE/DELETE)
3. Update frontend to call endpoint
4. Reload data after mutations

### Adding Database Fields
Update `createRecord()` in `db-service.js` to include new fields. SurrealDB is schemaless but application enforces structure.

### Modifying UI
Frontend is single-screen layout (100vh) with flexbox. Table scrolls independently. Keep compact design.
