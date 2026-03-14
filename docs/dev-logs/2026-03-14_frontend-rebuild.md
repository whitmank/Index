---
author: claude-sonnet-4-6
date: 2026-03-14
project: Index
version: v0.4
sessions: 009–015
---

# Development Log — 2026-03-14

## Session Summary

Built the entire v0.4 frontend from scratch across seven sessions. The work progressed through three distinct phases: (1) conceiving and implementing the Space data model, including a full rename of the `collections` system; (2) building the initial UI surface — SpacesView, CreateSpaceModal, AddressBar, and a Calendar system space; and (3) a significant rearchitecture that demoted Calendar from a space to a view type, enabling any space to be viewed through list, calendar, or graph lenses. The session cluster concluded with a command palette navigation system, a Tags management view, Settings promoted to a full page, and a GraphView viewport fix.

The frontend went from zero rendered content to a navigable, multi-view application with live reactivity throughout.

---

## Activities Completed

### Space Model — Conception and Rename (Sessions 009–010)

- **Space model defined**: A space is a named subset of [all] defined by tag conditions, with both read and write semantics. Read: entering a space evaluates its query and populates `spaceObjects`. Write: placing an object in a space assigns any missing `query.all` tags to it.
- **`collections` → `spaces` rename**: Total rename across all layers — SurrealDB table, live-queries IPC channel, export directory, all IPC handler strings (`db:createSpace`, `db:updateSpace`, `db:deleteSpace`, `db:evaluateSpace`), preload API surface, and store interface. The word "collections" no longer appears in active code.
- **Store rewritten** (`src/store/index.js`): `activeSpaceId`, `spaceObjects`, `enterSpace`, `exitSpace`, `toggleSpace`, `getDisplayObjects`, `getAllSpaces`, `_reevaluateActiveSpace`, `addObjectToSpace`. LIVE SELECT mutations re-evaluate the active space automatically. `getDisplayObjects()` returns `spaceObjects` when in a space, all objects otherwise.
- **Write rule settled**: Only `query.all` tags are assigned when placing an object in a space. `query.any` is ambiguous (which qualifying tag?); `query.none` is contradictory. Ignored for write, read-only for filtering.

### Initial UI Surface (Session 010)

- **SpacesView** (`src/components/SpacesView.jsx` / `.css`): Card grid, one card per space. Each card shows a tinted preview area with the space's initial and tag pill cluster (up to 5 pills, `none`-tags in red), plus the space name and a human-readable rule summary. System All card gets dashed border treatment. "New space" dashed slot wired to CreateSpaceModal.
- **CreateSpaceModal** (`src/components/CreateSpaceModal.jsx` / `.css`): Three-column drag-and-drop interface (Must have ALL / Has ANY / Has NONE). Tags are draggable between pool and columns. Each column has an inline search input with dropdown. Inline tag creation: typing a name with no existing match shows a `Create "..."` option; selecting it creates the tag and lands it in that column. Extended later to handle both create and edit (optional `space` prop).
- **AddressBar** (`src/components/AddressBar.jsx` / `.css`): Persistent navigation strip, always visible above the content area. Three zones: left (back chevron), center (current view name pill), right (view switcher, added in session 013). Back button always renders — disabled and greyed when there is no prior context, never absent.
- **ALL navigation fix**: `enterSpace(SYSTEM_ALL_ID)` was treating the system space as "exit." Fixed: `null` = home grid, `SYSTEM_ALL_ID` = inside All, any user space ID = filtered space.

### Calendar as System Space (Session 011)

- **CalendarView** (`src/components/CalendarView.jsx` / `.css`): Monthly grid with prev/next navigation. Days with objects show a filled dot. Today highlighted; future dates muted. Clicking a day calls `enterCalendarDay(dateStr)`.
- **DayView** (`src/components/DayView.jsx` / `.css`): Renders `spaceObjects` pre-filtered by `enterCalendarDay`. Object rows with name and source-count badge. Empty state message.
- **Store additions**: `SYSTEM_CALENDAR_ID`, `systemCalendar` system space, `activeCalendarDate`, `enterCalendarDay`, `exitCalendarDay`, `getDatesWithObjects`. Back navigation handles the calendar → day → back to grid → back to home chain.
- **Two-row home grid**: System spaces (All, Calendar) in top section; user spaces + "New space" in bottom section, separated by a hairline rule.
- **Rename**: `name: 'ALL'` → `name: 'All'`.

