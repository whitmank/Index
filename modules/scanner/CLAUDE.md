# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the scanner module.

## Project Overview

File scanner and ingestion layer for the Personal Information System. Recursively scans directories, extracts file metadata, calculates SHA-256 hashes, and sends data to the database API for storage as nodes.

## Running the Scanner

### Prerequisites
Database server must be running on `http://localhost:3000`:
```bash
# Terminal 1 - Start database first
cd /Users/karter/files/dev/Index/modules/database
npm run dev:backend
```

### Scanner Commands
```bash
# Terminal 2 - Run scanner
cd /Users/karter/files/dev/Index/modules/scanner

npm run scan                        # Live scan (writes to database)
npm run test                        # Dry run (no database writes)
node scanner.js /custom/path        # Scan custom directory
node scanner.js --dry-run /path     # Dry run custom directory
```

## Architecture

### Data Flow
```
File System → scanner.js → hash-service.js → metadata-extractor.js → API (POST /api/nodes) → Database
```

### Key Files

#### `scanner.js` (Main Logic)
- Entry point: `main()` function
- Waits for database health check via `/health` endpoint
- Recursively traverses directories with `scanDirectory()`
- Processes each file with `processFile()`
- Calls API via `createNodeViaAPI()`
- Reports stats: new nodes, duplicates, skipped, errors

#### `hash-service.js` (SHA-256 Hashing)
- **CRITICAL**: Uses streaming to avoid memory issues with large files
- Function: `calculateFileHash(filePath)` returns `"sha256:abc123..."`
- Read files in chunks (default 64KB) - never load entire file in memory

#### `metadata-extractor.js` (File Metadata)
- Function: `extractMetadata(filePath)` returns node-compatible object
- Extracts: name, size, type (MIME), source_path, timestamps
- Uses `mime-types` package for MIME type detection
- Stores file permissions, uid, gid in metadata blob

#### `config.json` (Configuration)
- `targetDirectory`: Default scan path
- `apiEndpoint`: Database API URL (default: `http://localhost:3000/api/nodes`)
- `filters.excludePatterns`: Regex array for exclusions (e.g., `.DS_Store`, `.git`)
- `filters.minSize/maxSize`: Size filters in bytes
- `options.followSymlinks`: Boolean (default: false)
- `options.progressInterval`: Report every N files

## Node Schema

Scanner creates nodes with this structure:
```javascript
{
  content_hash: "sha256:...",        // SHA-256 for deduplication
  name: "file.png",                  // Filename only (no path)
  size: 73264,                       // Bytes
  type: "image/png",                 // MIME type
  source_path: "/absolute/path",     // Full absolute path
  timestamp_created: "ISO 8601",     // File birthtime
  timestamp_modified: "ISO 8601",    // File mtime
  metadata: {                        // Extensible JSON blob
    extension: ".png",
    is_directory: false,
    is_file: true,
    is_symlink: false,
    permissions: 33188,
    uid: 501,
    gid: 20
  }
}
```

## Duplicate Detection

Scanner handles duplicates via API response codes:

1. **409 Conflict**: Content hash already exists
   - Scanner logs warning, continues
   - Node NOT created (duplicate content elsewhere)

2. **200 OK with update message**: Source path already exists
   - API updates existing node instead of creating duplicate
   - Useful for rescans (updates metadata/hash if changed)

3. **201 Created**: New node created successfully

## Critical Implementation Details

### Database Health Check
Scanner polls `GET /health` endpoint before starting:
- Max 30 attempts, 1 second delay between attempts
- Checks `response.status === 'ok'` AND `response.database === 'running'`
- Fails if database not ready within 30 seconds

### Error Handling Strategy
- **File-level errors**: Log error, continue to next file (increment error count)
- **Directory-level errors**: Log error, continue to sibling directories
- **Fatal errors** (database down, target missing): Exit with code 1
- Progress always reported, even with errors

### Stats Tracking
```javascript
{
  total: 0,        // Total files encountered
  processed: 0,    // New nodes created
  duplicates: 0,   // Existing nodes found
  skipped: 0,      // Filtered out (size/exclusion patterns)
  errors: 0        // Failed to process
}
```

### Exclusion Pattern Matching
- Patterns are **regex strings** in `config.json`
- Tested against both relative path (from target) and absolute path
- Example: `".*\\.DS_Store$"` excludes all `.DS_Store` files
- Excluded files increment `skipped` count

## Common Workflows

### Scan New Directory
1. Edit `config.json` → change `targetDirectory`
2. Run `npm run test` to preview
3. Run `npm run scan` to index

