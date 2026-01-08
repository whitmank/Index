# API Reference

Base URL: `http://localhost:3000/api`

## Nodes

### GET /nodes
List all indexed files.

**Response:**
```json
[
  {
    "id": "nodes:abc123",
    "content_hash": "sha256:d2d2d2...",
    "name": "example.png",
    "size": 73264,
    "type": "image/png",
    "source_path": "/Users/karter/files/example.png",
    "timestamp_created": "2025-01-06T12:00:00.000Z",
    "timestamp_modified": "2025-01-06T12:00:00.000Z",
    "metadata": {}
  }
]
```

### GET /nodes/:id
Get single node by ID.

**Example:** `GET /nodes/nodes:abc123`

### POST /nodes
Create new node. Handles duplicates:
- Same `content_hash` → 409 Conflict
- Same `source_path` → Updates existing node

**Request:**
```json
{
  "content_hash": "sha256:abc...",
  "name": "file.txt",
  "size": 1024,
  "type": "text/plain",
  "source_path": "/absolute/path/file.txt",
  "timestamp_created": "2025-01-06T12:00:00.000Z",
  "timestamp_modified": "2025-01-06T12:00:00.000Z",
  "metadata": {}
}
```

**Response (201):**
```json
{
  "id": "nodes:xyz789",
  ...
}
```

**Response (409 - Duplicate):**
```json
{
  "error": "Duplicate content",
  "existing_node": { ... }
}
```

### PUT /nodes/:id
Update existing node.

**Request:** Same as POST (partial updates supported)

### DELETE /nodes/:id
Delete node and associated tags/links.

**Response:** `204 No Content`

## Links

### GET /links
List all relationships.

**Response:**
```json
[
  {
    "id": "links:xyz",
    "source_node": "nodes:abc",
    "target_node": "nodes:def",
    "type": "derivative",
    "strength": 0.8,
    "timestamp_created": "2025-01-06T12:00:00.000Z",
    "timestamp_modified": "2025-01-06T12:00:00.000Z",
    "metadata": {}
  }
]
```

### POST /links
Create relationship.

**Request:**
```json
{
  "source_node": "nodes:abc",
  "target_node": "nodes:def",
  "type": "derivative",
  "strength": 0.8,
  "metadata": {}
}
```

**Link Types:**
- `derivative` - One file derived from another (edited, resized, etc.)
- `temporal` - Time-based relationship (versions, sequences)
- `semantic` - Conceptual similarity
- `spatial` - Location-based relationship
- `project` - Belong to same project/collection

### PUT /links/:id
Update relationship.

### DELETE /links/:id
Delete relationship.

## Tags

### GET /tags
List all tags across all nodes.

**Response:**
```json
[
  {
    "id": "tags:abc",
    "tag_name": "work",
    "node_id": "nodes:xyz",
    "timestamp_created": "2025-01-06T12:00:00.000Z"
  }
]
```

### GET /nodes/:id/tags
Get tags for specific node.

**Example:** `GET /nodes/nodes:abc123/tags`

### POST /tags
Add tag to node.

**Request:**
```json
{
  "tag_name": "important",
  "node_id": "nodes:abc123"
}
```

### DELETE /tags/:id
Remove tag.

## File Serving

### GET /files/:id
Stream file content with proper Content-Type header.

**Example:** `GET /files/nodes:abc123`

**Response Headers:**
```
Content-Type: image/png
```

**Use Case:** Image thumbnails in frontend
```html
<img src="/api/files/nodes:abc123" />
```

## Query Helpers

### GET /query/nodes/by-date
Filter nodes by date range.

**Query Params:**
- `start`: ISO 8601 datetime
- `end`: ISO 8601 datetime

**Example:** `GET /query/nodes/by-date?start=2025-01-01T00:00:00Z&end=2025-01-06T23:59:59Z`

### GET /query/nodes/by-type
Filter nodes by MIME type.

**Query Params:**
- `type`: MIME type prefix (e.g., `image`, `image/png`)

**Example:** `GET /query/nodes/by-type?type=image`

### GET /query/nodes/by-location
Filter nodes by source path prefix.

**Query Params:**
- `path`: Path prefix

**Example:** `GET /query/nodes/by-location?path=/Users/karter/Documents`

## Health Check

### GET /health
Check if database is ready.

**Response:**
```json
{
  "status": "ok",
  "database": "connected"
}
```

## Error Responses

**400 Bad Request:**
```json
{
  "error": "Invalid node data"
}
```

**404 Not Found:**
```json
{
  "error": "Node not found"
}
```

**409 Conflict:**
```json
{
  "error": "Duplicate content",
  "existing_node": { ... }
}
```

**500 Internal Server Error:**
```json
{
  "error": "Database error message"
}
```

## Testing with curl

```bash
# List all nodes
curl http://localhost:3000/api/nodes

# Get specific node
curl http://localhost:3000/api/nodes/nodes:abc123

# Create node
curl -X POST http://localhost:3000/api/nodes \
  -H "Content-Type: application/json" \
  -d '{
    "content_hash": "sha256:test123",
    "name": "test.txt",
    "size": 100,
    "type": "text/plain",
    "source_path": "/tmp/test.txt",
    "timestamp_created": "2025-01-06T12:00:00.000Z",
    "timestamp_modified": "2025-01-06T12:00:00.000Z",
    "metadata": {}
  }'

# Add tag
curl -X POST http://localhost:3000/api/tags \
  -H "Content-Type: application/json" \
  -d '{
    "tag_name": "important",
    "node_id": "nodes:abc123"
  }'

# Create link
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{
    "source_node": "nodes:abc",
    "target_node": "nodes:def",
    "type": "derivative",
    "strength": 0.9
  }'

# Query by type
curl "http://localhost:3000/api/query/nodes/by-type?type=image"

# Download file
curl http://localhost:3000/api/files/nodes:abc123 -o output.png
```