### Views Architecture Rearchitecture (Sessions 012–013)

The deepest structural change of the sprint. Calendar was reclassified from a space to a view type, resolving the routing exception problem and enabling any space to be seen through any lens.

- **`systemCalendar` removed** from store and home grid. Calendar is no longer a navigable space.
- **`activeView: 'list' | 'calendar' | 'graph'`** added to store. `setView(viewType)` action. `enterSpace` sets `activeView` from `space.default_view ?? 'list'`. `exitSpace` resets to `'list'`.
- **App.jsx routing** is now `activeView`-driven — no more `isCalendar` ID check. Three branches: `activeView === 'list'` → ObjectListView, `activeView === 'calendar'` → CalendarView or DayView (depending on `activeCalendarDate`), `activeView === 'graph'` → GraphView.
- **View switcher** added to AddressBar right slot: three buttons (≡ list / ▦ calendar / ⬡ graph), visible whenever inside a space.
- **`getDatesWithObjects()`** made space-aware: uses `spaceObjects` when in a user space, so the calendar grid reflects only dates with objects in the current space. Uses `_calendarBase` snapshot when in a day view to keep the grid accurate.
- **`enterCalendarDay` / `exitCalendarDay`** updated: saves pre-day `spaceObjects` as `_calendarBase` before filtering; restores on exit.
- **`default_view`** added to system space definitions and persisted on user space creation (`db:createSpace` handler updated). Upgrade path clear: add the column to the DB schema and surface in CreateSpaceModal if user-configurable view types are needed.
- **GraphView restored**: `src/components/GraphView.jsx` restored from git history (`9500f83`). `src/lib/forceSimulation.js` copied from `src/_archive/`. `src/styles/GraphView.css` restored from `src/components/_archive/`. Wired into App.jsx as the graph view branch.
- **ObjectListView** (`src/components/ObjectListView.jsx` / `.css`): Modular component accepting `objects[]` as props. Rows show a type badge, object name, primary URI truncated, and `created_at` date. Parent is responsible for filtering; component is purely presentational.
- **Space card 3-dot edit menu**: `CreateSpaceModal` extended with optional `space` prop for edit mode. `⋯` button appears on user space card hover; opens a dropdown with "Edit."
- **Reactivity bug fixed**: `getDisplayObjects` as a stable Zustand function reference never triggers re-renders when `spaceObjects` changes. Fixed by subscribing to `spaceObjects` and `objects` directly in App.jsx and computing `displayObjects` inline.

### Command Palette, Tags View, Settings Page (Session 014)

- **CommandPalette** (`src/components/CommandPalette.jsx` / `.css`): Fixed overlay, auto-focused input on open, filters a static COMMANDS list by typed string (includes match, case-insensitive). Arrow keys move selection, Enter executes, Escape closes, click-outside closes. Commands: `spaces`, `tags`, `settings`. Triggered by CMD+K.
- **TagsView** (`src/components/TagsView.jsx` / `.css`): Two sections — user tags (inline name edit, color swatch, delete button) and system tags (read-only, grouped by `type`: `media_type`, `file_type`, `origin`). Store extended with `deleteTag` (optimistic local remove) and `updateTag` (optimistic local merge), wrapping existing IPC handlers.
- **SettingsView** (`src/components/SettingsView.jsx` / `.css`): Settings content (General/Window/Appearance tabs) extracted from `SettingsModal` into a full-page component. `SettingsModal.jsx/css` deleted.
- **Navigation model**: `activeTopLevelView: 'spaces' | 'tags' | 'settings'` local state in App.jsx. `navigateTo(id)` handler: navigating to Spaces or Tags exits any active space first. Settings is a view, not a modal.
- **Keyboard shortcuts added**: CMD+1 → Spaces, CMD+2 → Tags, CMD+3 → Settings, CMD+K → command palette. `useKeyboardShortcuts` extended with `COMMAND_PALETTE`, `VIEW_SPACES`, `VIEW_TAGS`, `VIEW_SETTINGS` entries.
- **Back chevron always visible**: `AddressBar` always renders the back button; disabled (`opacity: 0.3`, no cursor change, no hover) when `onBack` is null.
- **CSS design system corrected**: TagsView, SettingsView, and CommandPalette had been written with CSS variable references that fell back to dark-theme values. Rewritten with hardcoded light-theme values matching the rest of the app (`#333` body text, `rgba(0,0,0,0.07–0.12)` borders, `rgba(255,255,255,0.55)` card surfaces).
- **Address bar label**: `'Home'` → `'Spaces'`.

