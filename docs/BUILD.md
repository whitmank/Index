---
Author: Claude Code
Last Updated: 2026-02-15
---

# Native Bindings Build Guide

This document covers the native macOS bindings used in Index, specifically the workspace observer for detecting desktop/space changes.

## Overview

Index uses **native Objective-C++ bindings** via Node.js N-API to hook into macOS's `NSWorkspaceActiveSpaceDidChangeNotification`. This allows the app to detect when users switch between virtual desktops and automatically hide the overlay window to respect the hidden state.

## Architecture

```
binding.gyp                    # node-gyp build configuration
src/native/
  ├── workspace-observer.h     # C++ class definition
  ├── workspace-observer.mm    # Objective-C++ implementation
  └── bindings.mm              # N-API JavaScript bridge
lib/
  └── workspace-observer.js    # JavaScript EventEmitter wrapper
```

## Setup

### Prerequisites

- **macOS** (Xcode command-line tools required)
- **Node.js 20+** (comes with Electron 39+)
- **Python 3** (required by node-gyp)

Verify you have the tools:
```bash
xcode-select --install      # Install Xcode CLI tools if needed
node --version              # Should be v20+
python3 --version           # Should be v3+
```

### Installation

```bash
# Install dependencies (including native module tools)
npm install

# Build native bindings (done automatically via postinstall)
npm run build:native

# Or, if you need to rebuild:
npm run build:native:clean  # Clean previous build
npm run build:native        # Rebuild
```

The build produces:
- `build/Release/workspace_observer.node` — Compiled native module
- `lib/workspace-observer.js` — JavaScript wrapper

## Development

### Editing Native Code

If you modify the Objective-C++ files (`src/native/*.mm`):

```bash
# Rebuild the native module
npm run build:native

# Or with verbose output for debugging
node-gyp rebuild --verbose
```

### Debugging Build Issues

**"node-gyp: not found"**
```bash
npm install -g node-gyp
```

**"xcode-select: error: tool 'xcodebuild' not found"**
```bash
xcode-select --install
```

**Permission denied on node_modules/.bin/node-gyp**
```bash
chmod +x node_modules/.bin/node-gyp
npm run build:native
```

**Build fails with framework errors**
```bash
# Clean and rebuild
npm run build:native:clean
npm run build:native --verbose
```

### Common Issues

**Issue:** "Python was not found; run without arguments to install from the Microsoft Store"
- **Solution:** Install Python 3 via Homebrew: `brew install python3`

**Issue:** "gyp ERR! build error (code 2)" with Xcode errors
- **Solution:** Ensure Xcode CLI tools are up to date:
  ```bash
  xcode-select --reset
  xcode-select --install
  ```

**Issue:** Build succeeds but native module doesn't load
- **Solution:** Check that the module path is correct:
  ```bash
  ls build/Release/workspace_observer.node
  ```

## API Reference

### WorkspaceObserver

JavaScript class that wraps the native bindings.

**Usage:**
```javascript
import { WorkspaceObserver } from './lib/workspace-observer.js';

const observer = new WorkspaceObserver();

observer.on('space-changed', () => {
  console.log('User switched desktops');
});

observer.start();    // Begin listening
observer.stop();     // Stop listening
```

**Events:**
- `space-changed` — Fired when user switches virtual desktops/spaces

**Methods:**
- `start()` — Start listening for notifications (macOS only; no-op on other platforms)
- `stop()` — Stop listening
- `getIsListening()` — Check if currently listening

## Platform Notes

### macOS
- **Fully supported** — Uses native Objective-C++ bindings
- **Requires:** Xcode command-line tools

### Windows / Linux
- **Gracefully disabled** — The module will fail to load, but the app continues
- `WorkspaceObserver` becomes a no-op (all methods are safe)
- No functionality loss (window doesn't have concept of "spaces")

## Technical Details

### NSWorkspace Integration

The native module registers an observer with `NSWorkspaceActiveSpaceDidChangeNotification`:

```objective-c++
NSWorkspace *workspace = [NSWorkspace sharedWorkspace];
NSNotificationCenter *nc = workspace.notificationCenter;

[nc addObserverForName:NSWorkspaceActiveSpaceDidChangeNotification
                object:nil
                 queue:[NSOperationQueue mainQueue]
            usingBlock:^(NSNotification *notification) {
              // Callback fired when user switches spaces
            }];
```

### Thread Safety

The N-API layer uses `napi_create_threadsafe_function` to safely invoke JavaScript callbacks from the Objective-C runtime.

### Build System

- **Build tool:** `node-gyp`
- **C++ API:** Node-API (N-API) via `node-addon-api`
- **Frameworks:** Foundation, AppKit

## Deployment

When building/distributing the app via Electron Builder:

1. Ensure native bindings are built: `npm run build:native`
2. Electron Builder includes `build/Release/*.node` files (see `package.json` build.files)
3. The packaged app contains the compiled native module

```bash
npm run electron:build    # Builds and packages (includes native bindings)
```

## Resources

- [Node.js N-API Documentation](https://nodejs.org/api/n-api.html)
- [node-addon-api GitHub](https://github.com/nodejs/node-addon-api)
- [Apple NSWorkspace Documentation](https://developer.apple.com/documentation/appkit/nsworkspace)
- [Electron Native Code Guide](https://www.electronjs.org/docs/latest/tutorial/native-code-and-electron-objc-macos)
- [Xcode Build System](https://developer.apple.com/xcode/)

---

For questions or issues with the native build, check the console output for detailed error messages from node-gyp and the Objective-C++ compiler.
