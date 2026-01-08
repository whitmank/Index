# Database Schema Reference

SurrealDB schema for the Index personal information system.

## Overview

Three core tables modeling a graph of files, relationships, and metadata:

```
┌─────────┐
│  nodes  │──────┐
└─────────┘      │
     │           │
     │           │ 1:N
     │           │
     │      ┌────────┐
     │      │  tags  │
     │      └────────┘
     │
     │ N:N
     │
┌─────────┐
│  links  │
└─────────┘
```

## Tables

### nodes

Physical files indexed from the file system.

**Schema:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Auto-generated unique ID | `nodes:abc123xyz` |
| `content_hash` | string | SHA-256 hash with algorithm prefix | `sha256:d2d2d2a1b3c4...` |
| `name` | string | Filename (basename) | `vacation-photo.jpg` |
| `size` | number | File size in bytes | `73264` |
| `type` | string | MIME type | `image/jpeg` |
| `source_path` | string | Absolute path on disk | `/Users/karter/Photos/vacation-photo.jpg` |
| `timestamp_created` | datetime | File creation time (ISO 8601) | `2025-01-06T12:34:56.789Z` |
| `timestamp_modified` | datetime | File modification time (ISO 8601) | `2025-01-06T15:22:10.123Z` |
| `metadata` | object | Extensible JSON blob | `{"extension": ".jpg", "permissions": 420}` |

**Indexes (Future):**
- `content_hash` (unique)
- `source_path` (unique)
- `type` (for filtering by file type)
- `timestamp_created` (for date range queries)

**Example Record:**
```json
{
  "id": "nodes:8j2k9x1p4m3n",
  "content_hash": "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "name": "document.pdf",
  "size": 204800,
  "type": "application/pdf",
  "source_path": "/Users/karter/Documents/document.pdf",
  "timestamp_created": "2024-12-15T09:30:00.000Z",
  "timestamp_modified": "2024-12-20T14:45:00.000Z",
  "metadata": {
    "extension": ".pdf",
    "permissions": 420,
    "uid": 501,
    "gid": 20
  }
}
```

**Business Rules:**
1. **Uniqueness by content**: Duplicate `content_hash` prevented (same file content)
2. **Update by path**: Same `source_path` updates existing node (file modified)
3. **Cascade delete**: Deleting node removes associated tags and links

### links

Directed relationships between nodes with typed semantics.

**Schema:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Auto-generated unique ID | `links:xyz789abc` |
| `source_node` | string | Source node ID (from) | `nodes:abc123` |
| `target_node` | string | Target node ID (to) | `nodes:def456` |
| `type` | enum | Relationship type | `derivative` |
| `strength` | float | Optional confidence (0.0-1.0) | `0.85` |
| `timestamp_created` | datetime | Link creation time | `2025-01-06T12:00:00.000Z` |
| `timestamp_modified` | datetime | Link modification time | `2025-01-06T12:00:00.000Z` |
| `metadata` | object | Extensible JSON blob | `{"auto_detected": true}` |

**Link Types:**

| Type | Description | Example |
|------|-------------|---------|
| `derivative` | Target derived from source | `photo.jpg` → `photo-edited.jpg` |
| `temporal` | Time-based sequence | `draft-v1.txt` → `draft-v2.txt` |
| `semantic` | Conceptual similarity | `report-2024.pdf` ↔ `report-2025.pdf` |
| `spatial` | Location-based | Files in same directory or geo-location |
| `project` | Belong to same project | Files in same project folder |

**Direction:**
- `source_node` → `target_node` (directed edge)
- Bidirectional relationships: create two links

**Example Record:**
```json
{
  "id": "links:5k3m9n2p1x4j",
  "source_node": "nodes:original123",
  "target_node": "nodes:edited456",
  "type": "derivative",
  "strength": 0.95,
  "timestamp_created": "2025-01-06T10:15:30.000Z",
  "timestamp_modified": "2025-01-06T10:15:30.000Z",
  "metadata": {
    "detected_by": "scanner",
    "confidence": "high"
  }
}
```

**Queries:**
```javascript
// Get all outgoing links from a node
SELECT * FROM links WHERE source_node = "nodes:abc123";

// Get all incoming links to a node
SELECT * FROM links WHERE target_node = "nodes:abc123";

// Get all related nodes (bidirectional)
SELECT * FROM links
WHERE source_node = "nodes:abc123" OR target_node = "nodes:abc123";

// Get derivative chain
SELECT * FROM links
WHERE type = "derivative"
START AT "nodes:original123"
TRAVERSE source_node, target_node;
```

### tags

Labels for organizing and categorizing nodes (many-to-many).

**Schema:**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `id` | string | Auto-generated unique ID | `tags:p4m3n8j2k` |
| `tag_name` | string | Tag label (case-sensitive) | `work` |
| `node_id` | string | Associated node ID | `nodes:abc123` |
| `timestamp_created` | datetime | Tag creation time | `2025-01-06T12:00:00.000Z` |

