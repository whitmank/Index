// Authored by Karter Whitman using Claude Sonnet 5
// Which folders relink.ts watches live and searches for a moved file's
// content, in the order given — search tries each in turn and stops at
// the first match, so this list's order is search priority, set by
// dragging a row via its handle. Adding is a folder dialog, same gesture
// as attaching a resource; reordering and removal both go through one
// "here's the list, persist it" call, since the frontend already holds
// the current array either way.
import { useEffect, useState } from "react";
import { errors } from "../../store/index.js";

export function WatchedFolders() {
  const [folders, setFolders] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    void window.index.resources.watchlist.list().then((answer) => {
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setFolders(answer.ok.folders);
    });
  }, []);

  const add = async (): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.resources.watchlist.add();
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setFolders(answer.ok.folders);
    } finally {
      setBusy(false);
    }
  };

  const update = async (next: string[]): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.resources.watchlist.update(next);
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setFolders(answer.ok.folders);
    } finally {
      setBusy(false);
    }
  };

  const move = (from: number, to: number): void => {
    if (!folders || from === to) return;
    const next = [...folders];
    const [moved] = next.splice(from, 1);
    if (moved !== undefined) next.splice(to, 0, moved);
    void update(next);
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Watched folders</h3>
      <p className="settings-section-note">
        A moved file is found again by its content, searched in this order — drag to put the
        places you expect it to land first, and a broad catch-all (your whole home folder, say)
        last, if you want one at all.
      </p>
      <ul className="watchlist">
        {(folders ?? []).map((folder, index) => (
          <li
            className={index === dragIndex ? "watchlist-row is-dragging" : "watchlist-row"}
            key={folder}
            onDragOver={(event) => {
              if (dragIndex === null || dragIndex === index) return;
              event.preventDefault();
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex === null || dragIndex === index) return;
              move(dragIndex, index);
              setDragIndex(null);
            }}
          >
            <span
              aria-hidden="true"
              className="watchlist-handle"
              draggable
              onDragEnd={() => setDragIndex(null)}
              onDragStart={(event) => {
                setDragIndex(index);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", folder);
              }}
            >
              ⠿
            </span>
            <span className="watchlist-path" title={folder}>
              {folder}
            </span>
            <button
              aria-label={`stop watching ${folder}`}
              disabled={busy}
              onClick={() => void update((folders ?? []).filter((entry) => entry !== folder))}
              type="button"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className="watchlist-add" disabled={busy} onClick={() => void add()} type="button">
        add a folder…
      </button>
    </section>
  );
}
