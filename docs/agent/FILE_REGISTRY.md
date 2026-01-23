# File Registry - v0.3

Quick reference for all important source files and their purposes.

Updated: January 2026 | Phases 0-9 Complete

---

## Documentation Reference

| Doc | Purpose | Path |
|-----|---------|------|
| DECISION-INDEX | Maps code areas to design decisions | `docs/agent/DECISION-INDEX.md` |
| QUICKSTART | Developer onboarding guide | `docs/agent/QUICKSTART.md` |
| SCHEMA | Database schema reference | `docs/agent/SCHEMA.md` |
| API_ENDPOINTS | REST API endpoint reference | `docs/agent/API_ENDPOINTS.md` |
| IPC_CHANNELS | Electron IPC channel reference | `docs/agent/IPC_CHANNELS.md` |
| PATTERNS | Code patterns and templates | `docs/agent/PATTERNS.md` |
| GLOSSARY | Terminology and definitions | `docs/agent/GLOSSARY.md` |

Phase Summaries:
- `PHASES_0_TO_8_SUMMARY.md` - Overview of all completed phases
- `PHASE_9_COMPLETE.md` - Integration testing (124 tests)
- `PHASE_10_COMPLETE.md` - Documentation & final polish

---

## Shared Types

**Purpose**: Type definitions used across frontend and backend

| Path | Purpose |
|------|---------|
| `shared/types/models.ts` | Core types: IndexObject, TagDefinition, TagAssignment, Collection, Link |

---

## Electron / Desktop Layer (Phase 3)

### Main Process Entry
| Path | Purpose |
|------|---------|
| `electron/main/index.ts` | Electron app entry point, BrowserWindow creation, IPC setup |

### IPC Handlers
| Path | Purpose |
|------|---------|
| `electron/main/ipc/handlers.ts` | IPC handlers: `source:extract-metadata`, `source:open`, `source:get-hash` |

### Preload Script
| Path | Purpose |
|------|---------|
| `electron/preload/index.ts` | Context bridge: exposes safe API to renderer process |

---

## Frontend / React Layer (Phases 4-8)

### Core Entry Points
| Path | Purpose |
|------|---------|
| `frontend/src/main.tsx` | Vite entry point, React root render |
| `frontend/src/App.tsx` | React Router setup, route definitions, app initialization |

### State Management (Phase 4)
| Path | Purpose |
|------|---------|
| `frontend/src/store/app-store.ts` | Zustand store: 24 CRUD actions, 7 state hooks, persistence |

**Actions**: setObjects, addObject, updateObject, deleteObject, addTagDefinition, updateTagDefinition, deleteTagDefinition, addTagAssignment, deleteTagAssignment, addCollection, updateCollection, deleteCollection, addLink, deleteLink, toggleSelect, clearSelection, selectAll

**UI State**: detailPanelOpen, sidebarCollapsed, currentView, searchQuery, sortField, sortDirection, loading, error

### API Client (Phase 5)
| Path | Purpose |
|------|---------|
| `frontend/src/services/api-client.ts` | Centralized API client: 25 methods, retry logic, error handling, 30s timeout |

**Methods** (25 total):
- Objects: getObjects, getObject, createObject, updateObject, deleteObject
- Tags: getTagDefinitions, getTagDefinition, createTagDefinition, updateTagDefinition, deleteTagDefinition
- Assignments: getTagAssignments, assignTag, unassignTag
- Collections: getCollections, getCollection, createCollection, updateCollection, deleteCollection, getCollectionObjects
- Links: getLinks, createLink, updateLink, deleteLink
- Import: importSource

### Data-Fetching Hooks (Phase 5)
| Path | Purpose |
|------|---------|
| `frontend/src/hooks/useObjectsData.ts` | Fetch objects on mount, populate store |
| `frontend/src/hooks/useTagsData.ts` | Fetch tag definitions + assignments in parallel |
| `frontend/src/hooks/useCollectionsData.ts` | Fetch collections on mount |
| `frontend/src/hooks/useLinksData.ts` | Fetch links on mount |
| `frontend/src/hooks/useImportSource.ts` | Import source with tags/notes |

