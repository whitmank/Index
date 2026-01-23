# ADR-001: URI-Based Source Model

## Status

**ACCEPTED**

## Context

In v0.2, Index was built around the concept of "files" with a `source_path` field containing filesystem paths like `/Users/karter/documents/report.pdf`. This worked but created several limitations:

1. **Conceptual narrowness**: The system was mentally framed as a "file manager," when the actual value is broader—managing *any* information that can be referenced.

2. **Limited extensibility**: Adding support for web URLs, Notion pages, or other sources would require schema changes and special-case handling.

3. **Inconsistent addressing**: File paths vary by OS (Unix vs Windows), while URIs provide a universal format.

The real insight: Index manages *objects* that point to *sources*. A source can be anything with a stable address—a file, a URL, or any other URI-addressable resource.

## Decision

Replace `source_path` (filesystem string) with `source` (URI string).

**Format:** Standard URI — `scheme://path`

**Examples:**
```
file:///Users/karter/documents/report.pdf
https://example.com/article/intro-to-graphs
notion://page/abc123
```

**Schema change:**
```javascript
// v0.2
{ source_path: "/path/to/file.pdf", ... }

// v0.3
{
  source: "file:///path/to/file.pdf",
  type: "file",  // Denormalized for fast queries
  ...
}
```

**Source handlers:** Each URI scheme gets a handler that knows how to:
- Extract metadata
- Calculate content hash (if applicable)
- Open in native app
- Watch for changes (if applicable)

## Consequences

### Positive
- **Unified model**: Files, URLs, and future sources all work the same way
- **Extensible**: New source types only require a new handler, no schema changes
- **Standard format**: URIs are well-understood, parseable, and universal
- **Cleaner mental model**: "Objects with sources" instead of "files with paths"

### Negative
- **Migration required**: v0.2 data needs `file://` prefix added
- **Slightly more verbose**: `file:///path` vs `/path`
- **Parsing overhead**: Must parse URI to determine handler (minimal impact)

### Neutral
- Requires defining which URI schemes are supported (explicit is good)

## Alternatives Considered

### A: Keep `source_path`, add separate `source_url` field
- Would require different code paths for files vs URLs
- Schema grows with each new source type
- **Rejected**: Doesn't scale, violates DRY

### B: Structured source object instead of URI string
```javascript
source: { type: "file", path: "/path/to/file" }
```
- More explicit, but reinvents the wheel
- URIs already solve this problem
- **Rejected**: URI standard exists for a reason

### C: Store source type in URI, don't denormalize
- Would require parsing URI for every "filter by type" query
- **Rejected**: Query performance matters; `type` field is worth the denormalization

---

*Decision date: January 2026*
*Applies to: v0.3+*
