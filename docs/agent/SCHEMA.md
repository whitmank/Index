# Database Schema Reference

SurrealDB database: `index` / namespace: `default`

---

## Objects Table

**Table:** `objects`

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| id | ulid | ✓ | Unique identifier (auto-generated) |
| source | string | ✓ | URI: `file:///path` or `https://example.com` |
| type | string | ✓ | Source type: `file` or `url` |
| name | string | - | User-visible name (optional, auto-derived) |
| content_hash | string | - | `sha256:...` for deduplication |
| created_at | ISO8601 | ✓ | When added to Index |
| modified_at | ISO8601 | ✓ | Last changed in Index |
| source_modified_at | ISO8601 | - | Last change at source |
| source_meta | object | - | `{size, mime_type, extension, title, description, favicon, domain}` |
| user_meta | object | - | `{notes, ...}` |

**Example:**
```json
{
  "id": "objects:01h2xcejqtf2nbrexx3vqjhp41",
  "source": "file:///Users/karter/docs/report.pdf",
  "type": "file",
  "name": "Q4 Report",
  "content_hash": "sha256:abc123...",
  "created_at": "2026-01-22T16:00:00Z",
  "modified_at": "2026-01-22T16:00:00Z",
  "source_meta": {
    "size": 1024000,
    "mime_type": "application/pdf",
    "extension": ".pdf"
  },
  "user_meta": {
    "notes": "Key insights on revenue"
  }
}
```

---

## Tag Definitions Table

**Table:** `tag_definitions`

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| id | ulid | ✓ | Unique identifier |
| name | string | ✓ | Tag name (unique) |
| color | string | - | Hex color: `#FF5733` |
| description | string | - | Optional explanation |
| created_at | ISO8601 | ✓ | Creation timestamp |

**Example:**
```json
{
  "id": "tag_definitions:01h2xcejqtf2nbrexx3vqjhp41",
  "name": "important",
  "color": "#FF5733",
  "description": "Mark high-priority items",
  "created_at": "2026-01-22T16:00:00Z"
}
```

---

## Tag Assignments Table

**Table:** `tag_assignments`

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| id | ulid | ✓ | Unique identifier |
| tag_id | string | ✓ | Reference to `tag_definitions:id` |
| object_id | string | ✓ | Reference to `objects:id` |
| created_at | ISO8601 | ✓ | Assignment timestamp |

**Example:**
```json
{
  "id": "tag_assignments:01h2xcejqtf2nbrexx3vqjhp41",
  "tag_id": "tag_definitions:abc123",
  "object_id": "objects:xyz789",
  "created_at": "2026-01-22T16:00:00Z"
}
```

---

## Collections Table

**Table:** `collections`

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| id | ulid | ✓ | Unique identifier |
| name | string | ✓ | Collection name |
| description | string | - | Optional explanation |
| query | object | ✓ | `{all?: [], any?: [], none?: []}` |
| color | string | - | Hex color for UI |
| pinned | boolean | - | Show in sidebar (default: false) |
| created_at | ISO8601 | ✓ | Creation timestamp |
| modified_at | ISO8601 | ✓ | Last modified timestamp |

**Query Logic:** `(all AND any) AND NOT none`

**Example:**
```json
{
  "id": "collections:01h2xcejqtf2nbrexx3vqjhp41",
  "name": "Active Projects",
  "query": {
    "all": ["project"],
    "any": ["urgent", "review"],
    "none": ["archived"]
  },
  "pinned": true,
  "created_at": "2026-01-22T16:00:00Z",
  "modified_at": "2026-01-22T16:00:00Z"
}
```

---

## Links Table

**Table:** `links`

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| id | ulid | ✓ | Unique identifier |
| source_object | string | ✓ | Reference to `objects:id` |
| target_object | string | ✓ | Reference to `objects:id` |
| type | string | ✓ | `related`, `derivative`, or `reference` |
| label | string | - | User description (e.g., "references", "cited by") |
| bidirectional | boolean | ✓ | If true, visible from both objects |
| created_at | ISO8601 | ✓ | Creation timestamp |
| modified_at | ISO8601 | ✓ | Last modified timestamp |
| metadata | object | - | Future extensibility |

**Example:**
```json
{
  "id": "links:01h2xcejqtf2nbrexx3vqjhp41",
  "source_object": "objects:abc123",
  "target_object": "objects:xyz789",
  "type": "derivative",
  "label": "derived from",
  "bidirectional": true,
  "created_at": "2026-01-22T16:00:00Z",
  "modified_at": "2026-01-22T16:00:00Z"
}
```

---

## Query Patterns

### Get all objects with a tag
```sql
SELECT objects.* FROM objects
WHERE id IN (
  SELECT object_id FROM tag_assignments
  WHERE tag_id = $tag_id
)
```

### Get objects matching collection query
```sql
SELECT * FROM objects
WHERE (
  id IN (
    SELECT object_id FROM tag_assignments
    WHERE tag_id IN (
      SELECT id FROM tag_definitions WHERE name IN $all_tags
    )
  )
) AND (
  id IN (
    SELECT object_id FROM tag_assignments
    WHERE tag_id IN (
      SELECT id FROM tag_definitions WHERE name IN $any_tags
    )
  )
) AND (
  id NOT IN (
    SELECT object_id FROM tag_assignments
    WHERE tag_id IN (
      SELECT id FROM tag_definitions WHERE name IN $none_tags
    )
  )
)
```

### Get all tags for an object
```sql
SELECT tag_definitions.* FROM tag_definitions
WHERE id IN (
  SELECT tag_id FROM tag_assignments
  WHERE object_id = $object_id
)
```

### Get links for an object
```sql
SELECT * FROM links
WHERE source_object = $object_id OR target_object = $object_id
```

---

## Indexes (for performance)

Recommend creating indexes on:
- `objects.source` (URI lookups)
- `objects.type` (filtering by type)
- `tag_assignments.object_id` (fetching tags for object)
- `tag_assignments.tag_id` (finding objects with tag)
- `tag_definitions.name` (tag lookups)
- `collections.pinned` (sidebar collection listing)

---

**Source:** Tech Spec Section 2, Section 8
**Last Updated:** January 2026
