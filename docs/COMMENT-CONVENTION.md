---
author: Claude Code
date: 2026-03-17
---

# Comment Convention

**File headers** — state the file's purpose and any non-obvious architectural constraints.

**JSDoc** — on exported functions where the signature alone doesn't fully communicate the contract.

**Inline** — record what the code cannot say about itself: intent, constraints, known gaps, and non-obvious invariants.

**The test** — a comment belongs if it would survive a significant refactor unchanged.
