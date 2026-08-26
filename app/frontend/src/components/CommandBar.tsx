// Authored by Karter Whitman using Claude Opus 5
// The command bar: one field that performs anything by name.
//
// It holds **commands** — the verbs that act on what is picked out. A
// verb that needs saying to something takes its argument in the same
// field: pick `add to…` and the bar keeps the verb as a chip and starts
// completing sets. ⇥ moves through the grammar the same as ↵, so the
// bar can be driven without ever leaving the home row.
//
// Destinations live in the nav bar (⌘L) now, not here — going somewhere
// and doing something to what's picked are two different sentences, and
// this field only ever says the second one.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { matches, type Command } from "../commands/index.js";
import { captionOf, FORMAT_GLYPH, formatOf } from "../lib/derive.js";
import { orderSets, PLACE_GLYPH } from "../lib/sets.js";
import { loadSets, pool, searchItems, usePool } from "../store/index.js";

/** How many hits the list shows at once. Past this you should type more,
 * not scroll more. */
const LIMIT = 12;

export interface CommandBarProps {
  /** Every verb, already bound to the shell's handlers and told whether
   * it can run. */
  commands: Command[];
  /** How many things are picked out — what the verbs would act on. */
  pickedCount: number;
  /** Dismiss without doing anything. */
  onClose: () => void;
}

/** One offer in the list. A verb, a destination, a set you could make,
 * or — for a verb whose argument is bare text — the text itself. */
type Row =
  | { kind: "command"; command: Command }
  | { kind: "item"; item: Item; place: boolean }
  | { kind: "create"; name: string }
  | { kind: "text"; value: string };

