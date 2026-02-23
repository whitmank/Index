---
Author: Claude Code
Date: 2026-02-23
Status: Draft Implementation Plan
---

# Implementation Plan: Data Model v2 (Multi-Device Sources)

This plan outlines the step-by-step implementation of the multi-device sources architecture with system metadata extraction.

---

## Overview & Philosophy

**Scope:** Refactor objects from `source_local`/`source_remote` to `sources: Source[]` array, with system metadata extraction based on URI analysis.

**Key Principle:** System metadata should be **derived from sources** at object creation time and kept in sync when sources change. No manual metadata entry.

**Start State:** Delete all test data; start fresh with v2 schema.

---

## System Metadata Extraction Strategy

### What Gets Extracted

**Object-level metadata (determined once from first source):**
1. **Media Type** (`media_type:document`, `media_type:image`, etc.)
   - Inferred from file extension of first source
   - Applies to entire object (all sources are same media type)
   - Values: `document`, `image`, `video`, `audio`, `spreadsheet`, `presentation`
   - Auto-assign system tag once per object

**Per-source metadata (extracted from each URI):**
2. **File Type** (`file_type:pdf`, `file_type:epub`, `file_type:jpg`, etc.)
   - Extract file extension from URI
   - Per-source (different sources might have different formats)
   - Auto-assign system tag for each unique file type found

3. **Device Origin** (`origin:myLaptop`, `origin:web`, `origin:nas`, etc.)
   - Provided by user or auto-detected
   - Implicitly encodes URI scheme (web→https, device→file, nas→smb)
   - Auto-assign system tag for each unique origin
   - URI scheme is stored in the URI itself, not duplicated as a tag

**NOT extracted (stored explicitly or inferred from origin):**
- URI scheme (stored in URI, derivable from origin)
- File path (high-cardinality, stored in URI itself)
- File size (requires disk access, not queried)
- File permissions (not used in filtering)

### Metadata Extraction Module

**New file:** `electron/main/utils/metadata-extractor.js`

```javascript
/**
 * Extract media type from URI (object-level, called once)
 * Media type is what the object fundamentally IS (document, image, video, etc.)
 */
export function extractMediaTypeFromSource(uri) {
  const fileType = extractFileType(uri);
  if (!fileType) return null;

  const mediaTypeMap = {
    // Documents
    'pdf': 'document', 'doc': 'document', 'docx': 'document',
    'txt': 'document', 'md': 'document', 'rst': 'document',

    // Images
    'jpg': 'image', 'jpeg': 'image', 'png': 'image',
    'gif': 'image', 'svg': 'image', 'webp': 'image',

    // Video
    'mp4': 'video', 'mkv': 'video', 'mov': 'video', 'avi': 'video',

    // Audio
    'mp3': 'audio', 'wav': 'audio', 'flac': 'audio', 'm4a': 'audio',

    // Office
    'xls': 'spreadsheet', 'xlsx': 'spreadsheet',
    'ppt': 'presentation', 'pptx': 'presentation',
  };

  return mediaTypeMap[fileType] || null;
}

/**
 * Extract per-source metadata from URI
 * Returns object with fileType and origin
 * Note: URI scheme is stored in URI itself and derivable from origin
 */
export function extractMetadataFromSource(uri, origin) {
  return {
    fileType: extractFileType(uri),       // "pdf", "jpg", "epub", etc.
    origin: origin,                       // "myLaptop", "web", "myTablet", "nas", etc.
  };
}

// File Type Extraction (file extension)
function extractFileType(uri) {
  // "/Users/karter/file.pdf" → "pdf"
  // "https://example.com/doc.pdf?v=1" → "pdf"
  // Extract before query params, lowercase
  const path = uri.split('?')[0];
  const match = path.match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : null;
}
```

---

## Phase 1: Database Schema & Core Objects

### 1.1 Update Object Creation Handler

**File:** `electron/main/ipc/db-handlers.js`

**Changes:**
- Remove `source_local`, `source_remote` parameters
- Add `sources: Source[]` parameter
- Add `origin` parameter (device identifier)
- Extract metadata and auto-create system tags

