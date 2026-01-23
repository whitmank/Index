# Electron IPC Channels

Preload script exposes `window.electronAPI` for renderer process communication with main process.

---

## File System Operations

### `selectDirectory()`
Opens native directory picker dialog.

```javascript
const dirPath = await window.electronAPI.selectDirectory();
// Returns: string (path) or null
```

---

### `selectFiles()`
Opens native file picker dialog (multi-select).

```javascript
const filePaths = await window.electronAPI.selectFiles();
// Returns: string[] (array of paths) or []
```

---

### `getFileMetadata(path)`
Get file stats and MIME type.

```javascript
const metadata = await window.electronAPI.getFileMetadata('/path/to/file.pdf');
// Returns: { size, mime_type, extension, modified_at, ... }
```

---

### `watchPath(path, callback)`
Watch for file changes. Calls callback when file changes.

```javascript
window.electronAPI.watchPath('/path/to/file.pdf', () => {
  console.log('File changed');
});
```

---

## Source Handler Operations

### `extractMetadata(uri)`
Extract metadata from source (dispatch to handler).

```javascript
const meta = await window.electronAPI.extractMetadata('file:///path/to/file.pdf');
const meta = await window.electronAPI.extractMetadata('https://example.com/article');

// File response: { size, mime_type, extension, ... }
// URL response: { title, description, favicon, domain, ... }
```

---

### `openSource(uri)`
Open source in native app (Finder/browser).

```javascript
await window.electronAPI.openSource('file:///path/to/file.pdf');
await window.electronAPI.openSource('https://example.com/article');
```

---

### `getContentHash(uri)`
Get SHA-256 content hash.

```javascript
const hash = await window.electronAPI.getContentHash('file:///path/to/file.pdf');
// Returns: "sha256:abc123..."
```

---

## IPC Handler Files

### Main Process Handlers
- **File System:** `electron/main/ipc/fs-bridge.js`
- **Source Handlers:** `electron/main/ipc/source-ipc.js`

### Context Bridge Exposure
- **Preload:** `electron/preload/preload.js`
- Exposes: `window.electronAPI` object with methods above

---

## Handler Base Interface

New source handlers implement:

```typescript
interface SourceHandler {
  scheme: string;                                    // "file", "https", etc.
  canHandle(uri: string): boolean;                  // Check if handler applies
  validate(uri: string): ValidationResult;          // Validate URI format
  extractMetadata(uri: string): Promise<Metadata>;  // Extract metadata
  getContent(uri: string): Promise<Content>;        // Get full content
  getContentHash(uri: string): Promise<string>;     // Get SHA-256 hash
  capabilities: {
    canWatch: boolean;      // Watch for changes
    canOpen: boolean;       // Open in native app
    canPreview: boolean;    // Inline preview support
    canCache: boolean;      // Content caching
  };
  watch?(uri, callback): void;                      // Optional: watch for changes
  unwatch?(uri): void;                              // Optional: stop watching
  open?(uri): Promise<void>;                        // Optional: open source
  cache?(uri): Promise<CachedContent>;              // Optional: cache content
}
```

---

## Handler Registry

**File:** `backend/source-handlers/handler-registry.js`

```typescript
class SourceRegistry {
  register(handler: SourceHandler): void;           // Register handler
  dispatch(uri, operation, ...args): Promise<any>;  // Find & dispatch to handler
  findHandler(uri): SourceHandler | null;           // Get handler for URI
}
```

---

## Built-in Handlers

### File Handler (`file://`)
- **File:** `backend/source-handlers/file-handler.js`
- **Capabilities:** Watch (chokidar), Open (shell), Preview, No cache
- **Hash:** SHA-256 of file bytes

### URL Handler (`https://`)
- **File:** `backend/source-handlers/https-handler.js`
- **Capabilities:** No watch, Open (shell.openExternal), Preview (cached), Cache
- **Hash:** SHA-256 of cached content

---

**Source:** Tech Spec Section 3, Section 7
**Last Updated:** January 2026