**Indexes (Future):**
- `node_id` (for fast node → tags lookup)
- `tag_name` (for tag → nodes lookup)

**Example Records:**
```json
[
  {
    "id": "tags:1a2b3c4d",
    "tag_name": "important",
    "node_id": "nodes:abc123",
    "timestamp_created": "2025-01-06T10:00:00.000Z"
  },
  {
    "id": "tags:5e6f7g8h",
    "tag_name": "work",
    "node_id": "nodes:abc123",
    "timestamp_created": "2025-01-06T10:05:00.000Z"
  },
  {
    "id": "tags:9i0j1k2l",
    "tag_name": "work",
    "node_id": "nodes:def456",
    "timestamp_created": "2025-01-06T10:10:00.000Z"
  }
]
```

**Tag Conventions:**
- Lowercase preferred (`work`, not `Work`)
- Hyphenated for multi-word (`machine-learning`)
- No special characters or spaces
- Max length: 50 chars (not enforced yet)

**Queries:**
```javascript
// Get all tags for a node
SELECT * FROM tags WHERE node_id = "nodes:abc123";

// Get all nodes with a tag
SELECT * FROM nodes
WHERE id IN (SELECT node_id FROM tags WHERE tag_name = "work");

// Get tag counts (aggregation)
SELECT tag_name, count() AS total
FROM tags
GROUP BY tag_name
ORDER BY total DESC;

// Get nodes with multiple tags (AND)
SELECT * FROM nodes WHERE id IN (
  SELECT node_id FROM tags WHERE tag_name = "work"
  INTERSECT
  SELECT node_id FROM tags WHERE tag_name = "important"
);

// Get nodes with any of multiple tags (OR)
SELECT * FROM nodes WHERE id IN (
  SELECT node_id FROM tags WHERE tag_name IN ["work", "personal"]
);
```

## Relationships

### Node → Tags (1:N)
- One node can have many tags
- One tag belongs to one node (in tags table)
- Same `tag_name` can appear multiple times (different nodes)

**Example:**
```
nodes:photo1 → tags:1 (tag_name: "vacation")
             → tags:2 (tag_name: "2024")
             → tags:3 (tag_name: "family")

nodes:photo2 → tags:4 (tag_name: "vacation")
             → tags:5 (tag_name: "2024")
```

### Node → Links (N:N via links table)
- One node can be source of many links
- One node can be target of many links
- Links are directed (source → target)

**Example:**
```
nodes:original ──derivative──> nodes:edited
               ──derivative──> nodes:thumbnail

nodes:doc1 ──temporal──> nodes:doc2 ──temporal──> nodes:doc3
```

## Data Types

### Datetime Format
All timestamps use ISO 8601 with milliseconds:
```
2025-01-06T12:34:56.789Z
```

JavaScript:
```javascript
new Date().toISOString()
// "2025-01-06T12:34:56.789Z"
```

### Hash Format
Algorithm prefix + colon + hex digest:
```
sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

Allows future algorithm changes:
```
sha3-256:abc123...
blake3:def456...
```

### Node ID Format
Table prefix + colon + random alphanumeric:
```
nodes:8j2k9x1p4m3n
links:5k3m9n2p1x4j
tags:1a2b3c4d5e6f
```

SurrealDB auto-generates IDs in this format.

## Metadata Field

Extensible JSON for future features. Current usage:

**nodes.metadata:**
```json
{
  "extension": ".jpg",      // File extension
  "permissions": 420,       // Unix permissions (octal)
  "uid": 501,              // User ID
  "gid": 20,               // Group ID
  "exif": {},              // Future: EXIF data
  "extracted_text": "",    // Future: OCR/PDF text
  "ai_tags": []            // Future: ML-generated tags
}
```

**links.metadata:**
```json
{
  "detected_by": "scanner",       // How link was created
  "confidence": "high",           // Detection confidence
  "similarity_score": 0.92,       // Future: image similarity
  "transformation": "resize"      // Future: edit operation type
}
```

**tags.metadata (future):**
Currently not used. Could add:
```json
{
  "color": "#FF6B82",      // Tag color
  "category": "project",   // Tag category
  "auto_applied": true     // AI-generated tag
}
```

## Constraints

### Current Constraints (Application-Level)
- `content_hash` uniqueness (409 Conflict in API)
- `source_path` updates instead of duplicates
- Tag cascade delete (manual in API)

### Future Constraints (Database-Level)
```sql
-- Unique content hash
DEFINE INDEX content_hash_idx ON nodes FIELDS content_hash UNIQUE;

-- Unique source path
DEFINE INDEX source_path_idx ON nodes FIELDS source_path UNIQUE;

-- Prevent self-links
DEFINE FIELD source_node ON links ASSERT $value != $parent.target_node;

-- Valid link strength
DEFINE FIELD strength ON links ASSERT $value >= 0 AND $value <= 1;

