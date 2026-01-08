# Development Guide

Quick reference for common development tasks.

## Quick Start

```bash
# Terminal 1 - Backend
cd /Users/karter/files/dev/Index/modules/database
node server.js

# Terminal 2 - Frontend
cd /Users/karter/files/dev/Index/modules/database/frontend
npm run dev

# Terminal 3 - Scanner (optional)
cd /Users/karter/files/dev/Index/modules/scanner
npm run scan
```

Access UI at `http://localhost:5173`

## Common Tasks

### Adding a New API Endpoint

**1. Add method to `db-service.js`:**
```javascript
async function getNodesByTag(tagName) {
  try {
    const query = `
      SELECT * FROM nodes
      WHERE id IN (SELECT node_id FROM tags WHERE tag_name = $tagName)
    `;
    const result = await db.query(query, { tagName });
    return result[0] || [];
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

module.exports = {
  // ... existing exports
  getNodesByTag,
};
```

**2. Add route to `server.js`:**
```javascript
app.get('/api/query/nodes/by-tag', async (req, res) => {
  try {
    const { tag } = req.query;
    if (!tag) {
      return res.status(400).json({ error: 'Tag parameter required' });
    }
    const nodes = await dbService.getNodesByTag(tag);
    res.json(nodes);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**3. Test:**
```bash
curl "http://localhost:3000/api/query/nodes/by-tag?tag=work"
```

### Adding a Frontend Feature

**1. Add state (if needed):**
```javascript
const [newFeature, setNewFeature] = useState(initialValue);
```

**2. Add fetch function:**
```javascript
const fetchNewData = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/endpoint');
    const data = await response.json();
    setNewFeature(data);
  } catch (error) {
    console.error('Fetch error:', error);
  }
};
```

**3. Call in useEffect:**
```javascript
useEffect(() => {
  fetchNewData();
}, [dependency]);
```

**4. Add UI components in JSX**

**5. Add styles to `App.css`**

### Modifying the Scanner

**1. Edit `config.json`:**
```json
{
  "targetDirectory": "/new/path",
  "filters": {
    "excludePatterns": [".*\\.tmp$"],
    "minSize": 1024,
    "maxSize": 10485760
  }
}
```

**2. Test dry-run:**
```bash
npm run test
```

**3. Run live scan:**
```bash
npm run scan
```

### Adding a New Database Table

**1. Update `db-service.js`:**
```javascript
// Initialize in initDatabase()
async function initDatabase() {
  // ... existing code
  await db.query(`
    DEFINE TABLE new_table SCHEMAFULL;
    DEFINE FIELD field_name ON new_table TYPE string;
  `);
}

// Add CRUD methods
async function getAllNewTable() { ... }
async function createNewTable(data) { ... }
// etc.
```

**2. Add API routes in `server.js`**

**3. Update frontend to fetch/display**

## Debugging

### Backend Issues

**Check if database is running:**
```bash
curl http://localhost:3000/health
```

**View SurrealDB logs:**
Backend outputs logs to console. Look for:
```
SurrealDB started successfully on port 8000
Database initialized successfully
```

**Test database connection:**
```bash
curl http://localhost:3000/api/nodes
```

**Common Issues:**
- "Database not ready" → Wait 2-3 seconds after starting
- "Connection refused" → Backend not running
- Empty results `[]` → Database empty, run scanner

### Frontend Issues

**Check browser console:**
- Right-click → Inspect → Console tab
- Look for fetch errors, 404s, CORS issues

**Verify API calls:**
```javascript
// Add to App.jsx
console.log('Fetched nodes:', nodes);
console.log('Fetched tags:', tags);
```

**Check network requests:**
- Inspect → Network tab
- Filter: "XHR" or "Fetch"
- Look for red (failed) requests

**Common Issues:**
- Images not loading → Check `/api/files/:id` endpoint
- No data showing → Check fetch in useEffect
- HMR not working → Restart Vite dev server

### Scanner Issues

**Test individual components:**
```bash
# Test hash calculation
node -e "const {calculateFileHash} = require('./hash-service'); calculateFileHash('/path/to/file').then(console.log)"

# Test metadata extraction
node -e "const {extractMetadata} = require('./metadata-extractor'); extractMetadata('/path/to/file').then(console.log)"
```

**Verify API endpoint:**
```bash
# Should return existing nodes
curl http://localhost:3000/api/nodes
```

**Common Issues:**
- "Cannot find module" → Run `npm install`
- "ENOENT: no such file" → Check `targetDirectory` in config.json
- Duplicates created → Check duplicate detection in POST /api/nodes

## Database Queries

### Useful SurrealQL Queries

**Get all nodes with tags:**
```sql
SELECT *, (SELECT * FROM tags WHERE node_id = $parent.id) AS tags FROM nodes;
```

**Get nodes by tag:**
```sql
SELECT * FROM nodes WHERE id IN (SELECT node_id FROM tags WHERE tag_name = "work");
```

**Get all links for a node:**
```sql
SELECT * FROM links WHERE source_node = "nodes:abc123" OR target_node = "nodes:abc123";
```

**Delete all tags for a node:**
```sql
DELETE FROM tags WHERE node_id = "nodes:abc123";
```

**Count nodes by type:**
```sql
SELECT type, count() AS total FROM nodes GROUP BY type;
```

### Running Raw Queries

**In `db-service.js`:**
```javascript
const result = await db.query('SELECT * FROM nodes LIMIT 10');
console.log(result[0]); // Array of results
```

## Code Patterns

### SurrealDB Result Handling

```javascript
// SELECT queries return nested arrays
const result = await db.query('SELECT * FROM nodes');
const nodes = result[0]; // Extract first array

