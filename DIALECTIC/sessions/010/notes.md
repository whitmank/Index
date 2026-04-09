---
session: 010
timestamp: 2026-03-26T02:46:25Z
authored_by: Claude Sonnet 4.6
---

## decision — 02:50 UTC

Settings menu is now escapable: Escape restores the previous view and space rather than defaulting to home. Return target is captured at navigation time via a ref so the caller's context is preserved.

## observation — 02:50 UTC

Backtick key (`) wired to the list view filter toggle — tap cycles objects/spaces, hold toggles combined view, mirroring the existing mouse hold behavior on the filter button.

## decision — 02:50 UTC

Added a Keybinds tab to Settings listing all current hotkeys grouped by context (Navigation, List View, Settings). Source of truth for shortcuts remains `useKeyboardShortcuts.js`; the tab is static documentation, not generated.

## synthesis — 02:50 UTC

Filter/sort state (`filterSide`, `filterCombined`, `sortField`, `sortDir`) was local component state in `ObjectListView`, lost on every unmount — including view toggle and space navigation. Resolved by lifting prefs into an App-level ref map keyed by `activeSpaceId`, persisted to `localStorage['index:space-prefs']`. Each space now retains its own filter/sort preferences across view toggles and app restarts.

## decision — 07:10 UTC

Space rules (any/all/none) were implemented in `CreateSpaceModal` but orphaned — space creation bypassed the modal and no edit affordance existed. Resolved by building `SpaceRulesSection` as an inline editor in the space detail pane, replacing the read-only rules display. Also fixed a latent bug where the read-only display rendered raw tag IDs instead of names.

## decision — 07:15 UTC

Source display in `ObjectDetailPane` changed from raw URI to `source.origin` badge (Web / device name). The `origin` field is already correctly set at write time by `determineOrigin()`.

## decision — 07:20 UTC

Refined the object detail pane: removed the INFORMATION section, replaced with a single quiet "Added" date row. Modified date removed entirely.

## synthesis — 07:40 UTC

Contradiction: `source.origin` is a plain string, not queryable in space rules, and provides no foundation for device-to-device file transfer. Resolved by lifting device identity into a first-class `devices` table with `sourced_from` relation edges (`object → device`). Space evaluation extended with `from_any` / `from_none` device rule arrays. `SpaceRulesSection` gains two device groups. Boot-time backfill migrates existing objects from `source.origin` strings to edges. The `origin` string is retained as-is — the edge layer is additive.
