---
session: 020
timestamp: 2026-04-09T04:21:11Z
authored_by: Claude Sonnet 4.6
---

## decision — 04:30 UTC

PDF scrolling uses RAF-based continuous loop (8→5 px/frame) started on keydown, stopped on keyup. Replaces stepped scrollBy approach which felt choppy on held keys.

## decision — 04:45 UTC

D/→ with no selection selects the first item in the list (same behavior as down arrow from empty state), rather than triggering navForward. Implemented via `selectFirst()` imperative handle on ObjectListView exposed through forwardRef.

## synthesis — 04:50 UTC

D/→ now has three distinct behaviors depending on state: no selection → select first item; single object/space selected → navigate into it; multiple selected → no-op. This completes the directional nav model: left exits, right enters or focuses.