### UI Components (Phase 6)
| Path | Purpose |
|------|---------|
| `frontend/src/components/Layout.tsx` | Main shell: navbar area, sidebar, content outlet, detail panel |
| `frontend/src/components/Sidebar.tsx` | Navigation menu: Objects, Tags, Collections, Settings with dynamic counters |
| `frontend/src/components/ObjectListTable.tsx` | Data table: multi-select, sorting, filtering, keyboard shortcuts |
| `frontend/src/components/DetailPanel.tsx` | Right sidebar: object metadata, tags, source info |
| `frontend/src/components/SearchBar.tsx` | Search input with clear button |
| `frontend/src/components/TagManager.tsx` | Tag CRUD: create, rename, color picker, delete |
| `frontend/src/components/CollectionQueryBuilder.tsx` | Visual query builder: AND/OR/NOT tag filters |
| `frontend/src/components/LoadingSpinner.tsx` | Loading indicator with configurable sizes |
| `frontend/src/components/ErrorBoundary.tsx` | Error catching, error UI display, retry button |
| `frontend/src/components/index.ts` | Barrel exports for all components |

### Page Views (Phase 7)
| Path | Purpose |
|------|---------|
| `frontend/src/pages/ObjectsView.tsx` | Browse & search objects: SearchBar + ObjectListTable + LoadingSpinner |
| `frontend/src/pages/TagsView.tsx` | Manage tag definitions: TagManager component |
| `frontend/src/pages/CollectionsView.tsx` | Create/edit collections: two-panel layout with CollectionQueryBuilder |
| `frontend/src/pages/SettingsView.tsx` | App settings: general, UI prefs, data mgmt, keyboard shortcuts, about |
| `frontend/src/pages/index.ts` | Barrel exports for all pages |

### Component Tests (Phase 6)
| Path | Purpose |
|------|---------|
| `frontend/src/components/__tests__/components.test.tsx` | 15 component unit tests |
| `frontend/src/components/__tests__/ErrorBoundary.test.tsx` | 5 error boundary tests |

### View Tests (Phase 7)
| Path | Purpose |
|------|---------|
| `frontend/src/pages/__tests__/views.test.tsx` | 21 view unit tests |

### Routing & App Tests (Phase 8)
| Path | Purpose |
|------|---------|
| `frontend/src/__tests__/App.test.tsx` | 19 routing + error boundary tests |

### Integration Tests (Phase 9)
| Path | Purpose |
|------|---------|
| `frontend/src/__tests__/integration/workflows.test.tsx` | 16 E2E workflow tests |
| `frontend/src/__tests__/integration/api-integration.test.tsx` | 30 API endpoint tests |
| `frontend/src/__tests__/integration/store-sync.test.tsx` | 18 Zustand reactivity tests |
| `frontend/src/__tests__/integration/error-scenarios.test.tsx` | 25 error handling tests |
| `frontend/src/__tests__/integration/performance.test.tsx` | 35 performance tests |

---

## Backend / Express Layer (Phases 1-2)

### Server Setup (Phase 1)
| Path | Purpose |
|------|---------|
| `backend/database/server.ts` | Express app: middleware, route setup, health check endpoint |
| `backend/database/db-service.ts` | SurrealDB client wrapper: 24 methods for CRUD operations |

### API Routes (Phase 1)
| Path | Purpose |
|------|---------|
| `backend/database/routes/objects.ts` | 5 endpoints: GET /api/objects, POST, PUT, DELETE |
| `backend/database/routes/tags.ts` | 7 endpoints: definitions (CRUD) + assignments (CRUD) |
| `backend/database/routes/collections.ts` | 5 endpoints: CRUD + query resolution |
| `backend/database/routes/links.ts` | 4 endpoints: GET, POST, DELETE |
| `backend/database/routes/import.ts` | 1 endpoint: POST /api/objects/import |

### Database Migrations (Phase 1)
| Path | Purpose |
|------|---------|
| `backend/database/migrations/v0.2-to-v0.3.sql` | Migration script: v0.2 → v0.3 schema |

### Source Handlers (Phase 2)
| Path | Purpose |
|------|---------|
| `backend/source-handlers/handler-base.ts` | Abstract SourceHandler interface |
| `backend/source-handlers/handler-registry.ts` | Registry: dispatch by URI scheme |
| `backend/source-handlers/file-handler.ts` | Implements `file://` scheme: metadata, hashing, watching, opening |
| `backend/source-handlers/utils/hash-service.ts` | SHA-256 hashing with streaming |
| `backend/source-handlers/utils/metadata-extractor.ts` | File metadata extraction |

