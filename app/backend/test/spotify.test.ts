// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for services/spotify.ts's pure pieces — url
// parsing and the Web API's response shape mapped to this module's own.
// The token fetch and the album lookup itself need a live network and
// real credentials, so those are exercised for real rather than mocked
// here (no mocked-network harness exists in this repo).
import assert from "node:assert/strict";
import { albumFromRow, isSpotifyAlbumUrl, parseAlbumId, type SpotifyAlbumRow } from "../src/services/spotify.js";

let passed = 0;

function check(what: string, assertion: () => void): void {
  assertion();
  passed += 1;
  console.log(`  ✓ ${what}`);
}

console.log("\nurl matching");

check("recognizes an album url", () => {
  assert.equal(isSpotifyAlbumUrl("https://open.spotify.com/album/3QITXlmmt93E176jzVqKUb"), true);
});

check("recognizes an album url with a share query string", () => {
  assert.equal(
    isSpotifyAlbumUrl("https://open.spotify.com/album/3QITXlmmt93E176jzVqKUb?si=abc123"),
    true,
  );
});

check("does not mistake a track url for an album url", () => {
  assert.equal(isSpotifyAlbumUrl("https://open.spotify.com/track/3QITXlmmt93E176jzVqKUb"), false);
});

check("does not match an unrelated url", () => {
  assert.equal(isSpotifyAlbumUrl("https://example.com/album/whatever"), false);
});

console.log("\nid parsing");

check("extracts the id, dropping the query string", () => {
  assert.equal(
    parseAlbumId("https://open.spotify.com/album/3QITXlmmt93E176jzVqKUb?si=abc123"),
    "3QITXlmmt93E176jzVqKUb",
  );
});

check("answers null for a non-album url", () => {
  assert.equal(parseAlbumId("https://open.spotify.com/playlist/abc123"), null);
});

console.log("\nresponse shaping");

const row: SpotifyAlbumRow = {
  name: "Nurture",
  artists: [{ name: "Porter Robinson" }],
  release_date: "2021-04-23",
  images: [{ url: "https://i.scdn.co/image/cover" }, { url: "https://i.scdn.co/image/smaller" }],
  tracks: {
    items: [
      {
        name: "Look at the Sky",
        artists: [{ name: "Porter Robinson" }],
        track_number: 2,
        duration_ms: 309_000,
        external_urls: { spotify: "https://open.spotify.com/track/look-at-the-sky" },
      },
      {
        name: "Lifelike",
        artists: [{ name: "Porter Robinson" }],
        track_number: 1,
        duration_ms: 94_000,
        external_urls: { spotify: "https://open.spotify.com/track/lifelike" },
      },
      {
        name: "Unfold",
        artists: [{ name: "Porter Robinson" }, { name: "TEED" }],
        track_number: 13,
        duration_ms: 285_000,
        external_urls: { spotify: "https://open.spotify.com/track/unfold" },
      },
    ],
  },
};

const album = albumFromRow(row);

check("carries the album's own name, artist, and release date", () => {
  assert.equal(album.name, "Nurture");
  assert.deepEqual(album.artists, ["Porter Robinson"]);
  assert.equal(album.releaseDate, "2021-04-23");
});

check("takes the first image as the cover", () => {
  assert.equal(album.coverUrl, "https://i.scdn.co/image/cover");
});

check("orders tracks by track_number, not response order", () => {
  assert.deepEqual(
    album.tracks.map((track) => track.name),
    ["Lifelike", "Look at the Sky", "Unfold"],
  );
});

check("flattens multi-artist tracks", () => {
  const unfold = album.tracks.find((track) => track.name === "Unfold");
  assert.deepEqual(unfold?.artists, ["Porter Robinson", "TEED"]);
});

check("carries each track's own url, not the album's", () => {
  const lifelike = album.tracks.find((track) => track.name === "Lifelike");
  assert.equal(lifelike?.url, "https://open.spotify.com/track/lifelike");
});

console.log(`\n${passed} assertions passed\n`);
