---
session: 005
session_timestamp: 2026-03-12T03:00:00Z
transcript: transcript.md
authored_by: Claude Sonnet 4.6
---

# Session 005 — Log

## Contradictions Surfaced

**Local ID vs. fully-qualified ID.** The stated architectural goal was "ID normalization at the IPC boundary" — but the implementation was incomplete. `normalizeRecord()` extracted only the local part of RecordId objects (`record.id?.id`), and LIVE SELECT sent raw un-normalized records directly to the renderer. The result: `id?.id || id` defensive patterns spread through the store and components, contradicting the stated intent. The architecture claimed a clean boundary; the code had no such boundary.

**`id?.id` as signal vs. symptom.** The immediate question was whether to fix the leak (normalize in `live-queries.js`) or address the underlying choice — local IDs vs. fully-qualified strings. These are different solutions with different long-term costs. Fixing the leak would preserve local IDs throughout while patching the gap. Switching to fully-qualified strings would eliminate the reconstruction burden in handlers and make IDs self-describing throughout the system.

**"One machine" framing in design docs.** PROJECT_DESIGN.md stated "one user, one machine, one database" as the local-first rationale. This contradicts Index's own data model: device origin tracking, multi-source objects, and the explicit design goal of a consistent semantic layer tied to user identity across many devices.

---

## Contradictions Resolved

**Local ID vs. fully-qualified: resolved in favor of fully-qualified.** The handler codebase was built around local IDs — `objects:${id}`, `tag_definitions:${tagId}` reconstruction throughout every handler. But Index is a graph application; IDs routinely cross table boundaries. Fully-qualified strings are SurrealDB's native ID format. The reconstruction pattern was invisible debt that would multiply with every new handler. Since v0.4 has no production data, the cost of switching was minimal. Synthesis: `normalizeRecord()` now uses `record.id?.toString?.()`, producing `"table:localId"` everywhere. All handler reconstruction removed. All `id?.id || id` patterns eliminated from store and components. Local SurrealDB data wiped for a clean start.

**`live-queries.js` as the normalization gap: resolved.** The root cause of the leakage was identified: LIVE SELECT bypassed the IPC handler boundary entirely, delivering raw RecordId objects to the renderer. Fixed by applying `normalizeRecord()` in `live-queries.js` before sending. The store now always receives plain strings regardless of source.

**"One machine" framing: corrected.** PROJECT_DESIGN.md updated to reflect the actual organizing principle: Index is organized around the user, not the machine. A person's collection spans many devices; local-first means data lives with the user, not on a server.

---

## Open Contradictions

- **Collection filtering is a no-op.** `_evaluateCollectionLocally()` ignores its query argument and returns all objects. `activateCollection` sets `activeCollectionId` but never calls `db:evaluateCollection`. The server-side evaluator is fully implemented and has no caller. Selecting a collection changes the UI state but not the displayed objects.
- **Graph edges absent.** Links are modeled in the data layer but GraphView renders no edges. The app's core value proposition — relationships — is structurally absent from the UI. Blocked until a relationship data model is designed.

---

## Current Synthesis

The v0.4 codebase is now structurally clean. The ID normalization refactor completed what the architecture promised: a single consistent ID format (`"table:localId"`) throughout all layers, with normalization applied at the point of emission (live queries) and the IPC boundary (handlers). The codebase structure was also clarified: `db/services/`, `dialogs/`, `db/connection.js`. All documentation was updated to reflect actual current state — BACKLOG, GLOSSARY, PROJECT_DESIGN, ABOUT, QUICKSTART all now describe v0.4 as it exists, not as it was planned. The system is ready for feature development. The two open contradictions (collection filtering, graph edges) are the next meaningful work.