### Backend Tests (Phase 1-2)
| Path | Purpose |
|------|---------|
| `backend/database/__tests__/migration.test.ts` | 9 database migration tests |
| `backend/source-handlers/__tests__/file-handler.test.ts` | 35 file handler tests |

---

## Configuration & Root Files

### TypeScript Config
| Path | Purpose |
|------|---------|
| `tsconfig.json` | Root TypeScript config: strict mode, all options |
| `backend/database/tsconfig.json` | Backend-specific TypeScript config |
| `frontend/tsconfig.json` | Frontend-specific TypeScript config |
| `electron/main/tsconfig.json` | Electron main process TypeScript config |

### Testing Config
| Path | Purpose |
|------|---------|
| `vitest.config.ts` | Vitest configuration: jsdom, plugins, coverage |
| `test-setup.ts` | Testing library setup: @testing-library/jest-dom |

### Build Config
| Path | Purpose |
|------|---------|
| `package.json` | Monorepo: workspaces, dependencies, scripts |
| `vite.config.ts` | Vite dev server + build config |
| `electron-builder.config.js` | Electron packaging config |

### Environment
| Path | Purpose |
|------|---------|
| `.env.local` (optional) | Runtime variables: VITE_API_URL, NODE_ENV |
| `.gitignore` | Git exclusions: node_modules, dist, .env |

---

## Directory Tree

```
/
├── backend/
│   ├── database/
│   │   ├── server.ts              (Phase 1)
│   │   ├── db-service.ts          (Phase 1)
│   │   ├── tsconfig.json          (Phase 0)
│   │   ├── routes/
│   │   │   ├── objects.ts         (Phase 1)
│   │   │   ├── tags.ts            (Phase 1)
│   │   │   ├── collections.ts     (Phase 1)
│   │   │   ├── links.ts           (Phase 1)
│   │   │   └── import.ts          (Phase 1)
│   │   ├── migrations/
│   │   │   └── v0.2-to-v0.3.sql   (Phase 1)
│   │   └── __tests__/
│   │       └── migration.test.ts  (Phase 1)
│   └── source-handlers/
│       ├── handler-base.ts        (Phase 2)
│       ├── handler-registry.ts    (Phase 2)
│       ├── file-handler.ts        (Phase 2)
│       ├── utils/
│       │   ├── hash-service.ts    (Phase 2)
│       │   └── metadata-extractor.ts (Phase 2)
│       └── __tests__/
│           └── file-handler.test.ts (Phase 2)
├── electron/
│   ├── main/
│   │   ├── index.ts               (Phase 3)
│   │   ├── tsconfig.json          (Phase 3)
│   │   ├── ipc/
│   │   │   └── handlers.ts        (Phase 3)
│   │   └── preload/
│   │       └── index.ts           (Phase 3)
├── frontend/
│   ├── src/
│   │   ├── main.tsx               (Phase 0)
│   │   ├── App.tsx                (Phase 8)
│   │   ├── tsconfig.json          (Phase 0)
│   │   ├── store/
│   │   │   └── app-store.ts       (Phase 4)
│   │   ├── services/
│   │   │   └── api-client.ts      (Phase 5)
│   │   ├── hooks/
│   │   │   ├── useObjectsData.ts      (Phase 5)
│   │   │   ├── useTagsData.ts         (Phase 5)
│   │   │   ├── useCollectionsData.ts  (Phase 5)
│   │   │   ├── useLinksData.ts        (Phase 5)
│   │   │   └── useImportSource.ts     (Phase 5)
│   │   ├── components/
│   │   │   ├── Layout.tsx         (Phase 6)
│   │   │   ├── Sidebar.tsx        (Phase 6)
│   │   │   ├── ObjectListTable.tsx (Phase 6)
│   │   │   ├── DetailPanel.tsx    (Phase 6)
│   │   │   ├── SearchBar.tsx      (Phase 6)
│   │   │   ├── TagManager.tsx     (Phase 6)
│   │   │   ├── CollectionQueryBuilder.tsx (Phase 6)
│   │   │   ├── LoadingSpinner.tsx (Phase 6)
│   │   │   ├── ErrorBoundary.tsx  (Phase 8)
│   │   │   ├── index.ts           (Phase 6)
│   │   │   └── __tests__/
│   │   │       ├── components.test.tsx (Phase 6)
│   │   │       └── ErrorBoundary.test.tsx (Phase 8)
│   │   ├── pages/
│   │   │   ├── ObjectsView.tsx    (Phase 7)
│   │   │   ├── TagsView.tsx       (Phase 7)
│   │   │   ├── CollectionsView.tsx (Phase 7)
│   │   │   ├── SettingsView.tsx   (Phase 7)
│   │   │   ├── index.ts           (Phase 7)
│   │   │   └── __tests__/
│   │   │       └── views.test.tsx (Phase 7)
│   │   └── __tests__/
│   │       ├── App.test.tsx       (Phase 8)
│   │       └── integration/
│   │           ├── workflows.test.tsx (Phase 9)
│   │           ├── api-integration.test.tsx (Phase 9)
│   │           ├── store-sync.test.tsx (Phase 9)
│   │           ├── error-scenarios.test.tsx (Phase 9)
│   │           └── performance.test.tsx (Phase 9)
│   └── index.html                (Phase 0)
├── shared/
│   └── types/
│       └── models.ts             (Phase 0)
├── docs/
│   └── agent/
│       ├── FILE_REGISTRY.md      (This file - Phase 10)
│       ├── API_ENDPOINTS.md      (Phase 1)
│       ├── SCHEMA.md             (Phase 1)
│       ├── IPC_CHANNELS.md       (Phase 3)
│       ├── PATTERNS.md           (Phases 1-9)
│       ├── DECISION-INDEX.md     (Phases 1-9)
│       ├── GLOSSARY.md           (Phase 0)
│       ├── QUICKSTART.md         (Phase 0)
│       └── INTERACTION-POLICY.md (Phase 0)
├── scripts/
│   ├── electron-dev.js           (Phase 3)
│   └── electron-start.js         (Phase 3)
├── package.json                  (Phase 0)
├── tsconfig.json                 (Phase 0)
├── vitest.config.ts              (Phase 0)
├── test-setup.ts                 (Phase 0)
├── PHASES_0_TO_8_SUMMARY.md      (Phase 8)
├── PHASE_9_COMPLETE.md           (Phase 9)
└── PHASE_10_COMPLETE.md          (Phase 10)
```

