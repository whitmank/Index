# SurrealDB Manager - Project Summary

## Overview
A full-stack Node.js application that manages the complete lifecycle of a SurrealDB instance, including automatic startup, REST API backend, and a React frontend for database interaction. All data persists to local storage.

## Architecture

### Backend (Node.js + Express)
- **Location**: `server.js`
- **Responsibilities**:
  - Spawns and manages SurrealDB process as a child process
  - Connects to SurrealDB on startup
  - Provides REST API endpoints for CRUD operations
  - Serves built frontend in production
  - Graceful shutdown handling (stops DB process on exit)

### Database Service
- **Location**: `db-service.js`
- **Responsibilities**:
  - Establishes connection to SurrealDB via the Node.js SDK
  - Provides abstraction layer for database operations
  - Uses raw SurrealDB queries for reliable updates/deletes
  - Handles connection lifecycle (connect/disconnect)

### Frontend (React + Vite)
- **Location**: `frontend/` directory
- **Key Files**:
  - `src/App.jsx` - Main application component
  - `src/App.css` - Minimal, single-screen styling
- **Features**:
  - Loads all records on mount
  - Create, Read, Update, Delete operations
  - Compact UI that fits on one screen without scrolling
  - Real-time data synchronization with backend

### Database (SurrealDB)
- **Storage**: File-based at `./data/database.db`
- **Configuration**:
  - Host: 127.0.0.1
  - Port: 8000
  - Namespace: test
  - Database: test
  - User: root
  - Pass: root
- **Table**: `records` with fields: `id`, `name`, `value`, `created_at`, `updated_at`

## Project Structure

```
mdb/
├── server.js              # Express server + SurrealDB process manager
├── db-service.js          # Database service layer
├── package.json           # Backend dependencies and scripts
├── data/                  # Database storage (gitignored)
│   └── database.db        # SurrealDB data file
├── frontend/              # React application
│   ├── src/
│   │   ├── App.jsx        # Main UI component
│   │   ├── App.css        # Styles
│   │   └── main.jsx       # React entry point
│   ├── dist/              # Production build output
│   ├── package.json       # Frontend dependencies
│   └── vite.config.js     # Vite configuration with API proxy
└── docs/                  # Documentation
    ├── PROJECT_SUMMARY.md
    └── DEVELOPMENT_LOG.md
```

## API Endpoints

### Health & Status
- `GET /health` - Server health check
- `GET /api/status` - Database and server status

### Records CRUD
- `GET /api/records` - Get all records
- `POST /api/records` - Create a new record
  - Body: `{ name: string, value: string }`
- `PUT /api/records/:id` - Update a record
  - Body: `{ name: string, value: string }`
- `DELETE /api/records/:id` - Delete a record

## NPM Scripts

### Backend (Root)
- `npm start` - Start production server
- `npm run build` - Build frontend for production
- `npm run build:start` - Build frontend and start server
- `npm run dev:backend` - Start backend in development mode
- `npm run dev:frontend` - Start frontend dev server (Vite)

### Frontend (frontend/)
- `npm run dev` - Start Vite dev server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Running the Application

### Development Mode
1. **Terminal 1** (Backend):
   ```bash
   npm run dev:backend
   ```
2. **Terminal 2** (Frontend):
   ```bash
   npm run dev:frontend
   ```
3. Open browser to `http://localhost:5173`

### Production Mode
```bash
npm run build:start
```
Open browser to `http://localhost:3000`

## Dependencies

### Backend
- `express` (v5.2.1) - Web server framework
- `surrealdb` (v1.3.2) - SurrealDB Node.js SDK
- `concurrently` (dev) - Run multiple commands

### Frontend
- `react` (v19.2.0) - UI framework
- `react-dom` (v19.2.0) - React DOM bindings
- `surrealdb.js` (v0.11.1) - SurrealDB JavaScript client
- `vite` (v7.2.4) - Build tool and dev server

## Key Implementation Details

### Database Lifecycle Management
- SurrealDB is spawned as a child process using Node's `spawn()`
- Process stdout is monitored for "Started web server" to confirm readiness
- Graceful shutdown handlers (SIGTERM/SIGINT) ensure DB stops cleanly
- Data persists to local file, surviving server restarts

### Data Persistence
- Uses SurrealDB's file-based storage: `file://data/database.db`
- All CRUD operations immediately write to disk
- No in-memory cache - all data comes from the database
- Frontend reloads data after create/update/delete to ensure consistency

### API Response Consistency
- Create/Update operations use raw SurrealDB queries for reliable results
- Query results are normalized before returning to frontend
- Frontend reloads all records after mutations to avoid stale state

### Frontend-Backend Integration
- Vite dev server proxies `/api` and `/health` requests to backend (port 3000)
- Production: Express serves built frontend from `frontend/dist/`
- Catch-all route serves `index.html` for client-side routing compatibility

## Known Technical Details

### Express 5.x Compatibility
- Uses `app.use((req, res) => ...)` instead of `app.get('*', ...)` for catch-all routes
- Express 5 changed wildcard route syntax

### SurrealDB SDK Quirks
- Must destructure import: `const { Surreal } = require('surrealdb')`
- `update()` and `merge()` methods sometimes return empty arrays
- Raw queries (`db.query()`) are more reliable for UPDATE and DELETE operations
- Query results are nested arrays: `result[0][0]` to get first record

## Future Enhancement Ideas
- Add authentication/authorization
- Support multiple tables/collections
- Add query filtering and sorting in UI
- Implement pagination for large datasets
- Add real-time updates via WebSockets
- Support for complex SurrealDB features (relationships, graph queries)
- Docker containerization
- Environment-based configuration (.env files)
