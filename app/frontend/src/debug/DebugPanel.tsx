// Authored by Karter Whitman using Claude Opus 4.8
// The debug panel (IMPLEMENTATION-PLAN, phase 3): drive the change
// catalog and check, after every step, that the pool, the database and
// the history still agree. It stays behind a dev flag once the real views
// arrive — the plan expects it to be useful forever.
//
// Every step is written the way a view would write it: build a change
// from the catalog, apply it, then read back through the same bridge
// paths a view uses. If this panel goes green, a view doing the same
// thing will too.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes, redo, undo } from "../changes/index.js";
import { HOME_SET_ID, MEMBER_OF_LABEL_ID } from "../lib/seeds.js";
import { history, loadSet, pool, useHistory, useTroubles } from "../store/index.js";

interface Line {
  text: string;
  ok: boolean;
}

function commandZ(): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: "z", metaKey: true, bubbles: true, cancelable: true });
}

/** The keyboard handler starts a write and does not await it; give the
 * round trip a moment before asking what happened. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 250));
}

/** The database's own answer for one item, through the bridge path a view
 * would use. Absent means the database considers it deleted or gone. */
async function fromDatabase(id: string): Promise<Item | null> {
  const answer = await window.index.items.get(id);
  return "err" in answer ? null : answer.ok.item;
}

class Report {
  readonly lines: Line[] = [];

  say(ok: boolean, text: string): void {
    this.lines.push({ ok, text });
  }

  /** The check that matters: the pool and the database describe the same
   * record, and the history is as deep as the number of undoable things
   * that have happened. */
  async agree(id: string, expectation: {
    step: string;
    live: boolean;
    name?: string;
    historyDepth: number;
  }): Promise<void> {
    const inPool = pool.getItem(id);
    const inDatabase = await fromDatabase(id);
    const depth = history.entries().done.length;

    const complaints: string[] = [];

    if (expectation.live) {
      if (!inPool) complaints.push("missing from the pool");
      if (!inDatabase) complaints.push("missing from the database");
      if (expectation.name !== undefined) {
        if (inPool && inPool.name !== expectation.name) {
          complaints.push(`pool name is '${inPool.name}'`);
        }
        if (inDatabase && inDatabase.name !== expectation.name) {
          complaints.push(`database name is '${inDatabase.name}'`);
        }
      }
    } else {
      if (inPool) complaints.push("still in the pool");
      if (inDatabase) complaints.push("still in the database");
    }

    if (depth !== expectation.historyDepth) {
      complaints.push(`history is ${depth} deep, expected ${expectation.historyDepth}`);
    }

    this.say(complaints.length === 0, `${expectation.step}${complaints.length ? ` — ${complaints.join("; ")}` : ""}`);
  }

  arrow(step: string, source: string, target: string, expected: boolean): void {
    const found = pool.findConnection(source, target, MEMBER_OF_LABEL_ID);
    this.say(Boolean(found) === expected, `${step}${Boolean(found) === expected ? "" : found ? " — arrow still there" : " — no arrow"}`);
  }
}

/**
 * One pass through the catalog: create, rename, tag, place, delete, then
 * undo each in turn until nothing is left. The pool, the database and the
 * history are checked between every step.
 */
