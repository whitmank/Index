// Authored by Karter Whitman using Claude Opus 5
// The command bar: one field that reaches anything by name, and hands
// what you pick to the shell's one navigation primitive. A place you
// enter, a thing you open — the bar never decides which, it just says
// which it is (the glyph and the trailing word) so the ↵ is never a
// surprise. That is the same promise the views make about a click.
//
// Empty, it is the set switcher: `~`, `public`, then the sets you made.
// Typing turns it into search over every item, set or not — because
// "somewhere I can go" and "something I made" are the same population
// here, and having to know which one you are looking for before you can
// look for it is the thing this replaces.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { captionOf, FORMAT_GLYPH, formatOf } from "../lib/derive.js";
import { orderSets, VIEW_GLYPH, viewKindOf } from "../lib/sets.js";
import { loadSets, pool, searchItems, usePool } from "../store/index.js";

/** How many hits the list shows at once. Past this you should type more,
 * not scroll more. */
const LIMIT = 12;

export interface CommandBarProps {
  /**
   * What picking means. `goto` — the default — hands the item to the
   * shell's navigation primitive. `sets` narrows the field to places and
   * hands back a set, which is what "add these to…" needs: the same
   * field, the same keys, a different question.
   */
  mode?: "goto" | "sets";
  /** What the field asks for; shown as its placeholder. */
  prompt?: string;
  /** Dismiss without going anywhere. */
  onClose: () => void;
  /** Go to the picked item. The shell reads its role and either walks
   * there or opens it. */
  onPick: (id: string) => void;
  /** In `sets` mode, make a set by this name and pick it. Offered only
   * when nothing existing matches what was typed. */
  onCreate?: (name: string) => void;
}

export function CommandBar({ mode = "goto", prompt, onClose, onPick, onCreate }: CommandBarProps) {
  const [term, setTerm] = useState("");
  const [hitIds, setHitIds] = useState<string[]>([]);
  const [setIds, setSetIds] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const searchToken = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  // The empty state is the set switcher, so the sets are fetched once on
  // open rather than waiting for a keystroke that may never come.
  useEffect(() => {
    void loadSets().then(setSetIds);
  }, []);

  // Hits follow the term, and a stale answer never wins a race.
  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setHitIds([]);
      return;
    }
    const token = ++searchToken.current;
    void searchItems(trimmed, LIMIT).then((items) => {
      if (token === searchToken.current) setHitIds(items.map((item) => item.id));
    });
  }, [term]);

  // The rows, resolved from the pool — which the search and the set list
  // have both already filled, so this render never waits on the wire.
  const rows = usePool(() => {
    const ids = term.trim() ? hitIds : setIds;
    const items = ids.flatMap((id) => {
      const item = pool.getItem(id);
      return item ? [item] : [];
    });
    const ordered = term.trim() ? items : orderSets(items);
    const found = ordered.map((item) => ({ item, place: pool.isPlace(item.id) }));
    // Asking for a set, only places can answer.
    return mode === "sets" ? found.filter((row) => row.place) : found;
  });

  /** In `sets` mode, a name that matches nothing is an offer to make it —
   * you should not have to leave the bar to put things somewhere new. */
  const offerToCreate =
    mode === "sets" &&
    onCreate !== undefined &&
    term.trim().length > 0 &&
    !rows.some((row) => captionOf(row.item).toLowerCase() === term.trim().toLowerCase());

  // A moved selection has to stay on a row that exists: results change
  // under it on every keystroke. The offer to make a set is the last row
  // when it is showing, so one set of keys drives both.
  useEffect(() => setAt(0), [term]);
  const total = rows.length + (offerToCreate ? 1 : 0);
  const cursor = Math.min(at, total - 1);
  const creating = offerToCreate && cursor === rows.length;
  const selected = creating ? undefined : rows[cursor];

  const move = useCallback(
    (step: number) => {
      setAt((current) => {
        if (total === 0) return 0;
        return (Math.min(current, total - 1) + step + total) % total;
      });
    },
    [total],
  );

  // Keep the selected row in view when the keyboard is what is moving it.
  useEffect(() => {
    listRef.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [at, total]);

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (creating) onCreate?.(term.trim());
      else if (selected) onPick(selected.item.id);
    } else if (event.key === "Escape") {
      // Stopped here so the escape that closes the bar does not also
      // reach the focus view underneath it.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const hint = useMemo(() => {
    if (mode === "sets") return "add to";
    return term.trim() ? "search" : "sets";
  }, [mode, term]);

  return (
    <div className="command-backdrop" onMouseDown={onClose}>
      <div
        className="command"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="go to"
      >
        <input
          aria-label={prompt ?? "go to"}
          autoFocus
          className="command-input"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder={prompt ?? "go to…"}
          value={term}
        />

        {total > 0 ? (
          <ul className="command-list" ref={listRef} role="listbox">
            {rows.map((row, index) => (
              <li key={row.item.id}>
                <button
                  aria-selected={row === selected}
                  className={row === selected ? "command-row is-at" : "command-row"}
                  onClick={() => onPick(row.item.id)}
                  onMouseMove={() => setAt(index)}
                  role="option"
                  type="button"
                >
                  <span className="command-row-mark">{markOf(row.item, row.place)}</span>
                  <span className="command-row-name">{captionOf(row.item) || "untitled"}</span>
                  <span className="command-row-kind">{kindOf(row.item, row.place)}</span>
                </button>
              </li>
            ))}

            {offerToCreate && (
              <li>
                <button
                  aria-selected={creating}
                  className={creating ? "command-row is-new is-at" : "command-row is-new"}
                  onClick={() => onCreate?.(term.trim())}
                  onMouseMove={() => setAt(rows.length)}
                  role="option"
                  type="button"
                >
                  <span className="command-row-mark">＋</span>
                  <span className="command-row-name">make a set “{term.trim()}”</span>
                  <span className="command-row-kind">new</span>
                </button>
              </li>
            )}
          </ul>
        ) : (
          <p className="command-empty">{term.trim() ? "nothing by that name" : "no sets yet"}</p>
        )}

        <footer className="command-foot">
          <span>{hint}</span>
          <span>↑↓ move · ↵ {mode === "sets" ? "add" : "go"} · esc close</span>
        </footer>
      </div>
    </div>
  );
}

/** A place wears the view it opens into; a thing wears its format. */
function markOf(item: Item, place: boolean): string {
  return place ? VIEW_GLYPH[viewKindOf(item)] : FORMAT_GLYPH[formatOf(item)];
}

function kindOf(item: Item, place: boolean): string {
  return place ? viewKindOf(item) : formatOf(item);
}
