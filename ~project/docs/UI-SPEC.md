---
title: Index — Frontend UI Specification
version: 0.5 (distilled for rebuild)
date: 2026-07-20
author: Authored by Karter Whitman using Claude Opus 4.8
---

# Index — Frontend UI Specification

A rebuild-ready distillation of the current interface. Framework-agnostic where
possible; where a mechanism is load-bearing (LIVE SELECT reactivity, controlled
selection) it is called out.

---

## 1. Core Concept the UI Must Express

- One primitive: the **object** (a file/URL reference). An object with `space:
  true` is a **space** — a navigable, named context. Everything else is a leaf.
- The UI never exposes a folder tree. Objects live in *multiple* contexts at
  once via tags + spaces. The interface sells "what things mean, not where they
  are."
- Visual grammar for the primitive, used **everywhere** (list, address bar,
  create menu, dropdowns, badges):
  - `●` filled dot = **object** (leaf)
  - `○` ring (radius 1.618, golden ratio) = **space**
  - **monad** = ring + dot together = "both / all" (the combined filter state)
  - Typed objects swap `●` for a small **geometric type glyph** (dot, ring,
    square, bar, diamond, triangle, cross, wave) carried on `tag_definitions.icon`.

---

## 2. Visual System

- **Window is a translucent floating panel**, not a full-screen app. Background
  is a single tunable HSLA layer: `hsla(--app-bg-h, --app-bg-s, --app-bg-l,
  --app-bg-a)` defaulting to `hsla(0,0%,92%,0.75)` over desktop blur, framed by
  layered shadows + a 1px inset top highlight. The whole chrome reads as frosted
  glass sitting above the OS.
- **User-tunable appearance**: Hue / Saturation / Lightness / Opacity sliders
  (each with a live gradient track preview). Persisted to
  `~/.index/appearance.json` via IPC; loaded *before first render* to avoid flash.
  Guard `bgA` so the window can never become fully invisible.
- **Type**: body UI is `Arial, sans-serif` at small sizes; **Spectral** (serif,
  weights 300–600, bundled locally) is available for editorial/display text;
  monospace `Monaco/Menlo` for URIs/paths.
- **Palette**: near-monochrome. Text and fills are `rgba(0,0,0,α)` washes over
  the translucent bg (α ≈ 0.25 tertiary → 0.75 primary). Single accent blue
  `#0061d9` for selection/active. No hard borders — hierarchy comes from tiny
  translucent background steps (`rgba(0,0,0,0.02–0.07)`).
- **Density**: compact, Finder-like. 12px icons, single-line rows, restrained
  spacing. Focus rings suppressed globally; `:focus-visible` only.
- Everything should also read on a **dark/tinted** background since the user
  controls hue — prefer alpha washes over opaque grays.

---

## 3. Layout Shell

Single window, vertical stack:

```
┌───────────────────────────────────────────┐
│  AddressBar   ‹  [ label / search ]  ≡⬡ ⊕  │   ← fixed top strip
├───────────────────────────────────────────┤
│                                            │
│   Active view (list / graph / source /     │
│   settings / tags)                         │
│                                            │
└───────────────────────────────────────────┘
   Overlays: ObjectCard, CommandPalette, TagEdit, Import
```

- One content region at a time, chosen by `activeTopLevelView`
  (`spaces` | `tags` | `settings`) and, within spaces, `activeView`
  (`list` | `graph`) — unless the active location is a **leaf object**, in which
  case the region shows its **source view** instead of a list.
- A second window mode exists: `?mode=quick` → **QuickSpaceView** overlay
  (lightweight capture surface, spawned by the global hotkey).

---

## 4. AddressBar (top strip)

Three slots: **back · field · right-tools**.

- **Back** `‹` — disabled at home (`~`); otherwise pops nav history (or exits a
  top-level view back to spaces).
- **Field** — shows current location `label` (`~` for home, `Settings`, or the
  space/object name). Click or **⌘L** turns it into a **combined search input**:
  - Empty query → lists spaces only (`○`), Tab to browse.
  - Typed query → matches **spaces (`○`) and objects (`●`)**, each with its glyph.
  - ↑/↓ to move, Tab to autocomplete first hit, Enter to execute, Esc to cancel.
  - Selecting a space navigates into it; selecting an object navigates *to it as
    a location*.