**Pseudocode:**
```javascript
async function handleCreateObject(db, objectData) {
  // Validate
  if (!objectData.name) throw new Error('Name required');

  // Sources are optional (can be empty array or omitted)
  let sources = [];
  if (objectData.sources && Array.isArray(objectData.sources)) {
    sources = objectData.sources.map(src => ({
      uri: cleanURI(src.uri),
      origin: src.origin || 'unknown',
      added_at: new Date().toISOString()
    }));
  }

  // Create object record
  const object = await db.create('objects', {
    name: objectData.name,
    description: objectData.description || null,
    sources: sources,  // Can be empty array
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });

  // Extract and assign system tags (only if sources exist)
  if (sources.length > 0) {
    await assignSystemTagsFromSources(db, object.id, sources);
  }

  return object;
}
```

**System Tags Assignment:**
```javascript
async function assignSystemTagsFromSources(db, objectId, sources) {
  // Empty sources: no tags to assign
  if (!sources || sources.length === 0) {
    console.log(`[Tags] No sources for object ${objectId}, skipping tag assignment`);
    return;
  }

  const tagSet = new Set(); // Avoid duplicates

  // Media type: determine once from first source, applies to whole object
  const mediaType = extractMediaTypeFromSource(sources[0].uri);
  if (mediaType) {
    tagSet.add({ name: mediaType, type: 'media_type', system: true });
  }

  // Per-source metadata: collect all unique file types and origins
  for (const source of sources) {
    const metadata = extractMetadataFromSource(source.uri, source.origin);

    // Add file type tag (per-source, can have multiple)
    if (metadata.fileType) {
      tagSet.add({ name: metadata.fileType, type: 'file_type', system: true });
    }

    // Add origin tag
    // Note: origin implicitly encodes the URI scheme
    // - origin:web → https://
    // - origin:myLaptop → file://
    // - origin:nas → smb://
    // URI scheme is stored in the URI itself
    if (metadata.origin) {
      tagSet.add({ name: metadata.origin, type: 'origin', system: true });
    }
  }

  // Create tags and assign to object
  for (const tag of tagSet) {
    const tagDef = await findOrCreateTag(db, tag.name, tag.type, tag.system);
    await assignTag(db, objectId, tagDef.id);
  }
}
```

### 1.2 Update Object Retrieval

**File:** `electron/main/ipc/db-handlers.js`

**Changes:**
- Fetch objects with full `sources` array
- Return with computed client metadata

**Example return:**
```javascript
{
  id: "obj:1",
  name: "Siddhartha",
  sources: [
    {uri: "file:///Users/karter/docs/book.pdf", origin: "myLaptop", added_at: "2026-02-23T10:00:00Z"},
    {uri: "https://example.com/siddhartha.pdf", origin: "web", added_at: "2026-02-23T10:05:00Z"}
  ],
  tags: ["scheme:file", "scheme:https", "origin:myLaptop", "origin:web", "media_type:pdf"]
}
```

### 1.3 Clean Initialization

**File:** `electron/main/db/index.js`

**Changes:**
- Remove any legacy v1 references
- Initialize fresh with v2 schema (SCHEMALESS is fine)
- No migration logic needed

---

## Phase 2: Source Management Operations

### 2.1 Copy Source to Device

**New handler:** `db:copySourceToDevice`

**Purpose:** User copies remote source to their device, creating new source entry.

**Pseudocode:**
```javascript
async function handleCopySourceToDevice(db, {
  objectId,
  sourceIndex,  // Which source in array to copy
  destinationPath,  // Where to save locally
  currentDeviceOrigin  // "myLaptop", "myTablet", etc.
}) {
  // Validate
  const object = await db.select('objects', {id: objectId});
  if (!object) throw new Error('Object not found');

  const sourceSource = object[0].sources[sourceIndex];
  if (!sourceSource) throw new Error('Source not found');

  // Check if destination already exists in sources
  const existingSource = object[0].sources.find(s =>
    s.uri === destinationPath && s.origin === currentDeviceOrigin
  );
  if (existingSource) throw new Error('Source already exists on this device');

  // Copy file content (this is app-level, not DB-level)
  // App will handle: fetch remote, write local, etc.
  // We just add the reference

  // Create new source entry
  const newSource = {
    uri: destinationPath,
    origin: currentDeviceOrigin,
    added_at: new Date().toISOString()
  };

  // Append to sources array
  const updatedSources = [...object[0].sources, newSource];

  // Update object
  await db.update(object[0].id, {
    sources: updatedSources,
    updated_at: new Date().toISOString()
  });

  // Update system tags (might need new origin tag if this is first copy to device)
  await assignSystemTagsFromSources(db, object[0].id, updatedSources);

  return object[0];
}
```

