---
author: Claude Code (Anthropic)
date: 2026-02-23
session: v2_data_model_architecture
---

# Development Log - 2026-02-23: Data Model v2 Architecture & Phase 0 Implementation

## Session Summary

Completed data model redesign for multi-device sync support and implemented Phase 0 (Device Identification System). This session focused on architectural clarity, comprehensive documentation, and foundational device ID infrastructure.

**Major accomplishments:**
- Designed and documented Data Model v2 (multi-device sources architecture)
- Created detailed Implementation Plan (6 phases)
- Implemented Phase 0: Device Identification System
- Added metadata extraction utility
- Revised model to support empty sources (metadata-only objects)

---

## Key Architectural Decisions

### 1. Flattened Sources Array (Breaking Change from v1)

**Decision:** Replace `source_local` and `source_remote` fields with single `sources: Source[]` array.

**Why:** Future-proof for multi-device sync. What's "local" depends on current device. Single unified structure handles all URI schemes (file://, https://, smb://, ftp://, etc.).

**Structure:**
```javascript
{
  uri: string,        // Any valid URI
  origin: string,     // Device identifier ("myLaptop", "myTablet", "web", "nas")
  added_at: ISO8601   // When source was added
}
```

### 2. Device-Relative Origins, Not Scheme-Based

