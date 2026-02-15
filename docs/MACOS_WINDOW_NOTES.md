# macOS Window Behavior - Known Issues

## The Problem

We use a panel-type window (`type: 'panel'`, `focusable: false`, `alwaysOnTop: true`) which works great - doesn't steal focus, floats above fullscreen apps.

**But:** When user switches desktops, the window reappears on the new desktop. It should stay hidden until explicitly invoked again via hotkey.

## What We Tried

Used `NSWindowCollectionBehavior` flags to control this:
- Disabling `canJoinAllSpaces` - confines window to single desktop
- Disabling `moveToActiveSpace` - prevents auto-following to active space

**Result:** Doesn't work. Window still reappears on other desktops.

## Why It's Hard

The problem is contradictory:
- Panel windows render on all visible spaces by default
- Collection behavior flags control *when* panels move, not *if* they appear
- No flag makes a panel "truly hidden" on other desktops

## Current State

We reverted to basic panel implementation without native code. The window works, but has the reappearance issue.

## For Next Developer

If tackling this: Look into detecting desktop/space changes via `NSWorkspaceActiveSpaceDidChangeNotification` and explicitly hiding the window on switch, rather than trying to configure collection behavior.
