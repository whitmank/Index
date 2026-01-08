# Index Database Module

Personal information system with file indexing, graph database, and Finder-style UI.

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────┐
│  React Frontend │─────▶│  Express API     │─────▶│  SurrealDB  │
│  (Vite)         │      │  (Node.js)       │      │  (Graph DB) │
│  Port 5173      │      │  Port 3000       │      │  Port 8000  │
└─────────────────┘      └──────────────────┘      └─────────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │  File Scanner   │
                         │  (CLI Module)   │
                         └─────────────────┘
```

## Components

### 1. Database Service (`db-service.js`)
Graph database interface using SurrealDB with three core tables:

**nodes** - Files indexed from disk
- `content_hash`: SHA-256 for deduplication
- `source_path`: Original file location
- `name`, `size`, `type`: File metadata
- `timestamp_created`, `timestamp_modified`: Temporal data

**links** - Relationships between nodes
- Types: `derivative`, `temporal`, `semantic`, `spatial`, `project`
- Optional `strength` (0.0-1.0)

**tags** - Labels for organization
- Many-to-many with nodes

### 2. API Server (`server.js`)
Express server with REST endpoints:

**Core Endpoints:**
- `GET /api/nodes` - List all indexed files
- `GET /api/nodes/:id` - Get node details
- `POST /api/nodes` - Create node (with duplicate detection)
- `PUT /api/nodes/:id` - Update node
- `DELETE /api/nodes/:id` - Delete node

**Links:**
- `GET /api/links` - List all relationships
- `POST /api/links` - Create link
- `PUT /api/links/:id` - Update link
- `DELETE /api/links/:id` - Delete link

**Tags:**
- `GET /api/tags` - List all tags
- `GET /api/nodes/:id/tags` - Get tags for node
- `POST /api/tags` - Add tag to node
- `DELETE /api/tags/:id` - Remove tag

**File Serving:**
- `GET /api/files/:id` - Stream file with proper Content-Type
  - Used by frontend for image thumbnails
  - Avoids browser `file://` protocol restrictions

**Query Helpers:**
- `GET /api/query/nodes/by-date?start=X&end=Y`
- `GET /api/query/nodes/by-type?type=X`
- `GET /api/query/nodes/by-location?path=X`

### 3. File Scanner (`../scanner/`)
CLI module for indexing files into the database:

**Features:**
- Recursive directory traversal
- SHA-256 content hashing (streaming for large files)
- MIME type detection
- Duplicate detection via content hash
- Change detection via source path

**Usage:**
```bash
cd /Users/karter/files/dev/Index/modules/scanner
npm install
npm run scan              # Live scan
npm run test              # Dry-run (no DB writes)
```

**Configuration (`config.json`):**
```json
{
  "targetDirectory": "/Users/karter/files/-test files",
  "apiEndpoint": "http://localhost:3000/api/nodes",
  "filters": {
    "excludePatterns": [".*\\.DS_Store$", ".*\\.git/.*"],
    "minSize": 0,
    "maxSize": null
  }
}
```

### 4. Frontend UI (`frontend/`)
React 19 + Vite application with macOS Finder-style interface.

**Key Features:**
- **Two Views:**
  - Files View: Sortable table of all indexed nodes
  - Tags View: Aggregate list of all tags with counts

- **Toolbar:**
  - Navigation buttons (back/forward)
  - View mode switcher (icons/list/columns/gallery)
  - Search input (filters by name, type, tags)

- **Sidebar:**
  - All Files (dodecahedron icon)
  - Tags (tag icon)

- **File List:**
  - Sortable columns: Name, Date Modified, Size, Kind
  - Colored file icons (20x20px) with image thumbnails
  - Single click: select row
  - Double click: open details panel

- **Details Panel:**
  - Image preview (for image files)
  - File metadata (size, type, hash, path)
  - Tags management (add/remove)
  - Notes (future: not fully implemented)
  - Links (future: not fully implemented)
  - Delete node action

**State Management:**
```javascript
nodes         // Array of all indexed files
tags          // Object: {nodeId: [tags]}
links         // Array of relationships
selectedNodeId // Currently selected row
detailsNode   // Node shown in details panel
activeView    // 'files' | 'tags'
searchQuery   // Filter string
sortField     // 'name' | 'size' | 'type' | 'modified'
sortDirection // 'asc' | 'desc'
```

## Running the System

### Prerequisites
- Node.js 18+
- npm

### Start Backend
```bash
cd /Users/karter/files/dev/Index/modules/database
npm install
node server.js
```
Output: `Server running on http://localhost:3000` + `SurrealDB ready`

### Start Frontend
In a new terminal:
```bash
cd /Users/karter/files/dev/Index/modules/database/frontend
npm install
npm run dev
```
Access UI at `http://localhost:5173`

### Index Files
In a third terminal:
```bash
cd /Users/karter/files/dev/Index/modules/scanner
npm install
npm run scan
```

## Key Implementation Details

### Duplicate Detection
The API performs two checks on `POST /api/nodes`:

1. **Content Hash**: Returns `409 Conflict` if same file content exists
2. **Source Path**: Updates existing node if same path (file modified)

This prevents duplicate indexing on rescan.

### File Serving Solution
Frontend cannot use `file://` protocol due to browser security.

