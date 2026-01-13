# Module Integration Guide

Quick reference for how the database and scanner modules work together.

## System Architecture

```
┌──────────────┐
│ File System  │
└──────┬───────┘
       │ scan
       ↓
┌──────────────────┐
│ Scanner Module   │ (Ingestion Layer)
│ - Traversal      │
│ - Hash (SHA-256) │
│ - Metadata       │
└──────┬───────────┘
       │ HTTP POST
       ↓
┌──────────────────┐
│ Database Module  │ (API + Storage)
│ - Express API    │
│ - SurrealDB      │
│ - Persistence    │
└──────────────────┘
```

## Data Flow

1. **Scanner** recursively walks directory tree
2. **Scanner** extracts metadata + calculates SHA-256 hash per file
3. **Scanner** POSTs to `http://localhost:3000/api/nodes`
4. **Database** checks for duplicates (by hash or path)
5. **Database** stores node in SurrealDB
6. **Database** returns 201 (created), 200 (updated), or 409 (duplicate)
7. **Scanner** logs result and continues to next file

## Starting the System

### Step 1: Start Database
```bash
cd /Users/karter/files/dev/Index/modules/database
npm run dev:backend
```

**Wait for**: "✅ Connected to SurrealDB" and API endpoint list

### Step 2: Run Scanner
```bash
# In new terminal
cd /Users/karter/files/dev/Index/modules/scanner
npm run scan              # Live scan
npm run test              # Dry run (preview only)
```

Scanner will:
- Auto-detect when database is ready (polls `/health`)
- Process files from `config.json` → `targetDirectory`
- Report progress and final stats

## Configuration Files

### Scanner: `modules/scanner/config.json`
```json
{
  "targetDirectory": "/path/to/scan",
  "apiEndpoint": "http://localhost:3000/api/nodes",
  "filters": {
    "excludePatterns": [".*\\.DS_Store$", ".*\\.git/.*"]
  }
}
```

### Database: `modules/database/server.js`
```javascript
const PORT = 3000;              // API port
const DB_PORT = 8000;           // SurrealDB port
const DB_PATH = './data/database.db';  // Data file
```

## Key Integration Points

### 1. Health Check
Scanner uses `GET /health` to verify database readiness:
```bash
curl http://localhost:3000/health
# Expected: {"status":"ok","database":"running","timestamp":"..."}
```

### 2. Node Creation
Scanner POSTs to `/api/nodes`:
```bash
curl -X POST http://localhost:3000/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "content_hash": "sha256:...",
    "name": "file.png",
    "size": 73264,
    "type": "image/png",
    "source_path": "/absolute/path",
    "timestamp_created": "2025-08-25T17:25:53.955Z",
    "timestamp_modified": "2025-08-25T17:25:53.957Z",
    "metadata": {"extension": ".png"}
  }'
```

### 3. Duplicate Detection
Database API handles duplicates:
- **409 Conflict**: Content hash exists (different location, same content)
- **200 OK**: Source path exists (rescan, updates node)
- **201 Created**: New node

## Query the Results

After scanning, query nodes:

```bash
# Get all nodes
curl http://localhost:3000/api/nodes | jq '.'

# Filter by type
curl 'http://localhost:3000/api/query/nodes/by-type?type=image' | jq '.'

# Filter by location
curl 'http://localhost:3000/api/query/nodes/by-location?path=/Users/karter' | jq '.'

# Filter by date
curl 'http://localhost:3000/api/query/nodes/by-date?start=2025-01-01T00:00:00Z&end=2025-12-31T23:59:59Z' | jq '.'
```

## Common Workflows

### Scan New Directory
1. Edit `modules/scanner/config.json` → change `targetDirectory`
2. Dry run: `cd modules/scanner && npm run test`
3. Live scan: `npm run scan`
4. Verify: `curl http://localhost:3000/api/nodes | jq length`

### Rescan to Update Metadata
Just run scanner again - it will:
- Detect source_path duplicates
- Update nodes with current metadata/hash
- Report as "duplicates" (not errors)

### Tag Files
```bash
# Get node ID
NODE_ID=$(curl -s http://localhost:3000/api/nodes | jq -r '.[0].id')

# Add tag
curl -X POST http://localhost:3000/api/tags \
  -H "Content-Type: application/json" \
  -d "{\"tag_name\": \"important\", \"node_id\": \"$NODE_ID\"}"

# Get all tags for node
curl http://localhost:3000/api/nodes/$NODE_ID/tags | jq '.'
```

### Create Link Between Files
```bash
# Get two node IDs
NODE1=$(curl -s http://localhost:3000/api/nodes | jq -r '.[0].id')
NODE2=$(curl -s http://localhost:3000/api/nodes | jq -r '.[1].id')

# Create link
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d "{
    \"source_node\": \"$NODE1\",
    \"target_node\": \"$NODE2\",
    \"type\": \"derivative\",
    \"strength\": 0.8
  }"
```

## Troubleshooting Integration

### Scanner Can't Reach Database
**Symptom**: "Database did not become ready within timeout period"

**Solutions**:
1. Check database is running: `curl http://localhost:3000/health`
2. Verify port 3000 not blocked
3. Check database logs for errors

### Duplicates Not Working
**Symptom**: Scanner creates duplicate nodes on rescan

**Solutions**:
1. Verify API returns 409 or 200 for duplicates (check scanner output)
2. Test manually:
   ```bash
   # Create node twice with same hash
   curl -X POST http://localhost:3000/api/nodes -H "Content-Type: application/json" -d '{"content_hash":"sha256:test","name":"test.txt","size":100,"type":"text/plain","source_path":"/tmp/test.txt","timestamp_created":"2025-01-01T00:00:00Z","timestamp_modified":"2025-01-01T00:00:00Z","metadata":{}}'
   curl -X POST http://localhost:3000/api/nodes -H "Content-Type: application/json" -d '{"content_hash":"sha256:test","name":"test.txt","size":100,"type":"text/plain","source_path":"/tmp/test.txt","timestamp_created":"2025-01-01T00:00:00Z","timestamp_modified":"2025-01-01T00:00:00Z","metadata":{}}'
   # Second should return 409
   ```

### No Nodes Created
**Symptom**: Scanner runs but no nodes in database

**Solutions**:
1. Check scanner isn't in dry-run mode
2. Verify files aren't all excluded (check scanner output for "Excluded" messages)
3. Check for API errors in scanner output
4. Query database: `curl http://localhost:3000/api/nodes`

## Performance

### Expected Performance
- **Hashing**: ~1MB/s per file (depends on disk speed)
- **API calls**: ~10-50ms per file (network latency)
- **Small files** (< 1MB): ~0.1s total per file
- **Large files** (> 100MB): Several seconds per file

### Scaling Considerations
- Sequential processing (one file at a time)
- For 1,000 files: ~2-5 minutes
- For 10,000 files: ~20-50 minutes
- For 100,000+ files: Consider batch API (future enhancement)

## Module Independence

Both modules can operate independently:

**Database Module Standalone**:
- Can be used without scanner
- Create nodes manually via API
- Build custom frontends
- Integrate with other tools

**Scanner Module Standalone**:
- Can scan and report without writing
- Use `--dry-run` for analysis
- Modify to output JSON instead of API calls
- Build different ingestion pipelines

## See Also

- **Database docs**: `modules/database/CLAUDE.md`
- **Scanner docs**: `modules/scanner/CLAUDE.md`
- **Architecture**: `/!docs/Personal Information System Architecture.md`
- **Data model**: `/data-model-sketch.md`
