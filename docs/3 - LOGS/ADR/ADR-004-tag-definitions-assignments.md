# ADR-004: Split Tags into Definitions and Assignments

## Status

**ACCEPTED**

## Context

In v0.2, tags were stored as simple records with a `name` and `object_id`:

```javascript
// v0.2 tag record
{ id: "tags:xyz", name: "important", node_id: "nodes:abc", created_at: ... }
```

This worked but had limitations:

1. **No global tag management**: To rename "important" to "priority", you'd have to update every record with that name.

2. **No tag metadata**: Couldn't store tag colors, descriptions, or other properties.

3. **Inconsistent data**: Same tag name might have slight variations ("Important" vs "important").

4. **Inefficient queries**: "List all tags with counts" required scanning all tag records and grouping by name.

## Decision

Split tags into two entities:

**TagDefinitions** — canonical registry of tags
```javascript
{
  id: "tag_definitions:ulid",
  name: "important",           // Unique, canonical name
  color: "#FF5733",            // Optional visual color
  description: "High priority", // Optional description
  created_at: ISO8601
}
```

**TagAssignments** — relationships between tags and objects
```javascript
{
  id: "tag_assignments:ulid",
  tag_id: "tag_definitions:abc",   // Reference to definition
  object_id: "objects:xyz",        // Reference to object
  created_at: ISO8601
}
```

**How it works:**
- When user types a tag name, look up or create TagDefinition
- Create TagAssignment linking definition to object
- To rename a tag globally, update the TagDefinition.name
- Tag colors and descriptions live on the definition

## Consequences

### Positive
- **Global rename**: Change TagDefinition.name, all assignments reflect it
- **Tag metadata**: Colors, descriptions, and future properties have a home
- **Data integrity**: No more "important" vs "Important" inconsistency
- **Efficient queries**: Count assignments per tag_id, join for names
- **Extensible**: Can add tag hierarchies, aliases, etc. later

### Negative
- **More complex writes**: Creating a tag requires checking/creating definition first
- **Two tables instead of one**: Slightly more schema complexity
- **Migration effort**: v0.2 tags need to be split during migration

### Neutral
- Follows standard database normalization patterns (this is the "correct" way)

## Migration Path

```javascript
// For each unique tag name in v0.2:
1. Create TagDefinition with that name
2. For each v0.2 tag record with that name:
   - Create TagAssignment linking definition to object
3. Delete old tags table
```

## Alternatives Considered

### A: Keep flat tags, add global operations
- Add "rename all tags with name X to Y" operation
- **Rejected**: Doesn't solve metadata storage, still has consistency issues

### B: Tags as array on object
```javascript
{ tags: ["important", "project-alpha"], ... }
```
- Simpler, no separate table
- **Rejected**: Can't store tag metadata, can't ensure consistency, harder to query "all tags"

### C: Tag names as primary key
- Use tag name as ID instead of ULID
- **Rejected**: Renaming becomes impossible (would change ID), names may have special characters

---

*Decision date: January 2026*
*Applies to: v0.3+*
