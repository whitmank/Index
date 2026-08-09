// Authored by Karter Whitman using Claude Sonnet 5
// Folders relink.ts's search must never consider a match from — content
// that happens to live in a place known to be stale (an old app's own
// data directory, a backup, a graveyard of exports) rather than where a
// file actually belongs. Order doesn't mean anything here the way it
// does for the watch list, so there's no dragging — just add and remove.
import { useEffect, useState } from "react";
import { errors } from "../../store/index.js";

export function ExcludedFolders() {
  const [folders, setFolders] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.index.resources.excludelist.list().then((answer) => {
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
      const answer = await window.index.resources.excludelist.add();
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setFolders(answer.ok.folders);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (folder: string): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.resources.excludelist.remove(folder);
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setFolders(answer.ok.folders);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h3 className="settings-section-title">Excluded folders</h3>
      <p className="settings-section-note">
        Never matched when searching for a moved file's content — for a place you know holds
        stale duplicates (an old backup, another app's own data) rather than where a file
        actually belongs.
      </p>
      <ul className="watchlist">
        {(folders ?? []).map((folder) => (
          <li className="watchlist-row" key={folder}>
            <span className="watchlist-path" title={folder}>
              {folder}
            </span>
            <button
              aria-label={`stop excluding ${folder}`}
              disabled={busy}
              onClick={() => void remove(folder)}
              type="button"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button className="watchlist-add" disabled={busy} onClick={() => void add()} type="button">
        exclude a folder…
      </button>
    </section>
  );
}
