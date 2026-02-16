# System Tags: Unified Metadata Architecture

## Executive Summary

This document proposes a fundamental shift in how Index treats metadata. Rather than storing derived attributes as object properties, we treat **all objective, derivable metadata as first-class system tags**. This creates a unified query and filtering system where users can organize, search, and discover their information across any dimension with the same interface and semantics.

---

## Design Philosophy

### The Core Insight

**Objects should represent what something is. Tags should represent everything we know about it.**

Currently, metadata is split: some lives as object properties (name, source, created_at), some as structured metadata (source_metadata), and some as user tags. This fragmentation means:
- Querying requires different mechanisms for different types of metadata
- Adding new metadata dimensions requires schema changes
- The distinction between "property" and "metadata" is arbitrary and inconsistent

The unified system tag approach eliminates this ambiguity:
- **System tags** are objective facts derived from the source (media type, file extension, creation date, source type)
- **User tags** are subjective interpretation and categorization (priority, project, category, custom dimensions)
- **Both flow through the same tagging and querying infrastructure**

### Design Principles

1. **Objectivity as the dividing line** - System tags represent facts that could be independently verified. User tags represent opinion and interpretation.

2. **Cardinality awareness** - We only create system tags for dimensions where the cardinality is reasonable (low to moderate). High-cardinality metadata (full file paths, exact URLs) remains structural but queryable.

3. **User-centric extensibility** - Users can override or supplement system tags with their own interpretations without losing the system-generated facts.

4. **Query as primary interface** - Collections become the primary navigation and organization tool, querying across any dimension uniformly.

---

## System Tags Specification

### Tag Categories and Examples

#### Structural (auto-generated on object creation)

| Tag Type | Examples | Cardinality | Purpose |
|----------|----------|-------------|---------|
| `media_type` | `image`, `pdf`, `text`, `video`, `audio`, `document` | ~10-20 | Content classification |
| `source_type` | `file`, `web`, `clipboard` | ~5 | Origin classification |
| `file_extension` | `jpg`, `pdf`, `md`, `txt`, `mp3` | ~50-200 | File format detail |
| `domain` | `github.com`, `twitter.com`, `arxiv.org` | ~100-500 | URL host (web sources) |

#### Temporal (auto-generated on object creation)

| Tag Type | Examples | Cardinality | Purpose |
|----------|----------|-------------|---------|
| `created_date` | `2026-02-16` | ~365/year | Browse by creation time |
| `indexed_date` | `2026-02-16` | ~365/year | Browse by when added to Index |

#### Derived (computed from source)

| Tag Type | Examples | Notes |
|----------|----------|-------|
| `file_size_range` | `<1mb`, `1-10mb`, `>100mb` | Bucketed, not exact |
| `language` | `english`, `spanish`, `japanese` | Detected from content (future) |

### What Does NOT Become a Tag

- **Full file paths** → Too unique, stored on object.source
- **Full URLs** → Too unique, stored on object.source
- **Timestamps with seconds** → Bucketed by day instead
- **Unique identifiers** → Stored as object properties
- **Binary metadata** (hashes, checksums) → Stored in source_metadata

---

## User Experience Implications

### Discovery and Navigation

**Before:** Users navigate objects directly or search by name. Filtering requires Collections with manual query definition.

**After:** Users discover information through dimensional filtering:
- "Show me all PDFs added in February"
- "Find every image I've collected from Twitter"
- "Display all documents from my research project (user tag) that are also web sources"

### Search and Organization

Collections become dramatically more powerful. Instead of thinking "where did I save this?", users think in terms of attributes:
- Filter by media type and date range
- Combine system tags (media_type, source_type) with user tags (project, priority)
- Create dynamic collections that update as new objects match the criteria

### Metadata Transparency

Users see what Index knows about their data. System tags are **read-only but visible**, showing what the system could objectively determine. This builds trust and helps users understand how their data is being indexed.

### Selective Overrides

Users can create user tags that refine system classifications without overwriting them:
- System says `source_type:file`, user adds `source_type:research-backup` (both coexist)
- System determines `media_type:image`, user adds `media_type:screenshot` for semantic distinction