### GraphView Fix and Final Refinements (Session 015)

- **GraphView CSS fixed**: `src/styles/GraphView.css` had been overwritten with JSX source at some earlier point, leaving zero CSS rules applied to `.graph-view`. The SVG collapsed to browser intrinsic size (~300×150px). Replaced with real CSS: `display: block; width: 100%; flex: 1; min-height: 0`. Node circles, labels, hover, and selected states styled.
- **ResizeObserver**: Replaced `window.addEventListener('resize', ...)` with `ResizeObserver` on the SVG element itself. More accurate for Electron layout-driven resizes. `dimensions` added to simulation effect dependency array so resize re-centers the graph.
- **Node/label colors corrected**: CSS assumed dark theme — labels were near-white, nodes were `#4a9eff`. Corrected to `#333333` (both nodes and labels) to match the app's light-background palette.
- **Calendar view compacted**: `aspect-ratio: 1` on `.calendar-cell` caused cells to be as tall as wide — with a wide window, 5–6 rows couldn't fit on screen. Removed. Grid now uses `grid-auto-rows: 1fr` and `flex: 1; min-height: 0` to distribute height across available space. Full month fits on one screen.
- **CMD+A shortcut**: Navigates directly to the All space (`enterSpace(SYSTEM_ALL_ID)`) from anywhere. Added `VIEW_ALL` entry to `useKeyboardShortcuts`.
- **All card removed from home grid**: System spaces section removed from `SpacesView`. All is now accessed exclusively via CMD+A; the home grid shows only user spaces.

---

## Files Changed

### New Files

| File | Purpose |
|------|---------|
| `src/components/SpacesView.jsx` / `.css` | Home grid — one card per navigable space |
| `src/components/CreateSpaceModal.jsx` / `.css` | Space creation and editing modal (drag-and-drop, inline tag creation) |
| `src/components/AddressBar.jsx` / `.css` | Persistent navigation strip with view switcher |
| `src/components/CalendarView.jsx` / `.css` | Monthly calendar grid; dates with objects marked |
| `src/components/DayView.jsx` / `.css` | Object list for a selected calendar day |
| `src/components/ObjectListView.jsx` / `.css` | Modular object list, receives `objects[]` as props |
| `src/components/CommandPalette.jsx` / `.css` | CMD+K command palette for top-level navigation |
| `src/components/TagsView.jsx` / `.css` | Tags management page (edit/delete user tags, read system tags) |
| `src/components/SettingsView.jsx` / `.css` | Settings as a full page (replaces SettingsModal) |
| `src/lib/forceSimulation.js` | D3 force simulation logic (restored from archive) |

### Modified Files

| File | Changes |
|------|---------|
| `src/store/index.js` | Full rewrite: spaces model, `activeSpaceId`, `spaceObjects`, `activeView`, `activeCalendarDate`, `_calendarBase`, `enterSpace`, `exitSpace`, `setView`, `enterCalendarDay`, `exitCalendarDay`, `getDatesWithObjects`, `addObjectToSpace`, `deleteTag`, `updateTag`, `getAllSpaces`, `getDisplayObjects` |
| `src/App.jsx` | Full rewrite: space/view/top-level routing, command palette wiring, keyboard shortcut dispatch, address bar label logic, `navigateTo` handler |
| `src/hooks/useKeyboardShortcuts.js` | Added: `COMMAND_PALETTE` (CMD+K), `VIEW_SPACES` (CMD+1), `VIEW_TAGS` (CMD+2), `VIEW_SETTINGS` (CMD+3), `VIEW_ALL` (CMD+A) |
| `src/components/GraphView.jsx` | Restored from git; `ResizeObserver` replaces `window.resize`; `dimensions` in simulation dep array |
| `src/styles/GraphView.css` | Replaced JSX content with real CSS; node/label styling corrected for light theme |
| `src/components/CalendarView.css` | Removed `aspect-ratio: 1`; `grid-auto-rows: 1fr` for single-screen fit |
| `src/App.css` | Removed ad-hoc `space-header` styles; added back-button disabled state |
| `electron/main/db/connection.js` | `'collections'` → `'spaces'` in table initialization |
| `electron/main/db/live-queries.js` | `db.live('spaces', ...)`, channel `live:spaces` |
| `electron/main/db/export.js` | Export table and directory: `collections` → `spaces` |
| `electron/main/ipc/db-handlers.js` | Handlers renamed to `createSpace/updateSpace/deleteSpace/evaluateSpace`; SQL `spaces`; `default_view` persisted on create |
| `electron/preload/index.js` | All `db.*` methods renamed to space language; `onSpacesLive` |