---

## Key Statistics

| Category | Count | Details |
|----------|-------|---------|
| **Components** | 9 | Layout, Sidebar, DetailPanel, ObjectListTable, SearchBar, TagManager, CollectionQueryBuilder, LoadingSpinner, ErrorBoundary |
| **Pages/Views** | 4 | Objects, Tags, Collections, Settings |
| **API Endpoints** | 25 | Objects (5), Tags (7), Collections (5), Links (4), Import (1), Health (1) |
| **Zustand Actions** | 24 | Object/Tag/Collection/Link CRUD + UI state |
| **Data Hooks** | 5 | useObjectsData, useTagsData, useCollectionsData, useLinksData, useImportSource |
| **Tests** | 200+ | Unit (74) + Integration (124) |
| **Database Tables** | 5 | objects, tag_definitions, tag_assignments, collections, links |
| **Source Handlers** | 1 | FileHandler (file://) - HTTPS deferred |
| **IPC Channels** | 6 | source:extract-metadata, source:open, source:get-hash, source:watch-* |
| **TypeScript Files** | 70+ | 100% strict mode, zero errors |

---

## Navigation Quick Links

**Need to...** → **Go to file**

- Add new component → `frontend/src/components/*.tsx`
- Add new page → `frontend/src/pages/*.tsx`
- Update store state → `frontend/src/store/app-store.ts`
- Update API → `frontend/src/services/api-client.ts` + `backend/database/routes/*.ts`
- Update database schema → `backend/database/db-service.ts` + `shared/types/models.ts`
- Add new IPC handler → `electron/main/ipc/handlers.ts` + `electron/preload/index.ts`
- Add new source handler → `backend/source-handlers/handler-base.ts` (extend) + `handler-registry.ts` (register)
- Review API endpoints → `docs/agent/API_ENDPOINTS.md`
- Review design decisions → `docs/agent/DECISION-INDEX.md`
- Learn code patterns → `docs/agent/PATTERNS.md`

---

**Last Updated:** January 23, 2026 | Phase 10 | All phases complete
