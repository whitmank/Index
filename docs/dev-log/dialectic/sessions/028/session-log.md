---
session: 028
session_timestamp: 2026-03-17T22:18:05Z
transcript: transcript.md
authored_by: Claude Sonnet 4.6
---

# Session 028 — Log

## Contradictions Surfaced

**Documentation as lagging artifact** — The project had accumulated four living docs (GLOSSARY, ABOUT, BACKLOG, QUICKSTART) all authored at or before 2026-03-11. The codebase had gone through two major renames (`collections` → `spaces` → container model) and a complete architectural shift to edge-first relationships. The docs described a system that no longer exists. The contradiction: documentation that is supposed to be canonical was materially false as a description of the code.

**"Spaces" as a transitional ghost** — The word "spaces" appeared throughout the prior docs as if settled. It was not a stable concept — it was an intermediate name that was itself superseded by the container model. The docs needed to resolve not one rename but two (`collections` → `spaces` → objects with `container: true`) and clarify that neither prior concept survives.

**Edges as unnamed architecture** — The edge-first relationship model (`tagged`, `contains`, `excludes`, `typed` as `TYPE RELATION` tables) was fully implemented but nowhere described as a design principle. Prior docs described `tag_assignments` as a join table — a concept from the old model. The new model represents a meaningful architectural choice (direction is semantic, edges carry data, LIVE SELECT works on them directly) that had no documentation surface.

## Contradictions Resolved

**Documentation brought to code** — All four docs were rewritten against the live codebase (IPC handlers, preload, store, domain registry, export module, container service). Terminology is now sourced from the implementation, not from prior docs or session memory.

**"Collections" and "spaces" retired** — Both terms are explicitly named as obsolete in ABOUT.md. GLOSSARY.md contains no "Collection" section and no "Space" section. The canonical term is "container," defined precisely as `object { container: true }`.

**Edges given their own section** — GLOSSARY.md now has a dedicated "Edges" section explaining `TYPE RELATION`, the `in`/`out` field pattern, why edge normalization matters, the four tables in use, and the LIVE SELECT implication. ABOUT.md has an "Edges" section in the data model. This makes the architectural choice legible to a reader coming to the docs cold.

**Tag type names corrected** — Prior docs used `media_type`, `file_type` as system tag type names. Actual names from `SYSTEM_TAG_TYPES`: `medium`, `kind`, `file`, `origin`. Corrected throughout.

**IPC surface documented accurately** — Old collection/space methods (`evaluateCollection`, `createSpace`, `setSpaceOverride`, etc.) removed from docs. Current surface (`evaluateContainer`, `addContains`, `removeContains`, `addExcludes`, `removeExcludes`, `createTagType`, etc.) documented with signatures.

**Export layout corrected** — Prior docs showed `collections/` and `tag_assignments.json` in `~/.index/export/`. Actual export (from `export.js`): `objects/`, `tag_definitions/`, `tag_types/`, `tagged_edges.json`, `contains_edges.json`, `excludes_edges.json`, `typed_edges.json`.

**ORIENT.md updated** — All seeding race items cleared (resolved prior to session). Open contradictions section set to "None carried forward." Updated to reflect current container/edge architecture, AddressBar integration, and auto-pin on container create.

## Open Contradictions

None carried forward.

## Current Synthesis

Documentation is now synchronized with the codebase at v0.4.2. The four living docs collectively describe:

- The unified object/container model with no separate primitive for either
- The edge-first relationship architecture across four `TYPE RELATION` tables
- The tag type system as first-class `tag_types` records connected via `typed` edges
- The complete current IPC surface (what exists; what was removed)
- The actual export layout on disk
- The current UI component set and keyboard shortcuts

The codebase is feature-complete for its current scope. The remaining backlog items are well-defined gaps (graph edge rendering, object detail view, manual pin affordance, display filter in container builder) with no architectural ambiguity.
