# ADR-005: Collection Query Model (AND/OR/NOT)

## Status

**ACCEPTED**

## Context

In v0.2, collections were defined by a simple `tags` array with AND logic:

```javascript
// v0.2 collection
{
  name: "Project Alpha",
  tags: ["alpha", "active"],  // Must have BOTH tags
  ...
}
```

This was limiting:
- **No OR logic**: Can't say "tagged 'urgent' OR 'review'"
- **No exclusions**: Can't say "NOT tagged 'archived'"
- **Simple cases only**: Real-world filtering often needs combinations

Users needed more expressive queries to create useful collections.

## Decision

Replace `tags` array with a `query` object supporting AND, OR, and NOT logic:

```javascript
{
  name: "Active Project Alpha",
  query: {
    all: ["alpha", "active"],      // Must have ALL (AND)
    any: ["urgent", "review"],     // Must have at least ONE (OR)
    none: ["archived", "done"]     // Must NOT have ANY (NOT)
  },
  ...
}
```

**Evaluation logic:**
```
matches = (has ALL tags in 'all')
      AND (has ANY tag in 'any', or 'any' is empty)
      AND (has NONE of tags in 'none')
```

**Examples:**

| Query | Meaning |
|-------|---------|
| `{ all: ["alpha"] }` | Tagged "alpha" |
| `{ all: ["alpha"], none: ["archived"] }` | Tagged "alpha", not "archived" |
| `{ any: ["urgent", "review"] }` | Tagged "urgent" OR "review" |
| `{ all: ["project"], any: ["q1", "q2"], none: ["done"] }` | Tagged "project" AND ("q1" OR "q2") AND NOT "done" |

## Consequences

### Positive
- **Expressive filtering**: Covers most real-world use cases
- **Composable**: AND, OR, NOT can be combined freely
- **Familiar logic**: Boolean operators are well-understood
- **Backwards compatible**: `{ all: ["tag1", "tag2"] }` equals v0.2 behavior

### Negative
- **More complex evaluation**: Query logic is more involved than simple array intersection
- **UI complexity**: Need to design a way for users to build these queries
- **Migration**: v0.2 collections need `tags` converted to `query.all`

### Neutral
- Empty arrays mean "no constraint" (e.g., `any: []` matches everything)

## Query Evaluation (Pseudocode)

```javascript
function matchesQuery(object, query) {
  const objectTags = getTagsForObject(object.id);

  // Must have ALL tags in 'all' array
  const hasAll = query.all.every(tag => objectTags.includes(tag));

  // Must have at least ONE tag in 'any' array (or 'any' is empty)
  const hasAny = query.any.length === 0 ||
                 query.any.some(tag => objectTags.includes(tag));

  // Must NOT have any tags in 'none' array
  const hasNone = !query.none.some(tag => objectTags.includes(tag));

  return hasAll && hasAny && hasNone;
}
```

## Alternatives Considered

### A: Keep AND-only, add separate OR collections
- Two types of collections: AND-collections and OR-collections
- **Rejected**: Doesn't allow combining AND and OR, arbitrary limitation

### B: Full query language (SQL-like)
```javascript
query: "tags CONTAINS 'alpha' AND (tags CONTAINS 'urgent' OR tags CONTAINS 'review')"
```
- Maximum flexibility
- **Rejected**: Overkill for this use case, harder to build UI, error-prone

### C: Nested boolean tree
```javascript
query: {
  and: [
    { tag: "alpha" },
    { or: [{ tag: "urgent" }, { tag: "review" }] }
  ]
}
```
- Arbitrarily complex expressions
- **Rejected**: Harder to build UI for, all/any/none covers 95% of cases

### D: Just add OR, no NOT
- Simpler than full AND/OR/NOT
- **Rejected**: Exclusions ("not archived") are extremely common; worth including

## UI Considerations

The query builder UI should:
1. Default to simple mode (just `all` tags, like v0.2)
2. Allow expanding to advanced mode for `any` and `none`
3. Use clear language: "Must have ALL of", "Must have ANY of", "Must NOT have"
4. Show preview of matching objects as query is built

---

*Decision date: January 2026*
*Applies to: v0.3+*
