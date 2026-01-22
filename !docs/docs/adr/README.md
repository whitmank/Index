# Architecture Decision Records

This directory contains Architecture Decision Records (ADRs) for Index.

ADRs document significant architectural decisions, including context, rationale, and consequences. They serve as a historical record of *why* things are the way they are.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-000](ADR-000-template.md) | Template | — |
| [ADR-001](ADR-001-uri-based-sources.md) | URI-Based Source Model | Accepted |
| [ADR-002](ADR-002-surrealdb-embedded.md) | SurrealDB as Embedded Database | Accepted |
| [ADR-003](ADR-003-electron-desktop.md) | Electron for Desktop Shell | Accepted |
| [ADR-004](ADR-004-tag-definitions-assignments.md) | Split Tags into Definitions and Assignments | Accepted |
| [ADR-005](ADR-005-collection-query-model.md) | Collection Query Model (AND/OR/NOT) | Accepted |
| [ADR-006](ADR-006-database-single-source-of-truth.md) | Database as Single Source of Truth | Accepted |

## Creating New ADRs

1. Copy `ADR-000-template.md`
2. Rename to `ADR-NNN-short-title.md` (next number in sequence)
3. Fill in all sections
4. Update this README with the new entry
5. Commit with message: `docs: add ADR-NNN short title`

## When to Write an ADR

Write an ADR when making decisions that:
- Are difficult to reverse
- Have significant impact on the codebase
- Involve trade-offs worth documenting
- Future developers (including yourself) will wonder "why?"

Not every decision needs an ADR. Use judgment.

## ADR Lifecycle

- **Proposed**: Under discussion, not yet decided
- **Accepted**: Decision made and in effect
- **Deprecated**: No longer recommended (explain why)
- **Superseded**: Replaced by another ADR (link to it)

---

*Last updated: January 2026*