### 2.2 Add New Source to Object

**New handler:** `db:addSourceToObject`

**Purpose:** User adds additional source to existing object (e.g., finds web version).

**Pseudocode:**
```javascript
async function handleAddSourceToObject(db, {
  objectId,
  uri,
  origin
}) {
  const object = await db.select('objects', {id: objectId});
  if (!object) throw new Error('Object not found');

  // Check for duplicate
  const exists = object[0].sources.find(s =>
    s.uri === uri && s.origin === origin
  );
  if (exists) throw new Error('This source already exists');

  // Add source
  const newSource = { uri, origin, added_at: new Date().toISOString() };
  const updatedSources = [...object[0].sources, newSource];

  await db.update(object[0].id, {
    sources: updatedSources,
    updated_at: new Date().toISOString()
  });

  // Update tags
  await assignSystemTagsFromSources(db, object[0].id, updatedSources);

  return object[0];
}
```

### 2.3 Remove Source from Object

**New handler:** `db:removeSourceFromObject`

**Purpose:** Remove a source from object (e.g., file was deleted).

**Important:** Can only remove if object has ≥2 sources. Last source cannot be removed.

**Pseudocode:**
```javascript
async function handleRemoveSourceFromObject(db, {
  objectId,
  sourceIndex
}) {
  const object = await db.select('objects', {id: objectId});
  if (!object) throw new Error('Object not found');

  if (object[0].sources.length <= 1) {
    throw new Error('Cannot remove last source from object');
  }

  const removedSource = object[0].sources[sourceIndex];
  const updatedSources = object[0].sources.filter((_, i) => i !== sourceIndex);

  await db.update(object[0].id, {
    sources: updatedSources,
    updated_at: new Date().toISOString()
  });

  // Recalculate tags (might lose origin tag if all sources from that origin removed)
  await recalculateSystemTags(db, object[0].id, updatedSources);

  return object[0];
}
```

---

## Phase 3: System Tag Management

### 3.1 System Tag Creation

**File:** `electron/main/db/system-tags.js` (refactor existing, extend with new types)

**Functions:**
```javascript
export async function findOrCreateTag(db, name, type, system = true) {
  // Query: find tag where name = ? AND type = ? AND system = ?
  const existing = await db.select('tag_definitions', {
    name: name,
    type: type,
    system: system
  });

  if (existing.length > 0) return existing[0];

  // Create if not exists
  const newTag = await db.create('tag_definitions', {
    name: name,
    type: type,
    system: system,
    description: generateDescription(type, name),
    created_at: new Date().toISOString()
  });

  return newTag;
}

function generateDescription(type, name) {
  const descriptions = {
    'media_type:document': 'Document (PDF, Word, Text, Markdown, etc.)',
    'media_type:image': 'Image (JPG, PNG, SVG, GIF, etc.)',
    'media_type:video': 'Video file (MP4, MKV, MOV, AVI, etc.)',
    'media_type:audio': 'Audio file (MP3, WAV, FLAC, M4A, etc.)',
    'media_type:spreadsheet': 'Spreadsheet (XLS, XLSX, CSV, etc.)',
    'media_type:presentation': 'Presentation (PPT, PPTX, etc.)',
    'file_type:pdf': 'PDF format',
    'file_type:epub': 'EPUB format',
    'file_type:jpg': 'JPEG image',
    'file_type:mp4': 'MP4 video',
    'origin:myLaptop': 'Local file on primary laptop',
    'origin:myTablet': 'Local file on tablet',
    'origin:web': 'Public web source (HTTPS)',
    'origin:nas': 'Network file share (SMB)',
  };

  return descriptions[`${type}:${name}`] || `${type}: ${name}`;
}
```

