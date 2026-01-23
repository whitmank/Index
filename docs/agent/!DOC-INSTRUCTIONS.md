# Agent Documentation Instructions

## Purpose

The `/docs/agent/` folder contains documentation specifically optimized for coding agents and efficient context management. These documents are **derivatives** of the human-readable documentation (found in `/CORE/`, `/1 - PRODUCT SPEC/`, `/2 - TECH SPEC/`, etc.) and serve a distinct purpose:

**Goal:** Maximize agent efficiency and minimize token usage during development.

---

## Core Principles

### 1. **Token Efficiency**
- Remove all narrative, philosophy, and explanation
- Use tables, lists, and structured formats
- One-line descriptions instead of paragraphs
- Code examples only when essential
- No redundancy or repetition across documents

### 2. **Greppability**
- Organize for fast text search
- Use consistent header structure (`##`, `###`, `####`)
- Include file paths and line references
- Use code blocks for technical content
- Make scanning immediate

### 3. **Rapid Lookup**
- Documents should answer specific questions in seconds
- Index important terms in header comments
- Link to human docs for deep context
- Assume agent has limited context window available
- Provide "just the facts" references

### 4. **Derivative, Not Original**
- Do NOT invent new information
- Extract and reorganize from existing human docs
- Maintain accuracy and consistency with source material
- Update agent docs when human docs change
- Reference source documents explicitly

### 5. **Actionable Structure**
- Tables over prose
- Bullet points over paragraphs
- Examples over explanations
- Cross-references to source files
- Jump-to-file paths included

---

## Document Format Guidelines

### Headers
- Use `##` for top-level sections (searchable)
- Use `###` for subsections
- Use `####` for sub-subsections only if needed
- Make headers searchable keywords

### Tables
Preferred over lists when comparing multiple attributes:

```markdown
| Name | Type | Purpose | Example |
|------|------|---------|---------|
| objects | SurrealDB table | Stores all indexed items | `file:///path/to/file` |
```

### Lists
Use bullet points for simple sequences or single-attribute items:

```markdown
- Item 1 (brief description)
- Item 2 (brief description)
```

### Code Blocks
Only include when showing structure or patterns:

```typescript
// Minimal example, not tutorial
interface SourceHandler {
  scheme: string;
  canHandle(uri: string): boolean;
}
```

### File References
Always include full paths for navigation:

```
/Users/karter/files/dev/index-workspace/0.3/backend/database/server.js:42
```

Or relative from root:

```
backend/database/server.js:42
```

### Cross-References
Link to human docs for context:

```markdown
[See TECH SPEC for full architecture](../2%20-%20TECH%20SPEC/0.3_technical-spec.md)
```

---

## Document Checklist

Before completing an agent doc, verify:

- [ ] No narrative or explanation beyond context
- [ ] All tables use consistent formatting
- [ ] File paths included where relevant
- [ ] Headers are scannable (not paragraphs)
- [ ] One-liners for all descriptions
- [ ] Code examples are minimal
- [ ] No duplication across agent docs
- [ ] Links back to human source docs
- [ ] Agent can find answer in < 10 seconds

---

## Standard Agent Documents

The following documents should exist in `/docs/agent/`:

1. **SCHEMA.md** — Database tables, fields, types, constraints
2. **FILE_REGISTRY.md** — All important files, their purpose, one-liner
3. **PATTERNS.md** — Code conventions, templates, structure patterns
4. **IPC_CHANNELS.md** — Electron IPC channel names, data shapes
5. **API_ENDPOINTS.md** — All REST endpoints, methods, purposes
6. **GLOSSARY.md** — Key terms, one-line definitions (distinct from CORE/GLOSSARY.md)

---

## Maintenance

- **When to Update:** If human docs change, update agent docs within same task
- **Source of Truth:** Human docs are authoritative; agent docs are derived
- **Versioning:** Update docs with version changes (v0.3 → v0.4, etc.)
- **Sync Frequency:** Agent docs should stay <1 week behind human docs

---

## Example: Good vs. Bad

### ❌ Bad (Narrative, verbose)

```markdown
## Tags

Tags are a fundamental organizational concept in Index. Users can assign multiple
tags to objects, allowing flexible categorization. The tagging system is split into
two parts: tag definitions (which store metadata about tags) and tag assignments
(which link tags to objects). This design allows us to rename tags globally...
```

### ✅ Good (Token-efficient, scannable)

```markdown
## Tags

| Component | Table | Purpose |
|-----------|-------|---------|
| Definitions | `tag_definitions` | Metadata (name, color, description) |
| Assignments | `tag_assignments` | Links tags to objects |

**Key Benefit:** Rename tags globally by updating TagDefinition
```

---

## When to Reference Human Docs

**Use agent docs for:** File locations, API endpoints, data schema, patterns
**Use human docs for:** Why decisions were made, architecture rationale, design philosophy

Example: Agent needs to know IPC channel format → use `IPC_CHANNELS.md`
Example: Agent needs to understand why Electron was chosen → read `ADR-003` in human docs
