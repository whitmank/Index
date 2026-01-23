# Index v0.3 - Developer Quickstart

## What is Index?

**Index** is a local-first desktop application that creates a semantic organizational layer above your information sources (files, URLs, and future sources). Instead of rigid file hierarchies, Index lets you organize everything through:

- **Objects**: Abstraction for any information source (files, URLs, etc.)
- **Tags**: Flexible multiple labels instead of single-folder hierarchies
- **Collections**: Smart queries combining tags with AND/OR/NOT logic
- **Links**: Explicit relationships between objects
- **Graph Visualization**: Visual representation of connections

**Key Properties:**
- 100% local-first (no cloud, no accounts)
- Non-destructive (only creates references, never modifies sources)
- Cross-platform (macOS, Windows, Linux via Electron)
- Keyboard-friendly power-user interface

---

## Architecture Overview

### High-Level Stack

```
┌─────────────────────────────────────────────┐
│         Electron Shell (Desktop)            │
│  ┌──────────────────┬──────────────────┐    │
│  │  Main Process    │  React Frontend  │    │
│  │  IPC Bridge      │  (Vite)          │    │
│  └──────────┬───────┴──────────┬───────┘    │
└─────────────┼──────────────────┼────────────┘
              │                  │
┌─────────────┴──────────────────┴────────────┐
│         Core Services Layer                 │
│  ┌────────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Express    │ │SurrealDB │ │ Source   │  │
│  │ API        │ │Database  │ │ Handlers │  │
│  │ (:3000)    │ │(:8000)   │ │file://, │  │
│  │            │ │          │ │https:/  │  │
│  └────────────┘ └──────────┘ └──────────┘  │
└─────────────────────────────────────────────┘
```

### Key Services

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Desktop** | Electron 39.2.7+ | Cross-platform wrapper, IPC bridge |
| **Frontend** | React 19.2.3+, Vite 7.2.4+ | UI, routing (React Router), state (Zustand/Jotai) |
| **Backend** | Express 5.2.1+ | REST API server |
| **Database** | SurrealDB 1.3.2+ | Embedded document database (local file) |
| **Graph** | D3 Force | Physics-based visualization |
| **Styling** | Tailwind CSS / Styled Components | UI styling |

### Port Configuration

| Service | Port | Purpose | Environment |
|---------|------|---------|------------|
| Vite Dev Server | 5173 | Frontend dev (HMR) | Dev only |
| Express API | 3000 | REST endpoints | Both |
| SurrealDB | 8000 | Database service | Both |

### Directory Structure

```
index-workspace/
├── electron/                    # Electron main process
│   ├── main/
│   │   ├── index.js            # Entry point
│   │   ├── ipc/                # IPC channel handlers
│   │   └── services/           # Database, app management
│   └── preload/
│       └── preload.js          # Context bridge API
│
├── frontend/                    # React application (Vite)
│   ├── src/
│   │   ├── main.jsx            # Entry point
│   │   ├── App.jsx             # Root component
│   │   ├── store/              # Zustand state management
│   │   ├── components/         # Reusable UI components
│   │   ├── pages/              # Route-based views
│   │   ├── hooks/              # Custom React hooks
│   │   └── styles/             # Global CSS
│   └── index.html
│
├── backend/                     # Core services
│   ├── database/
│   │   ├── server.js           # Express app & routes
│   │   ├── db-service.js       # SurrealDB wrapper
│   │   └── routes/             # API endpoints
│   │
│   └── source-handlers/        # Source handler implementations
│       ├── handler-base.js     # Base interface
│       ├── file-handler.js     # file:// handler
│       ├── https-handler.js    # https:// handler
│       └── handler-registry.js # Dispatch logic
│
├── data/                        # Local SurrealDB storage
│   └── surrealdb.db
│
├── package.json                # Monorepo workspace config
└── docs/                        # Documentation (this file, etc.)
```

---

## Development Setup

### Prerequisites

- **Node.js** 18+ and npm/yarn/pnpm
- **SurrealDB** 1.3.2+ (for database backend)
- **Electron** 39.2.7+ (installed via npm)

### Installation Steps

```bash
# 1. Install dependencies (monorepo workspace)
npm install

# 2. Start database server
# Option A: Using SurrealDB locally
surrealdb start --bind 127.0.0.1:8000 memory

# Option B: If using file-based storage
surrealdb start --bind 127.0.0.1:8000 file:./data/surrealdb.db

# 3. In a separate terminal, start backend API server
npm run backend:dev
# Runs on http://localhost:3000

# 4. In another terminal, start frontend dev server
npm run frontend:dev
# Runs on http://localhost:5173 with HMR

# 5. In another terminal, start Electron in dev mode
npm run electron:dev
# Opens Electron window with dev tools
```

---

## NPM Scripts

### Development

```bash
# Start all services (requires 3-4 terminals)
npm run dev          # Run all dev servers in parallel (if configured)

# Individual service startup
npm run backend:dev  # Start Express API server (port 3000)
npm run frontend:dev # Start Vite dev server (port 5173)
npm run electron:dev # Start Electron in development mode

# Database
npm run db:start     # Start SurrealDB server (port 8000, memory)
npm run db:shell     # Open SurrealDB shell (surql)
```

### Building

```bash
# Build frontend
npm run frontend:build    # Create optimized Vite bundle

# Build Electron app
npm run electron:build    # Create distributable Electron app
npm run electron:build:mac   # macOS app
npm run electron:build:win   # Windows app
npm run electron:build:linux # Linux app

# Full build
npm run build         # Build all components
```

### Testing & Validation

```bash
npm run test         # Run all tests
npm run test:watch   # Run tests in watch mode
npm run lint         # Lint code (ESLint)
npm run typecheck    # TypeScript type checking (if using TS)
npm run format       # Format code (Prettier)
```

