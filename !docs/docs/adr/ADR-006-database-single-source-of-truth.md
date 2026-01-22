# ADR-006: Database as Single Source of Truth

## Status

**ACCEPTED**

## Context

In v0.2, application state was split across multiple locations:
- **Database (SurrealDB)**: Objects, tags, collections, links
- **localStorage**: Pinned collections, UI preferences
- **React state**: Selection, filters, transient UI state

This caused problems:
1. **State fragmentation**: Had to remember which state lived where
2. **Sync issues**: localStorage and database could get out of sync
3. **No persistence guarantees**: localStorage can be cleared unexpectedly
4. **Testing difficulty**: Had to mock multiple state sources

The user expressed a clear architectural preference: use a "load-modify-persist" pattern where the database manages all persistent state.

## Decision

**All persistent application state lives in the database.**

localStorage is not used for any application state. The database is the single source of truth.

**State locations in v0.3:**

| State Type | Location | Notes |
|------------|----------|-------|
| Objects, tags, collections, links | Database | Core data |
| Pinned collections | Database (`pinned` field) | Was localStorage in v0.2 |
| Collection colors | Database (`color` field) | Already in database |
| User preferences | Database (future `settings` table) | If needed |
| Selection, focus, transient UI | React state (memory) | Not persisted |

**Load-Modify-Persist Pattern:**
1. **Load**: On startup, load state from database into memory (React state/store)
2. **Modify**: User actions update in-memory state AND trigger database writes
3. **Persist**: Database handles durability; app doesn't worry about save timing

## Consequences

### Positive
- **Single source of truth**: No confusion about where state lives
- **Reliable persistence**: Database handles durability properly
- **Easier testing**: Mock one data source, not multiple
- **Future-proof**: If sync is ever added, all state is already in database
- **No localStorage quirks**: Avoids browser storage limits, clearing, etc.

### Negative
- **Slightly more schema**: `pinned` field on collections, potential `settings` table
- **More database writes**: Actions that were localStorage-only now hit database
- **Startup dependency**: App needs database connection before showing state

### Neutral
- React state still holds transient/UI state (selection, etc.) — that's appropriate

## Migration Path

**Pinned collections:**
```javascript
// v0.2: localStorage
localStorage.getItem('pinnedCollections') // ["collections:abc", ...]

// v0.3: Database field
{ id: "collections:abc", pinned: true, ... }
```

Migration: Read localStorage, update matching collections in database, clear localStorage.

## Implementation Notes

**State Store (Zustand/Jotai):**
- Hydrate from database on startup
- Actions update store AND call database API
- Database is async, but UI responds immediately (optimistic updates)

**Error Handling:**
- If database write fails, revert optimistic update
- Show error to user
- Never leave store and database out of sync

## Alternatives Considered

### A: Keep localStorage for UI preferences
- "Pinned" is just UI preference, doesn't need database
- **Rejected**: Slippery slope; cleaner to have one rule (database is truth)

### B: Hybrid with sync layer
- Use localStorage as cache, sync to database
- **Rejected**: Adds complexity, still two sources of truth

### C: File-based preferences (JSON file)
- Store preferences in `~/.index/preferences.json`
- **Rejected**: Another state location to manage, database already exists

---

*Decision date: January 2026*
*Applies to: v0.3+*
