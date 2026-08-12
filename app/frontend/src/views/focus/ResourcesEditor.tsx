// Authored by Karter Whitman using Claude Opus 4.8
// The resources list: ordered pointers, first is primary — which is what
// decides the item's format, and so its renderer. Adding one is the file
// dialog behind the "+", or a drag/paste onto the focused item itself
// (Focus.tsx) — both go through intake, which stamps the uri and fetches
// the derivations before the change is built.
//
// Nothing here copies bytes. Adding a file is recording where it already
// is.
import { useEffect, useRef, useState } from "react";
import type { Item, Resource } from "@index/database/types";
import { apply } from "../../changes/index.js";
import { DeviceIcon } from "../../components/DeviceIcon.tsx";
import { deviceKindOf, deviceOf } from "../../lib/derive.js";
import {
  attachResource,
  detachResource,
  dropIndexFor,
  moveResource,
} from "../../lib/resources.js";
import { errors, useSelfDevice } from "../../store/index.js";

/** Where the resource actually is: the absolute path for a local file,
 * the url as-is for a web resource — the location, not the name. */
function locationOf(resource: Resource): string {
  const { uri } = resource;
  if (deviceOf(uri) === "web") return uri;
  const separator = uri.indexOf("://");
  return separator === -1 ? uri : uri.slice(separator + 3);
}