### Database Management

```bash
npm run db:migrate   # Run database migrations (if applicable)
npm run db:seed      # Seed test data
npm run db:reset     # Reset database (dev only)
```

---

## Useful Development Commands

### Debugging

```bash
# Backend: Start Express with debug output
DEBUG=* npm run backend:dev

# Frontend: React DevTools
# Available in Electron DevTools (Ctrl+Shift+I / Cmd+Option+I)

# Electron: Open DevTools
# In running Electron: Ctrl+Shift+I (Windows/Linux) or Cmd+Option+I (macOS)
```

### Database Operations

```bash
# Access SurrealDB shell
surrealdb shell --endpoint http://127.0.0.1:8000

# In shell, query examples:
SELECT * FROM objects;           # List all objects
SELECT * FROM tags;              # List all tags
SELECT * FROM collections;       # List all collections
SELECT * FROM links;             # List all links

# Clear all data (dev only)
REMOVE TABLE objects;
REMOVE TABLE tags;
REMOVE TABLE collections;
REMOVE TABLE links;
```

### Testing the API

```bash
# Using curl or Postman
curl http://localhost:3000/api/objects
curl http://localhost:3000/api/tags
curl http://localhost:3000/api/collections

# Or use Thunder Client / Postman with the API.md spec
```

---

## File Organization

- **`- Human Docs/`** — Conceptual foundation and problem statement
- **`0 - CORE/`** — Vision, glossary, and terminology
- **`1 - PRODUCT SPEC/`** — User-facing design and features
- **`2 - TECH SPEC/`** — Technical architecture and implementation details
  - `0.3_technical-spec.md` — Complete technical specification
  - `API.md` — REST API endpoint documentation
  - `STYLING.md` — UI design system
  - `adr/` — Architecture Decision Records (why we made key choices)
- **`3 - DEVELOPMENT/`** — Development logs and planning
  - `dev-log/` — Historical session logs
  - `plans/` — Development plans and tasks

**Read these in order:**
1. `CORE/PRODUCT_VISION.md` — Understand the vision
2. `1 - PRODUCT SPEC/0.3_product-spec.md` — Understand what users do
3. `2 - TECH SPEC/0.3_technical-spec.md` — Understand how it's built
4. `2 - TECH SPEC/API.md` — Understand the backend API
5. `2 - TECH SPEC/adr/` — Deep dive into architectural decisions

---

## Key Concepts

### Objects
- Abstraction for any information source
- Example: File objects reference `file:///path/to/file.pdf`
- Example: URL objects reference `https://example.com/article`
- Stores metadata (name, size, type, modification date, etc.)
- Supports content hashing for deduplication

### Tags
- Flexible labels for organizing objects
- Separated into **definitions** (tag metadata) and **assignments** (tag-object relationships)
- Allows renaming tags globally without breaking references

### Collections
- Smart queries combining tags
- Query syntax: `{ all: [...], any: [...], none: [...] }`
- `all`: Objects with ALL specified tags (AND)
- `any`: Objects with ANY specified tags (OR)
- `none`: Objects WITHOUT specified tags (NOT)

### Links
- Explicit relationships between objects
- Types: "related", "derivative", "reference"
- Can be bidirectional
- Examples: "references", "cited by", "depends on"

### Source Handlers
- Extensible interface for handling different URI schemes
- Built-in: `file://` (filesystem), `https://` (web)
- Future-ready for custom handlers

---

## Troubleshooting

### Port Already in Use

```bash
# Find what's using the port
lsof -i :3000    # Backend
lsof -i :5173    # Frontend
lsof -i :8000    # Database

# Kill the process
kill -9 <PID>
```

### Database Connection Errors

- Ensure SurrealDB is running: `surrealdb start --bind 127.0.0.1:8000 memory`
- Check backend is connecting to the right endpoint (default: `http://127.0.0.1:8000`)
- Clear data if corrupted: `rm data/surrealdb.db`

### Electron Won't Start

- Ensure both backend (port 3000) and frontend (port 5173) are running
- Check Electron console for errors (DevTools: Cmd+Option+I or Ctrl+Shift+I)
- Rebuild native modules if needed: `npm rebuild`

### Hot Reload Not Working

- Vite should auto-reload on file changes
- Check that frontend dev server is running on port 5173
- Manually refresh Electron window (Cmd+R or Ctrl+R)

---

## Next Steps

1. **Understand the Vision**: Read `0 - CORE/PRODUCT_VISION.md`
2. **Set Up Environment**: Follow installation steps above
3. **Explore the Code**: Start in `frontend/src/App.jsx` and `backend/database/server.js`
4. **Read the Spec**: Dive into `2 - TECH SPEC/0.3_technical-spec.md`
5. **Check Out ADRs**: Review Architecture Decision Records in `2 - TECH SPEC/adr/`
6. **Start Coding**: Create a task in `3 - DEVELOPMENT/plans/` and begin implementing

---

## References

- **Architecture Decisions**: `2 - TECH SPEC/adr/`
- **API Specification**: `2 - TECH SPEC/API.md`
- **UI Design System**: `2 - TECH SPEC/STYLING.md`
- **Glossary**: `0 - CORE/GLOSSARY.md`
- **Product Spec**: `1 - PRODUCT SPEC/0.3_product-spec.md`
- **Technical Spec**: `2 - TECH SPEC/0.3_technical-spec.md`

---

## Development Philosophy

- **Local-First**: All data stays on device
- **Non-Destructive**: Never modify original sources
- **Extensible**: Source handlers support future sources
- **User-Centric**: Keyboard shortcuts and efficient workflows
- **Simple Architecture**: Clear separation of concerns (Electron → React → Express → SurrealDB)
