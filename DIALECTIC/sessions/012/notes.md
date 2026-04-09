---
session: 012
timestamp: 2026-03-27T00:56:04Z
authored_by: Claude Sonnet 4.6
---

## observation — 01:15 UTC

Session focused on detail pane refinement and a significant tag creation bug. Key work: source card UI cleanup (URL display on hover, no tooltip), space-specific sort prefs fixed via key={activeSpaceId}, tag creation broken due to string::lowercase(NULL) failure in SurrealDB dedup query — fixed with IS NOT NONE AND IS NOT NULL guard. Dedup also made type-scoped so same-name tags can exist across different types. Kind tag promoted to primary field in detail pane, suppressed from the tags section below.

## observation — 06:45 UTC

Session continued with UI polish and typography exploration. + Add source replaced with inline SVG circle-plus adjacent to section header. Nav state persisted to localStorage for refresh survival. Spectral serif trialed and bundled locally (CSP required local font files); shelved in favor of Arial for simplicity — files retained for future use.

