# Development Log - 2026-02-15

<!-- Created by Claude (Anthropic) -->

## Session Summary

Investigated and attempted to fix macOS window behavior issue where the Index Electron application's overlay window incorrectly reappears when users switch desktop spaces. After exploring NSWindowCollectionBehavior native APIs and multiple implementation approaches, determined that the desired behavior (appear on all spaces but don't auto-show when switching) is not achievable with current Electron/macOS APIs. Reverted to simplified panel implementation and documented findings for future reference.

## Activities Completed

- Reviewed previous session's panel-type overlay implementation
- Diagnosed window behavior issue: window reappears on new desktops when switching spaces
- Researched NSWindowCollectionBehavior flags and their interactions with Electron
- Implemented and tested native Node.js addon for direct macOS API access
- Debugged native module compilation issues (C++ exceptions, N-API syntax)
- Investigated timing issues with NSApp keyWindow availability
- Created comprehensive technical documentation of the problem space
- Reverted to clean, basic panel implementation after determining native approach was not viable
- Removed all native code dependencies and build artifacts

## Files Changed

- `electron/main/window-manager/macos.js` - Simplified to basic panel configuration, removed all native API calls and complex collection behavior management
- `docs/MACOS_WINDOW_NOTES.md` - Created comprehensive documentation explaining the window behavior problem, attempted solutions, and technical constraints

## Files Deleted

- `src/native/` - Entire directory containing native addon source code
- `lib/window-config.js` - Native module JavaScript wrapper
- `binding.gyp` - Native module build configuration
- `build/` - Native module build artifacts

## Key Decisions

- **Reverted to basic panel implementation**: After extensive testing, determined that macOS NSWindowCollectionBehavior cannot provide the desired behavior (appear on all spaces but don't auto-show when switching spaces). The flags NSWindowCollectionBehaviorCanJoinAllSpaces and NSWindowCollectionBehaviorMoveToActiveSpace work in opposition - either the window appears everywhere (including unwanted auto-show) or it stays on one space.

- **Removed native code entirely**: Native Node.js addon approach introduced significant complexity (build toolchain, compilation issues, timing dependencies) without solving the core problem. Clean Electron API surface is more maintainable.

- **Documented the constraint**: Created MACOS_WINDOW_NOTES.md to preserve investigation findings and prevent future developers from revisiting the same dead ends.

## In Progress / Next Steps

- Consider alternative UX approaches that work within macOS constraints:
  - Option 1: Window appears only on the space where it was last shown (simpler, more predictable)
  - Option 2: Use a true menu bar app pattern instead of overlay window
  - Option 3: Accept current behavior as platform limitation
- User testing to determine if the current behavior is actually problematic in practice
- Review Raycast's implementation approach (may use private APIs not available to Electron apps)

## Blockers / Open Questions

- **Fundamental platform constraint**: macOS does not provide a public API to make a window "available on all spaces" without also making it auto-show when switching spaces. This appears to be by design in the Spaces/Mission Control architecture.

- **Private API consideration**: Some applications (like Raycast) may achieve this behavior through private APIs, but this would:
  - Risk App Store rejection
  - Break with macOS updates
  - Require code signing workarounds
  - Not be suitable for a production Electron application

## Technical Notes

### NSWindowCollectionBehavior Investigation

Tested combinations of these flags:
- `NSWindowCollectionBehaviorCanJoinAllSpaces` - Makes window appear on all spaces but triggers auto-show on space switch
- `NSWindowCollectionBehaviorMoveToActiveSpace` - Disabled to prevent following user, but conflicts with CanJoinAllSpaces
- `NSWindowCollectionBehaviorStationary` - Pins window to specific space, opposite of desired behavior

### Native Module Compilation Issues Encountered

1. C++ exceptions not enabled - Required adding `-fexceptions` to binding.gyp
2. N-API syntax errors - `napi_value` must be declared before use in variable declarations
3. Timing issue - `[NSApp keyWindow]` returns nil when called immediately after window creation; requires waiting for 'ready-to-show' or similar event

### Current Implementation

The simplified implementation in `electron/main/window-manager/macos.js` uses:
- Panel type window (`type: 'panel'`)
- Basic visibility flags (`alwaysOnTop: true`, `skipTaskbar: true`)
- Standard Electron show/hide behavior triggered by global hotkey
- No collection behavior modification

This provides stable, predictable behavior at the cost of the window not being "omnipresent" across spaces.
