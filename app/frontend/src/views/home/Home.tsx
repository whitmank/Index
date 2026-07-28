// Authored by Karter Whitman using Claude Opus 4.8
// The home screen: every set you can open, listed. `~` is pinned at the
// top — it is the set of everything, and the application's front door —
// then `public`, then the sets you have made, in the order they were made.
// A row at the bottom makes a new one: name it and you land inside it.
//
// Picking a set enters it; the shell then shows that set's view and the
// address bar in the top-left says where you are.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ViewKind } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { captionOf } from "../../lib/derive.js";
import { HOME_SET_ID, PUBLIC_SET_ID } from "../../lib/seeds.js";
import { viewKindOf } from "../../lib/sets.js";
import { loadSets, pool, usePool } from "../../store/index.js";

/** A glyph per view kind, so a set reads as what it opens into at a glance. */
const VIEW_GLYPH: Record<ViewKind, string> = { timeline: "▦", canvas: "◍", list: "≣" };

export interface HomeProps {
  onEnter: (setId: string) => void;
}

export function Home({ onEnter }: HomeProps) {
  const [ids, setIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    void loadSets().then(setIds);
  }, []);

  const sets = usePool(() =>
    ids.flatMap((id) => {
      const set = pool.getItem(id);
      return set ? [set] : [];
    }),
  );

  // `~` first, `public` next, then everything else in the backend's order.
  const ordered = useMemo(() => {
    const pinned = [HOME_SET_ID, PUBLIC_SET_ID];
    const head = pinned.flatMap((id) => {
      const set = sets.find((candidate) => candidate.id === id);
      return set ? [set] : [];
    });
    const rest = sets.filter((set) => !pinned.includes(set.id));
    return [...head, ...rest];
  }, [sets]);

  const create = useCallback(() => {
    const trimmed = name.trim();
    setName("");
    setCreating(false);
    if (!trimmed) return;
    const set = changes.blankSet(trimmed);
    void apply(changes.createSet(set)).then((ok) => {
      if (ok) onEnter(set.id);
    });
  }, [name, onEnter]);

  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="home-title">Sets</h1>

        <ul className="home-list">
          {ordered.map((set) => {
            const kind = viewKindOf(set);
            const pinned = set.id === HOME_SET_ID;
            return (
              <li key={set.id}>
                <button
                  className={pinned ? "set-card is-pinned" : "set-card"}
                  onClick={() => onEnter(set.id)}
                  type="button"
                >
                  <span className="set-card-mark">{pinned ? "★" : VIEW_GLYPH[kind]}</span>
                  <span className="set-card-name">{captionOf(set) || "untitled"}</span>
                  <span className="set-card-kind">{kind}</span>
                </button>
              </li>
            );
          })}

          <li>
            {creating ? (
              <input
                aria-label="name the new set"
                autoFocus
                className="set-new-input"
                onBlur={create}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") create();
                  else if (event.key === "Escape") {
                    setName("");
                    setCreating(false);
                  }
                }}
                placeholder="name the set, then Enter"
                value={name}
              />
            ) : (
              <button
                className="set-card set-new"
                onClick={() => setCreating(true)}
                type="button"
              >
                <span className="set-card-mark">＋</span>
                <span className="set-card-name">new set</span>
              </button>
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}
