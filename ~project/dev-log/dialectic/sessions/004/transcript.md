---
session: 004
timestamp: 2026-08-07T03:55:20Z
session_id: cf6bc66e-1438-4331-9b41-32781227fbf6
cwd: /Users/karter/files/dev/index-workspace/0.5.1
session_log: session-log.md
---


---

# Human

how does this project differ from 0.5

---

# Model

> **[tool: Bash]** {"command": "ls -la /Users/karter/files/dev/index-workspace/ 2>&1 | head -50"}

---

# Model

> **[tool: Bash]** {"command": "ls -la /Users/karter/files/dev/index-workspace/0.5.1 2>&1"}

> **[result]** total 608
drwxr-xr-x@  18 karter  staff     576 Apr 19 00:06 .
drwxr-xr-x   10 karter  staff     320 Aug  6 16:41 ..
drwxr-xr-x@   5 karter  staff     160 Apr 19 00:34 .claude
-rw-r--r--@   1 karter  ...

> **[result]** total 32
drwxr-xr-x  10 karter  staff    320 Aug  6 16:41 .
drwxr-xr-x  30 karter  staff    960 Jun 28 16:05 ..
-rw-r--r--@  1 karter  staff  14340 Jul 20 21:10 .DS_Store
drwxr-xr-x  18 karter  staff ...

---

# Model

There's a sibling `0.5` directory. Let me compare them directly.

---

# Model

> **[tool: Bash]** {"command": "echo \"=== 0.5 top level ===\"; ls -la /Users/karter/files/dev/index-workspace/0.5 2>&1\necho; echo \"=== p...

> **[result]** === 0.5 top level ===
total 624
drwxr-xr-x   19 karter  staff     608 Aug  6 23:27 .
drwxr-xr-x   10 karter  staff     320 Aug  6 16:41 ..
drwxr-xr-x@   5 karter  staff     160 Mar 31 22:47 .claude
-r...

---

# Model

> **[tool: Bash]** {"command": "echo \"=== 0.5.1 git log ===\"; git -C /Users/karter/files/dev/index-workspace/0.5.1 log --oneline --all -2...

> **[result]** === 0.5.1 git log ===
0bc7c96 Initial commit

=== 0.5 git log ===
f73caa2 feat: ObjectCardModal, PDF viewer, source view, continuous scroll, selection memory
b87cf8b feat: CMD+E tag/rule edit modal, o...

---

# Model

> **[tool: Bash]** {"command": "ls /Users/karter/files/dev/index-workspace/0.5.1/DIALECTIC/sessions/\necho; echo \"--- data-model-proposal....

> **[result]** 001
002
003
004

--- data-model-proposal.md head ---
---
title: Unified Graph Data Model — Development Proposal
author: Claude Opus 4.7 (transcribing a dialectic with Karter Whitman)
status: proposal
...

---

# Model

0.5.1 is a fork of 0.5 that took the data model in a different direction. Both are the same "Index" Electron/SurrealDB/React app, but:

**0.5** (still active, 27 dialectic sessions deep, real git history):
- Legacy schema: separate `objects` / `tag_definitions` / `tag_types` / `devices` tables, with `tagged`/`typed` two-hop relations plus `contains`/`excludes` edges for spaces.
- SurrealDB client `^2.0.6`.
- Recent work: ObjectCardModal, PDF viewer, source view, continuous scroll, CMD+E tag/rule edit modal.

**0.5.1** (forked off 0.5's base, only 4 dialectic sessions, single squashed "Initial commit"):
- Committed to the **unified graph model**: one `objects` node table + one SurrealDB `RELATION` table per edge name (no more separate tag/type/device tables, no two-hop `tagged`/`typed`). Every edge gets a twin "edge Object" carrying display metadata; `schema` arrays on type-Objects drive pill rendering as data, not code.
- Mid-migration ("Phase 2 Stage B"): legacy schema is still authoritative for writes, new unified shape is grown via dual-write, with an idempotent boot-time backfill (`electron/main/db/graph-migration.js`) and a new rule compiler (`electron/main/db/rule-compiler.js`) that turns `all`/`any`/`none` predicates into SurrealQL. New files not in 0.5: `edges.js`, `graph-migration.js`, `rule-compiler.js`, `services/edge-service.js`.
- Added `docs/architecture.md` and `docs/data-model-proposal.md` (the design doc for this migration) — not present in 0.5.
- Pinned to SurrealDB client `^1.3.2` instead of `^2.0.6` (downgrade relative to 0.5).
- Missing some 0.5-only additions: `docs/UI-SPEC.md`, `electron/main/config/paths.js`, and 0.5's sessions 005–027 (the later UI work — ObjectCardModal, PDF viewer, multi-select, etc. — never landed here).

In short: 0.5 is the continuation of the original partitioned-table architecture; 0.5.1 is a parallel branch that's rearchitecting the data layer around a single unified object/edge graph, currently in a dual-write transitional state, and hasn't picked up 0.5's later UI features.