### 3.2 Tag Recalculation

**New function:** `recalculateSystemTags`

**Purpose:** When sources change, recompute all system tags (in case origin was lost, etc.)

**Pseudocode:**
```javascript
async function recalculateSystemTags(db, objectId, sources) {
  // Get current object tags
  const currentTags = await db.select('tag_assignments', {
    object_id: objectId
  });

  // Get tag definitions for current tags
  const currentSystemTags = await Promise.all(
    currentTags.map(ta => db.select('tag_definitions', {id: ta.tag_id}))
  ).then(results =>
    results
      .flat()
      .filter(t => t.system)
      .map(t => ({name: t.name, type: t.type}))
  );

  // Extract new tags from sources
  const newTags = new Set();
  for (const source of sources) {
    const metadata = extractMetadataFromSource(source.uri, source.origin);
    if (metadata.scheme) newTags.add(JSON.stringify({name: metadata.scheme, type: 'scheme'}));
    if (metadata.origin) newTags.add(JSON.stringify({name: metadata.origin, type: 'origin'}));
    if (metadata.mediaType) newTags.add(JSON.stringify({name: metadata.mediaType, type: 'media_type'}));
    if (metadata.fileExtension) newTags.add(JSON.stringify({name: metadata.fileExtension, type: 'file_extension'}));
  }

  // Convert back to objects
  const newTagsArray = Array.from(newTags).map(t => JSON.parse(t));

  // Find tags to remove (in current but not in new)
  const toRemove = currentSystemTags.filter(current =>
    !newTagsArray.find(n => n.name === current.name && n.type === current.type)
  );

  // Find tags to add (in new but not in current)
  const toAdd = newTagsArray.filter(n =>
    !currentSystemTags.find(c => c.name === n.name && c.type === n.type)
  );

  // Remove obsolete tags
  for (const tag of toRemove) {
    const tagDef = await findOrCreateTag(db, tag.name, tag.type, true);
    await db.delete('tag_assignments', {
      object_id: objectId,
      tag_id: tagDef.id
    });
  }

  // Add new tags
  for (const tag of toAdd) {
    const tagDef = await findOrCreateTag(db, tag.name, tag.type, true);
    await assignTag(db, objectId, tagDef.id);
  }
}
```

---

## Phase 4: Frontend Integration

### 4.1 Object Creation UI

**File:** `src/App.jsx` (drag-drop, paste handlers)

**Changes:**
- When user drops file or pastes URL, capture it
- Determine origin (current device)
- Create sources array
- Call `db:createObject` with sources

