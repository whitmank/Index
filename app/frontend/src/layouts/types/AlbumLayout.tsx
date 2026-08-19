// Authored by Karter Whitman using Claude Sonnet 5
// Cover and tracklist beside the data — the lightbox a Spotify-style
// album page gets.
//
// The cover art is painted directly from the primary resource's cached
// `preview_image` rather than through `content` (LinkRenderer's format-
// driven card, favicon/title/extract and all) — an album's resource is a
// Spotify link by format, but its identity here is the artwork, not a
// bookmark card. `content` is still the fallback while that derivation
// hasn't warmed yet, so a just-imported album shows *something*. This
// doesn't reach for a different renderer (the registry's own rule: "the
// renderer is always format-selected; layouts never override it" stays
// true) — it's this layout painting its own cover.
//
// The tracklist reads its own connections via `useOrderedChildren`
// rather than through the generic `connections` prop (the claimed-chip
// shape, unused here — `TwoColumn` gets `connections={[]}`) — a track
// row wants the song's order and duration too, and showing the same 14
// rows twice would be its own kind of clutter.
import type { Item } from "@index/database/types";
import type { LayoutProps } from "../registry.tsx";
import { CoverArt } from "../../components/CoverArt.tsx";
import { errors } from "../../store/index.js";
import { ChildrenList } from "../parts/ChildrenList.tsx";
import { TwoColumn } from "../parts/TwoColumn.tsx";
import { useOrderedChildren } from "../parts/useOrderedChildren.ts";

/** `Nurture —track→ Lifelike`: a labelled connection, not a tag — an
 * album's songs are a stated relationship, never the unlabelled form that
 * `isPlace` reads as containment (PRODUCT-SPEC §3.4). That is what lets an
 * album hold songs without becoming somewhere you walk into instead of
 * open; mirrored from `labelId("track")` in @index/database, the same way
 * `lib/seeds.ts` mirrors the two system set ids. */
const ALBUM_TRACK_LABEL = "labels:track";

function durationOf(song: Item): string {
  const value = song.data.duration?.value;
  return typeof value === "string" ? value : "";
}

export function AlbumLayout({ item, content, editor }: LayoutProps) {
  const tracks = useOrderedChildren(item.id, ALBUM_TRACK_LABEL);
  const resource = item.resources[0];
  const cover = resource?.cached?.preview_image;

  const rows = tracks.map(({ connection, item: song }, index) => ({
    id: connection.id,
    index: index + 1,
    primary: (song.data.display_name?.value as string | undefined) ?? ((song.data.name.value as string) || "untitled"),
    trailing: durationOf(song),
  }));

  return (
    <TwoColumn
      connections={[]}
      content={
        <>
          {cover && resource ? (
            <CoverArt
              alt=""
              onClick={() => {
                void window.index.shell.openExternal(resource.uri).then((result) => {
                  if ("err" in result) errors.surface(result.err);
                });
              }}
              src={window.index.url.thumb(cover)}
            />
          ) : (
            content
          )}
          <ChildrenList rows={rows} />
        </>
      }
      editor={editor}
      stackContent
    />
  );
}
