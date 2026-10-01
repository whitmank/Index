---
author: Claude Opus 4.7
date: 2026-04-19
based_on: 0.5/docs/COMMENT-CONVENTION.md (Claude Code, 2026-03-17)
---

# Comment Convention

**File headers** — state the file's purpose and any non-obvious architectural constraints.

**JSDoc** — on exported functions where the signature alone doesn't fully communicate the contract.

**Inline** — record what the code cannot say about itself: intent, constraints, known gaps, and non-obvious invariants.

**The test** — a comment belongs if it would survive a significant refactor unchanged.
