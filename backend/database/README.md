# Database Module

Express REST API with SurrealDB for storing indexed files.

## Structure

```
backend/database/
├── server.js       # Express app, route definitions
├── db-service.js   # SurrealDB connection and queries
└── package.json
```

## Configuration

In `server.js`:
```javascript
const PORT = 3000;        // API port
const DB_PORT = 8000;     // SurrealDB port
const DB_PATH = '../../data/database.db';
```

## Scripts

```bash
npm start           # Start API server
npm run dev:backend # Start with SurrealDB
```

## API

Full reference in `!docs/API.md`. Key endpoints:

- `GET /health` - Health check
- `GET/POST /api/nodes` - File nodes
- `GET/POST /api/tags` - Tags
- `GET/POST /api/links` - Node relationships
- `GET/POST /api/collections` - Collections

## Data Storage

SurrealDB stores data in `data/database.db/` (RocksDB format).

Database is started automatically by Electron in dev mode.
