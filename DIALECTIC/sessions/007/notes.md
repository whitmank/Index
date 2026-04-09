---
session: 007
date: 2026-03-25
authored_by: Claude Sonnet 4.6
---

## Session 007 — Frontend UI Work

### Decisions

- **Type filter button** added to top-left corner of list view header (previously empty).
  - State model: two independent bits — `filterSide` ('objects'|'spaces') + `filterCombined` (bool).
  - Single click: toggles side (or exits combined if active). Hold (300ms): toggles combined.
  - Icon reflects state: ObjectIcon, SpaceIcon, or MonadIcon.

- **Shared icon system** established at `src/icons/index.jsx`.
  - Three exports: `ObjectIcon`, `SpaceIcon`, `MonadIcon`.
  - No component owns these — imported wherever needed.
  - Geometry: viewBox `0 0 4 4`, center `(2,2)`, inner dot `r=1`, outer ring `r=1.618` (φ).
  - `vectorEffect="non-scaling-stroke"` on ring elements for consistent 1px weight at any size.
  - All instances render at `size=12`.

- **Row type badges** converted from unicode (●/○) to SVG using shared icons.

- **Column alignment**: first grid column uses `display:flex; justify-content:center; align-items:center` as the shared centering rule for both header and rows — single source of alignment truth.

- **URI removed** from list rows. Name only.

- **Alternating row tint** added (`nth-child(even)` at `rgba(0,0,0,0.025)`).

- **View toggle** collapsed from two buttons to one. Shows current view icon, clicks to other.
  - Keyboard shortcut: `V` (no modifier, guarded against inputs).

### Open
- Icon visual consistency still being tuned (size, stroke weight relative to fill dot).