async function runSequence(): Promise<Line[]> {
  const report = new Report();

  pool.clear();
  history.clear();
  await loadSet(HOME_SET_ID);

  const depthBefore = 0;

  // create
  const item = changes.blankItem();
  await apply(changes.createItem(item));
  await report.agree(item.id, { step: "create", live: true, name: "", historyDepth: depthBefore + 1 });

  // rename
  const created = pool.getItem(item.id);
  if (!created) return [...report.lines, { ok: false, text: "aborted: the item never landed" }];
  await apply(changes.rename(created, "a debug item"));
  await report.agree(item.id, {
    step: "rename",
    live: true,
    name: "a debug item",
    historyDepth: 2,
  });

  // tag — the target is minted in the same change
  const renamed = pool.getItem(item.id)!;
  const target = { ...changes.blankItem(), name: "debug tag" };
  await apply(changes.tag(renamed, target, true));
  report.arrow("tag", item.id, target.id, true);
  await report.agree(target.id, { step: "tag target exists", live: true, name: "debug tag", historyDepth: 3 });

  // place — upserts the arrow the tag just made, rather than adding one
  await apply(changes.place(renamed, target.id, { x: 120, y: -40 }));
  const placed = pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID);
  report.say(
    placed?.position?.x === 120 && pool.arrowsInto(target.id).length === 1,
    `place — position ${JSON.stringify(placed?.position ?? null)}, ${pool.arrowsInto(target.id).length} arrow(s)`,
  );

  // delete — takes its connections with it
  await apply(changes.deleteItem(renamed)!);
  await report.agree(item.id, { step: "delete (soft)", live: false, historyDepth: 5 });
  report.arrow("delete took the arrow too", item.id, target.id, false);

  // and back out, one undo at a time
  await undo();
  await report.agree(item.id, { step: "undo delete", live: true, name: "a debug item", historyDepth: 4 });
  report.arrow("undo restored the arrow", item.id, target.id, true);

  await undo(); // place
  const unplaced = pool.findConnection(item.id, target.id, MEMBER_OF_LABEL_ID);
  report.say(unplaced?.position === null, `undo place — position ${JSON.stringify(unplaced?.position ?? null)}`);

  await undo(); // tag
  report.arrow("undo tag", item.id, target.id, false);
  await report.agree(target.id, { step: "undo tag removed its target", live: false, historyDepth: 2 });

  await undo(); // rename
  await report.agree(item.id, { step: "undo rename", live: true, name: "", historyDepth: 1 });

  await undo(); // create
  await report.agree(item.id, { step: "undo create", live: false, historyDepth: 0 });

  // redo walks forward again
  await redo();
  await report.agree(item.id, { step: "redo create", live: true, name: "", historyDepth: 1 });

  // the keyboard path, and the guard that keeps it out of the way while
  // the user is typing (PRODUCT-SPEC §3.2)
  const typed = document.createElement("input");
  typed.type = "text";
  document.body.append(typed);
  typed.focus();
  typed.dispatchEvent(commandZ());
  await settle();
  report.say(
    Boolean(pool.getItem(item.id)),
    `⌘Z inside a text input is left to native editing${pool.getItem(item.id) ? "" : " — it undid anyway"}`,
  );
  typed.remove();

  document.body.dispatchEvent(commandZ());
  await settle();
  report.say(!pool.getItem(item.id), `⌘Z outside a text input undoes${pool.getItem(item.id) ? " — it did nothing" : ""}`);

  // clean up after ourselves; the panel should leave no residue
  const restored = pool.getItem(item.id);
  if (restored) await apply(changes.deleteItem(restored)!);
  history.clear();

  return report.lines;
}

export function DebugPanel() {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [running, setRunning] = useState(false);
  // The sequence drives shared state, so two of them at once report
  // nonsense. StrictMode fires effects twice in development, which is
  // exactly the case this guards.
  const inFlight = useRef(false);
  const troubles = useTroubles();

  const { done, undone } = useHistory(() => history.entries());

  const run = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    runSequence()
      .then(
        (result) => {
          // The dev runner forwards the renderer's console to the same
          // terminal as the main process's, so a run is readable without
          // a devtools window open.
          for (const line of result) console.log(`${line.ok ? "✓" : "✗"} ${line.text}`);
          setLines(result);
        },
        (error: unknown) => setLines([{ ok: false, text: `threw: ${String(error)}` }]),
      )
      .finally(() => {
        inFlight.current = false;
        setRunning(false);
      });
  }, []);

  // Set VITE_INDEX_AUTORUN=1 to have the sequence run itself on launch.
  useEffect(() => {
    if (import.meta.env.VITE_INDEX_AUTORUN) run();
  }, [run]);

  const failures = lines?.filter((line) => !line.ok).length ?? 0;

  return (
    <section className="debug">
      <header className="debug-head">
        <button type="button" onClick={run} disabled={running}>
          {running ? "running…" : "run the change sequence"}
        </button>
        <button type="button" onClick={() => void undo()} disabled={done.length === 0}>
          undo
        </button>
        <button type="button" onClick={() => void redo()} disabled={undone.length === 0}>
          redo
        </button>
        <span className="debug-note">
          history {done.length}↩ {undone.length}↪ · pool {pool.all().length}
        </span>
      </header>

      {lines && (
        <p className={failures ? "debug-verdict bad" : "debug-verdict good"}>
          {failures ? `${failures} of ${lines.length} checks failed` : `all ${lines.length} checks passed`}
        </p>
      )}

      <ol className="debug-lines">
        {lines?.map((line) => (
          <li className={line.ok ? "good" : "bad"} key={line.text}>
            {line.ok ? "✓" : "✗"} {line.text}
          </li>
        ))}
      </ol>

      {troubles.length > 0 && (
        <ul className="debug-troubles">
          {troubles.map((trouble) => (
            <li key={trouble.id}>{trouble.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
