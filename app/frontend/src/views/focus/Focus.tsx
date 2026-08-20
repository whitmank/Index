// Authored by Karter Whitman using Claude Opus 4.8
// The focus view: an item opened up (PRODUCT-SPEC §3.4). Title, its
// direct children if it has any (an album's tracks —
// ChildrenList.tsx/useOrderedChildren.ts, restored from the per-type
// layout cascade that stripped-dead-code removed; general here rather
// than album-specific, since nothing about "show what's nested under
// this" is particular to albums), the item's own data, and the
// resources that back it. No separate description field — whatever an
// item has to say about itself lives in its data now.
//
// The top bar (type classification, public/parse/delete/close) lives in
// FocusToolbar.tsx — pulled out because it's the one piece every future
// per-type arrangement will still want unchanged, so it has to be
// composable independently of whatever this file does with content/editor.
//
// A brand-new item that is still empty when it falls off the trail is
// discarded rather than kept: you opened something, looked at it, and
// moved on, and nothing about that is worth remembering. That check now
// lives in App.tsx's `arriveAt` (not here) — a crumb click or a fresh
// `enter` elsewhere can drop this item from the trail without this
// component's own dismiss ever firing, so it has to live where every
// trail change is guaranteed to pass through.
import { useEffect, useRef, useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { CoverArt } from "../../components/CoverArt.tsx";
import { SettleInput } from "../../components/SettleInput.tsx";
import { sameTypeName } from "../../lib/derive.js";
import { formatDurationRounded } from "../../lib/duration.js";
import { attachResource } from "../../lib/resources.js";
import { expandSpotifyAlbum } from "../../lib/spotify.js";
import { errors, loadItem, pool, usePool } from "../../store/index.js";
import { ChildrenList } from "./ChildrenList.tsx";
import { DataFields } from "./DataFields.tsx";
import { FocusLayout } from "./FocusLayout.tsx";
import { FocusToolbar } from "./FocusToolbar.tsx";
import { ResourceCarousel } from "./ResourceCarousel.tsx";
import { ResourceContent } from "./ResourceContent.tsx";
import { ResourcesEditor } from "./ResourcesEditor.tsx";
import { useOrderedChildren } from "./useOrderedChildren.ts";

/** A child's own duration, if it has one — a track's, today; whatever
 * else a future child carries the same field tomorrow. Formatted by
 * whichever kind it was actually stored as, since a song's own
 * `Duration` is still the plain "M:SS" string `expandSpotifyAlbum`
 * writes (lib/spotify.ts), not the rounded/precise `duration` kind the
 * album's own field uses. */
function durationOf(child: Item): string {
  const entry = child.data.duration;
  if (!entry || typeof entry.value !== "string") return "";
  return entry.kind === "duration" ? formatDurationRounded(entry.value) : entry.value;
}

/** A song, specifically — not "any leaf child." A movie series' episodes
 * are children too, and each one is worth going into on its own (or
 * will, once the content pane can page through them); a song just isn't,
 * the same way clicking a track in Spotify plays it rather than opening
 * a page about it. Once clicking a song does that instead, this is the
 * one place that decides — not "does it have children of its own," which
 * only ever meant "is this actually a song" for the one case that
 * existed to test it. */
function isSong(child: Item): boolean {
  const type = child.data.type?.value as string | undefined;
  return Boolean(type) && sameTypeName(type as string, "song");
}

export interface FocusProps {
  itemId: string;
  /** True when this item was created by the gesture that opened it. */
  isNew?: boolean;
  onDismiss: () => void;
  /** The shell's one navigation primitive, so following a connection
   * behaves exactly as clicking the same item anywhere else would. */
  onGoTo: (item: { id: string }) => void;
  /** Right-clicking the type chip's shortcut to that type's schema in
   * Settings. */
  onOpenTypeSettings: (typeName: string) => void;
}

export function Focus({ itemId, isNew, onDismiss, onGoTo, onOpenTypeSettings }: FocusProps) {
  // The scrim fades in rather than snapping to full dark — two rAFs so
  // the hidden state paints first, or the transition has nothing to
  // animate from.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setVisible(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  // A paste event only bubbles from whatever currently has DOM focus. A
  // brand-new item's name field grabs it via `autoFocus` below, but
  // opening an *existing* item moves nothing — without this, pasting
  // right after opening one would land on whatever was focused in the
  // view behind it, not here. Runs once per mount, which `key={itemId}`
  // at the call site (App.tsx) makes exactly "once per item opened."
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, []);

  const item = usePool(() => pool.getItem(itemId));

  useEffect(() => {
    void loadItem(itemId);
  }, [itemId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      // ← / A back out of the view the same way Escape does — the trail's
      // own back gesture (useArrowNav) stands down while an overlay is up,
      // so this is the only way left/A means "back" once you're in one.
      const isBack =
        event.key === "ArrowLeft" || (event.key.toLowerCase() === "a" && !event.metaKey && !event.ctrlKey && !event.altKey);
      if (event.key !== "Escape" && !isBack) return;
      // Escape (or ←/A) inside a text input belongs to the field — it
      // abandons the draft there, and only a second press closes the view.
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
        return;
      }
      onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss]);

  const children = useOrderedChildren(itemId);

  if (!item) return null;

  /** A file dropped or pasted anywhere on the focused item, or a link
   * dragged/pasted in the same way, becomes a resource on *this* item —
   * the in-focus counterpart to the shell's own drop-anywhere, which
   * mints a new item instead (App.tsx's `onDropAnywhere`). Calling
   * `preventDefault` here is what keeps that shell handler from also
   * firing: it only acts when the event reaches it unclaimed. */
  const attachDropped = async (inputs: string[]): Promise<void> => {
    const trimmed = inputs.map((entry) => entry.trim()).filter(Boolean);
    if (trimmed.length === 0) return;
    const answer = await window.index.intake.pathsToResources(trimmed);
    if ("err" in answer) {
      errors.surface(answer.err);
      return;
    }
    for (const { resource } of answer.ok.results) {
      // A Spotify album link gets its songs bundled into the same change
      // as the resource itself — one undo for the whole import. Unlike
      // `lib/intake.ts`'s brand-new-item path, this deliberately leaves
      // the item's own `name` alone: you already named it, attaching a
      // link to it shouldn't rename it out from under you.
      const expansion = await expandSpotifyAlbum(item, resource);
      if (!expansion) {
        await apply(await attachResource(item, resource));
        continue;
      }
      await apply({
        description: `Attach '${expansion.albumName}' as an album, with its songs`,
        pairs: [
          {
            before: item,
            after: { ...item, resources: [...item.resources, resource], ...expansion.itemPatch },
          },
          ...expansion.extraPairs,
        ],
      });
    }
  };

  // A resource with its own cached artwork (an album's cover, off
  // Spotify's card metadata) paints that directly rather than through
  // the format-driven renderer registry's own link card — the registry
  // stays format-selected for everything else (renderers/registry.tsx's
  // own rule), but a cover is this item's actual identity, not a
  // favicon/title/extract summary of a page. Takes priority over the
  // carousel for the same reason a book's jacket does (BookRenderer.tsx):
  // there's nothing paging through when the whole point is the one image.
  const primaryResource = item.resources[0];
  const cover = primaryResource?.cached?.preview_image;

  const content =
    cover && primaryResource ? (
      <CoverArt
        alt=""
        onClick={() => {
          void window.index.shell.openExternal(primaryResource.uri).then((result) => {
            if ("err" in result) errors.surface(result.err);
          });
        }}
        src={window.index.url.thumb(cover)}
      />
    ) : item.resources.length > 1 ? (
      <ResourceCarousel initialIndex={0} item={item} resources={item.resources} />
    ) : (
      <ResourceContent item={item} resource={item.resources[0]} />
    );

  // Title, then whatever is nested under it, then the item's other data,
  // then what backs it.
  const editor = (
    <>
      <label className="field field-name">
        <span className="sr-only">name</span>
        <SettleInput
          ariaLabel="name"
          autoFocus={isNew}
          onCommit={(name) => void apply(changes.rename(item, name))}
          placeholder="unnamed"
          value={item.data.name.value as string}
        />
      </label>
      <ChildrenList
        rows={children.map(({ connection, item: child }, index) => ({
          id: connection.id,
          index: index + 1,
          primary: (child.data.name.value as string) || "untitled",
          trailing: durationOf(child),
          // A song specifically (isSong, above) doesn't navigate —
          // clicking one is headed toward playback later, not toward
          // opening a page about it, so for now it just does nothing.
          // Every other kind of child (a movie series' episodes, say)
          // goes into it normally.
          onGoTo: isSong(child) ? undefined : () => onGoTo({ id: child.id }),
        }))}
      />
      <DataFields item={item} />
      <ResourcesEditor item={item} />
    </>
  );

  return (
    <div
      className={visible ? "focus-backdrop visible" : "focus-backdrop"}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const files = [...event.dataTransfer.files];
        if (files.length > 0) {
          void attachDropped(files.map((file) => window.index.intake.pathForFile(file)));
          return;
        }
        // A link dragged in from a browser tab or address bar carries no
        // File — just the url as text.
        const link = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
        if (link.trim()) void attachDropped([link]);
      }}
      onPaste={(event) => {
        // An ordinary paste into a field — the name, a field value —
        // belongs to that field; only claim it when nothing editable is
        // where the paste landed.
        const target = event.target;
        if (target instanceof HTMLElement && (target.isContentEditable || /input|textarea/i.test(target.tagName))) {
          return;
        }
        const files = [...event.clipboardData.files];
        if (files.length > 0) {
          event.preventDefault();
          void attachDropped(files.map((file) => window.index.intake.pathForFile(file)));
          return;
        }
        const text = event.clipboardData.getData("text/plain").trim();
        if (text) {
          event.preventDefault();
          void attachDropped([text]);
        }
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div className={visible ? "focus visible" : "focus"} ref={panelRef} role="dialog" tabIndex={-1}>
        <FocusToolbar item={item} onDismiss={onDismiss} onGoTo={onGoTo} onOpenTypeSettings={onOpenTypeSettings} />

        <FocusLayout content={content} editor={editor} />
      </div>
    </div>
  );
}