**Example:**
```javascript
async function handleFileDrop(files) {
  for (const file of files) {
    const fileUri = `file://${file.path}`;
    const deviceOrigin = await getDeviceOrigin(); // "myLaptop", etc.

    const object = await ipcRenderer.invoke('db:createObject', {
      name: file.name,
      sources: [{
        uri: fileUri,
        origin: deviceOrigin
      }]
    });

    // Update store with new object
    useObjectsStore.getState().addObject(object);
  }
}
```

### 4.2 Object Detail Sidebar: Sources List

**File:** `src/components/ObjectDetailSidebar.jsx` (new section)

**Display:**
```
Sources:
├─ 📁 /Users/karter/Documents/file.pdf (myLaptop) - Local
├─ 🌐 https://example.com/file.pdf (web) - Remote
└─ [Copy to this device] [Add source] [Remove]
```

**Features:**
- List all sources with origin labels
- Icon indicating accessibility (local vs remote)
- "Copy to device" button for remote sources
- "Add source" button to add another source
- "Remove" button (grayed if only one source)

### 4.3 Collections: Scheme and Origin Filtering

**File:** `src/components/CollectionsSidebar.jsx` (update tag selector)

**Pre-built Collections:**
```javascript
const suggestedCollections = [
  { name: "All Documents", query: { all: ["media_type:document"] } },
  { name: "Images", query: { all: ["media_type:image"] } },
  { name: "Web Sources", query: { all: ["origin:web"] } },
  { name: "Available on This Device", query: { all: [`origin:${currentDevice}`] } },
  { name: "Multi-Device", query: { any: ["origin:myLaptop", "origin:myTablet", "origin:web"] } },
  { name: "Laptop Only", query: { all: ["origin:myLaptop"], none: ["origin:myTablet", "origin:web"] } }
];
```

---

## Phase 5: Data Persistence & Hydration

### 5.1 Object Persistence

**File:** `electron/main/watchers/objects.js` (persist to disk)

**Changes:**
- Write full object with sources array to `~/.index/objects/[id].json`
- Validate sources array before writing
- Handle nested JSON serialization

**Example file:**
```json
{
  "id": "obj:1",
  "name": "Siddhartha",
  "sources": [
    {
      "uri": "file:///Users/karter/Documents/siddhartha.pdf",
      "origin": "myLaptop",
      "added_at": "2026-02-23T10:00:00Z"
    },
    {
      "uri": "https://example.com/siddhartha.pdf",
      "origin": "web",
      "added_at": "2026-02-23T10:05:00Z"
    }
  ],
  "created_at": "2026-02-23T10:00:00Z",
  "updated_at": "2026-02-23T10:05:00Z"
}
```

### 5.2 Hydration

**File:** `electron/main/db/hydration.js` (unchanged structure, handles new schema)

**Validation during hydration:**
```javascript
async function hydrateObjects(db) {
  // Load all object files
  const objects = await loadObjectsFromDisk();

  for (const obj of objects) {
    // Validate sources array
    if (!Array.isArray(obj.sources) || obj.sources.length === 0) {
      console.warn(`[Hydration] Object ${obj.id} has invalid sources, skipping`);
      continue;
    }

    for (const source of obj.sources) {
      if (!source.uri || !source.origin) {
        console.warn(`[Hydration] Object ${obj.id} source missing uri or origin, skipping`);
        continue;
      }
    }

    // Insert into DB
    await db.create('objects', obj);

    // Recalculate system tags (safety measure)
    await assignSystemTagsFromSources(db, obj.id, obj.sources);
  }
}
```

---

## Phase 0: Device Identification

### 0.1 Device ID System

**File:** `electron/main/config/device.js` (new)

**Core functions:**

```javascript
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuid } from 'uuid';

const DEVICE_ID_FILE = path.join(os.homedir(), '.index', '.device-id');

/**
 * Initialize or load device identity
 * Returns {id, name, created_at, last_seen}
 * If device not yet named, name is null
 */
export async function initializeDeviceId() {
  if (fs.existsSync(DEVICE_ID_FILE)) {
    // Load existing device
    const device = JSON.parse(fs.readFileSync(DEVICE_ID_FILE, 'utf-8'));

    // Update last_seen
    device.last_seen = new Date().toISOString();
    fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(device, null, 2));

    console.log(`[Device] Loaded device: ${device.name} (${device.id})`);
    return device;
  }

  // New device: generate ID, prompt for name later
  const newDevice = {
    id: uuid(),
    name: null,  // User must provide via dialog
    created_at: new Date().toISOString(),
    last_seen: new Date().toISOString()
  };

  // Ensure .index/ directory exists
  const indexDir = path.dirname(DEVICE_ID_FILE);
  if (!fs.existsSync(indexDir)) {
    fs.mkdirSync(indexDir, { recursive: true });
  }

  fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(newDevice, null, 2));
  console.log(`[Device] Created new device: ${newDevice.id}`);
  return newDevice;
}

/**
 * Get current device's origin identifier
 * Returns the user-friendly name
 * Returns null if device not yet named
 */
export async function getDeviceOrigin() {
  const device = await initializeDeviceId();
  return device.name;  // null if not yet named
}

/**
 * Check if device has been named
 */
export async function isDeviceNamed() {
  const device = await initializeDeviceId();
  return device.name !== null && device.name !== '';
}

/**
 * Set device name (called after user provides name via dialog)
 */
export async function setDeviceName(name) {
  if (!name || name.trim() === '') {
    throw new Error('Device name cannot be empty');
  }

  const device = await initializeDeviceId();
  device.name = name.trim();
  device.last_seen = new Date().toISOString();

  fs.writeFileSync(DEVICE_ID_FILE, JSON.stringify(device, null, 2));
  console.log(`[Device] Device named: ${device.name}`);
  return device;
}

