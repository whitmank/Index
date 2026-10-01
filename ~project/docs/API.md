# API Reference

REST API served by `backend/database/server.js` on port 3000.

## Health

```
GET /health
```
Returns `{"status":"ok","database":"running","timestamp":"..."}`

## Nodes

```
GET  /api/nodes              # List all nodes
POST /api/nodes              # Create node
GET  /api/nodes/:id          # Get single node
GET  /api/nodes/:id/tags     # Get tags for node
```

### Create Node

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

**Response codes:**
- `201` - Created
- `200` - Updated (existing source_path)
- `409` - Duplicate (content_hash exists)

## Query Endpoints

```
GET /api/query/nodes/by-type?type=image
GET /api/query/nodes/by-location?path=/Users/karter
GET /api/query/nodes/by-date?start=2025-01-01T00:00:00Z&end=2025-12-31T23:59:59Z
```

## Tags

```
GET  /api/tags               # List all tags
POST /api/tags               # Create tag on node
```

```bash
curl -X POST http://localhost:3000/api/tags \
  -H "Content-Type: application/json" \
  -d '{"tag_name": "important", "node_id": "nodes:abc123"}'
```

## Links

```
GET  /api/links              # List all links
POST /api/links              # Create link between nodes
```

```bash
curl -X POST http://localhost:3000/api/links \
  -H "Content-Type: application/json" \
  -d '{
    "source_node": "nodes:abc",
    "target_node": "nodes:xyz",
    "type": "derivative",
    "strength": 0.8
  }'
```

## Collections

```
GET  /api/collections        # List all collections
POST /api/collections        # Create collection
GET  /api/collections/:id    # Get collection with nodes
```

## Troubleshooting

**Can't reach API:** Verify database running with `curl http://localhost:3000/health`

**Duplicates not detected:** API checks by content_hash. Same hash = 409, same path = 200 (update).
