# File Scanner Module

Recursive directory scanner. Extracts metadata, calculates SHA-256 hashes, sends to database API.

## Structure

```
backend/fs-indexer/
├── index.js              # CLI entry point
├── scanner.js            # Directory traversal
├── hash-service.js       # SHA-256 streaming hash
├── metadata-extractor.js # File metadata extraction
├── config.json           # Scan configuration
└── package.json
```

## Usage

```bash
npm run scan              # Live scan
npm run test              # Dry run (no database writes)
node scanner.js /path     # Custom directory
```

## Configuration

Edit `config.json`:

```json
{
  "targetDirectory": "/path/to/scan",
  "apiEndpoint": "http://localhost:3000/api/nodes",
  "filters": {
    "excludePatterns": [".*\\.DS_Store$", ".*\\.git/.*"],
    "minSize": 0,
    "maxSize": null
  }
}
```

## How It Works

1. Polls `/health` until database is ready
2. Recursively traverses target directory
3. For each file: extract metadata, calculate SHA-256 hash
4. POST to `/api/nodes`
5. Handle response: 201 (created), 200 (updated), 409 (duplicate)

## Output

Creates nodes with:
- `content_hash` - SHA-256 hash
- `name`, `size`, `type` - Basic metadata
- `source_path` - Absolute path
- `timestamp_created`, `timestamp_modified`
- `metadata` - Extension, MIME type

## Requirements

Database server must be running on `http://localhost:3000`.