/**
 * Get device ID (internal UUID)
 */
export async function getDeviceId() {
  const device = await initializeDeviceId();
  return device.id;
}
```

### 0.2 Device Naming Dialog

**File:** `electron/main/windows/device-naming-dialog.js` (new)

**Purpose:** Show dialog on first launch if device not named.

```javascript
import { ipcMain, dialog } from 'electron';
import { isDeviceNamed, setDeviceName } from '../config/device.js';

/**
 * Show device naming dialog if needed
 * Returns true if device is ready (named or already was named)
 * Returns false if user cancelled
 */
export async function ensureDeviceNamed() {
  const named = await isDeviceNamed();

  if (named) {
    // Device already named, proceed
    return true;
  }

  // Show dialog
  const result = await dialog.showMessageBox(null, {
    type: 'question',
    title: 'Welcome to Index',
    message: 'What is the name of this device?',
    detail: 'This helps Index identify where your files are located when syncing across devices.',
    defaultId: 0,
    buttons: ['Continue', 'Quit'],
    cancelId: 1
  });

  if (result.response === 1) {
    // User clicked Quit
    return false;
  }

  // Show input dialog
  const { response, cancelled } = await dialog.showInputDialog({
    title: 'Device Name',
    label: 'Device name (e.g., "My Laptop", "iPad", "Work Desktop"):',
    cancelId: 1
  });

  if (cancelled || !response?.trim()) {
    // User cancelled or didn't enter name
    return false;
  }

  try {
    await setDeviceName(response);
    return true;
  } catch (error) {
    console.error('[Device] Failed to set device name:', error);
    return false;
  }
}

// IPC handler for frontend to request device naming
ipcMain.handle('device:ensureNamed', async () => {
  return await ensureDeviceNamed();
});

ipcMain.handle('device:getName', async () => {
  const { isDeviceNamed, getDeviceOrigin } = await import('../config/device.js');
  if (await isDeviceNamed()) {
    return await getDeviceOrigin();
  }
  return null;
});
```

### 0.3 App Startup Integration

**File:** `electron/main/index.js` (modify)

**On app ready:**

```javascript
import { app, BrowserWindow } from 'electron';
import { ensureDeviceNamed } from './windows/device-naming-dialog.js';

async function onAppReady() {
  try {
    // Step 1: Initialize device (load or create ID)
    const { initializeDeviceId } = await import('./config/device.js');
    const device = await initializeDeviceId();
    console.log(`[App] Device ID loaded: ${device.id}`);

    // Step 2: Ensure device is named
    const deviceNamed = await ensureDeviceNamed();
    if (!deviceNamed) {
      // User cancelled naming dialog, quit app
      app.quit();
      return;
    }

    // Step 3: Start database
    await startDatabase();

    // Step 4: Create main window
    createMainWindow();
  } catch (error) {
    console.error('[App] Failed to initialize:', error);
    app.quit();
  }
}
```

### 0.4 Frontend Integration

**File:** `src/App.jsx` (modify)

**On app load, verify device is named:**

```javascript
import { useEffect, useState } from 'react';
import { ipcRenderer } from 'electron';

export default function App() {
  const [appReady, setAppReady] = useState(false);
  const [deviceOrigin, setDeviceOrigin] = useState(null);

  useEffect(() => {
    async function initializeApp() {
      try {
        // Ensure device is named
        const named = await ipcRenderer.invoke('device:ensureNamed');
        if (!named) {
          // Device naming failed, app should quit
          window.close();
          return;
        }

        // Get device origin for this session
        const origin = await ipcRenderer.invoke('device:getName');
        setDeviceOrigin(origin);

        // App is ready
        setAppReady(true);
      } catch (error) {
        console.error('Failed to initialize device:', error);
      }
    }

    initializeApp();
  }, []);

  if (!appReady) {
    return <div>Initializing...</div>;
  }

  return (
    <div>
      {/* App content */}
      {/* deviceOrigin available for use: {deviceOrigin} */}
    </div>
  );
}
```

### 0.5 Object Creation with Device Origin

**File:** `electron/main/ipc/db-handlers.js` (modify)

**When creating object, use device origin from config:**

```javascript
import { getDeviceOrigin } from '../config/device.js';

