# Index Project

Personal information indexing and visualization system with clean backend/frontend separation.

## Architecture

This project is organized as a monorepo using npm workspaces with clear separation between backend services, frontend views, and reusable packages.

```
Index/
├── backend/              # Backend services
│   ├── services/
│   │   ├── database/     # Express API + SurrealDB
│   │   └── scanner/      # File indexing service
│   └── shared/           # Shared backend utilities
│
├── frontend/             # Frontend applications
│   ├── views/
│   │   └── database-viewer/  # React UI for browsing indexed files
│   └── shared/           # Shared frontend components
│
├── packages/             # Standalone packages
│   └── graph-viz/        # D3 + Pixi.js graph visualization library
│
├── data/                 # Runtime data (gitignored)
│   └── database.db/      # SurrealDB storage
│
├── archive/              # Archived projects
│   └── app-0.1/          # Previous monolithic application
│
└── docs/                 # Documentation
    └── INTEGRATION.md    # Service integration guide
```

## Quick Start

### Prerequisites

- **Node.js** 18+
- **SurrealDB** CLI installed (`brew install surrealdb/tap/surreal`)
- **npm** (comes with Node.js)

### Installation

Install all workspace dependencies from the root:

```bash
npm install
```

Or install individually:

```bash
# Backend services
cd backend/services/database && npm install
cd backend/services/scanner && npm install

# Frontend views
cd frontend/views/database-viewer && npm install

# Packages
cd packages/graph-viz && npm install
```

## Services

### Database Service

Express API server with SurrealDB for storing and querying indexed files.

**Start:**
```bash
cd backend/services/database
npm start
```

**API Endpoints:**
- `GET /health` - Health check
- `GET /api/nodes` - List all indexed nodes
- `POST /api/nodes` - Create new node
- See `/docs/INTEGRATION.md` for full API reference

**Port:** 3000

### Scanner Service

Recursive file scanner that calculates SHA-256 hashes and sends metadata to the database API.

**Configure:**
Edit `backend/services/scanner/config.json`:
```json
{
  "targetDirectory": "/path/to/scan",
  "apiEndpoint": "http://localhost:3000/api/nodes",
  "filters": {
    "excludePatterns": [".*\\.DS_Store$", ".*\\.git/.*"]
  }
}
```

**Run:**
```bash
cd backend/services/scanner
npm run test    # Dry run (preview only)
npm run scan    # Live scan (sends to database)
```

### Database Viewer

React application for browsing indexed files with filtering and search.

**Start:**
```bash
# Terminal 1: Start database service
cd backend/services/database
npm start

# Terminal 2: Start frontend dev server
cd frontend/views/database-viewer
npm run dev
```

**Access:** http://localhost:5173

The frontend uses Vite proxy to communicate with the database API on port 3000.

## Development Workflow

### Full Integration Test

1. **Start database service:**
   ```bash
   cd backend/services/database
   npm start
   ```

2. **Run scanner on a directory:**
   ```bash
   cd backend/services/scanner
   # Edit config.json to set targetDirectory
   npm run scan
   ```

3. **View indexed files:**
   ```bash
   cd frontend/views/database-viewer
   npm run dev
   # Visit http://localhost:5173
   ```

### Using Workspaces (from root)

```bash
# Start database service
npm run start:db

# Run scanner
npm run start:scanner

# Start database viewer
npm run dev:db-viewer

# Build all packages
npm run build:all
```

## Package Structure

### @index/database
Backend service providing REST API and SurrealDB management.
- **Dependencies:** express, surrealdb
- **Port:** 3000
- **Data:** Stored in `/data/database.db`

### @index/scanner
CLI tool for recursive directory scanning and file indexing.
- **Dependencies:** mime-types
- **Config:** `config.json`
- **Mode:** Standalone (can run without database)

### @index/database-viewer
React frontend for viewing indexed nodes.
- **Dependencies:** react, vite, surrealdb.js
- **Port:** 5173 (dev), proxies to 3000 for API
- **Build:** `npm run build` → `dist/`

### @index/graph-viz
Standalone graph visualization library using D3.js and Pixi.js.
- **Dependencies:** d3, pixi.js, preact
- **Language:** TypeScript
- **Use:** Can be imported by other frontend apps

## Data Flow

```
File System
    ↓
Scanner (calculates SHA-256, extracts metadata)
    ↓ HTTP POST /api/nodes
Database Service (Express + SurrealDB)
    ↓ HTTP GET /api/nodes
Database Viewer (React UI)
```

## Configuration

### Database Service

Edit `backend/services/database/server.js`:
```javascript
const PORT = 3000;              // API port
const DB_HOST = '127.0.0.1';   // SurrealDB host
const DB_PORT = 8000;           // SurrealDB port
const DB_PATH = '../../../data/database.db';  // Data file path
```

### Scanner Service

Edit `backend/services/scanner/config.json`:
```json
{
  "targetDirectory": "/path/to/scan",
  "apiEndpoint": "http://localhost:3000/api/nodes",
  "filters": {
    "excludePatterns": ["regex patterns..."]
  }
}
```

### Frontend Proxy

Edit `frontend/views/database-viewer/vite.config.js`:
```javascript
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000' },
    '/health': { target: 'http://localhost:3000' }
  }
}
```

## Documentation

- **`/docs/INTEGRATION.md`** - Service integration and API reference
- **`/archive/README.md`** - Archived projects and history
- **Service READMEs:**
  - `/backend/services/database/` (to be created)
  - `/backend/services/scanner/README.md`
  - `/packages/graph-viz/README.md`

## Architecture Principles

### 1. Clear Separation
- **Backend** = Services with business logic and data access
- **Frontend** = Views that consume backend APIs
- **Packages** = Reusable libraries

### 2. Independence
- Each service can be developed and tested independently
- Frontend views can run against any backend instance
- Packages are standalone and framework-agnostic

### 3. Workspace Benefits
- Single `npm install` at root installs all dependencies
- Shared dependency resolution
- Unified scripts for common operations

### 4. No Code Duplication
- Single source of truth for each service
- Shared code extracted to `backend/shared/` or `frontend/shared/`

## Troubleshooting

### Scanner can't reach database
**Symptom:** "Database did not become ready within timeout period"

**Solutions:**
1. Verify database is running: `curl http://localhost:3000/health`
2. Check firewall/port blocking
3. Review database service logs

### Frontend can't load data
**Symptom:** Empty table or API errors in browser console

**Solutions:**
1. Verify database service is running on port 3000
2. Check Vite proxy configuration in `vite.config.js`
3. Test API manually: `curl http://localhost:3000/api/nodes`

### SurrealDB not starting
**Symptom:** Database service fails to start

**Solutions:**
1. Verify SurrealDB is installed: `which surreal`
2. Check data directory permissions
3. Review startup logs for errors

## License

ISC
