// Authored by Karter Whitman using Claude Sonnet 5
// Turning an album resource into its songs: the frontend half of the
// Spotify import (the backend half, app/backend/src/services/spotify.ts,
// is the actual Web API call). Everything here is pure pair-building —
// no `apply()` — so the two call sites that create an album item
// (lib/intake.ts's createItemsFromPaths, Focus.tsx's attachDropped) can
// fold the result into whatever change they're already building and
// apply it once, one undo for the album and every song together.
import type { ChangePair, Data, DataEntry, Item, Resource } from "@index/database/types";
import { changes } from "../changes/index.js";
import { secondsToDurationValue } from "./duration.js";
import { errors, pool } from "../store/index.js";

const ALBUM_URL_PATTERN = /open\.spotify\.com\/album\/([A-Za-z0-9]+)/;

export function isSpotifyAlbumUrl(uri: string): boolean {
  return ALBUM_URL_PATTERN.test(uri);
}

/** Upsert by attribute, without disturbing whatever else `data` holds. */
function upsertByName(data: Data, updates: DataEntry[]): Data {
  let next = data;
  for (const update of updates) {
    if (!update.attribute) continue;
    next = { ...next, [update.attribute.toLowerCase()]: update };
  }
  return next;
}

/** Data keys this integration used to write, since renamed — kept here so
 * re-attaching an already-imported album's Spotify link cleans the stale
 * field up instead of leaving it sitting beside the one that replaced it
 * forever. `"year"` predates `"Date"` taking over the same job. */
const RETIRED_KEYS = ["year"];

function withoutRetiredKeys(data: Data): Data {
  const next = { ...data };
  for (const key of RETIRED_KEYS) delete next[key];
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
   * should leave that alone.
   *
   * The type carries its provenance because the import decided it, not
   * the user: an item is never left typed with nothing recorded about who
   * typed it, or the classifier could not tell later whether it is
   * allowed to revise the answer. */
  itemPatch: Pick<Item, "data">;
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
    attributes: [
      { attribute: "Artist", kind: "string", display: true },
      { attribute: "Date", kind: "date", display: true },
      // The exact second count underneath, rounded to the nearest minute
      // on screen — focusing it to edit is what asks for the precise
      // reading instead (DurationValueInput.tsx).
      { attribute: "Duration", kind: "duration", display: true },
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

  const albumData = withoutRetiredKeys(
    upsertByName(item.data, [
      { attribute: "Artist", value: album.artists.join(", "), kind: "string", prov: "auto" },
      { attribute: "Date", value: releaseDate, kind: "date", prov: "auto" },
      { attribute: "Duration", value: secondsToDurationValue(totalMs / 1000), kind: "duration", prov: "auto" },
    ]),
  );

  // A track's own url is stable across every re-fetch — matching by it is
  // what makes a refetch converge onto the songs already here instead of
  // minting a fresh set on top of them every time the button is pressed.
  const existingByUrl = new Map<string, Item>();
  for (const connection of pool.childrenOf(item.id)) {
    const child = pool.getItem(connection.target);
    const uri = child?.resources[0]?.uri;
    if (child && uri) existingByUrl.set(uri, child);
  }

  const extraPairs: ChangePair[] = [];

  for (const track of album.tracks) {
    const existing = existingByUrl.get(track.url);

    const data: Data = {
      // A renamed song keeps the name you gave it, the same courtesy the
      // album itself gets (`itemPatch` above never touches its name
      // either) — everything else here is Spotify's own, auto-derived,
      // and refreshed on every fetch regardless.
      name:
        existing?.data.name.prov === "user"
          ? existing.data.name
          : { attribute: "name", value: track.name, kind: "string", prov: "auto" },
      type: { attribute: "type", value: "song", kind: "string", prov: "auto" },
      duration: { attribute: "Duration", value: formatTrackDuration(track.durationMs), kind: "string", prov: "auto" },
      artist: { attribute: "Artist", value: track.artists.join(", "), kind: "string", prov: "auto" },
      "release date": { attribute: "Release Date", value: releaseDate, kind: "date", prov: "auto" },
    };

    const song: Item = existing
      ? { ...existing, resources: [{ uri: track.url, name: track.name }], data }
      : {
          // `date_added` is the app's own "added" day — the same one the
          // album item lands on — never Spotify's release date, which is
          // real information but a different question (it's captured
          // below as a "Release Date" field instead). It rides on
          // `item.date_added` rather than `releaseDate` so it inherits
          // whatever day the album itself was created on, exactly as if
          // you'd added each song by hand today.
          ...changes.blankItem(item.date_added),
          resources: [{ uri: track.url, name: track.name }],
          data,
        };
    extraPairs.push({ before: existing ?? null, after: song });

    // A child of the album, not just tagged into it — `track` still says
    // *what* the relation is, `child: true` says the song nests under the
    // album rather than standing beside it at the top level (PRODUCT-SPEC
    // hierarchy). `connect`'s upsert-by-triple dedup applies here too —
    // and since `song` reuses `existing`'s own id when there is one, this
    // finds and updates the same connection rather than minting another.
    extraPairs.push(
      ...changes.connect(item, label.ok.id, label.ok.name, song, {
        child: true,
        order: track.trackNumber,
      }).pairs,
    );
  }

  return {
    itemPatch: { data: { ...albumData, type: { attribute: "type", value: "album", kind: "string", prov: "auto" } } },
    albumName: album.name,
    extraPairs,
  };
}