- **Right tools**:
  - **View toggle** (`≡` list / `⬡` graph) — only shown in spaces view.
  - **Create (`⊕`)** — popover menu: `● Object` / `○ Space`. New item is created
    in the current space (via a `contains` edge unless at root), then opens in
    edit-name-on-mount state.

---

## 5. ObjectListView (primary view)

Finder-style table. Columns: **[glyph] · Name · Kind · Created**.

- **Rows**: 12px leading glyph (space ring / type glyph / thumbnail), name
  (falls back to "Untitled"), Kind (uppercase extension or `URL`; blank for
  spaces), formatted date. System rows (e.g. root) sort first and hide
  Kind/date.
- **Thumbnails**: images + PDFs render a 40px thumbnail in place of the glyph
  (via `fs:thumbnail`); epub covers via `fs:epubCover`. Cached across rows.
- **Header controls**:
  - **Filter button** cycling three states with a single control: **all
    (monad)** → **objects (`●`)** → **spaces (`○`)**. Tap toggles; **hold
    (300ms)** jumps back to "all". Same logic bound to the **backtick key**.
  - **Sort buttons**: Name / Created, click to set field, click again to flip
    direction (↑/↓). Name defaults asc, Created defaults desc.
- **Selection (controlled, lifted to app root)** — Finder semantics:
  - Click = single select; ⌘/Ctrl-click = toggle; Shift-click = range from
    anchor.
  - Keyboard: **W/S or ↑/↓** move; **Shift+** extends range (anchor + moving
    cursor); **⌘A** select all; click empty canvas clears.
  - **Selection is remembered per space** and restored on nav back/forward;
    pruned when a branch leaves history.
- **Open semantics**:
  - **D / → / double-click** on a single selection → navigate *into* it (spaces
    and objects alike). With nothing selected, D/→ selects the first row.
  - **Enter** on a single selection → space navigates in; object opens its
    **ObjectCard** modal.
  - **Delete/Backspace** deletes selection.
- **Drop / paste**: dragging files or URLs onto the list (or **⌘V**) adds them to
  the active space, deduped by URI; a full-surface "Drop to add" overlay appears
  on dragenter. Empty state reads "Drop files or links to add."

---

## 6. GraphView (alternate view)

- D3 force-directed graph of the same `displayObjects`. Nodes render as `●`/`○`;
  click selects → opens ObjectCard. Physics + zoom/drag; simulation lifecycle
  split into mount / data-change / resize; node positions reconciled live.
- **Edges are not yet rendered** — nodes only. A rebuild should treat edge
  rendering (`contains` / `tagged` / `sourced_from`, ego-graph on entering a
  leaf) as the first extension.

---

## 7. ObjectCard / ObjectDetailPane (object surface)

The detail pane is presented as a centered **modal** (`ObjectCardModal`);
Esc or click-outside closes. Content adapts to object vs space.

**Header (shared)**: pin button `◈` (toggles membership in `~`, hidden for
system objects) · type badge (`●`/`○`, or a 144px thumbnail) · title
(click-to-edit inline; opens in edit mode when freshly created).

**Info block**: `Type` (inline editable type-tag badge with its glyph + color;
create-on-type, `—` when empty) · `Added` (full date).

**For leaf objects**:
- **Type schema section** — if the object's type defines a `schema` (ordered
  list of tag types), render guided metadata field rows for it.
- **Sources** — ordered list of URIs. Each: drag handle `⠿` to reorder, label
  (filename or hostname, hover reveals full URI), click to open externally, `×`
  to remove. Add via a `+` card that accepts **drop / paste / Browse file**.
- **Tags** — free tag assignment with typed/untyped autocomplete
  (`TagAddInput`), excluding tag types already consumed by the schema.

**For spaces**:
- **Rules** — inline **SpaceRulesSection**: tag-query rule groups and device
  rule groups (`from_any` / `from_none`) that define membership. Membership is
  evaluated server-side as `(query_results ∪ contains) − excludes`.

---

