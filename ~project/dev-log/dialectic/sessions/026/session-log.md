---
session: 026
session_timestamp: 2026-03-16T22:08:13Z
transcript: transcript.md
authored_by: Claude Sonnet 4.6
status: complete
---

<!-- authored by Claude Sonnet 4.6 -->

# Session 026 — Log

## What Was Built

Continued from session 025. Executed the same bug fix (SurrealQL reserved word in ORDER BY), navigation and settings consolidation, tag type system rename, and tag library UI refactor — confirming that sessions 025 and 026 covered largely overlapping ground, either as parallel branches or a repeated implementation pass. Closed with planning for the `tag_types` table refactor.

## Dialectical Exchange

**Bug — `objects:all` not at root**: Same reserved word issue as session 025. `evaluateContainer` was silently failing due to `ORDER BY \`order\``. Fixed: sort in JavaScript. Pattern established: when SurrealDB dialect conflicts with intent, defer to application-layer logic.

**Navigation — modal duplication**: SpaceNavigator and CommandPalette both used overlay modal pattern. User intuition: navigation should be grounded in the interface, not floating above it. Resolved: SpaceNavigator merged into AddressBar as in-place dropdown.

**Keyboard shortcut regression**: During removal of CMD+1 and CMD+2, CMD+, (Settings) was accidentally removed. User feedback: "NOPE NOT WHAT I ASKED YOU TO DO." Corrected. Lesson: when removing bindings, be atomic and explicit about what is being kept. Regressions damage trust even when small.

**Semantic collision — medium vs. kind**: Same ontological contradiction as session 025. `media_type` conflating signal format (derivable, closed) with semantic form (asserted, open). Resolved: `medium` (signal) and `kind` (form). Migration added to `connection.js`.

**Data constraint — `universal` flag**: Proposed to mark types that all objects must carry. User rejected: "we'll be flexible with our data, not requiring any object to have a certain set of properties." Data model stays flexible; constraints belong in the UI. Removed from domain model.

**User-defined typed tags**: Users want custom tag types (e.g., `color: blue`) but current model stores type as a string field on `tag_definitions`. Two approaches considered:
- Inferred: a type exists because a tag with that type exists — simple, messy at scale
- Explicit: a type is a registered record; can exist with no members — structured, higher friction

User chose explicit registration. This required a schema change. Designed but not implemented.

## Decisions Finalized

- Four system tag types: `medium`, `kind`, `file`, `origin`
- `medium` and `kind`: user-visible; `file` and `origin`: auto-derived, read-only
- AddressBar is the primary navigation surface; SpaceNavigator removed
- Keyboard shortcuts: CMD+, → Settings; CMD+K → Command Palette; CMD+L → Address bar; CMD+/ → Root
- "ALL" (capitalized) for the system container; "Custom" for untyped user tags
- Two-panel master-detail for tag library; alphabetic sorting; all types always visible
- Command palette shows no default list when query is empty

## Architectural Direction Decided — Not Yet Implemented

**`tag_types` table + `typed` edge**:
- New table: `tag_types` with rows `{ id: tag_types:kind, name, label, system, editable, ... }`
- New edge table: `typed` — `tag_definitions → typed → tag_types` (SurrealDB RELATE)
- System types seeded at boot via UPSERT
- User-defined types: new rows in `tag_types`
- Untyped tags: no `typed` edge (absence = untyped)
- Replaces `WHERE type = 'kind'` patterns with edge traversal: `->typed->tag_types.name = 'kind'`
- ~30 query/call sites affected across backend and frontend
- Plan drafted; implementation is next

## Carried Forward

- **Tag types refactor** — schema change to `tag_types` table + `typed` edge. Plan ready.
- `medium` signal detection — how/when to auto-derive signal type at capture time
- Graph visualization — not yet built
- Object detail view — `onObjectOpen` still stubbed
- Manual pinning UI — no affordance for `addContains`
