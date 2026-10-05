---
session: 012
session_timestamp: 2026-03-14T17:05:10Z
authored_by: Claude Sonnet 4.6
transcript: transcript.md
---

# Session 012 — Log

## Contradictions Surfaced

**Calendar is not a space — it's a view.**
The central rearchitecture of the session. The user shared a screenshot and named the contradiction directly: Calendar as a system space is wrong. The Finder analogy clarified it — the same directory can be viewed as icons, list, columns, or gallery. Same data, different lens. Applied to Index: any space should be viewable through any view type (list, calendar, graph). Calendar is a view of whatever space you're in, not a space of its own.

This resolved the routing exception problem (`isCalendar` flag) and the two-row system/user separation: if Calendar isn't a space, it doesn't appear on the home grid at all.

**`view_type` at the store vs. DB level.**
After proposing `view_type` on space objects to clean up App.jsx routing, the question was raised: why not persist it to the DB? Named and resolved: system spaces don't exist in the DB at all; user spaces currently have only one possible view type. Persisting it to the DB would be premature — no UI to assign it, no second view type to choose from. Store-only for now with a clear upgrade path when needed.

## Contradictions Resolved

**Two-row home grid implemented.**
System spaces (All, Calendar) top section; user spaces + "New space" button bottom section. (This was the carry-in plan from session 011.)

**ObjectListView built.**
Modular component taking `objects[]` as props. Renders rows: type badge, name, primary URI truncated, `created_at` date. Parent is responsible for filtering; component stays dumb. Wired into App.jsx for all non-calendar spaces.

**Calendar rearchitected as a view.**
`systemCalendar` removed from store. `activeView: 'list' | 'calendar' | 'graph'` added. `setView()` action. `enterSpace` sets `activeView` from `space.default_view`. App.jsx routing is now `activeView`-driven rather than ID-driven. The routing exception problem is structurally resolved.

**`view_type` / `default_view` property established.**
System spaces have `default_view` hardcoded. User spaces will have `default_view: 'list'` written on creation (DB handler updated). `view_type` is store-level; DB extension path is clear if user-configurable view types are needed later.

**GraphView unarchived and wired.**
User answered "unarchive and wire it" when asked about the archived GraphView. GraphView, forceSimulation, and GraphView.css restored from git/archive. Wired as a third view type in App.jsx.

**3-dot menu on space cards.**
`CreateSpaceModal` generalized to handle both create and edit (optional `space` prop). `⋯` button appears on card hover, opens dropdown with "Edit" option.

## Open Contradictions

- **GraphView viewport** — wired but not yet rendering correctly (sizing issue surfaced during testing; session ended before it could be addressed).
- **Tags management** — no top-level Tags view exists. Tags are created inline during space creation only.

## Current Synthesis

The views architecture is established and implemented. Spaces hold objects; views are a lens applied to the active space's objects. Any space can be viewed through list, calendar, or graph. The view switcher lives in the AddressBar right slot. `activeView` in the store is set on space entry from `default_view`, switchable at any time.

Calendar is no longer a special routing case. GraphView is restored and wired. ObjectListView is modular and functional. The home grid shows user spaces only — system spaces (All) are accessed by other means.