## 8. TagsView (library / management)

Two-column: nav rail + panel.

- **Rail**: pinned **Types** section first, an **untyped (`∅`)** bucket, then one
  entry per tag type (ordered), a `× delete`, and **+ New type** (inline input).
- **Panel** depends on selection:
  - **Types** → list of type values (book, song, …) each with its geometric
    glyph; selecting one opens an inline **schema editor**: an **icon picker**
    (8 geometric keys) + an ordered **schema** field list (add via
    autocomplete over existing tag types, create-on-miss).
  - **Untyped** / a **type** → flat tag list; rows show a color swatch, inline
    rename, `×` delete; **+ New** to append. System groups honor
    `editable`/`deletable` flags.

---

## 9. Settings & other surfaces

- **SettingsView**: tabbed (Appearance / Devices / Keybinds). Appearance = the
  HSLA sliders. Devices = live list of known devices (from store). Esc restores
  the prior context (view + space), not just "home."
- **CommandPalette** (**⌘K**): fuzzy command list; includes `Settings → <tab>`
  jump commands. Extensible command registry.
- **ImportModal**: Finder-import flow — folder tree with per-folder tag
  assignment, already-indexed detection, optional space creation. Triggered by
  the Finder Sync extension via `onImportFolder`.
- **TagEditModal** (**⌘E**): context-sensitive — single space → edit rules;
  single object → edit tags; multiple selected → batch tag edit.
- **QuickSpaceView**: minimal capture overlay for the `?mode=quick` window.

---

## 10. Keyboard Map (global)

| Keys | Action |
|---|---|
| `⌘,` | Settings |
| `⌘K` | Command palette |
| `⌘L` | Address-bar search |
| `A` / `←` | Nav back |
| `D` / `→` | Nav forward / into selection (select first if none) |
| `W` `S` / `↑` `↓` | Move selection (Shift = extend range) |
| `⌘A` | Select all |
| `⌘\`` | Home (`~`) |
| `⌘/` | Root (`/`) |
| `V` | Toggle list/graph |
| `` ` `` (backtick) | Cycle list filter (all → objects → spaces; hold = all) |
| `⌘E` | Context tag/rule edit modal |
| `⌘V` | Paste URL/path as object into space |
| `Enter` | Open object card / enter space |
| `Delete` `Backspace` | Delete selection |
| `Esc` | Dismiss overlay / restore prior context |

Rules: directional keys take **no modifier** and are suppressed inside inputs;
paste is intercepted only outside inputs.

---

## 11. State & Reactivity Contract (non-negotiable for a faithful rebuild)

- **Single store** (`useIndexStore`) owns: `objects` (spaces + leaves), `tags`,
  `tagTypes`, `typedEdges`, `taggedEdges`, `devices`, `rootObjects`,
  `activeSpaceObjects`, `objectTags` cache, and nav history.
- **LIVE SELECT is the update mechanism.** The renderer subscribes once at mount
  to `objects` + all edge tables and receives CREATE/UPDATE/DELETE diffs. The UI
  never polls or refetches on mutation — it mutates through IPC and lets the push
  reconcile. Any rebuild must preserve this: **write via API, render from
  subscription.**
- **Space membership is derived server-side**, re-evaluated on any relevant live
  event; the UI treats `activeSpaceObjects` as read-only truth.
- **Persistence in the client**: per-space filter/sort prefs and nav state
  (top-level view, space, view, open card) persisted to `localStorage` and
  restored after initial load.

---

## 12. Rebuild Guardrails

- Keep the **`●`/`○`/monad** grammar and geometric type glyphs — they are the
  product's identity and must be one shared icon module, not per-component SVGs.
- Keep the **object = space** unification. Do not reintroduce a separate
  space/folder entity or a hierarchical tree.
- Keep the **translucent, user-tunable window**; it is core to the feel.
- Keep **controlled selection lifted to the shell** so nav memory, batch tag
  edit, and card-open all read one selection source.
- Known debt to *not* carry forward: orphaned `CreateSpaceModal`, stale
  `.space-rules` CSS. Known gaps to build: graph edge rendering, full-screen
  object view, undo (archived but complete), full-text search.
</content>