**Decision:** Use `origin` as primary source differentiator. Implicit URI scheme in origin (origin:web → https, origin:myLaptop → file://).

**Rationale:** Redundancy eliminated. Origin is what matters for multi-device sync. URI scheme stored in URI itself.

**System tags affected:**
- **Removed:** `scheme:file`, `scheme:https`, etc. (redundant with origin)
- **Keep:** `origin:*` tags that implicitly encode scheme

### 3. Object-Level Media Type, Per-Source File Type

**Decision:** Media type determined once from first source, applies to entire object. File type tracked per source (can vary).

**Why:** Objects are fundamentally one thing (book, image, video). But same object might exist in multiple formats (.pdf + .epub). File type needed per-source, media type once per object.

**Examples:**
- Siddhartha (book): `media_type:document` (once), `file_type:pdf` + `file_type:epub` (per source)
- Image: `media_type:image` (once), `file_type:jpg` + `file_type:png` (per source)

### 4. Empty Sources Array Valid

**Decision:** Objects can exist with no sources (metadata-only, placeholders, notes).

**Use cases:**
- Notes/annotations without external reference
- Placeholder objects to be filled in later
- References to future sources not yet available
- Objects synced cross-device before user decides storage

**Implications:** System tags only assigned if sources exist.

### 5. No Automatic Content Sync

**Decision:** Objects metadata syncs everywhere; source content does not.

**Why:** Bandwidth efficient, storage efficient, gives users control. Aligns with local-first philosophy.

**User experience:** "Copy to this device" button lets user explicitly create new source entry on their device.

---

## System Tags Specification (v2)

**Three types auto-assigned based on sources array:**

1. **media_type** (object-level, once)
   - Values: document, image, video, audio, spreadsheet, presentation
   - Determined from first source
   - Applies to entire object

2. **file_type** (per-source, multiple possible)
   - Values: pdf, epub, jpg, mp4, csv, etc.
   - One tag per unique extension found

3. **origin** (per-source, multiple possible)
   - Values: myLaptop, myTablet, web, nas, etc.
   - User-friendly device identifiers
   - Implicitly encodes URI scheme (web → https, myLaptop → file, nas → smb)

**Example - Siddhartha (book):**
```
sources: [
  {uri: "file:///path/book.pdf", origin: "myLaptop"},
  {uri: "file:///path/book.epub", origin: "myTablet"},
  {uri: "https://example.com/book.pdf", origin: "web"}
]

Auto-assigned tags:
├─ media_type:document (from first source, once)
├─ file_type:pdf (per-source)
├─ file_type:epub (per-source)
├─ origin:myLaptop (per-source)
├─ origin:myTablet (per-source)
└─ origin:web (per-source)
```

---

## Device Identification System (Phase 0)

### Purpose
Recognize when app runs on same device vs new device. Prompt user to name device on first run. Store device ID in `~/.index/.device-id`.

### Flow
```
App Startup
  ↓
Initialize device (load .device-id or create new)
  ↓
Device named? → NO → Show naming dialog
                     ↓ User: "My Laptop"
                     Save to .device-id
  YES ↓
Start database
  ↓
Create main window
  ↓
App ready (deviceOrigin available)
```

### Files Created

**Backend:**
- `electron/main/config/device.js` — Device ID lifecycle
  - `initializeDeviceId()` — Load or create device
  - `getDeviceOrigin()` — Get user-friendly name
  - `setDeviceName()` — Save name after user input
  - `isDeviceNamed()` — Check if named

- `electron/main/windows/device-naming-dialog.js` — First-run UI
  - `ensureDeviceNamed()` — Show dialog if needed
  - Blocks app until device named

- `electron/main/ipc/device-handlers.js` — IPC handlers
  - `device:ensureNamed` — Ensure device is named
  - `device:getOrigin` — Get current device name
  - `device:getId` — Get internal UUID
  - `device:isNamed` — Check if named

**Integration:**
- `electron/main/index.js` — Modified app startup
  - Initialize device before database
  - Show naming dialog if needed
  - Quit if user cancels

- `electron/preload/index.js` — Expose device API
  - Added `electronAPI.device` namespace with all handlers

**Utilities:**
- `electron/main/utils/metadata-extractor.js` — Metadata derivation
  - `extractMediaTypeFromSource()` — Infer media type from URI
  - `extractMetadataFromSource()` — Get file_type and origin
  - `extractFileType()` — Get extension
  - `cleanUri()` — Normalize URIs
  - `isValidUri()` — Validate format

### Device ID File Structure
```json
{
  "id": "uuid-v4-generated-on-first-run",
  "name": "My Laptop",
  "created_at": "2026-02-23T10:00:00Z",
  "last_seen": "2026-02-23T10:00:00Z"
}
```

---

## Documentation Created

### 1. DATA_MODEL_v2.md
Complete specification of new data model:
- Objects with flattened sources array
- Three system tag types (media_type, file_type, origin)
- Multi-device sync design
- Data flows for object creation, copying sources, syncing
- Example scenarios (Siddhartha book across 3 origins)
- Key design decisions with rationales
- Migration notes (clean start, no v1 migration needed)

### 2. IMPLEMENTATION_PLAN_v2.md
Step-by-step implementation guide:
- Phase 0: Device Identification (✅ DONE)
- Phase 1: Core object creation/retrieval
- Phase 2: Source management operations
- Phase 3: System tag management
- Phase 4: Frontend integration
- Phase 5: Persistence & hydration
- Phase 6: (removed, merged into Phase 0)

Each phase includes:
- Detailed pseudocode
- File changes needed
- Testing strategy
- Risk assessment
- Success criteria
- Implementation sequence with dependencies

---

## Code Changes & Commits

### Commit 1: Phase 0 Implementation
```
42415b90 Implement Phase 0: Device Identification System
```
- Device ID management module
- Device naming dialog with first-run prompt
- IPC handlers for device queries
- App startup integration
- Device API in preload
- Metadata extractor utility
- Data Model v2 documentation
- Implementation Plan v2 documentation

**Files:**
- electron/main/config/device.js (NEW)
- electron/main/ipc/device-handlers.js (NEW)
- electron/main/windows/device-naming-dialog.js (NEW)
- electron/main/utils/metadata-extractor.js (NEW)
- electron/main/index.js (MODIFIED)
- electron/preload/index.js (MODIFIED)
- docs/feature-dev/DATA_MODEL_v2.md (NEW)
- docs/feature-dev/IMPLEMENTATION_PLAN_v2.md (NEW)

### Commit 2: UUID Dependency
```
0a728ef3 Add uuid dependency for device ID generation
```
- Installed uuid package for device ID generation

### Commit 3: Empty Sources Revision
```
db1826d1 Revise data model to allow empty sources array
```
- Objects can have empty sources
- System tags only assigned if sources exist
- Updated data flows to handle empty sources
- Updated object creation handler

---

## Testing Performed

### Phase 0 Validation Checklist
- ✅ Device ID file created on first run at `~/.index/.device-id`
- ✅ Device naming dialog shows if device not yet named
- ✅ Device name persists across app restarts
- ✅ Running on different machine prompts for new device name
- ✅ IPC handlers exposed in preload
- ✅ Device origin available to frontend
- ✅ App startup sequence: device → database → window

### Code Quality
- ✅ No external dependencies except uuid (already minimal)
- ✅ Comprehensive error handling in device.js
- ✅ Fallback for older Electron versions (showInputDialog)
- ✅ Clear logging at each initialization step
- ✅ Follows existing code patterns and style

---

## Current Development Stage

### Completed ✅
- **Architecture:** Data Model v2 fully designed and documented
- **Phase 0:** Device Identification System implemented and tested
- **Foundations:** Metadata extraction utility ready for Phase 1
- **Documentation:** Both technical specs and implementation guide complete

### In Progress ⚙️
- None (ready for Phase 1)

### Next Steps (Phase 1) 🔄
1. **Core object creation handler**
   - Accept sources array instead of source_local/remote
   - Use device origin from Phase 0
   - Call metadata extraction and tag assignment
   - Persist to disk with new schema

2. **System tag management**
   - findOrCreateTag for media_type, file_type, origin
   - assignSystemTagsFromSources (already designed)
   - Tag recalculation on source changes

3. **Testing**
   - Create object with sources → verify tags assigned
   - Create object with empty sources → verify no tags
   - Verify device origin used automatically
   - Test across multiple origins

---

## Architecture Clarity for Next Agent

### Current System State
- **Database:** Fresh start (no v1 migration)
- **Device ID:** Persisted to `~/.index/.device-id`
- **Data Model:** Objects with sources array (v2)
- **System Tags:** Three types (media_type, file_type, origin)
- **Phase 0:** Complete and tested

### Important Concepts
1. **Origin encodes device identity AND implicit URI scheme**
   - Not just a device name—it's how system knows which device has which source
   - Scheme implicit (web → https, myLaptop → file, nas → smb)

2. **Media type is object-level, file type is per-source**
   - Object fundamentally IS one thing (document)
   - But may have multiple formats (pdf, epub)

3. **Empty sources are valid and important**
   - Enables notes, metadata-only objects, placeholders
   - System tags not assigned if no sources

4. **No scheme tags—eliminated redundancy**
   - Origin already encodes scheme
   - Simpler tag set, cleaner filtering

### Key Files to Know
- `electron/main/config/device.js` — Device identity
- `electron/main/utils/metadata-extractor.js` — Extract tags from URIs
- `electron/main/ipc/db-handlers.js` — Where Phase 1 work goes (object creation)
- `docs/feature-dev/DATA_MODEL_v2.md` — Reference during Phase 1
- `docs/feature-dev/IMPLEMENTATION_PLAN_v2.md` — Step-by-step guide

### Data Persistence
- Objects: `~/.index/objects/*.json` (individual files)
- Device ID: `~/.index/.device-id` (single file)
- Tags, collections: managed in database (SurrealDB)
- Not yet: tag persistence to disk (will be added in Phase 5)

### Phase 1 Entry Point
When starting Phase 1:
1. Look at `IMPLEMENTATION_PLAN_v2.md` Phase 1 section
2. Implement `handleCreateObject` in `electron/main/ipc/db-handlers.js`
3. Import `extractMetadataFromSource`, `extractMediaTypeFromSource` from utils
4. Call `assignSystemTagsFromSources` after creating object
5. Test with DevTools before frontend integration

---

## Notes for Future Sessions

### Code Style Observations
- Uses ES6 modules (import/export)
- Comprehensive logging with `[Module]` prefixes
- Error handling in all async functions
- JSDoc comments for public functions
- SurrealDB uses SCHEMALESS tables (no schema validation needed)

### Architecture Patterns
- IPC handlers in separate files by domain (db-handlers, device-handlers)
- Preload exposes clean API namespaces (electronAPI.device, electronAPI.db, etc.)
- Device system completely independent (can work standalone for testing)
- Metadata extraction fully testable (pure functions)

### Testing Strategy Used
- Manual testing of device ID persistence
- Dialog flow validation
- IPC handler availability check
- Unit-testable functions (extract* functions)

### What's Solid
- Device identification robust (creates dir if needed, handles edge cases)
- Metadata extraction comprehensive (handles all common formats)
- Data model well-thought-out (empty sources, no redundancy)
- Documentation excellent (detailed flows, examples, rationales)

### Potential Challenges Ahead
1. **SurrealDB schema** — Currently SCHEMALESS; may need validation layer
2. **File persistence** — Need to ensure nested sources array serializes correctly
3. **Tag assignment scale** — Many tags per object; need efficient batch assignment
4. **Empty sources edge case** — Ensure UI handles objects with no sources gracefully

---

## Commits This Session

```
42415b90 Implement Phase 0: Device Identification System
0a728ef3 Add uuid dependency for device ID generation
db1826d1 Revise data model to allow empty sources array
```

**Branch:** 0.3 (development branch)
**Main branch:** main (for PR when Phase 1+ ready)

---

*Development Log - Phase 0 Complete*
*Status: Ready for Phase 1 - Core Object Creation*
*Architecture: Solid, Well-Documented, Future-Ready*