---

## Data Model Impact

### Object Simplification

Objects become leaner, focusing on what they are rather than how they were obtained:

```
Object {
  id,
  name,
  source          // Path or URL
}

// All other metadata is derived or user-provided as tags
```

### Tag Schema Extension

Tags gain a `system` boolean field and optional `source_type` field:

```
Tag {
  id,
  name,           // "pdf" or "2026-02-16" or "github.com"
  color,          // For user tags
  system: bool,   // Read-only if true
  tag_type_id,    // References tag_types
  created_at,
  updated_at
}
```

### Data Generation Pipeline

On object creation, a metadata extraction phase runs:
1. Determine source type (file path vs URL vs clipboard)
2. Extract media type and file extension (for files)
3. Extract domain (for URLs)
4. Extract/compute created date
5. Generate system tags for all extracted metadata
6. Persist tags and object_tags relationships

---

## Performance Considerations

### At Target Scale (10k-100k objects)

- **Objects table:** 10k-100k rows (very small)
- **Tags table:** 10k-50k rows (user tags + low-cardinality system tags)
- **object_tags junction:** 200k-1M rows (manageable, efficient with indexes)

### Query Performance

Collections queries remain fast because:
- Tag lookups are indexed (tag_id, object_id)
- Low cardinality system tags reduce filtering overhead
- No full-text search needed (exact tag matching)

### Storage

System tags add ~5-8 KB per object (as junction table entries), which is negligible at 100k scale.

---

## Implementation Approach

### Phase 1: Foundation

Establish the data model and core infrastructure:
- Add `system` field to tags
- Create system tag types (media_type, source_type, etc.)
- Build metadata extraction functions for different source types
- Generate system tags on object creation

### Phase 2: Integration

Connect system tags to existing features:
- Display system tags in object detail view (read-only, visually distinguished)
- Include system tags in Collections queries
- Update tag assignment UI to prevent user creation of system tags

### Phase 3: UX Refinement

Enhance the user experience:
- Visual distinction between system and user tags (grayed, locked icon)
- System tag organization in tag assignment dropdown
- Collection query builder hints for common system tag dimensions
- Dashboard/analytics showing most-used tag dimensions

### Phase 4: Extensibility

Enable growth and customization:
- User-defined system tag types (custom extractors)
- Bulk retagging when metadata extraction improves
- Tag suggestions based on similar objects
- Integration with external metadata sources (APIs, file systems)

---

## Future Considerations

This architecture enables future capabilities:

- **Smart organization** - Automatic collection suggestions based on usage patterns
- **Relationship inference** - Finding objects that share system dimensions (objects similar to this one)
- **Migration and export** - Exporting data with full metadata preservation
- **Multi-source synthesis** - Combining metadata from multiple sources (file system + URL metadata + manual tags)
- **Temporal querying** - "Show my research from Q1 2026" combining dates with user tags

---

## Success Criteria

The feature succeeds when:
- Users can discover and organize information across any objective dimension
- System tags feel transparent and trustworthy
- Collections queries feel natural and expressive
- The interface doesn't overwhelm users with system tag noise
- Query performance remains sub-second even at 100k objects

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Tag explosion from high-cardinality data | Only create tags for low-cardinality dimensions; keep unique data structural |
| User confusion between system and user tags | Clear visual distinction; system tags read-only |
| Stale metadata when objects change | Update system tags on object modification |
| Complex queries becoming confusing | Provide UI hints and saved collection templates |
| Performance degradation at scale | Monitor query times; add caching/indexing as needed |

---

## Conclusion

The unified system tags architecture transforms Index from a document storage system into a metadata-driven information discovery platform. By treating all objective metadata as first-class taggable dimensions, we give users a powerful, consistent interface for understanding, organizing, and discovering their information.

The approach is pragmatic: we only create tags for dimensions that are useful and have manageable cardinality. We keep detailed metadata on objects themselves. We build incrementally, validating each phase with real usage before proceeding to the next.

This architecture scales to the envisioned personal information index and provides a foundation for future enhancements.
