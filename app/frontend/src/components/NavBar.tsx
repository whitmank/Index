// Authored by Karter Whitman using Claude Sonnet 5
// The nav bar: where you are, and — ⌘L, or click it — the one field that
// finds anything by name and takes you there. It is the address bar
// 0.1.5 had (AddressBar.jsx), split back out from the combined bar 0.2
// briefly merged it into: this one only ever goes somewhere; the command
// bar (⌘K) only ever does something to what is picked.
//
// The box is the one constant — a single pill, always on screen, the way
// a browser's address bar always shows the current page. Not editing, it
// holds the trail — ⌂ then crumbs, still individually clickable to walk
// back. Editing, the trail is traded for a search field: places (◍) and
// things (their format's glyph). The field opens quiet — nothing is
// offered until a name is actually typed; browsing every set unprompted
// is the one thing this door doesn't do.
import { Fragment, forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { captionOf, FORMAT_GLYPH, formatOf } from "../lib/derive.js";
import { PLACE_GLYPH } from "../lib/sets.js";
import { pool, searchItems, usePool } from "../store/index.js";

/** How many hits the dropdown shows at once. */
const LIMIT = 5;

export interface Crumb {
  id: string;
  item: Item | undefined;
  /** True: this crumb is a thing opened, not a place walked into — the
   * same distinction `store/location.ts`'s `PathEntry` carries. Lets the
   * same id appear twice on the trail (entered, and separately opened as
   * itself) without the two crumbs colliding. */
  open: boolean;
}

export interface NavBarHandle {
  /** ⌘L: drop into the field from anywhere. */
  startEditing: () => void;
  /** So another door — the command bar opening over it — can claim the
   * keyboard back without leaving this one's search hanging open behind
   * the scrim. */
  stopEditing: () => void;
}

export interface NavBarProps {
  /** Whether the trail is standing on `~` right now — the home button
   * reads as "here" when it is. */
  atHome: boolean;
  /** Whether the trail is standing on `spaces` right now — same "here"
   * treatment as the home button. */
  atSpaces: boolean;
  /** The trail, with `~` already said by ⌂ and left out if it leads it. */
  crumbs: Crumb[];
  /** ⌂ — the floor every trail starts and ends on. */
  onHome: () => void;
  /** ◍ — every Space, in one feed (⌘⇧/). */
  onSpaces: () => void;
  /** A crumb behind the current one, by its position on the trail: walk
   * back to exactly that position (a place and a thing can share an id,
   * so the index is what disambiguates which one was clicked). */
  onEnter: (index: number) => void;
  /** The last crumb: open what you're standing in. Always acts on "here"
   * — there's nothing else the last crumb could mean. */
  onOpenHere: () => void;
  /** A place or thing found by search: the shell reads its role and
   * either jumps there or opens it. */
  onPick: (id: string) => void;
}

type Hit = { item: Item; place: boolean };

export const NavBar = forwardRef<NavBarHandle, NavBarProps>(function NavBar(
  { atHome, atSpaces, crumbs, onHome, onSpaces, onEnter, onOpenHere, onPick },
  ref,
) {
  const [editing, setEditing] = useState(false);
  const [term, setTerm] = useState("");
  const [hitIds, setHitIds] = useState<string[]>([]);
  const [at, setAt] = useState(0);
  const searchToken = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

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

  const beginEditing = useCallback(() => {
    setEditing(true);
    setTerm("");
    setAt(0);
  }, []);

  const stopEditing = useCallback(() => {
    setEditing(false);
    setTerm("");
  }, []);

  useImperativeHandle(ref, () => ({ startEditing: beginEditing, stopEditing }), [beginEditing, stopEditing]);

  const rows = usePool<Hit[]>(() => {
    if (!term.trim()) return [];
    return hitIds.flatMap<Hit>((id) => {
      const item = pool.getItem(id);
      return item ? [{ item, place: pool.isPlace(item.id) }] : [];
    });
  });

  useEffect(() => setAt(0), [term]);
  const cursor = Math.min(at, rows.length - 1);

  const move = useCallback(
    (step: number) => {
      setAt((current) => {
        if (rows.length === 0) return 0;
        return (Math.min(current, rows.length - 1) + step + rows.length) % rows.length;
      });
    },
    [rows.length],
  );

  useEffect(() => {
    listRef.current?.querySelector("[aria-selected='true']")?.scrollIntoView({ block: "nearest" });
  }, [at, rows.length]);

  const take = useCallback(
    (row: Hit | undefined) => {
      if (!row) return;
      onPick(row.item.id);
      stopEditing();
    },
    [onPick, stopEditing],
  );

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Tab" || event.key === "Enter") {
      event.preventDefault();
      take(rows[cursor]);
    } else if (event.key === "Escape") {
      // Stopped here so the escape that leaves the field does not also
      // reach whatever is picked out underneath it.
      event.preventDefault();
      event.stopPropagation();
      stopEditing();
    }
  };

  return (
    <nav aria-label={editing ? "go to…" : "trail"} className="bar-address">
      <button
        className={atHome ? "bar-home is-here" : "bar-home"}
        onClick={onHome}
        title="All (⌘/)"
        type="button"
      >
        ⌂
      </button>

      <button
        className={atSpaces ? "bar-home is-here" : "bar-home"}
        onClick={onSpaces}
        title="Spaces (⌘⇧/)"
        type="button"
      >
        {PLACE_GLYPH}
      </button>

      {/* One box, always on screen — the omni bar. Not editing, clicking
          any part of it that isn't a crumb starts the search; a crumb
          stops its own click there instead, since it already means
          something. */}
      <div className={editing ? "nav-box is-editing" : "nav-box"} onClick={editing ? undefined : beginEditing}>
        {editing ? (
          <>
            <input
              aria-label="go to…"
              autoFocus
              className="nav-input"
              onBlur={stopEditing}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="go to…"
              value={term}
            />
            {rows.length > 0 && (
              <ul className="nav-dropdown" ref={listRef} role="listbox">
                {rows.map((row, index) => (
                  <li key={row.item.id}>
                    <button
                      aria-selected={index === cursor}
                      className={index === cursor ? "nav-row is-at" : "nav-row"}
                      // mousedown, not click: it fires before the input's own
                      // blur, so the field never closes out from under the
                      // click that was aiming at a row.
                      onMouseDown={(event) => {
                        event.preventDefault();
                        take(row);
                      }}
                      onMouseMove={() => setAt(index)}
                      role="option"
                      type="button"
                    >
                      <span className="nav-row-mark">
                        {row.place ? PLACE_GLYPH : FORMAT_GLYPH[formatOf(row.item)]}
                      </span>
                      <span className="nav-row-name">{captionOf(row.item) || "untitled"}</span>
                      <span className="nav-row-kind">{row.place ? "place" : formatOf(row.item)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="nav-box-trail" title="Go to… (⌘L)">
            {crumbs.length === 0 ? (
              // `~` — the only place with no crumb of its own (⌂ already
              // said it) — still has to show *something*, the way a
              // browser never shows a blank address bar.
              <span className="nav-here">All</span>
            ) : (
              crumbs.map(({ id, item, open }, index, all) => {
                const last = index === all.length - 1;
                const name = item ? captionOf(item) || "untitled" : "…";
                return (
                  <Fragment key={`${id}:${open}`}>
                    <span className="bar-sep">/</span>
                    <button
                      aria-current={last ? "page" : undefined}
                      className={last ? "bar-crumb is-here" : "bar-crumb"}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (last) onOpenHere();
                        else onEnter(index);
                      }}
                      title={last ? `About ${name}` : `Back to ${name}`}
                      type="button"
                    >
                      {open && item && (
                        <span aria-hidden="true" className="bar-crumb-mark">
                          {FORMAT_GLYPH[formatOf(item)]}
                        </span>
                      )}
                      {name}
                    </button>
                  </Fragment>
                );
              })
            )}
          </div>
        )}
      </div>
    </nav>
  );
});
