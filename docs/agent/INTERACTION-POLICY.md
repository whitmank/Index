# Agent Documentation Policy

System instructions for efficient context management.

---

## Doc Categories

| Category | Use For | Speed |
|----------|---------|-------|
| **Agent Docs** | File paths, endpoints, schemas, patterns, IPC | <5 sec |
| **Human Docs** | Architecture decisions, rationale, design context | Slower |
| **ADRs** | Why architectural choices were made | 5-10 min |

---

## Quick Lookup

| Need | Doc | Path |
|------|-----|------|
| File location | FILE_REGISTRY.md | `docs/agent/FILE_REGISTRY.md` |
| API endpoint | API_ENDPOINTS.md | `docs/agent/API_ENDPOINTS.md` |
| Database schema | SCHEMA.md | `docs/agent/SCHEMA.md` |
| Code pattern | PATTERNS.md | `docs/agent/PATTERNS.md` |
| IPC channel | IPC_CHANNELS.md | `docs/agent/IPC_CHANNELS.md` |
| Term definition | GLOSSARY.md | `docs/agent/GLOSSARY.md` |
| Architecture | 0.3_technical-spec.md | `docs/2 - TECH SPEC/0.3_technical-spec.md` |
| Decisions | adr/ | `docs/2 - TECH SPEC/adr/` |

---

## Task-Based Routing

### Bug Fix / Small Change
1. Check FILE_REGISTRY.md → file location
2. Read that file
3. Check PATTERNS.md → match existing pattern
4. Implement

### Feature Implementation
1. Clarify requirements
2. Check FILE_REGISTRY.md → relevant files
3. Check API_ENDPOINTS.md / SCHEMA.md / IPC_CHANNELS.md → what changes needed
4. Check PATTERNS.md → code template
5. Read source file for context
6. Implement
7. Update agent docs if new endpoint/file/schema

### Architecture / Design Task
1. Read full Tech Spec (sections 1-8)
2. Read relevant ADRs
3. Check PRODUCT_VISION.md alignment
4. Create new ADR (ADR-000 template)
5. Propose with ADR

### Onboarding / First Run
1. Read QUICKSTART.md → What is Index?
2. Read PRODUCT SPEC → What do users do?
3. Read Tech Spec sections 1-3 → Architecture + Data Model
4. Read ADR-001, ADR-002, ADR-003, ADR-004, ADR-005 → Key decisions
5. Skim agent docs (FILE_REGISTRY, SCHEMA, API, IPC, PATTERNS)
6. Ready for tasks

---

## Context Rule

**Minimize token usage:**
- Agent docs first (always)
- Human docs only if:
  - Architecture question
  - Design decision needed
  - Uncertain about core concept
  - Creating new file/endpoint/table

**Stop and read more if:**
- Affects data model
- New file outside pattern
- New API endpoint
- Uncertain about terminology
- Changes IPC layer
- Changes database

---

## Update Rules

**Update agent docs immediately when:**
- New file created
- New API endpoint added
- New database table/field added
- New IPC channel added
- New code pattern emerges

**Same commit or follow-up commit before next task.**

**Agent docs are derivative:** If human docs change, regenerate agent docs from human source.

---

**v1.0 | January 2026 | Index v0.3**