**Solution**: Backend endpoint streams files:
```javascript
app.get('/api/files/:id', async (req, res) => {
  const node = await dbService.getNodeById(req.params.id);
  res.setHeader('Content-Type', node.type);
  fs.createReadStream(node.source_path).pipe(res);
});
```

Frontend uses: `<img src="/api/files/${node.id}" />`

### SurrealDB Query Patterns
SDK's `update()` and `delete()` return empty arrays. Use raw queries:

```javascript
// Update example
async function updateNode(id, data) {
  const query = `UPDATE ${id} SET name = $name, size = $size`;
  const result = await db.query(query, { name: data.name, size: data.size });
  return result[0]?.[0] || null;
}

// Delete example
async function deleteNode(id) {
  const query = `DELETE ${id}`;
  await db.query(query);
}
```

### Tag Aggregation
Tags are stored per-node. Frontend aggregates for Tags View:

```javascript
const getAllTags = () => {
  const tagMap = new Map();
  Object.entries(tags).forEach(([nodeId, nodeTags]) => {
    nodeTags.forEach(tag => {
      if (tagMap.has(tag.tag_name)) {
        tagMap.get(tag.tag_name).count++;
      } else {
        tagMap.set(tag.tag_name, { name: tag.tag_name, count: 1 });
      }
    });
  });
  return Array.from(tagMap.values());
};
```

## Database Schema

### nodes
```sql
id: nodes:xxxxx (auto-generated)
content_hash: string (sha256:abc...)
name: string (filename)
size: number (bytes)
type: string (MIME type)
source_path: string (absolute path)
timestamp_created: datetime (ISO 8601)
timestamp_modified: datetime (ISO 8601)
metadata: object (extensible JSON)
```

### links
```sql
id: links:xxxxx
source_node: nodes:xxx
target_node: nodes:yyy
type: enum(derivative|temporal|semantic|spatial|project)
strength: float (0.0-1.0, nullable)
timestamp_created: datetime
timestamp_modified: datetime
metadata: object
```

### tags
```sql
id: tags:xxxxx
tag_name: string
node_id: nodes:xxx
timestamp_created: datetime
```

## Styling

**Theme**: macOS Finder dark mode
- Background: `#1e1e1e`
- Toolbar: `#2d2d2d`
- Sidebar: `#282828`
- Accent: `#0a84ff` (blue)
- Success: `#30d158` (green)
- Danger: `#ff453a` (red)

**Fonts**:
- System: `-apple-system, BlinkMacSystemFont, 'Segoe UI'`
- Monospace: `'SF Mono', 'Monaco', 'Menlo'`

**Icon Customization**:
- Dodecahedron SVG for "All Files" in `public/dodecahedron.svg`
- CSS filters for dark theme: `filter: invert(1) brightness(0.7)`
- Active state: `brightness(1)`

## Test Data
Sample files: `/Users/karter/files/-test files/shapes/`
- 8 PNG images (1.png through 8.png)
- Used for initial testing

## Future Enhancements

**Planned Features (not implemented):**
- Notes functionality (UI exists, backend incomplete)
- Links management UI (backend ready, UI incomplete)
- Watch mode (continuous file monitoring)
- Content extraction (EXIF, OCR)
- Graph visualization
- Advanced search (by tag combinations, date ranges)
- Batch operations (multi-select, bulk tag/delete)

## Troubleshooting

**Issue**: "Database not ready"
- Wait 2-3 seconds for SurrealDB to initialize
- Check `http://localhost:3000/health`

**Issue**: Images not displaying
- Verify backend is running (`http://localhost:3000`)
- Check browser console for CORS errors
- Ensure files exist at `source_path`

**Issue**: Duplicates on rescan
- Check `content_hash` calculation
- Verify duplicate detection logic in `POST /api/nodes`

**Issue**: Tags not showing
- Check `/api/tags` returns data
- Verify `node_id` references exist in nodes table
- Check browser console for fetch errors

## File Structure

```
modules/database/
├── server.js              # Express API + SurrealDB launcher
├── db-service.js          # Database interface layer
├── package.json           # Backend dependencies
├── README.md              # This file
└── frontend/
    ├── src/
    │   ├── App.jsx        # Main React component
    │   └── App.css        # Finder-style dark theme
    ├── public/
    │   └── dodecahedron.svg
    ├── package.json       # Frontend dependencies
    └── vite.config.js

modules/scanner/
├── scanner.js             # Main CLI logic
├── hash-service.js        # SHA-256 streaming
├── metadata-extractor.js  # File stats + MIME
├── config.json            # Scanner configuration
└── package.json
```

## Dependencies

**Backend:**
- `express`: ^4.21.2 (REST API)
- `cors`: ^2.8.5 (CORS middleware)
- `surrealdb`: ^1.0.7 (Database SDK)
- `surreal-cli`: Custom wrapper for SurrealDB binary

**Frontend:**
- `react`: ^19.0.0
- `react-dom`: ^19.0.0
- `vite`: ^6.0.5 (Build tool + dev server)

**Scanner:**
- `mime-types`: ^2.1.35 (MIME detection)
- Built-in: `crypto`, `fs`, `path`

## Development Notes

- Frontend uses Vite HMR for instant updates
- Backend auto-restarts on crash (SurrealDB child process)
- All timestamps in ISO 8601 format
- Hash format: `sha256:hexdigest`
- Node IDs format: `nodes:randomid`
- Keep `/api/records` endpoints for backward compatibility
