# Index

Personal information indexing system. Organizes files into collections with tagging, linking, and multiple query views.

## Quick Start

**Prerequisites:** Node.js 18+, SurrealDB CLI (`brew install surrealdb/tap/surreal`)

```bash
npm install
npm run electron:dev
```

## Architecture

Electron desktop app with React frontend and Express/SurrealDB backend.

```
Index/
├── electron/           # Desktop app (main process, IPC, preload)
├── frontend/           # React UI (components, pages, hooks)
├── backend/
│   ├── database/       # Express API + SurrealDB
│   └── fs-indexer/     # File scanner with SHA-256 hashing
├── data/               # SurrealDB storage (gitignored)
└── !docs/              # Documentation
```

## Modules

| Module | Purpose | Entry Point |
|--------|---------|-------------|
| `electron` | Desktop wrapper, native file dialogs, IPC | `electron/main/index.js` |
| `backend/fs-indexer` | Recursive scanner, metadata extraction | `backend/fs-indexer/scanner.js` |
| `backend/database` | REST API for nodes, tags, links, collections | `backend/database/server.js` |
| `frontend` | React app with file browser, collections, tags | `frontend/src/main.jsx` |

## Scripts

```bash
npm run electron:dev    # Full dev stack (recommended)
npm run dev:db          # Database service only
npm run dev:frontend    # Vite dev server only
npm run build           # Production build
```

## Documentation

- [`!docs/ARCHITECTURE.md`](./!docs/Personal%20Information%20System%20Architecture.md) - Vision & principles
- [`!docs/API.md`](./!docs/API.md) - REST API reference
- [`!docs/STYLING.md`](./!docs/STYLING.md) - CSS grid & design system

## Data Flow

```
File System → Scanner → REST API → SurrealDB → React UI
                          ↑
               Electron IPC (native dialogs)
```

## License

ISC