-- Foreign key constraints
DEFINE FIELD source_node ON links TYPE record(nodes);
DEFINE FIELD target_node ON links TYPE record(nodes);
DEFINE FIELD node_id ON tags TYPE record(nodes);
```

## Migration Path

### Current State: SCHEMAFULL
Tables defined as SCHEMAFULL but no DEFINE FIELD statements yet.

### Recommended Migration (Future)

**Phase 1: Add indexes**
```sql
DEFINE INDEX content_hash_idx ON nodes FIELDS content_hash UNIQUE;
DEFINE INDEX source_path_idx ON nodes FIELDS source_path UNIQUE;
DEFINE INDEX tag_node_idx ON tags FIELDS node_id;
DEFINE INDEX tag_name_idx ON tags FIELDS tag_name;
```

**Phase 2: Add field definitions**
```sql
DEFINE FIELD content_hash ON nodes TYPE string ASSERT $value != NONE;
DEFINE FIELD name ON nodes TYPE string ASSERT $value != NONE;
DEFINE FIELD size ON nodes TYPE number ASSERT $value >= 0;
-- etc.
```

**Phase 3: Add validations**
```sql
DEFINE FIELD type ON nodes TYPE string
  ASSERT $value CONTAINS '/' OR $value = 'application/octet-stream';

DEFINE FIELD timestamp_created ON nodes TYPE datetime DEFAULT time::now();
```

## Example Queries

### Complex Queries

**Find orphaned nodes (no tags, no links):**
```sql
SELECT * FROM nodes WHERE
  id NOT IN (SELECT node_id FROM tags) AND
  id NOT IN (SELECT source_node FROM links) AND
  id NOT IN (SELECT target_node FROM links);
```

**Find most-tagged files:**
```sql
SELECT node_id, count() AS tag_count
FROM tags
GROUP BY node_id
ORDER BY tag_count DESC
LIMIT 10;
```

**Find files modified in last 7 days:**
```sql
SELECT * FROM nodes
WHERE timestamp_modified > time::now() - 7d
ORDER BY timestamp_modified DESC;
```

**Find image files over 1MB:**
```sql
SELECT * FROM nodes
WHERE type CONTAINS 'image' AND size > 1048576
ORDER BY size DESC;
```

**Find derivative chains:**
```sql
SELECT * FROM links
WHERE type = 'derivative'
ORDER BY timestamp_created ASC;
```

**Tag co-occurrence (which tags appear together):**
```sql
SELECT t1.tag_name AS tag1, t2.tag_name AS tag2, count() AS count
FROM tags AS t1, tags AS t2
WHERE t1.node_id = t2.node_id AND t1.tag_name < t2.tag_name
GROUP BY tag1, tag2
ORDER BY count DESC;
```

## Backup & Export

### Export to JSON
```bash
# Full database dump (future)
surreal export --conn http://localhost:8000 --user root --pass root \
  --ns index --db files output.surql

# Export as JSON (manual query)
curl http://localhost:3000/api/nodes > nodes.json
curl http://localhost:3000/api/links > links.json
curl http://localhost:3000/api/tags > tags.json
```

### Import from JSON
```javascript
// Bulk import (future API endpoint)
const nodes = require('./nodes.json');
for (const node of nodes) {
  await fetch('http://localhost:3000/api/nodes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(node)
  });
}
```

## Performance Considerations

### Current State
- No indexes (except default id)
- Full table scans for queries
- Acceptable for < 10,000 nodes

### Scaling Recommendations

**10,000 - 100,000 nodes:**
- Add indexes on `content_hash`, `source_path`, `tag_name`
- Use query helpers (by-date, by-type) instead of client-side filtering

**100,000 - 1,000,000 nodes:**
- Partition by date or type
- Add pagination to API endpoints
- Cache frequently accessed queries (Redis)

**1,000,000+ nodes:**
- Distribute across multiple SurrealDB instances
- Add search index (Elasticsearch/Meilisearch)
- Consider object storage for files (S3/MinIO)

## Future Schema Extensions

### Planned Tables

**collections:**
```sql
id: collections:xxx
name: "Project Alpha"
description: "Work files for project"
created_by: "user:karter"
timestamp_created: datetime
```

**collection_members:**
```sql
id: collection_members:xxx
collection_id: collections:xxx
node_id: nodes:xxx
added_at: datetime
```

**notes:**
```sql
id: notes:xxx
node_id: nodes:xxx
content: "Meeting notes from 2025-01-06..."
timestamp_created: datetime
timestamp_modified: datetime
```

**users (multi-user future):**
```sql
id: users:xxx
username: "karter"
email: "user@example.com"
password_hash: "..."
created_at: datetime
```

### Planned Fields

**nodes.embedding (for AI search):**
```sql
DEFINE FIELD embedding ON nodes TYPE array<float>;
DEFINE INDEX embedding_idx ON nodes FIELDS embedding HNSW;
```

**nodes.content_preview (extracted text):**
```sql
DEFINE FIELD content_preview ON nodes TYPE string;
DEFINE INDEX content_preview_idx ON nodes FIELDS content_preview SEARCH;
```