async function handleCreateObject(db, objectData) {
  // Get current device's origin
  const deviceOrigin = await getDeviceOrigin();

  if (!deviceOrigin) {
    throw new Error('Device not named. Cannot create object.');
  }

  // Validate input
  if (!objectData.name) throw new Error('Name required');
  if (!objectData.uri) throw new Error('URI required');

  // Normalize and create sources array with device origin
  const sources = [{
    uri: cleanURI(objectData.uri),
    origin: deviceOrigin,  // Auto-set to current device
    added_at: new Date().toISOString()
  }];

  // ... rest of object creation logic
}
```

### 0.6 IPC Handlers for Device Info

**File:** `electron/main/ipc/device-handlers.js` (new)

```javascript
import { ipcMain } from 'electron';
import {
  getDeviceId,
  getDeviceOrigin,
  getDeviceName,
  isDeviceNamed
} from '../config/device.js';

/**
 * Get current device's origin (user-friendly name)
 * Used by frontend when displaying/filtering by device
 */
ipcMain.handle('device:getOrigin', async () => {
  return await getDeviceOrigin();
});

/**
 * Get device ID (internal UUID)
 * Used for debugging/logging
 */
ipcMain.handle('device:getId', async () => {
  return await getDeviceId();
});

/**
 * Check if device is named
 */
ipcMain.handle('device:isNamed', async () => {
  return await isDeviceNamed();
});
```

---

## Implementation Sequence

**Recommended order of implementation:**

1. **Phase 0:** Device identification system
   - Create device.js module for device ID management
   - Create device naming dialog
   - Integrate into app startup (ensure device named before database starts)
   - Test device ID persistence across restarts
   - **Dependency:** Must complete before Phase 1 (objects need device origin)

2. **Phase 1.1-1.2:** Update core object creation/retrieval
   - Create metadata extractor module
   - Update db-handlers for new schema with device origin
   - Pass deviceOrigin to object creation handlers
   - Test basic object creation with sources array

3. **Phase 3:** System tag management
   - Implement findOrCreateTag with media_type, file_type, origin types
   - Implement assignSystemTagsFromSources
   - Test that objects get correct tags
   - **Dependency:** Phase 0 (need device origin available)

4. **Phase 2:** Source management operations
   - Implement copy source, add source, remove source
   - Test tag recalculation
   - **Dependency:** Phase 3 (tag recalculation logic)

5. **Phase 5:** Persistence & hydration
   - Update object persistence format with sources array
   - Test disk writing and loading
   - **Dependency:** Phase 1 (new object schema)

6. **Phase 4:** Frontend integration
   - Update object creation UI
   - Create object detail sources view
   - Update collections for origin/file_type/media_type filtering
   - **Dependency:** Phase 0 (need device origin in context)

---

## Testing Strategy

### Unit Tests
```javascript
// Metadata extraction
test('extractScheme from various URIs', () => {
  expect(extractScheme('file:///path')).toBe('file');
  expect(extractScheme('https://example.com')).toBe('https');
});

test('extractFileType handles edge cases', () => {
  expect(extractFileType('/path/to/file.pdf')).toBe('pdf');
  expect(extractFileType('https://example.com/doc.pdf?v=1')).toBe('pdf');
  expect(extractFileType('/path/no-extension')).toBeNull();
});