// Single record
const result = await db.query('SELECT * FROM nodes:abc123');
const node = result[0]?.[0]; // First array, first element

// UPDATE/DELETE require raw queries (SDK returns empty)
const updateQuery = `UPDATE ${id} SET name = $name`;
await db.query(updateQuery, { name: 'new_name' });
```

### Error Handling Pattern

```javascript
// Backend
app.get('/api/endpoint', async (req, res) => {
  try {
    const data = await dbService.someMethod();
    res.json(data);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Frontend
const fetchData = async () => {
  try {
    const response = await fetch('http://localhost:3000/api/endpoint');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    setData(data);
  } catch (error) {
    console.error('Fetch error:', error);
  }
};
```

### React State Updates

```javascript
// Update array state
setNodes(prevNodes => [...prevNodes, newNode]);

// Update object state
setTags(prevTags => ({
  ...prevTags,
  [nodeId]: [...(prevTags[nodeId] || []), newTag]
}));

// Filter state
setNodes(prevNodes => prevNodes.filter(n => n.id !== idToRemove));
```

## Performance Tips

### Backend
- Use streaming for large files (`fs.createReadStream`)
- Add indexes to frequently queried fields (future)
- Batch operations when possible
- Use query helpers instead of fetching all + filtering

### Frontend
- Memoize expensive calculations (`useMemo`)
- Virtualize long lists (future, for 1000+ files)
- Lazy load images (future)
- Debounce search input

### Scanner
- Process files in parallel (future: `--parallel N` flag)
- Stream large files for hashing
- Skip unchanged files (check mtime vs DB timestamp)

## Testing

### Manual Testing Checklist

**Backend:**
- [ ] `/health` returns 200
- [ ] Can create node via POST
- [ ] Duplicate detection works (409 response)
- [ ] Can fetch all nodes
- [ ] Can update/delete node
- [ ] File serving works for images

**Frontend:**
- [ ] Files view displays all nodes
- [ ] Tags view shows aggregated tags
- [ ] Search filters correctly
- [ ] Sorting works (click column headers)
- [ ] Row selection works (click)
- [ ] Details panel opens (double-click)
- [ ] Can add/remove tags
- [ ] Can delete node

**Scanner:**
- [ ] Dry-run shows files to index
- [ ] Live scan creates nodes
- [ ] Duplicate detection prevents re-indexing
- [ ] Changed files get updated
- [ ] Exclusion patterns work

### Automated Tests (Future)

Not yet implemented. Consider adding:
- Backend: Jest/Mocha for API tests
- Frontend: Vitest for component tests
- Scanner: Node.js test runner for unit tests

## Project Structure Reference

```
modules/database/
├── server.js              # Line ~1-450: Express + SurrealDB
│                          # Key sections:
│                          #   - Database initialization
│                          #   - API routes
│                          #   - File serving
├── db-service.js          # Database abstraction layer
│                          # All SurrealDB queries here
├── package.json
├── README.md              # Overview + architecture
├── API.md                 # Endpoint reference
├── DEVELOPMENT.md         # This file
└── frontend/
    ├── src/
    │   ├── App.jsx        # Main component (~500 lines)
    │   │                  # Key sections:
    │   │                  #   - State management
    │   │                  #   - Data fetching
    │   │                  #   - Toolbar + Sidebar
    │   │                  #   - Files/Tags views
    │   │                  #   - Details panel
    │   └── App.css        # ~700 lines of Finder-style CSS
    ├── public/
    │   └── dodecahedron.svg
    ├── package.json
    └── vite.config.js

modules/scanner/
├── scanner.js             # Main CLI (~200 lines)
├── hash-service.js        # SHA-256 streaming
├── metadata-extractor.js  # File stats + MIME
├── config.json            # Configuration
└── package.json
```

## Environment Variables (Future)

Not currently used, but consider adding:

```bash
# .env
DATABASE_HOST=localhost
DATABASE_PORT=8000
API_PORT=3000
VITE_API_URL=http://localhost:3000
```

## Git Workflow (Future)

No git repo initialized yet. Recommended workflow:

```bash
# Initialize
git init
git add .
git commit -m "Initial commit: Phase 1 + Phase 2 complete"

# Feature branch
git checkout -b feature/new-feature
# ... make changes ...
git commit -m "Add new feature"
git checkout main
git merge feature/new-feature

# Tag releases
git tag -a v1.0.0 -m "Phase 1 + Phase 2: Foundation + UI"
```

## Next Steps

**Immediate improvements:**
1. Add notes functionality (backend methods exist, needs UI)
2. Complete links management UI
3. Add multi-select for batch operations
4. Implement watch mode in scanner

**Medium-term:**
5. Graph visualization of links
6. Advanced search (multiple tags, date ranges)
7. Content extraction (EXIF, PDF text, etc.)
8. Export/import functionality

**Long-term:**
9. Desktop app (Electron/Tauri)
10. Mobile access
11. Sync across devices
12. AI-powered tagging suggestions
