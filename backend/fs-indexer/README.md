# File Scanner Module

Recursive directory scanner for the Personal Information System. Scans directories, extracts metadata, calculates SHA-256 hashes, and indexes files into the database.

## Installation

```bash
cd /Users/karter/files/dev/Index/modules/scanner
npm install
```

## Usage

### Live Scan
```bash
npm run scan
```

### Dry Run (test without database writes)
```bash
npm run test
```

### Custom Directory
```bash
node scanner.js /path/to/directory
node scanner.js --dry-run /path/to/directory
```

## Configuration

Edit `config.json` to customize scanner behavior:

- **targetDirectory**: Default directory to scan
- **apiEndpoint**: Database API endpoint
- **filters.excludePatterns**: Regex patterns to exclude files/folders
- **filters.minSize/maxSize**: File size filters (bytes)
- **options.followSymlinks**: Follow symbolic links
- **options.progressInterval**: Progress report frequency

## Features

- ✅ Recursive directory traversal
- ✅ SHA-256 content hashing (streaming for large files)
- ✅ MIME type detection
- ✅ Duplicate detection (by content hash and path)
- ✅ Configurable filters (exclusions, size limits)
- ✅ Progress reporting
- ✅ Dry-run mode for testing
- ✅ Graceful error handling

## Output

Scanner creates nodes in the database with:
- Unique ID (auto-generated)
- Content hash (SHA-256)
- File metadata (name, size, type, timestamps)
- Source path (absolute)
- Extensible metadata JSON blob

## Requirements

- Database server must be running on `http://localhost:3000`
- Target directory must be accessible

## How It Works

1. **Wait for Database**: Polls `/health` endpoint until database is ready
2. **Verify Directory**: Checks that target directory exists and is accessible
3. **Recursive Scan**: Traverses directory tree, processing each file:
   - Checks exclusion patterns
   - Extracts file metadata (size, type, timestamps)
   - Calculates SHA-256 hash
   - Sends to API for storage
4. **Duplicate Handling**:
   - Same content hash → Logs warning, continues
   - Same source path → Updates existing node
5. **Progress Reporting**: Shows stats every N files (configurable)
6. **Final Report**: Total processed, skipped, errors, time elapsed

## Example Output

```
============================================================
📂 FILE SCANNER - Personal Information System
============================================================

Target directory: /Users/karter/files/-test files
Mode: LIVE
API endpoint: http://localhost:3000/api/nodes
Waiting for database to be ready...
✅ Database is ready!

🔍 Verifying target directory...
✅ Target directory verified

🚀 Starting scan...

📄 Processing: /Users/karter/files/-test files/shapes/1.png
  📊 Extracting metadata...
  🔐 Calculating SHA-256 hash...
  Hash: sha256:a3f2e1b4c5d6...
  📤 Sending to database...
  ✅ Node created successfully

[... more files ...]

============================================================
📊 SCAN COMPLETE
============================================================
Total files found:      8
Successfully processed: 8
Skipped:                0
Errors:                 0
Time elapsed:           2.34s
============================================================
```

## Troubleshooting

### "Database did not become ready within timeout period"
- Ensure the database server is running: `cd ../database && npm run dev:backend`
- Check that port 3000 is available

### "Target path is not a directory"
- Verify the path in `config.json` is correct
- Ensure you have read permissions for the directory

### Files being skipped unexpectedly
- Check `filters.excludePatterns` in `config.json`
- Check `filters.minSize` and `filters.maxSize` settings

### Hashing is slow
- Normal for large files (videos, archives)
- Scanner uses streaming to avoid memory issues
- Consider adding `maxSize` filter to skip very large files