export function ResourcesEditor({ item }: { item: Item }) {
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState<number | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [missingUris, setMissingUris] = useState<Set<string>>(new Set());
  // The uri a search is currently running for — locate (a picked folder)
  // and reseek (the whole watch list) share this, since only one of
  // either makes sense in flight for a given resource at a time.
  const [searching, setSearching] = useState<string | null>(null);
  const selfDevice = useSelfDevice();

  // Re-checks whenever the item gets a fresh `resources` array (a relink,
  // this window's or the background watcher's, landing via
  // `records:changed`) and whenever the backend says some resource's
  // availability changed shape. That second listener is the one that
  // matters for a file going missing: moving it doesn't touch the item's
  // own record, so `item.resources` never changes, and without a push
  // from the backend the badge would only ever catch up on some later,
  // unrelated re-render.
  useEffect(() => {
    const uris = item.resources.map((resource) => resource.uri);
    if (uris.length === 0) {
      setMissingUris(new Set());
      return;
    }
    let cancelled = false;
    const check = (): void => {
      void window.index.resources.checkMissing(uris).then((answer) => {
        if (cancelled || "err" in answer) return;
        setMissingUris(new Set(uris.filter((uri) => answer.ok.missing[uri])));
      });
    };
    check();
    const unlisten = window.index.on("resources:availabilityChanged", check);
    return () => {
      cancelled = true;
      unlisten();
    };
  }, [item.resources]);

  const locate = async (uri: string): Promise<void> => {
    setSearching(uri);
    try {
      const answer = await window.index.resources.locate(item.id, uri);
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      if (!answer.ok.found) errors.surface("Couldn't find that file in the folder you picked.");
    } finally {
      setSearching(null);
    }
  };

  // Unlike `locate`, this isn't gated on the resource being missing — a
  // resource that still resolves but points at a bad match (a duplicate
  // caught before an exclusion ruled it out) needs the same "search
  // again" gesture, just without a folder dialog: it searches everywhere
  // the watch list already covers.
  const reseek = async (uri: string): Promise<void> => {
    setSearching(uri);
    try {
      const answer = await window.index.resources.reseek(item.id, uri);
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      if (!answer.ok.found) errors.surface("No other match found in the watched folders.");
    } finally {
      setSearching(null);
    }
  };

  /** Which row the pointer is over, by each row's own midpoint — the
   * same measure SchemaManager's field reorder uses, so dragging feels
   * the same in both places. */
  const indexAt = (clientY: number): number => {
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>(".resource-row") ?? [])];
    for (const [index, row] of rows.entries()) {
      const box = row.getBoundingClientRect();
      if (clientY < box.top + box.height / 2) return index;
    }
    return rows.length;
  };

  /** Dragging a resource to the top is how the user says what the item
   * *is*, so this goes through `moveResource` like the keyboard path —
   * a drop onto position 0 can reclassify, in the same change. */
  const move = (from: number, to: number): void => {
    if (to === from || to < 0 || to >= item.resources.length) return;
    void moveResource(item, from, to).then(apply);
  };

  const startReorder = (event: React.PointerEvent, from: number): void => {
    event.preventDefault();
    setDragging(from);

    const onMove = (pointer: PointerEvent): void => pointer.preventDefault();
    const onUp = (pointer: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(null);

      move(from, dropIndexFor(from, indexAt(pointer.clientY)));
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
  };

  const pick = async (): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.intake.pick();
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      for (const { resource } of answer.ok.results) {
        await apply(await attachResource(item, resource));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="editor-block">
      <div className="editor-block-header">
        <h3>resources</h3>
        <button
          aria-label="add a file"
          className="resources-add-button"
          disabled={busy}
          onClick={() => void pick()}
          title="add a file"
          type="button"
        >
          +
        </button>
      </div>

      <ul className="resources" ref={listRef}>
        {item.resources.map((resource, index) => {
          const isMissing = missingUris.has(resource.uri);
          return (
          <li
            className={
              [
                "resource-row",
                isMissing ? "resource-row-missing" : "",
                dragging === index ? "is-dragging" : "",
              ]
                .filter(Boolean)
                .join(" ")
            }
            key={resource.uri}
          >
            {/* One control where two arrows used to be. It still answers
                the arrow keys, because a pointer-only handle would take
                reordering away from the keyboard entirely — dragging is
                the faster gesture, not the only one. */}
            <button
              aria-label={`reorder ${resource.name}`}
              className="resource-handle"
              onKeyDown={(event) => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                move(index, index + (event.key === "ArrowUp" ? -1 : 1));
              }}
              onPointerDown={(event) => startReorder(event, index)}
              title="drag to reorder, or use the arrow keys — the first is primary"
              type="button"
            >
              ⠿
            </button>

            {/* Fixed-width regardless of primary/not, so every row's
                label starts at the same x — xyz's source-primary-
                indicator convention. */}
            <span className="resource-primary-indicator" title={index === 0 ? "primary — decides the format" : undefined}>
              {index === 0 && (
                <>
                  ★<span className="sr-only">Primary</span>
                </>
              )}
            </span>

            <span className="resource-name" title={resource.name}>
              {locationOf(resource)}
            </span>

            {isMissing && (
              <span className="resource-missing-badge" title="the file wasn't found at this location">
                missing
              </span>
            )}

            {deviceOf(resource.uri) !== "web" && resource.contentHash && (
              <button
                aria-label={`search again for ${resource.name}`}
                className="resource-reseek"
                disabled={searching === resource.uri}
                onClick={() => void reseek(resource.uri)}
                title="search the watch list again for this file's content"
                type="button"
              >
                ⟳
              </button>
            )}

            {isMissing && (
              <button
                className="resource-locate"
                disabled={!resource.contentHash || searching === resource.uri}
                onClick={() => void locate(resource.uri)}
                title={
                  resource.contentHash
                    ? "search a folder for this file"
                    : "no content record to search by — this file was already missing before relocation search existed"
                }
                type="button"
              >
                {searching === resource.uri ? "searching…" : "search a folder…"}
              </button>
            )}

            {/* The location's device and the way to open it are one
                fact, not two — a chip naming it beside a button that
                repeats what the chip already implied. The icon alone
                both says where it is and, clicked, takes you there. */}
            <button
              aria-label={deviceOf(resource.uri) === "web" ? "open" : "reveal"}
              className="resource-device"
              onClick={() => {
                const local = deviceOf(resource.uri) !== "web";
                const answer = local
                  ? window.index.shell.reveal(resource.uri)
                  : window.index.shell.openExternal(resource.uri);
                void answer.then((result) => {
                  if ("err" in result) errors.surface(result.err);
                });
              }}
              title={deviceOf(resource.uri) === "web" ? "open" : "reveal"}
              type="button"
            >
              <DeviceIcon kind={deviceKindOf(resource.uri, selfDevice)} />
            </button>

            <button
              aria-label={`remove ${resource.name}`}
              onClick={() => void detachResource(item, index).then(apply)}
              type="button"
            >
              ✕
            </button>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