export function CommandBar({ commands, pickedCount, onClose }: CommandBarProps) {
  const [term, setTerm] = useState("");
  /** The verb taken, while its argument is being said. */
  const [staged, setStaged] = useState<Command | null>(null);
  const [hitIds, setHitIds] = useState<string[]>([]);
  const [setIds, setSetIds] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const searchToken = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  // The sets are fetched once on open: a set-taking verb's argument is
  // the only thing left here that ever needs them.
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

  const rows = usePool<Row[]>(() => {
    const trimmed = term.trim();

    // Saying a verb's argument: only what can answer it is offered.
    if (staged) {
      // Bare text has nothing to look up — whatever's typed so far is
      // the whole offer, one row, taken the same way any other is.
      if (staged.argument?.kind === "text") {
        return trimmed ? [{ kind: "text", value: trimmed }] : [];
      }

      const found = (trimmed ? hitIds : setIds).flatMap<{ item: Item; place: boolean }>((id) => {
        const item = pool.getItem(id);
        return item ? [{ item, place: pool.isPlace(item.id) }] : [];
      });
      const places = found.filter((row) => row.place);
      const ordered = trimmed ? places : orderSets(places.map((row) => row.item)).map((item) => ({
        item,
        place: true,
      }));
      const rows: Row[] = ordered.map((row) => ({ kind: "item", ...row }));
      const exact = ordered.some(
        (row) => captionOf(row.item).toLowerCase() === trimmed.toLowerCase(),
      );
      if (staged.argument?.allowCreate && trimmed && !exact) {
        rows.push({ kind: "create", name: trimmed });
      }
      return rows;
    }

    // Otherwise: just the verbs that answer to what was typed. An
    // unavailable one shows only when it is asked for by name, and then
    // it says why it cannot run.
    return commands
      .filter((command) => (trimmed ? matches(command, trimmed) : !command.unavailable))
      .map<Row>((command) => ({ kind: "command", command }));
  });

  // A moved cursor has to stay on a row that exists: the offers change
  // under it on every keystroke.
  useEffect(() => setAt(0), [term, staged]);
  const cursor = Math.min(at, rows.length - 1);
  const selected = rows[cursor];

  const move = useCallback(
    (step: number) => {
      setAt((current) => {
        if (rows.length === 0) return 0;
        return (Math.min(current, rows.length - 1) + step + rows.length) % rows.length;
      });
    },
    [rows.length],
  );

  // Keep the cursor's row in view when the keyboard is what is moving it.
  useEffect(() => {
    listRef.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [at, rows.length]);

  /** Take an offer: a verb is staged or run, a destination is gone to. */
  const take = useCallback(
    (row: Row | undefined) => {
      if (!row) return;

      if (row.kind === "command") {
        if (row.command.unavailable) return;
        if (row.command.argument) {
          setStaged(row.command);
          setTerm("");
          return;
        }
        row.command.run();
        onClose();
        return;
      }

      if (row.kind === "create") {
        staged?.run({ newSetNamed: row.name });
        onClose();
        return;
      }

      if (row.kind === "text") {
        staged?.run({ text: row.value });
        onClose();
        return;
      }

      // The only remaining kind is "item", and it is only ever offered
      // while a verb's argument is being said.
      staged?.run({ set: row.item });
      onClose();
    },
    [onClose, staged],
  );

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Tab" || event.key === "Enter") {
      // ⇥ and ↵ do the same thing, which is what makes the grammar one
      // gesture: take what is in front of you and carry on.
      event.preventDefault();
      take(selected);
    } else if (event.key === "Backspace" && term === "" && staged) {
      // Backing out of a verb rather than out of the bar: the argument
      // was a mistake, the bar was not.
      event.preventDefault();
      setStaged(null);
    } else if (event.key === "Escape") {
      // Stopped here so the escape that closes the bar does not also
      // reach the focus view or the selection underneath it.
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const placeholder = useMemo(() => {
    if (staged) return staged.argument?.prompt ?? "…";
    if (pickedCount > 0) return `${pickedCount} picked — a command`;
    return "a command…";
  }, [pickedCount, staged]);

  const hint = useMemo(() => {
    if (!staged) return "commands";
    if (staged.argument?.kind === "text") return "text";
    return term.trim() ? "search" : "Spaces";
  }, [staged, term]);

  return (
    <div className="command-backdrop" onMouseDown={onClose}>
      <div
        className="command"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="command bar"
      >
        <div className="command-field">
          {/* The verb stays visible while its argument is said, so the
              sentence you are in the middle of is never a memory test. */}
          {staged && <span className="command-verb">{staged.title.replace(/…$/, "")}</span>}
          <input
            aria-label={placeholder}
            autoFocus
            className="command-input"
            onChange={(event) => setTerm(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            value={term}
          />
        </div>

        {rows.length > 0 ? (
          <ul className="command-list" ref={listRef} role="listbox">
            {rows.map((row, index) => (
              <li key={keyOf(row)}>
                <button
                  aria-selected={index === cursor}
                  className={rowClass(row, index === cursor)}
                  disabled={row.kind === "command" && Boolean(row.command.unavailable)}
                  onClick={() => take(row)}
                  onMouseMove={() => setAt(index)}
                  role="option"
                  title={row.kind === "command" ? row.command.unavailable : undefined}
                  type="button"
                >
                  <span className="command-row-mark">{markOf(row)}</span>
                  <span className="command-row-name">{nameOf(row)}</span>
                  <span className="command-row-kind">{kindOf(row)}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="command-empty">
            {staged?.argument?.kind === "text"
              ? "type a tag…"
              : term.trim()
                ? "nothing by that name"
                : staged
                  ? "no Spaces yet"
                  : "no commands"}
          </p>
        )}

        <footer className="command-foot">
          <span>{hint}</span>
          <span>↑↓ move · ⇥ take · ↵ do · esc close</span>
        </footer>
      </div>
    </div>
  );
}

function keyOf(row: Row): string {
  if (row.kind === "command") return `command:${row.command.id}`;
  if (row.kind === "create") return "create";
  if (row.kind === "text") return "text";
  return row.item.id;
}

function rowClass(row: Row, current: boolean): string {
  const parts = ["command-row"];
  if (row.kind === "command") parts.push("is-verb");
  if (row.kind === "create" || row.kind === "text") parts.push("is-new");
  if (current) parts.push("is-at");
  return parts.join(" ");
}

/** A verb wears an arrow, a place wears the place mark, a thing wears
 * its format. The mark says which of the three a row is before you have
 * read a word of it. */
function markOf(row: Row): string {
  if (row.kind === "command") return "›";
  if (row.kind === "create" || row.kind === "text") return "＋";
  return row.place ? PLACE_GLYPH : FORMAT_GLYPH[formatOf(row.item)];
}

function nameOf(row: Row): string {
  if (row.kind === "command") return row.command.title;
  if (row.kind === "create") return `make a Space “${row.name}”`;
  if (row.kind === "text") return `“${row.value}”`;
  return captionOf(row.item) || "untitled";
}

function kindOf(row: Row): string {
  if (row.kind === "command") return row.command.unavailable ? "unavailable" : "command";
  if (row.kind === "create") return "new";
  if (row.kind === "text") return "tag";
  return row.place ? "place" : formatOf(row.item);
}
