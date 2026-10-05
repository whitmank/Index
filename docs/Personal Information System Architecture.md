# Personal Information System Architecture

## Goal
Build a unified "life stream" system to organize all personal data with a simple, robust foundation supporting multiple view layers.

## Core Architecture

### Atomic Layer (Immutable Foundation)
- Append-only record of every information object
- Core attributes: unique ID, content hash, timestamps, source location, type, size
- Extensible metadata container for format-specific data
- **Key principle**: Never delete or modify. Original files stay in place; we index their locations.

### Metadata Layer (Enrichment & Organization)
Build understanding above the atomic layer through:

**Automatic extraction**:
- Content parsing (text from documents, EXIF from images, ID3 from audio)
- Derived attributes (word count, dimensions, duration, language)
- Relationship detection (spatial/temporal proximity, content similarity, derivation chains)

**Manual curation**:
- Tags and annotations
- Explicit relationships between atoms
- Collections and groupings
- User notes and context

**Metadata types**:
- Descriptive (what it is, what it contains)
- Relational (how atoms connect - temporal, semantic, derivative, spatial, project)
- Contextual (where, when, why it was created/accessed)
- Analytical (patterns, clusters, similarities)

### View Layer (Query Interfaces)
Multiple lenses over the same data:
- Temporal (timelines, date ranges)
- Semantic (knowledge graphs, topic clusters)
- Project (hierarchical groupings)
- Search (full-text, tags, similarity)
- Social (by people/interactions)
- Media (specialized for images/video/audio)
- Spatial (geographic if available)

## Implementation Phases

**Phase 1 - Foundation**
- Directory scanner with recursive processing
- Extract core metadata: name, size, timestamps, hash
- Store in atomic layer
- Basic queries: filter by date, type, location

**Phase 2 - Metadata Enrichment**
- Automatic content extraction and relationship detection
- Manual curation interface (tagging, annotations, explicit bonds)
- Pattern-based metadata generation

**Phase 3 - Advanced Views**
- Full-text search
- Graph visualization
- Semantic similarity
- Pattern detection and suggestions
- Export capabilities

## Key Principles
- **Local-first**: User controls all data
- **Non-destructive**: Original files unmodified
- **Extensible**: Metadata evolves without migration
- **Queryable**: Multiple views from same foundation
- **Gradual**: Start small, expand over time
- **Layered**: Atoms, metadata, and views are independent

## Starting Point
Begin with one well-defined subset to test extraction, validate patterns, and iterate on queries before expanding scope.