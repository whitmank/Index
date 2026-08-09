# Product

## Register

product

## Users

A single person (the app's own author) managing their personal files and
URLs as one semantic graph instead of a folder tree. Context: capturing
something quickly (drag a file in, paste a link), then browsing it back
spatially (canvas), chronologically (timeline), or as rows (list) —
always alone with the app, never a shared multi-user surface.

## Product Purpose

A personal semantic layer over files and URLs (package.json's own
description). Files and links become "items" — nodes in a graph, never
copied, always pointers to where they already live. What an item *is*
(its format, and now its classified type) drives how it's drawn; nothing
about presentation is chosen by hand unless inference gets it wrong.
Success looks like: dropping a book file lands a fully-classified,
field-populated item with zero manual data entry, and finding it again
later — by day, by set, by search — costs nothing.

## Brand Personality

Precise, quiet, considered. Evidenced throughout the codebase itself:
extensively documented "pinned" decisions, a frameless window with
minimal chrome, commit-on-settle editing (autosave on blur/Enter, never
per keystroke), and an explicit refusal of unnecessary abstraction ("no
half-finished implementations," "three similar lines is better than a
premature abstraction"). The tone is architectural rather than playful —
software that explains its own reasoning in comments the way a careful
engineer would, not software that performs friendliness.

## Anti-references

Generic SaaS dashboard chrome (sidebars, breadcrumb-heavy file-explorer
trees, card-grid dashboards). Gradient or glassmorphism decoration.
Anything that multiplies the app's one navigation primitive (`goTo`) into
several competing ways to get somewhere. Enterprise-scale patterns
(dense paginated tables, bulk-admin toolbars) sized for a scale this app
deliberately doesn't operate at.

## Design Principles

1. **Presentation is inferred; override is the exception, not the rule.**
   The UI should default to the right look from data (format, type,
   tags) — an explicit override control appears only when inference
   disagrees, and should visually read as "you chose this" vs. "this was
   inferred."
2. **Content and arrangement stay decoupled.** The renderer (what draws)
   and the layout/editing surface (how the screen is arranged) are two
   independent machines that compose; a redesign should preserve that
   seam, not weld them together.
3. **Nothing is stored that can be derived.** Visual/UI state persists
   only when it represents a real disagreement with inference (like
   `opens`) — don't invent new persisted display state casually.
4. **Commit on settle, never on keystroke.** Every editable surface
   autosaves on blur/Enter; no live-typing writes.
5. **Personal scale, not enterprise scale.** Favor directness and
   quietness over dashboard density — this is one person's tool, not a
   multi-tenant product.

## Accessibility & Inclusion

No formal WCAG target documented. Keyboard-first affordances already
exist and should be preserved by any redesign: ⌘K/⌘F command bar,
Escape-to-dismiss on overlays, arrow-key day paging on the timeline.
Contrast needs active attention in this task specifically — the
reference screenshot is a dark theme, the current app is a warm-light
one; verify body text and field values hit ≥4.5:1 in whichever direction
this lands.
