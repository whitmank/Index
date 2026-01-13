# Archive Directory

This directory contains deprecated projects and code that are no longer actively used but are preserved for reference.

## Contents

### `app-0.1/`
**Archived:** 2026-01-08

**Description:** Complete "GraphTool" application - an interactive force-directed graph visualization tool with React frontend, Express backend, and SurrealDB database. This was an earlier iteration of the project that has been superseded by the reorganized modular structure.

**Features:**
- Express API + SurrealDB + WebSocket broadcasting
- React frontend with D3.js force simulation
- File-based persistence (JSON files as source of truth)
- Developer CRUD interface at `/dev` route
- Multi-source data management with hot reload

**Git History:** This directory contains its own `.git/` repository with full commit history preserved.

**Why Archived:**
- Code duplication with `/modules/` directory
- Mixed concerns (backend and frontend in same structure)
- Inconsistent with new modular architecture
- User may manually extract useful components later

**Useful Components to Extract:**
- `backend/src/services/file-service.js` - File I/O and watcher logic
- `backend/src/services/data-source-service.js` - Multi-source data management
- `backend/src/utils/` - Utility functions (config, events)
- `frontend/src/DevInterface.jsx` - CRUD interface for data management
- `frontend/src/components/` - GraphCanvas, Node, Link React components
- `frontend/src/engine/` - D3 force simulation wrapper

**Note:** Do not delete this directory without reviewing its contents first.
