# Frontend Module

React application for browsing and organizing indexed files.

## Structure

```
frontend/src/
├── main.jsx              # React mount point
├── App.jsx               # Route definitions
├── styles/
│   └── global.css        # CSS variables, resets
├── components/
│   ├── Layout/           # Main grid layout, app state
│   ├── DetailPanel/      # Right sidebar (file details)
│   ├── FileListTable/    # File list display
│   ├── ImportConfirmModal/
│   ├── CreateCollectionModal/
│   ├── ColorPickerModal/
│   └── ContextMenu/
├── pages/
│   ├── FilesView/        # Browse all files
│   ├── TagsView/         # Files grouped by tag
│   ├── CollectionsView/  # Collection list
│   ├── CollectionDetailView/
│   └── DevView/          # Debug tools
└── hooks/
    └── useElectron.js    # Electron API access
```

## Routes

| Path | Component | Purpose |
|------|-----------|---------|
| `/` | FilesView | Browse indexed files |
| `/tags` | TagsView | View by tags |
| `/collections` | CollectionsView | Collection list |
| `/collections/:id` | CollectionDetailView | Single collection |
| `/dev` | DevView | Development tools |

## Key Components

**Layout** - Main wrapper. Manages global state (nodes, tags, collections). Renders sidebar nav, content area, detail panel.

**FileListTable** - Reusable file list. Used by FilesView and CollectionDetailView.

**useElectron** - Hook for Electron API. Returns `{ selectPaths, getFileMetadata, ... }`.

## Scripts

```bash
npm run dev       # Vite dev server (port 5173)
npm run build     # Production build to dist/
```

## Styling

See `!docs/STYLING.md` for CSS grid layout and design system.
