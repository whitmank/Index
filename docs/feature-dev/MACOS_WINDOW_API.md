# macOS Native Window API Reference

This document captures key macOS window management APIs and concepts for building overlay applications.

## Overview

macOS provides sophisticated window management APIs through the Cocoa framework. Understanding these APIs is essential for building applications that behave like system overlays (e.g., Raycast, Alfred).

## Core Concepts

### Window Types

macOS supports different window types via `NSWindowStyleMask` and the `type` property in Electron:

- **`regular`** (default): Standard application window with title bar and decorations
- **`panel`**: Floats above full-screen applications and other windows. Does not steal focus when shown. Does not appear in the dock. Key for overlay applications.
- **`modal`**: Modal dialog window
- **`utility`**: Utility/tool window (smaller than regular)

**Panel Windows:** Best choice for overlay UIs like Index because they:
- Float above fullscreen apps (Mission Control, games, etc.)
- Don't steal focus from the active application
- Don't appear in the dock or window switcher
- Can use vibrancy effects (glassmorphic UI)

### NSWindowCollectionBehavior

The `collectionBehavior` property controls how a window participates in macOS's virtual desktop (Spaces) system. This is a bitmask of flags that can be combined.

#### Key Flags

| Flag | Purpose | Behavior |
|------|---------|----------|
| `NSWindowCollectionBehaviorDefault` | Default behavior | Window moves to active space when brought to focus |
| `NSWindowCollectionBehaviorCanJoinAllSpaces` | Window visible on all spaces | Window appears on every virtual desktop simultaneously |
| `NSWindowCollectionBehaviorMoveToActiveSpace` | Auto-follow active space | Window automatically moves when user switches desktops |
| `NSWindowCollectionBehaviorStationary` | Window stays on invoked space | Window does not follow user across desktops |
| `NSWindowCollectionBehaviorParticipatesInCycle` | Window cycles with Cmd+` | Appears in window cycling |
| `NSWindowCollectionBehaviorIgnoresCycle` | Window skips cycling | Does not appear in Cmd+` window switcher |
| `NSWindowCollectionBehaviorFullScreenPrimary` | Can enter fullscreen | Window can be fullscreened |
| `NSWindowCollectionBehaviorFullScreenAuxiliary` | Supports fullscreen modes | Auxiliary fullscreen mode support |

#### Common Combinations

**Raycast-style behavior** (window stays on invoked space):
```objc
// Window appears on all spaces BUT doesn't move when switching
behavior |= NSWindowCollectionBehaviorCanJoinAllSpaces;
behavior &= ~NSWindowCollectionBehaviorMoveToActiveSpace;
```

**Single space behavior** (window confined to one desktop):
```objc
// Window only appears on the space where it was invoked
behavior &= ~NSWindowCollectionBehaviorCanJoinAllSpaces;
behavior &= ~NSWindowCollectionBehaviorMoveToActiveSpace;
```

**Full isolation** (window ignores space switching entirely):
```objc
// Window is completely independent of space management
behavior &= ~NSWindowCollectionBehaviorCanJoinAllSpaces;
behavior &= ~NSWindowCollectionBehaviorMoveToActiveSpace;
behavior |= NSWindowCollectionBehaviorStationary;
```

### Getting/Setting Collection Behavior

```objc
NSWindow* window = [NSApp keyWindow];  // Get focused window
if (!window) {
  // No key window - window not yet active/focused
  return;
}

NSWindowCollectionBehavior behavior = window.collectionBehavior;

// Modify behavior using bitwise operations
behavior |= NSWindowCollectionBehaviorCanJoinAllSpaces;   // Add flag
behavior &= ~NSWindowCollectionBehaviorMoveToActiveSpace; // Remove flag

// Apply modified behavior
window.collectionBehavior = behavior;
```

## Common Challenges

### Challenge 1: Timing of [NSApp keyWindow]

**Problem:** `[NSApp keyWindow]` returns `nil` if called before the window is active.

**When it works:** After the window is:
- Visible (after `show()`)
- Has been focused/activated
- Is the active application window

**Solution:** Defer collection behavior configuration until after window show event:
```javascript
mainWindow.once('show', () => {
  setImmediate(() => {
    // Now safe to call native code that uses [NSApp keyWindow]
    configureWindowBehavior();
  });
});
```

### Challenge 2: Panel Windows Can't Receive Focus

When `focusable: false` is set on a panel window:
- It won't steal focus from other applications
- But `mainWindow.focus()` may not work as expected
- The window can still be visible and interactive

**Workaround:** Use `mainWindow.show()` to make visible; focus is not necessary for user interaction.

### Challenge 3: Collection Behavior Can't Do Everything

**Limitation:** There is no built-in flag to make a window:
- Appear on all spaces but NOT move when switching
- Only appear when explicitly invoked and stay hidden otherwise

**Why:** These are contradictory requirements. If `canJoinAllSpaces` is enabled, the OS can draw it on any space. If `moveToActiveSpace` is disabled, it won't follow you. But neither prevents the OS from rendering it on other spaces.

**Alternative approach:** Instead of trying to control collection behavior, manage visibility in response to space change notifications.

## Electron Integration

### Panel Type in Electron

```javascript
const mainWindow = new BrowserWindow({
  type: 'panel',           // macOS panel window
  alwaysOnTop: true,       // Stay above other windows
  focusable: false,        // Don't steal focus
  frame: false,            // No title bar
  transparent: true,       // Transparent background
  hasShadow: true,         // Add drop shadow
  vibrancy: 'popover',     // Glass effect (macOS 10.10+)
  visualEffectState: 'active',
});
```

### Accessing Native Window

To manipulate native behavior from JavaScript:

**Via N-API bindings:**
```javascript
// window-config.js
const addon = require('../build/Release/window_config.node');
addon.configureWindowBehavior();
```

**Via native module:**
```cpp
// bindings.mm
#include <napi.h>
#include <Cocoa/Cocoa.h>

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set(
    Napi::String::New(env, "configure"),
    Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
      NSWindow* window = [NSApp keyWindow];
      // Modify window.collectionBehavior
      return info.Env().Undefined();
    })
  );
  return exports;
}

NODE_API_MODULE(my_module, Init)
```

## Useful Resources

- [NSWindowCollectionBehavior Documentation](https://developer.apple.com/documentation/appkit/nswindowcollectionbehavior)
- [NSWindow Documentation](https://developer.apple.com/documentation/appkit/nswindow)
- [Virtual Spaces Overview](https://support.apple.com/guide/mac-help/work-in-multiple-spaces-mh14112/mac)
- [Electron BrowserWindow Options](https://www.electronjs.org/docs/api/browser-window)

## Lessons Learned

1. **Panel windows are the right choice** for overlay applications - they handle most of the complexity automatically
2. **Collection behavior is declarative, not procedural** - you can't create arbitrary visibility rules
3. **Timing matters** - native code execution depends on window lifecycle events
4. **Simpler is better** - often the basic panel behavior (`type: 'panel'`, `focusable: false`) is sufficient without additional native manipulation
5. **Test on actual macOS** - behavior varies between macOS versions and can be hard to predict without testing

## Related Files

- `electron/main/window-manager/macos.js` - Electron window manager using panel type
- `electron/main/index.js` - Global hotkey registration and window lifecycle