### Deleted Files

| File | Reason |
|------|--------|
| `src/components/SettingsModal.jsx` / `.css` | Replaced by `SettingsView` |

---

## Key Decisions

- **Spaces over collections**: "Collections" was eliminated entirely — not just renamed in the UI, but renamed at the DB table level. Conceptual clarity was the driving reason; the word was identified as a source of future confusion with the space model.

- **Write rule: `query.all` only**: When placing an object in a space, only `query.all` tags are assigned. `query.any` is ambiguous; `query.none` is contradictory. This rule is simple and correct in all cases.

- **Calendar as a view, not a space**: Calendar was initially implemented as a system space peer to All. Reclassifying it as a view type applied to any space resolved the routing exception problem (`isCalendar` ID checks) and enabled a more general model — any space can be seen through any lens. The Finder analogy (same directory, multiple view types) anchored the decision.

- **`default_view` stored in space records, not in UI**: `view_type` lives at the store level (system spaces) and DB level (user spaces). Not surfaced as a user-configurable option in `CreateSpaceModal` — no second view type to choose from at creation time. Upgrade path is clear.

- **Command palette as navigation**: Rather than adding visual chrome (a sidebar, a nav bar), the command palette (CMD+K) was chosen as the primary navigation mechanism between top-level views. Preserves visual real estate; extensible to search later.

- **Settings as a page, not a modal**: After the command palette pattern was established, having Settings as a modal overlay was inconsistent. All top-level destinations are now full pages with identical navigation semantics.

- **Reactivity: subscribe to data, not to computed functions**: `getDisplayObjects` is a stable Zustand function reference — subscribing to it never triggers re-renders. Subscribing to `spaceObjects` and `objects` directly and computing inline is the correct Zustand pattern for derived display values.

- **CMD+A removes the All card**: The All card on the home grid became redundant once a direct keyboard shortcut existed. Removing it gives user spaces more grid presence and reduces visual noise on the home screen.

---

## In Progress / Next Steps

- **`display: false` system tags in space builder**: `file_type` and `origin` tags are domain-hidden but still appear in CreateSpaceModal's tag pool (raw `tags` array, no display filter). Needs a filter on `tag.display !== false` (or equivalent) before rendering the pool.
- **Graph edges**: Relationship links are modeled in the data layer but not rendered in GraphView. Blocked on relationship data model design.
- **Space evaluation coverage**: `evaluateSpace` is now properly wired, but complex `any`/`none` query combinations have not been stress-tested against real data.
- **Clicking an object row**: ObjectListView renders rows but clicking them does nothing. Object detail view not yet designed.
- **`addObjectToSpace` UI surface**: The write semantic exists in the store but there is no UI affordance for a user to place an object into a space by dragging or otherwise.

---

## Technical Notes

- **SurrealDB table is `spaces`**: Any direct DB queries or external tooling should use `spaces`, not `collections`. The rename is total.
- **`SYSTEM_ALL_ID = '__system_all'`**: The All system space is a frontend-only construct. It has no record in the DB; `getDisplayObjects()` returns all objects when `activeSpaceId === SYSTEM_ALL_ID` and `spaceObjects` is null.
- **`_calendarBase`**: When entering a calendar day, the current `spaceObjects` is saved as `_calendarBase` before overwriting it with the day's filtered result. `exitCalendarDay` restores it. `getDatesWithObjects` uses `_calendarBase` when a day is active so the calendar grid stays accurate.
- **GraphView CSS**: The file at `src/styles/GraphView.css` was overwritten with JSX source at some point (likely a tooling error during the restore). The fix is in the commit log.
- **Source**: `/Users/karter/files/dev/index-workspace/0.4`
- **Sessions covered**: 009–015 (2026-03-14)