### Add New Exclusion Pattern
Edit `config.json`:
```json
"filters": {
  "excludePatterns": [
    ".*\\.DS_Store$",
    ".*\\.git/.*",
    ".*node_modules/.*",
    ".*\\.tmp$"          // Add new pattern
  ]
}
```

### Scan Only Large Files
Edit `config.json`:
```json
"filters": {
  "minSize": 1048576,    // 1MB minimum
  "maxSize": null
}
```

### Update Metadata for Existing Files
Just run `npm run scan` again - scanner will:
- Detect source path duplicates
- Update nodes with new hash/metadata
- Return 200 instead of 201

## Integration with Database Module

### Required API Endpoints
Scanner depends on:
- `GET /health` - Health check (must return `{status: 'ok', database: 'running'}`)
- `POST /api/nodes` - Create node (must handle duplicate detection)

### Expected API Behavior
**POST /api/nodes** should:
- Check `content_hash` for duplicates → return 409 if exists
- Check `source_path` for duplicates → update existing node, return 200
- If new → create node, return 201
- All responses should include node data in body

### Database Must Be Running First
Scanner will fail if database not reachable. Always start database before scanner.

## Extending the Scanner

### Add New Metadata Field
Edit `metadata-extractor.js`:
```javascript
metadata: {
  extension: extension,
  // ... existing fields
  newField: computeNewField(filePath)  // Add here
}
```

### Add File Type-Specific Processing
In `scanner.js` → `processFile()`:
```javascript
// After metadata extraction
if (metadata.type.startsWith('image/')) {
  // Extract EXIF data
  metadata.metadata.exif = await extractExif(filePath);
}
```

### Change Hashing Algorithm
Edit `hash-service.js`:
```javascript
const hash = crypto.createHash('sha512');  // Change algorithm
resolve(`sha512:${hash.digest('hex')}`);   // Update prefix
```

### Add Progress Callback
Modify `scanDirectory()` to accept callback parameter:
```javascript
async function scanDirectory(dirPath, stats, onProgress) {
  // Call onProgress(stats) at intervals
}
```

## Performance Considerations

### Hashing Speed
- Small files (< 1MB): Instant
- Medium files (1-100MB): < 1 second
- Large files (> 1GB): Several seconds
- Uses streaming - no memory issues regardless of size

### API Call Overhead
- One POST per file (sequential, not parallel)
- Network latency: ~10-50ms per file
- For 1000 files: expect ~10-50 seconds
- Future: Could batch multiple nodes in one request

### Recommended Limits
- Works well up to 100,000 files
- Consider `maxSize` filter for very large files
- Use `excludePatterns` to skip irrelevant directories

## Troubleshooting

### "Database did not become ready"
- Check database is running: `curl http://localhost:3000/health`
- Verify port 3000 is not blocked
- Check database logs for errors

### "Failed to hash file"
- Check file permissions (scanner runs as current user)
- Verify file exists and is readable
- Check disk space

### All Files Skipped
- Check `filters.excludePatterns` in config.json
- Verify `filters.minSize/maxSize` settings
- Run with `--dry-run` to see exclusion reasons

### Duplicates Not Detected
- Verify API returns 409 or 200 (not 201) for duplicates
- Check database has duplicate detection logic in POST /api/nodes
- Ensure `content_hash` and `source_path` are sent in request

## Testing Changes

After modifying scanner code:

1. **Unit test components**:
```bash
# Test hash service
node -e "const {calculateFileHash} = require('./hash-service'); \
  calculateFileHash('/path/to/file').then(console.log)"

# Test metadata extractor
node -e "const {extractMetadata} = require('./metadata-extractor'); \
  extractMetadata('/path/to/file').then(console.log)"
```

2. **Dry run test**:
```bash
npm run test  # Should complete without errors
```

3. **Live test with small directory**:
```bash
node scanner.js /path/to/small/test/directory
```

4. **Verify in database**:
```bash
curl http://localhost:3000/api/nodes | jq '.'
```

## Future Enhancements (Not Yet Implemented)

These features are planned but not in Phase 1:

- Watch mode (continuous monitoring)
- Parallel processing (--parallel N flag)
- Batch API (create multiple nodes per request)
- Resume capability (skip already-scanned files)
- Content extraction (EXIF, ID3, OCR)
- Relationship detection (temporal, spatial, semantic)

## Dependencies

- `mime-types@^2.1.35` - MIME type detection
- Node.js built-ins: `fs`, `crypto`, `path`
- Requires: Database server on port 3000
