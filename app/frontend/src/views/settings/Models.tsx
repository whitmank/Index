// Authored by Karter Whitman using Claude Sonnet 5
// Where the item classifier's model comes from: a person's own library of
// `.gguf` files, not something this app fetches or takes custody of.
// Locations is `WatchedFolders.tsx`'s pattern verbatim — a folder dialog,
// one "here's the list, persist it" call — except order never matters
// here, so there's no drag handle. The model picker below it scans those
// locations and lets one file be marked active per task; today there is
// exactly one task, "classification".
import { useCallback, useEffect, useState } from "react";
import { errors } from "../../store/index.js";

const TASK = "classification";

interface FoundModel {
  path: string;
  filename: string;
  sizeBytes: number;
}

interface ClassificationSettings {
  trad: boolean;
  ai: boolean;
}

function readableSize(bytes: number): string {
  return `${Math.round(bytes / 1_000_000)} MB`;
}

/** Everything but the filename, for telling two same-named files in
 * different folders apart. */
function parentOf(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(0, index);
}

export function Models() {
  const [locations, setLocations] = useState<string[] | null>(null);
  const [found, setFound] = useState<FoundModel[]>([]);
  const [active, setActive] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [stages, setStages] = useState<ClassificationSettings | null>(null);

  const refreshLocations = useCallback(async () => {
    const answer = await window.index.models.locations.list();
    if ("err" in answer) {
      errors.surface(answer.err);
      return;
    }
    setLocations(answer.ok.locations);
  }, []);

  const refreshScan = useCallback(async () => {
    const answer = await window.index.models.scan();
    if ("err" in answer) {
      errors.surface(answer.err);
      return;
    }
    setFound(answer.ok.models);
    setActive(answer.ok.active[TASK]);
  }, []);

  const refreshStages = useCallback(async () => {
    const answer = await window.index.classification.settings.get();
    if ("err" in answer) {
      errors.surface(answer.err);
      return;
    }
    setStages(answer.ok);
  }, []);

  useEffect(() => {
    void refreshLocations();
    void refreshScan();
    void refreshStages();
  }, [refreshLocations, refreshScan, refreshStages]);

  const setStage = async (stage: keyof ClassificationSettings, value: boolean): Promise<void> => {
    if (!stages) return;
    const next = { ...stages, [stage]: value };
    setStages(next);
    const answer = await window.index.classification.settings.set(next.trad, next.ai);
    if ("err" in answer) {
      errors.surface(answer.err);
      void refreshStages();
      return;
    }
    setStages(answer.ok);
  };

  const addLocation = async (): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.models.locations.add();
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setLocations(answer.ok.locations);
      await refreshScan();
    } finally {
      setBusy(false);
    }
  };

  const removeLocation = async (dir: string): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.models.locations.remove(dir);
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      setLocations(answer.ok.locations);
      await refreshScan();
    } finally {
      setBusy(false);
    }
  };

  const use = async (path: string): Promise<void> => {
    const answer = await window.index.models.setActive(TASK, path);
    if ("err" in answer) {
      errors.surface(answer.err);
      return;
    }
    setActive(answer.ok.active[TASK]);
  };

  return (
    <>
      <section className="settings-section">
        <h3 className="settings-section-title">Classification stages</h3>
        <p className="settings-section-note">
          What guesses an item's type when it's added: trad rules first, the model below as a fallback
          when they have no opinion. Either can be turned off on its own.
        </p>
        <div className="settings-row">
          <span className="settings-row-label">trad</span>
          <span className="settings-row-value">
            <label>
              <input
                checked={stages?.trad ?? true}
                disabled={!stages}
                onChange={(event) => void setStage("trad", event.target.checked)}
                type="checkbox"
              />{" "}
              built-in format/URL rules
            </label>
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-row-label">ai</span>
          <span className="settings-row-value">
            <label>
              <input
                checked={stages?.ai ?? true}
                disabled={!stages}
                onChange={(event) => void setStage("ai", event.target.checked)}
                type="checkbox"
              />{" "}
              the model below, as a fallback
            </label>
          </span>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Model locations</h3>
        <p className="settings-section-note">
          Folders to look for <code>.gguf</code> files in — this app never downloads a model, it only
          looks at what's already on disk here.
        </p>
        <ul className="watchlist">
          {(locations ?? []).map((dir) => (
            <li className="watchlist-row" key={dir}>
              <span className="watchlist-path" title={dir}>
                {dir}
              </span>
              <button
                aria-label={`stop looking in ${dir}`}
                disabled={busy}
                onClick={() => void removeLocation(dir)}
                type="button"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button className="watchlist-add" disabled={busy} onClick={() => void addLocation()} type="button">
          add a folder…
        </button>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">Classification model</h3>
        <p className="settings-section-note">
          Which model the "what is this?" prompt asks to guess an item's type. Pick one found in the
          locations above.
        </p>
        {found.length === 0 ? (
          <p className="settings-section-note">
            {(locations ?? []).length === 0
              ? "No folders added yet."
              : "No .gguf files found in these folders."}
          </p>
        ) : (
          <ul className="model-list">
            {found.map((model) => (
              <li className="model-row" key={model.path}>
                <span className="model-label" title={model.path}>
                  <span className="model-filename">{model.filename}</span>
                  <span className="model-dir">{parentOf(model.path)}</span>
                </span>
                <span className="model-size">{readableSize(model.sizeBytes)}</span>
                {model.path === active ? (
                  <span className="model-active">active</span>
                ) : (
                  <button onClick={() => void use(model.path)} type="button">
                    use this one
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
