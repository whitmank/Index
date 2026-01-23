# ADR-002: SurrealDB as Embedded Database

## Status

**ACCEPTED** (carried forward from v0.2)

## Context

Index needs a database that can:
1. Store structured data (objects, tags, collections, links)
2. Run locally without external services
3. Support flexible queries (filtering, relationships)
4. Persist to disk reliably
5. Work within an Electron app

Options considered:
- SQLite: Proven, but requires more boilerplate for complex queries
- LevelDB/RocksDB: Key-value only, would need to build query layer
- PouchDB/LokiJS: JavaScript-native, but less mature
- SurrealDB: Multi-model, SQL-like queries, embeddable, Rust-based

## Decision

Use **SurrealDB** in embedded mode with RocksDB storage backend.

**Configuration:**
- Namespace/database structure for multi-tenancy (`dev/test`, `prod/main`, etc.)
- File-based persistence to `data/database.db/`
- Accessed via Express API layer (not directly from renderer)

**Why SurrealDB:**
1. **Multi-model**: Supports documents, graphs, and relations in one system
2. **SurrealQL**: SQL-like syntax that's powerful yet readable
3. **Embeddable**: Runs as a subprocess, no separate server install
4. **Graph-ready**: Native support for relationships (useful for Links)
5. **Modern**: Active development, good documentation

## Consequences

### Positive
- **Flexible queries**: SurrealQL handles complex tag/collection logic well
- **Single dependency**: One database for documents and relationships
- **No external setup**: Users don't need to install anything
- **Multi-database**: Can switch between databases (useful for dev/prod separation)

### Negative
- **Younger ecosystem**: Less battle-tested than SQLite/Postgres
- **Binary dependency**: Must bundle SurrealDB binary per platform
- **Learning curve**: SurrealQL has quirks vs standard SQL
- **Resource usage**: Heavier than SQLite for simple use cases

### Neutral
- Requires Express layer to manage connection (adds architecture complexity but also separation)

## Alternatives Considered

### A: SQLite
- Most proven embedded database
- Would need ORM or raw SQL for complex queries
- **Not chosen**: More boilerplate for the flexible queries Index needs

### B: LokiJS (in-memory + persistence)
- Pure JavaScript, no binary
- **Not chosen**: Less mature, concerns about data integrity at scale

### C: PostgreSQL (local)
- Most powerful, but requires separate installation
- **Not chosen**: Violates "no external setup" requirement

### D: Direct SurrealDB from renderer
- Skip Express layer, talk to DB directly
- **Not chosen**: Violates Electron security best practices (context isolation)

---

*Decision date: v0.2 (carried forward)*
*Applies to: v0.2+*