test('extractMediaType maps to fundamental type', () => {
  expect(extractMediaTypeFromSource('file.pdf')).toBe('document');
  expect(extractMediaTypeFromSource('image.jpg')).toBe('image');
  expect(extractMediaTypeFromSource('movie.mp4')).toBe('video');
  expect(extractMediaTypeFromSource('song.mp3')).toBe('audio');
});
```

### Integration Tests
```javascript
// Object creation with system tags
test('createObject assigns correct system tags', async () => {
  const object = await db.handleCreateObject({
    name: 'Siddhartha',
    sources: [
      {uri: 'file:///path/book.pdf', origin: 'myLaptop'},
      {uri: 'file:///path/book.epub', origin: 'myTablet'},
      {uri: 'https://example.com/siddhartha.pdf', origin: 'web'}
    ]
  });

  const tags = await getObjectTags(object.id);

  // Object-level media type (determined from first source)
  expect(tags).toContain('media_type:document');

  // Per-source file types
  expect(tags).toContain('file_type:pdf');
  expect(tags).toContain('file_type:epub');

  // Per-source origins (scheme is implicit in origin)
  expect(tags).toContain('origin:myLaptop');      // implies file://
  expect(tags).toContain('origin:myTablet');      // implies file://
  expect(tags).toContain('origin:web');           // implies https://

  // Scheme tags should NOT be present (redundant with origin)
  expect(tags).not.toContain('scheme:file');
  expect(tags).not.toContain('scheme:https');
});
```

### Manual Testing Scenarios
```
1. Create object from file drop
   └─ Verify sources array created with file:// URI
   └─ Verify origin set to current device
   └─ Verify tags assigned:
      ├─ media_type:document (from first source)
      ├─ file_type:pdf (per-source)
      └─ origin:myLaptop (per-source, implies file://)

2. Create object from URL paste
   └─ Verify sources array created with https:// URI
   └─ Verify origin set to "web"
   └─ Verify tags assigned:
      ├─ media_type:document (inferred from URL)
      ├─ file_type:pdf (per-source)
      └─ origin:web (per-source, implies https://)

3. Multi-source object (different file types)
   └─ Create with pdf (laptop) + epub (tablet) + web source
   └─ Verify tags:
      ├─ media_type:document (once, from first source)
      ├─ file_type:pdf, file_type:epub (multiple)
      └─ origin:myLaptop, origin:myTablet, origin:web

4. Copy remote source to device
   └─ Object has web PDF, copy to laptop
   └─ New source added: {uri: laptop_path, origin: myLaptop}
   └─ Verify file_type:pdf still present (no change)
   └─ Verify origin:myLaptop added (if not already present)

5. Collections queries
   └─ Collection: "All Documents" (all: [media_type:document])
   └─ Collection: "PDF Format" (all: [file_type:pdf])
   └─ Collection: "Laptop Files" (all: [origin:myLaptop, media_type:document])
   └─ Collection: "Web Sources" (all: [origin:web])
   └─ Collection: "Multi-Device" (any: [origin:myLaptop, origin:myTablet])
   └─ Verify filtering works correctly
```

---

## Risk Assessment & Mitigation

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Metadata extraction fails silently | Objects missing tags | Verbose logging, validation tests |
| Source validation too strict | Blocks valid URIs | Test against real user paths/URLs |
| Tag assignment race conditions | Orphaned tags or duplicates | Wrap in transaction-like logic, validate |
| Hydration misses invalid objects | Data loss | Log warnings, skip gracefully |
| Deep nesting of sources array | Persistence issues | Validate before writing, test serialization |

---

## Success Criteria

**Device Identification:**
- [ ] Device ID file created on first run
- [ ] Device naming dialog shows if device not yet named
- [ ] User can name device (e.g., "My Laptop", "iPad")
- [ ] Device name persists across app restarts
- [ ] Running app on different machine prompts for new device name
- [ ] Device ID used as origin in all objects created

**Object Management:**
- [ ] Objects can be created with sources array
- [ ] Device origin correctly set on object creation (from device config)
- [ ] System tags auto-assigned for media_type, file_type, origin
- [ ] Copy source creates new entry and updates tags
- [ ] Collections filter by origin, media_type, file_type work correctly
- [ ] Objects persist to disk with full sources array
- [ ] Objects hydrate correctly on startup

**Frontend:**
- [ ] UI displays sources with origin labels
- [ ] UI displays accessibility indicators (local vs remote)
- [ ] All new operations tested (create, copy, add, remove source)
- [ ] Device name available in app context

**Data:**
- [ ] No test data migration needed (clean start)
- [ ] No duplicates when multiple sources from same origin

---

*Implementation Plan v2 - Draft*
*Ready for dialectic refinement*
