// Authored by Karter Whitman using Claude Sonnet 5
// Turning an album resource into its songs: the frontend half of the
// Spotify import (the backend half, app/backend/src/services/spotify.ts,
// is the actual Web API call). Everything here is pure pair-building —
// no `apply()` — so the two call sites that create an album item
// (lib/intake.ts's createItemsFromPaths, Focus.tsx's attachDropped) can
// fold the result into whatever change they're already building and
// apply it once, one undo for the album and every song together.
import type { ChangePair, Item, Resource } from "@index/database/types";
import { changes } from "../changes/index.js";
import { errors } from "../store/index.js";

const ALBUM_URL_PATTERN = /open\.spotify\.com\/album\/([A-Za-z0-9]+)/;

export function isSpotifyAlbumUrl(uri: string): boolean {
  return ALBUM_URL_PATTERN.test(uri);
}

/** `Field[]`, upserted by name — the same shape `layouts/registry.tsx`'s
 * `KnownFields` already uses to edit a known field in place without
 * disturbing whatever else an item's `fields` array holds. */
function upsertByName(fields: Item["fields"], updates: Item["fields"]): Item["fields"] {
  let next = fields;
  for (const update of updates) {
    const at = next.findIndex((field) => field.name.toLowerCase() === update.name.toLowerCase());
    next = at === -1 ? [...next, update] : next.map((field, index) => (index === at ? update : field));
  }
  return next;
}

/** Spotify gives release dates at whatever precision the label supplied
 * — a bare year, a year and month, or a full date. The item's own `date`
 * field wants `YYYY-MM-DD`, so a short one is padded to the first of the
 * period rather than rejected. */
function padReleaseDate(date: string): string {
  const parts = date.split("-");
  const year = parts[0]?.padStart(4, "0") ?? "1970";
  const month = parts[1] ?? "01";
  const day = parts[2] ?? "01";
  return `${year}-${month}-${day}`;
}

function formatTrackDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatAlbumDuration(totalMs: number): string {
  const totalMinutes = Math.round(totalMs / 1000 / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

/**
 * If `resource` is a Spotify album link, the pairs that turn it into the
 * real thing. Deliberately hands back a *patch* for the album item
 * (`type`/`fields` only) rather than a full before/after pair for it:
 * the caller might be updating an item that already exists (attaching
 * the link to it) or creating one that doesn't exist yet (minting a new
 * item from the link), and only the caller knows which — merging this
 * patch into whatever `after` it's already building is what keeps the
 * album item itself to exactly one pair in the final `Change`, instead
 * of two pairs disagreeing about whether the record exists yet.
 *
 * Returns `null` when `resource` isn't a Spotify album link, or the
 * lookup itself fails (no credentials configured yet, a bad url,
 * Spotify unreachable) — surfaced through the usual error toast rather
 * than blocking the plain "add this link" gesture that's always allowed
 * to succeed on its own.
 */
export interface SpotifyExpansion {
  /** Merge into the album item's own `after`. Deliberately excludes
   * `name` — a caller minting a brand-new item from the bare url has one
   * (`resource.name` is a placeholder worth replacing with `albumName`),
   * but a caller attaching this link to an item the user already named
   * should leave that alone. */
  itemPatch: Pick<Item, "type" | "fields">;
  /** The real album title, for callers that want it — see above. */
  albumName: string;
  /** One `createItem` pair and one connection pair per song — append
   * these to the same `Change` as the album item's own pair. */
  extraPairs: ChangePair[];
}

export async function expandSpotifyAlbum(item: Item, resource: Resource): Promise<SpotifyExpansion | null> {
  if (!isSpotifyAlbumUrl(resource.uri)) return null;

  const answer = await window.index.spotify.album(resource.uri);
  if ("err" in answer) {
    errors.surface(answer.err);
    return null;
  }
  const album = answer.ok;

  const schemaAnswer = await window.index.schemas.upsert({
    name: "album",
    label: "Album",
    fields: [
      { name: "Artist", label: null, kind: "string" },
      { name: "Year", label: null, kind: "string" },
      { name: "Duration", label: null, kind: "string" },
    ],
  });
  if ("err" in schemaAnswer) errors.surface(schemaAnswer.err);

  const label = await window.index.labels.ensure("track");
  if ("err" in label) {
    errors.surface(label.err);
    return null;
  }

  const releaseDate = padReleaseDate(album.releaseDate);
  const totalMs = album.tracks.reduce((sum, track) => sum + track.durationMs, 0);

  const albumFields = upsertByName(item.fields, [
    { name: "Artist", value: album.artists.join(", "), kind: "string" },
    { name: "Year", value: releaseDate.slice(0, 4), kind: "string" },
    { name: "Duration", value: formatAlbumDuration(totalMs), kind: "string" },
  ]);

  const extraPairs: ChangePair[] = [];

  for (const track of album.tracks) {
    const song: Item = {
      // `date` is the app's own "added" day — the same one the album
      // item lands on — never Spotify's release date, which is real
      // information but a different question. It rides on `item.date`
      // rather than `releaseDate` so it inherits whatever day the album
      // itself was created on, exactly as if you'd added each song by
      // hand today.
      ...changes.blankItem(item.date),
      name: track.name,
      type: "song",
      resources: [{ uri: track.url, name: track.name }],
      fields: [
        { name: "Duration", value: formatTrackDuration(track.durationMs), kind: "string" },
        { name: "Artist", value: track.artists.join(", "), kind: "string" },
        { name: "Release Date", value: releaseDate, kind: "date" },
      ],
    };
    extraPairs.push({ before: null, after: song });

    // A child of the album, not just tagged into it — `track` still says
    // *what* the relation is, `child: true` says the song nests under the
    // album rather than standing beside it at the top level (PRODUCT-SPEC
    // hierarchy). `connect`'s upsert-by-triple dedup applies here too.
    extraPairs.push(
      ...changes.connect(item, label.ok.id, label.ok.name, song, {
        child: true,
        order: track.trackNumber,
      }).pairs,
    );
  }

  return { itemPatch: { type: "album", fields: albumFields }, albumName: album.name, extraPairs };
}
