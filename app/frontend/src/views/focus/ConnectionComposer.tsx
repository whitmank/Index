// Authored by Karter Whitman using Claude Opus 4.8
// The connection composer: search-or-create. Typing a word and pressing
// Enter tags the item with it — minting the target item too, if that word
// is new, in the same change so one undo takes both back.
//
// A label turns the same gesture into a labelled statement:
// `novel —author→ hemingway`. Which is why this is one control, not two —
// the label is the only difference between belonging and saying something.
import { useEffect, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { errors, pool, searchItems } from "../../store/index.js";

export interface Outbound {
  connectionId: string;
  label: string | null;
  targetId: string;
  targetName: string;
}

export function ConnectionComposer({
  item,
  outbound,
  onNavigate,
}: {
  item: Item;
  outbound: Outbound[];
  onNavigate: (itemId: string) => void;
}) {
  const [label, setLabel] = useState("");
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<Item[]>([]);
  const searchToken = useRef(0);

  // Suggestions follow the term, and a stale answer never wins a race.
  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setMatches([]);
      return;
    }
    const token = ++searchToken.current;
    void searchItems(trimmed, 8).then((items) => {
      if (token !== searchToken.current) return;
      setMatches(items.filter((match) => match.id !== item.id));
    });
  }, [term, item.id]);

  const connectTo = async (target: Item, targetIsNew: boolean): Promise<void> => {
    setTerm("");
    setMatches([]);
    const word = label.trim();

    if (!word) {
      await apply(changes.tag(item, target, targetIsNew));
      return;
    }

    // Labels are minted outside the change model — they carry no state of
    // their own, so there is nothing about one to undo.
    const made = await window.index.labels.ensure(word);
    if ("err" in made) {
      errors.surface(made.err);
      return;
    }
    if (targetIsNew) await apply(changes.createItem(target));
    await apply(changes.connect(item, made.ok.id, made.ok.name, target));
    setLabel("");
  };

  const submit = (): void => {
    const trimmed = term.trim();
    if (!trimmed) return;
    const exact = matches.find(
      (match) => (match.display_name ?? match.name).toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) void connectTo(exact, false);
    else void connectTo({ ...changes.blankItem(), name: trimmed }, true);
  };

  return (
    <section className="editor-block">
      <h3>connections</h3>

      <ul className="chips">
        {outbound.map((connection) => (
          <li className="chip is-connection" key={connection.connectionId}>
            {connection.label && <span className="chip-label">—{connection.label}→</span>}
            <button onClick={() => onNavigate(connection.targetId)} type="button">
              {connection.targetName || "unnamed"}
            </button>
            <button
              aria-label="remove"
              onClick={() => {
                const record = pool.getConnection(connection.connectionId);
                if (record) void apply(changes.disconnect(record));
              }}
              type="button"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="composer">
        <input
          aria-label="label (optional)"
          className="composer-label"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="label"
          value={label}
        />
        <span className="composer-arrow">→</span>
        <input
          aria-label="tag or connect to"
          className="composer-term"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
          placeholder="tag, or an item to point at"
          value={term}
        />
      </div>

      {matches.length > 0 && (
        <ul className="composer-matches">
          {matches.map((match) => (
            <li key={match.id}>
              <button onClick={() => void connectTo(match, false)} type="button">
                {match.display_name ?? (match.name || "unnamed")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
