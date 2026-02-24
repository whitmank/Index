# Bug Report: Sidebar Unmount During Data Reload

**Status:** FIXED
**Severity:** High
**Date:** 2026-02-23
**Author:** Claude Code (Anthropic)

---

## Problem

When updating sidebar data (adding/deleting sources, tags, etc.), the ObjectDetailSidebar would unmount and remount, causing:
- Visual flicker (sidebar slides out and back in)
- Lost focus and user context disruption
- Confusing UX during routine operations

### Reproduction Steps

1. Click a node to open ObjectDetailSidebar
2. Paste a URL into the "Add source" field
3. Observe: sidebar briefly slides out (close animation) then slides back in (open animation)
4. Repeat for any data update (delete source, add tag, etc.)

---

## Root Cause

**The loading state was unmounting the entire UI component tree.**

When a data update triggered `loadObjects()` (via file watcher), the store's `loading` state would be set to `true`. This changed the render condition in App.jsx:

```jsx
// BEFORE (Buggy)
{loading ? (
  <div className="loading">Loading...</div>
) : objects.length === 0 ? (
  ...
) : displayObjects.length === 0 ? (
  ...
) : (
  <>
    <GraphView ... />
    {selectedNodeId && <ObjectDetailSidebar ... />}
  </>
)}
```

**Flow:**
1. User adds source → local state updates (shows in sidebar)
2. IPC persists to DB
3. File watcher detects change → calls `loadObjects()`
4. Store sets `loading = true`
5. **Render condition becomes true** → replaces `<GraphView/>` + `<ObjectDetailSidebar/>` with `<div className="loading"/>`
6. **ObjectDetailSidebar unmounts** (slides out with CSS animation)
7. Store finishes loading → `loading = false`
8. **ObjectDetailSidebar remounts** (slides in with CSS animation)

The sidebar was never actually calling `onClose()` — React simply removed it from the DOM because the render condition changed.

---

## Solution

**Only show the loading state on initial load when no objects exist yet.**

Change the condition to:

```jsx
// AFTER (Fixed)
{loading && objects.length === 0 ? (
  <div className="loading">Loading...</div>
) : objects.length === 0 ? (
  ...
) : displayObjects.length === 0 ? (
  ...
) : (
  <>
    <GraphView ... />
    {selectedNodeId && <ObjectDetailSidebar ... />}
  </>
)}
```

**Key change:** `loading &&` instead of just `loading`

Now:
- On app startup (when objects don't exist yet): show loading
- During data updates (when objects already exist): keep showing the UI
- No more unmounting/remounting

---

## Architectural Pattern: Conditional State vs. State Transitions

This bug reveals an important distinction in React component architecture:

### ❌ Anti-Pattern: State as Condition

```jsx
// Don't do this
{isLoading ? <LoadingUI/> : <MainUI/>}
```

Problem: The `isLoading` state controls UI visibility globally. Any transient state change (`true` → `false`) unmounts entire component trees, losing context and user interaction state.

### ✅ Pattern: State Transitions with Existing State Preservation

```jsx
// Do this
{isLoadingWithNoData ? <LoadingUI/> : <MainUI/>}
```

Principle: **Distinguish between initial state (no data + loading) and update state (has data + reloading).**

- Initial load: Show loading → no existing UI to preserve
- Refresh/update: Keep existing UI → show subtle feedback (optional: spinner overlay)

### Application to Index

For this app:
- **Initial load:** No objects exist, show loading spinner (expected state)
- **File watcher reload:** Objects exist, keep showing graph/sidebar with fresh data (transient update)
- **Collection filter:** Objects exist but filtered results empty, show "No matching objects" (valid state)

---

## Files Modified

- `src/App.jsx` — Changed loading condition from `{loading ? ...}` to `{loading && objects.length === 0 ? ...}`

---

## Testing

✅ Click node → sidebar opens
✅ Add source (paste) → sidebar stays open, updates instantly
✅ Delete source → sidebar stays open, updates instantly
✅ Add tag → sidebar stays open
✅ Delete tag → sidebar stays open
✅ File watcher reload → sidebar remains stable
✅ Close sidebar (X/Escape) → closes as expected
✅ Delete object → sidebar closes gracefully

---

## Lessons Learned

1. **Loading states should be scoped to their context.** Global loading states can have cascading effects throughout the component tree.

2. **Distinguish between "initial" and "update" states.** They have different UX requirements:
   - Initial: User expects to wait for content
   - Update: User expects content to refresh in place

3. **State-driven unmounting is powerful but dangerous.** Monitor render conditions carefully; they can unmount entire subtrees unexpectedly.

4. **Data persistence != Visual persistence.** Just because data is being reloaded doesn't mean the UI should reset.
