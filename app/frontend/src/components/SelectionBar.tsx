// Authored by Karter Whitman using Claude Opus 5
// What you can do to several things at once. It appears only when
// something is picked, says how many, and offers the actions that are
// actually about plurality — the rest of the app already handles one
// thing at a time better than a batch ever could.
//
// Every action here is one change, so one undo takes the whole batch
// back. That is the promise that makes selecting twenty things and
// acting on them a safe thing to try.
import type { Item } from "@index/database/types";
import { apply, changes } from "../changes/index.js";
import { pool, selection, useSelection } from "../store/index.js";

export interface SelectionBarProps {
  /** Open the set picker; the shell owns it, because it is the command
   * bar wearing a different hat. */
  onAddToSet: () => void;
}

export function SelectionBar({ onAddToSet }: SelectionBarProps) {
  const picked = useSelection(() =>
    selection.ids().flatMap((id) => {
      const item = pool.getItem(id);
      return item ? [item] : [];
    }),
  );

  if (picked.length === 0) return null;

  const deletable = picked.filter((item) => !item.system).length;

  return (
    <div className="selected-bar" role="toolbar" aria-label="selected items">
      <span className="selected-count">
        {picked.length} selected
      </span>

      <button className="selected-action" onClick={onAddToSet} type="button">
        add to set…
      </button>

      <button
        className="selected-action is-danger"
        disabled={deletable === 0}
        onClick={() => void deleteThem(picked)}
        title={
          deletable === picked.length
            ? undefined
            : `${picked.length - deletable} of these are system items and will be left alone`
        }
        type="button"
      >
        delete
      </button>

      <button
        aria-label="clear the selection"
        className="selected-clear"
        onClick={() => selection.clear()}
        title="Clear the selection (Esc)"
        type="button"
      >
        ✕
      </button>
    </div>
  );
}

async function deleteThem(picked: Item[]): Promise<void> {
  const change = changes.deleteMany(picked);
  if (change.pairs.length === 0) return;
  // The pool drops the records, and the selection reads through it — so
  // what was deleted leaves the selection without being told.
  await apply(change);
  selection.clear();
}
