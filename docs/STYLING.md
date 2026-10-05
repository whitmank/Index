# Styling Guide

Documentation for working with styles in the Index project.

## Architecture Overview

### Style Organization

```
frontend/src/
├── styles/
│   └── global.css              # CSS variables, resets, body styles
├── components/
│   ├── Layout/
│   │   └── Layout.css          # Main grid structure, frame, toolbar, sidebars
│   └── DetailPanel/
│       └── DetailPanel.css     # Right sidebar detail panel
└── pages/
    ├── FilesView/
    │   └── FilesView.css       # File list table and content area
    ├── TagsView/
    │   └── TagsView.css        # Tags view specific styles
    └── DevView/
        └── DevView.css         # Dev tools view styles
```

**Pattern:** Each component/page has its own CSS file, imported directly in the JSX file.

## Design System

### CSS Variables (defined in `global.css`)

#### Colors
```css
--bg-color: oklch(92% 0% 68deg)    /* Light gray background */
--text-color: #000000               /* Primary text */
--text-secondary: #666666           /* Secondary/muted text */
--border-color: #e0e0e0             /* Borders and dividers */
--hover-color: #f5f5f5              /* Hover states */
--accent-color: #0066cc             /* Links, active states */
```

#### Spacing
```css
--spacing-xxs: 0.25rem  /* ~4px */
--spacing-xs: 0.5rem    /* ~8px */
--spacing-sm: 1rem      /* ~16px */
--spacing-md: 1.5rem    /* ~24px */
--spacing-lg: 2rem      /* ~32px */
--spacing-xl: 3rem      /* ~48px */
--spacing-xxl: 4rem     /* ~64px */

--in-frame: max(20px, 4vmin)  /* Responsive frame padding */
```

#### Typography
```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', ...
--font-mono: 'SF Mono', Monaco, 'Cascadia Code', ...
--font-size-base: 16px
--line-height: 1.6
```

#### Layout
```css
--border-radius: 10px
--icon-sm: 16px
--icon-md: 20px
--icon-lg: 24px
```

**Always use CSS variables** instead of hardcoded values for consistency and themability.

## Main Grid Layout

### Structure (`Layout.css`)

The app uses a **5-column CSS Grid** with sidebars anchored to edges:

```css
.main {
  display: grid;
  grid-template-columns: var(--in-frame) 25% 1fr 25% var(--in-frame);
  grid-template-rows: var(--in-frame) auto 1fr var(--in-frame);
  gap: var(--spacing-sm);
}
```

**Column breakdown:**
1. `var(--in-frame)` - Left edge padding (4vmin, responsive)
2. `25%` - Left sidebar (anchored to left edge)
3. `1fr` - Content area (flexible, centered)
4. `25%` - Right sidebar (anchored to right edge)
5. `var(--in-frame)` - Right edge padding (4vmin, responsive)

**Row breakdown:**
1. `var(--in-frame)` - Top edge padding
2. `auto` - Toolbar height (fits content)
3. `1fr` - Main content area (flexible)
4. `var(--in-frame)` - Bottom edge padding

### Grid Item Positions

```css
.toolbar         { grid-column: 2 / 5; grid-row: 2; }  /* Spans all 3 main areas */
.sidebar         { grid-column: 2;     grid-row: 3; }  /* Left sidebar */
.content-area    { grid-column: 3;     grid-row: 3; }  /* Center content */
.details-panel   { grid-column: 4;     grid-row: 3; }  /* Right sidebar */
```

### Critical Rules

⚠️ **DO NOT** remove `var(--in-frame)` columns - they provide the frame border spacing
⚠️ **DO NOT** center the entire layout with flexbox on body - sidebars must stay anchored
⚠️ The 25% sidebar widths are calculated relative to the grid container width (after padding)

## Keita Style Frame

The distinctive **frame border** effect:

```css
.frame {
  position: fixed;
  top: var(--in-frame);
  right: var(--in-frame);
  bottom: var(--in-frame);
  left: var(--in-frame);
  border: 1px solid var(--text-color);
  z-index: 9999;
  pointer-events: none;  /* Allows clicks through to content */
}
```

This creates the characteristic inset border. The grid padding must match `var(--in-frame)` to align content with the frame.

## Component Styling Patterns

### Tables (File Lists, Tags)

