# API Endpoints Reference

Express server on `http://localhost:3000`

---

## Health Check

```
GET /health
```

Response: `{"status":"ok","database":"running","timestamp":"..."}`

---

## Objects API

### List Objects
```
GET /api/objects?type=file&tag=important&limit=100&offset=0
```
**Params:** `type`, `tag`, `limit`, `offset`

### Get Object
```
GET /api/objects/:id
```

### Create Object
```
POST /api/objects
Content-Type: application/json

{
  "source": "file:///path/to/file.pdf",
  "type": "file",
  "name": "Report Q4",
  "content_hash": "sha256:abc...",
  "source_meta": { "size": 1024, "mime_type": "application/pdf" },
  "user_meta": { "notes": "..." }
}
```

**Response codes:**
- `201` Created
- `409` Duplicate (content_hash exists)

### Update Object
```
PUT /api/objects/:id
Content-Type: application/json

{
  "name": "New Name",
  "user_meta": { "notes": "Updated notes" }
}
```

### Delete Object
```
DELETE /api/objects/:id
```

### Get Tags for Object
```
GET /api/objects/:id/tags
```

---

## Tags API

### List Tag Definitions
```
GET /api/tags
```

### Create Tag Definition
```
POST /api/tags
Content-Type: application/json

{
  "name": "important",
  "color": "#FF5733",
  "description": "High priority items"
}
```

### Update Tag Definition
```
PUT /api/tags/:id
Content-Type: application/json

{
  "color": "#00FF00",
  "description": "Updated description"
}
```

### Delete Tag Definition
```
DELETE /api/tags/:id
```
*Cascades to all tag_assignments*

### Assign Tag to Object
```
POST /api/tags/assign
Content-Type: application/json

{
  "tag_id": "tag_definitions:abc123",
  "object_id": "objects:xyz789"
}
```

### Remove Tag Assignment
```
DELETE /api/tags/assign/:id
```

---

## Collections API

### List Collections
```
GET /api/collections?pinned=true
```
**Params:** `pinned` (optional filter)

### Get Collection
```
GET /api/collections/:id
```

### Get Objects in Collection
```
GET /api/collections/:id/objects?limit=100&offset=0
```
*Resolves collection query, returns matching objects*

### Create Collection
```
POST /api/collections
Content-Type: application/json

{
  "name": "Active Projects",
  "description": "All active projects",
  "query": {
    "all": ["project"],
    "any": ["urgent", "review"],
    "none": ["archived"]
  },
  "color": "#0066FF",
  "pinned": true
}
```

### Update Collection
```
PUT /api/collections/:id
Content-Type: application/json

{
  "name": "New Name",
  "query": { ... },
  "pinned": false
}
```

### Delete Collection
```
DELETE /api/collections/:id
```

---

## Links API

### List Links
```
GET /api/links
```

### Create Link
```
POST /api/links
Content-Type: application/json

{
  "source_object": "objects:abc123",
  "target_object": "objects:xyz789",
  "type": "derivative",
  "label": "derived from",
  "bidirectional": true
}
```

### Update Link
```
PUT /api/links/:id
Content-Type: application/json

{
  "label": "new label",
  "type": "reference",
  "bidirectional": false
}
```

### Delete Link
```
DELETE /api/links/:id
```

---

## Import API

### Import File or URL
```
POST /api/objects/import
Content-Type: application/json

{
  "source": "file:///path/to/file.pdf",
  "tags": ["important", "project-alpha"],
  "notes": "Optional user notes"
}
```

**Response:**
- `201` Created new object
- `200` Updated existing (same source)
- `409` Duplicate (same content_hash)

---

## Error Responses

All errors return JSON:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": "2026-01-22T16:00:00Z"
}
```

**Common codes:**
- `INVALID_URI` — Malformed URI
- `HANDLER_NOT_FOUND` — No handler for URI scheme
- `NOT_FOUND` — Resource doesn't exist
- `DUPLICATE_CONTENT` — Content hash already exists
- `VALIDATION_ERROR` — Invalid request body

---

**Source:** API.md, Tech Spec Section 4
**Last Updated:** January 2026
