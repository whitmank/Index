---
session: 017
session_timestamp: 2026-03-16T01:47:17Z
transcript: transcript.md
authored_by: Claude Sonnet 4.6
note: transcript recovered from JSONL; log authored retrospectively
---

# Session 017 — Log

## Contradictions Surfaced

**System tag editability flag ignored by UI** — `tag-types.js` already declared `media_type` as `editable: true`, but `deletable: false`. The `TagsView` `SystemTagsSection` component did not read or act on either flag — system tags were uniformly read-only in the UI regardless of their registry definition. The registry expressed intent that the code never honored.

## Contradictions Resolved

**Per-type editability wired through** — `media_type.deletable` set to `true` in the registry. `SystemTagsSection` now delegates to `SystemTagGroup` per type, reading `tagTypes[typeKey].editable` and `deletable` at render time:
- Media Type gains an inline `+` button in the group label and a `×` delete affordance on row hover
- File Type and Origin remain visually read-only
- The IPC `db:deleteTag` guard already read from the registry, so deletion was permitted at the DB layer once the flag was set

The registry is now the single source of truth for system tag behavior at all layers.

## Open Contradictions

*(Carried forward from prior sessions)*

- `display: false` system tags (`file_type`, `origin`) appear in CreateSpaceModal's tag pool — no display filter applied
- Graph edges absent — links in data model, not rendered; relationship model unresolved
- Object row click is a no-op — no detail view designed
- `addObjectToSpace` write semantic has no UI surface

## Current Synthesis

System tag type registry (`domain/tag-types.js`) is now authoritative at all layers. UI components read `editable`/`deletable` flags and render affordances accordingly. Media type tags are fully user-curated; other system tag types remain read-only by registry definition.
