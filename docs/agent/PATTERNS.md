# Code Patterns & Conventions

Standard patterns for implementing features across the codebase.

---

## React Components

### Functional Component Template
```jsx
import React, { useState, useEffect } from 'react';

export function MyComponent({ prop1, onAction }) {
  const [state, setState] = useState(null);

  useEffect(() => {
    // Setup logic
  }, []);

  return (
    <div className="component">
      {/* JSX */}
    </div>
  );
}
```

### Custom Hook Pattern
```javascript
// hooks/useMyFeature.js
import { useAppStore } from '../store/app-store';

export function useMyFeature() {
  const { data, setData } = useAppStore();

  const update = (newValue) => {
    setData(newValue);
  };

  return { data, update };
}

// Usage in component
const { data, update } = useMyFeature();
```

---

## State Management (Zustand)

### Store Pattern
```javascript
// store/app-store.js
import { create } from 'zustand';

export const useAppStore = create((set) => ({
  // State
  objects: new Map(),
  selectedIds: new Set(),
  loading: false,

  // Actions
  setObjects: (objects) => set({ objects: new Map(objects) }),
  addObject: (obj) => set((state) => {
    state.objects.set(obj.id, obj);
    return { objects: new Map(state.objects) };
  }),
  toggleSelect: (id) => set((state) => {
    const sel = new Set(state.selectedIds);
    sel.has(id) ? sel.delete(id) : sel.add(id);
    return { selectedIds: sel };
  }),
}));
```

### Using Store in Components
```jsx
import { useAppStore } from '../store/app-store';

function MyComponent() {
  const { objects, setObjects } = useAppStore();

  return <div>{objects.size} items</div>;
}
```

---

## API Integration

### Fetch Data
```javascript
// Frontend
async function fetchObjects() {
  const response = await fetch('http://localhost:3000/api/objects');
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
}

// In component/hook
useEffect(() => {
  fetchObjects()
    .then(setObjects)
    .catch(setError);
}, []);
```

### Create/Update/Delete
```javascript
async function createObject(data) {
  const response = await fetch('http://localhost:3000/api/objects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return response.json();
}

async function updateObject(id, updates) {
  const response = await fetch(`http://localhost:3000/api/objects/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return response.json();
}

async function deleteObject(id) {
  const response = await fetch(`http://localhost:3000/api/objects/${id}`, {
    method: 'DELETE',
  });
  return response.ok;
}
```

---

## Express Routes

### Route Handler Pattern
```javascript
// backend/database/routes/objects.js
import express from 'express';
import { ObjectService } from '../services/object-service.js';

const router = express.Router();
const objectService = new ObjectService();

// GET /api/objects
router.get('/', async (req, res) => {
  try {
    const objects = await objectService.list(req.query);
    res.json(objects);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/objects
router.post('/', async (req, res) => {
  try {
    const object = await objectService.create(req.body);
    res.status(201).json(object);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
```

### Service Layer Pattern
```javascript
// backend/database/services/object-service.js
import { DBService } from '../db-service.js';

export class ObjectService {
  constructor() {
    this.db = new DBService();
  }

  async list(filters = {}) {
    let query = 'SELECT * FROM objects';
    if (filters.type) query += ` WHERE type = $type`;
    return this.db.query(query, filters);
  }

  async create(data) {
    // Validation
    if (!data.source) throw new Error('source required');

    // Creation
    return this.db.create('objects', data);
  }

  async update(id, updates) {
    return this.db.update(id, updates);
  }

  async delete(id) {
    return this.db.delete(id);
  }
}
```

---

## IPC Communication

### IPC Handler Pattern (Main Process)
```javascript
// electron/main/ipc/fs-bridge.js
import { ipcMain } from 'electron';

ipcMain.handle('fs:select-files', async (event) => {
  const { filePaths } = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
  });
  return filePaths;
});

ipcMain.on('fs:watch-path', (event, path) => {
  const watcher = chokidar.watch(path);
  watcher.on('change', () => {
    event.sender.send('fs:path-changed', path);
  });
});
```

### Preload Script Pattern
```javascript
// electron/preload/preload.js
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFiles: () => ipcRenderer.invoke('fs:select-files'),
  watchPath: (path, callback) => {
    ipcRenderer.on('fs:path-changed', (event, changedPath) => {
      if (changedPath === path) callback();
    });
  },
});
```

### Using IPC in React
```jsx
// Frontend
async function handleSelectFiles() {
  const files = await window.electronAPI.selectFiles();
  setSelectedFiles(files);
}

function handleWatch() {
  window.electronAPI.watchPath('/path/to/file', () => {
    console.log('File changed, refresh');
  });
}
```

---

## Source Handlers

### Handler Implementation Template
```javascript
// backend/source-handlers/[scheme]-handler.js
import { SourceHandler } from './handler-base.js';

export class MyHandler extends SourceHandler {
  scheme = 'myscheme';

  canHandle(uri) {
    return uri.startsWith('myscheme://');
  }

  async validate(uri) {
    // Validation logic
    return { valid: true };
  }

  async extractMetadata(uri) {
    // Extract and return metadata
    return { title: '...', size: 0, ... };
  }

  async getContentHash(uri) {
    // Calculate and return SHA-256 hash
    return 'sha256:abc...';
  }

  get capabilities() {
    return {
      canWatch: false,
      canOpen: true,
      canPreview: true,
      canCache: false,
    };
  }
}
```

### Registering Handler
```javascript
// backend/source-handlers/handler-registry.js
import { MyHandler } from './myscheme-handler.js';

const registry = new SourceRegistry();
registry.register(new MyHandler());
```

---

## Database Service Pattern

```javascript
// backend/database/db-service.js
import Surreal from 'surrealdb.js';

export class DBService {
  constructor() {
    this.db = new Surreal();
  }

  async connect(url) {
    await this.db.connect(url);
    await this.db.use('index', 'default');
  }

  async query(sql, vars = {}) {
    return this.db.query(sql, vars);
  }

  async create(table, data) {
    return this.db.create(`${table}:${v4()}`, data);
  }

  async update(id, data) {
    return this.db.update(id, data);
  }

  async delete(id) {
    return this.db.delete(id);
  }
}
```

---

## Error Handling

### Backend Error Pattern
```javascript
// Route
router.post('/', async (req, res) => {
  try {
    const result = await service.create(req.body);
    res.json(result);
  } catch (error) {
    if (error.code === 'DUPLICATE') {
      res.status(409).json({ error: error.message, code: 'DUPLICATE' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});
```

### Frontend Error Pattern
```jsx
const [error, setError] = useState(null);

async function handleAction() {
  try {
    await performAction();
    setError(null);
  } catch (err) {
    setError(err.message);
  }
}

return <div>{error && <div className="error">{error}</div>}</div>;
```

---

## Testing Patterns

### Unit Test Template
```javascript
// __tests__/service.test.js
import { MyService } from '../service.js';

describe('MyService', () => {
  let service;

  beforeEach(() => {
    service = new MyService();
  });

  test('should do something', () => {
    const result = service.doSomething();
    expect(result).toBe(expected);
  });
});
```

---

**Source:** Tech Spec Sections 5-8
**Last Updated:** January 2026