Tables use shared styles from `FilesView.css`:

```css
.file-list              /* Table itself */
.file-list thead        /* Sticky header */
.file-list tbody tr     /* Rows with hover states */
.file-list th.sortable  /* Sortable columns */
```

**Pattern:** Sticky headers, subtle hover states, cursor pointers for interactive elements.

### Content Area

All route components render a `.content-area` container:

```css
.content-area {
  grid-column: 3;
  grid-row: 3;
  display: grid;
  grid-template-rows: 1fr auto;  /* Content + footer */
  overflow: hidden;
  background: white;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
}
```

**Pattern:** White background cards with subtle borders and rounded corners.

### Sidebar Navigation

Links in the sidebar use React Router `<Link>` components:

```css
.sidebar-item          /* Base link style */
.sidebar-item:hover    /* Hover state */
.sidebar-item.active   /* Active route (inverted colors) */
```

**Pattern:** Active state is high-contrast (black background, white text).

## Responsive Behavior

### Sidebars
- Fixed at **25% of container width**
- Anchored to their respective edges
- Scale proportionally with viewport

### Content Area
- Flexible (`1fr`)
- Expands/contracts to fill space between sidebars
- Always centered

### Frame Padding
- Responsive: `max(20px, 4vmin)`
- Minimum 20px, scales with viewport
- Maintains consistent visual balance at all sizes

## Common Tasks

### Adding a New Route View

1. Create page component folder: `pages/NewView/`
2. Create `NewView.jsx` and `NewView.css`
3. Use `.content-area` container with proper grid positioning:
   ```css
   .content-area {
     grid-column: 3;
     grid-row: 3;
   }
   ```
4. Import and add route in `App.jsx`
5. Add navigation link in `Layout.jsx` sidebar

### Modifying Grid Layout

⚠️ **Be careful** - the grid structure is tightly coupled to the frame design.

**To change sidebar widths:**
- Modify percentages in `grid-template-columns` (must total 100%)
- Update all affected component positions

**To add a new grid area:**
- Add column/row to grid definition
- Update all grid-column/grid-row references
- Ensure frame padding columns/rows remain intact

### Changing Colors/Theme

All colors are defined as CSS variables in `global.css`:

1. Update color variables
2. Changes propagate automatically throughout the app
3. Consider adding a dark theme toggle by swapping variable values

## Gotchas & Pitfalls

### 1. Centering Layout
❌ **Don't** add `justify-content: center` to body
✅ **Do** let the grid naturally span full width

### 2. Grid Column Counting
- Grid columns are **1-indexed**
- Spanning uses format: `start / end` (e.g., `2 / 5`)
- Frame padding columns **count** in the numbering

### 3. Percentage Widths
- `25%` sidebar widths are relative to **grid container**, not viewport
- Actual width = `25% × (viewport width - 2 × frame-padding)`
- Gaps also affect final rendered width

### 4. Z-Index Layers
```
9999 - .frame (border overlay)
  10 - .file-list thead (sticky table headers)
   1 - .details-panel (above content)
```

### 5. Scrolling Containers
Only these elements should scroll:
- `.sidebar` (left navigation)
- `.file-list-container` (file/tag lists)
- `.panel-content` (detail panel content)

**Never** make the main grid scrollable.

## Testing Checklist

When modifying styles, verify:

- [ ] Layout looks correct at different window sizes
- [ ] Sidebars stay anchored to edges (no floating)
- [ ] Frame border aligns with content padding
- [ ] All routes render correctly in content area
- [ ] Detail panel opens without breaking layout
- [ ] Scrolling works only in designated containers
- [ ] Hover/active states work on interactive elements
- [ ] Text remains readable (contrast, sizing)

## Tools & Resources

**Browser DevTools:**
- Use Grid Inspector to visualize grid lines
- Check computed values for percentage widths
- Verify CSS variable inheritance

**MDN CSS Grid:**
- Understanding `fr` units: https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout/Basic_concepts#the_fr_unit
- Grid template syntax: https://developer.mozilla.org/en-US/docs/Web/CSS/grid-template

## Questions?

If you're unsure about a styling decision:
1. Check existing patterns in similar components
2. Verify it works across different viewport sizes
3. Ensure it uses CSS variables (not hardcoded values)
4. Test with the frame border visible
