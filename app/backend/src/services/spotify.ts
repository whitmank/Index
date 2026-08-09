// Authored by Karter Whitman using Claude Sonnet 5
// Spotify's own catalog, read through the official Web API (Client
// Credentials grant) rather than scraped off the page — accurate track
// names, exact per-track urls, and none of the fragility of parsing
// whatever Spotify's frontend happens to embed this week.
import { loadSpotifyCredentials } from "../config.js";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";

// Refreshed a minute early rather than waiting to be turned away — a
// token that expires mid-request is indistinguishable from one that was
// never fetched, so there's nothing to gain by cutting it closer.
const TOKEN_SAFETY_MARGIN_MS = 60_000;

const ALBUM_URL_PATTERN = /open\.spotify\.com\/album\/([A-Za-z0-9]+)/;

export function isSpotifyAlbumUrl(url: string): boolean {
  return ALBUM_URL_PATTERN.test(url);
}

export function parseAlbumId(url: string): string | null {
  return ALBUM_URL_PATTERN.exec(url)?.[1] ?? null;
}

export interface SpotifyTrack {
  name: string;
  artists: string[];
  trackNumber: number;
  durationMs: number;
  url: string;
}

export interface SpotifyAlbum {
  name: string;
  artists: string[];
  /** Whatever precision Spotify gave it — a bare year, year-month, or
   * full date (its own `release_date_precision`, which this doesn't
   * bother carrying since the caller just pads what's short). */
  releaseDate: string;
  coverUrl: string | null;
  tracks: SpotifyTrack[];
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

let cachedToken: CachedToken | null = null;

interface TokenResponse {
  access_token: string;
  expires_in: number;
}

async function fetchAccessToken(): Promise<CachedToken> {
  const credentials = loadSpotifyCredentials();
  if (!credentials.clientId || !credentials.clientSecret) {
    throw new Error("No Spotify credentials configured — add a Client ID and Secret in Settings.");
  }

  const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    throw new Error(
      response.status === 400
        ? "Spotify rejected those credentials — check the Client ID and Secret in Settings."
        : `Spotify's token endpoint answered ${response.status}.`,
    );
  }

  const body = (await response.json()) as TokenResponse;
  return { token: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 - TOKEN_SAFETY_MARGIN_MS };
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  cachedToken = await fetchAccessToken();
  return cachedToken.token;
}

export interface SpotifyImageRow {
  url: string;
}

export interface SpotifyArtistRow {
  name: string;
}

export interface SpotifyTrackRow {
  name: string;
  artists: SpotifyArtistRow[];
  track_number: number;
  duration_ms: number;
  external_urls: { spotify: string };
}

export interface SpotifyAlbumRow {
  name: string;
  artists: SpotifyArtistRow[];
  release_date: string;
  images: SpotifyImageRow[];
  tracks: { items: SpotifyTrackRow[] };
}

/** The Web API's own response shape → this module's, exported so the
 * mapping (track order, artist flattening) is checkable without a live
 * network call. */
export function albumFromRow(row: SpotifyAlbumRow): SpotifyAlbum {
  return {
    name: row.name,
    artists: row.artists.map((artist) => artist.name),
    releaseDate: row.release_date,
    coverUrl: row.images[0]?.url ?? null,
    tracks: row.tracks.items
      .map((track) => ({
        name: track.name,
        artists: track.artists.map((artist) => artist.name),
        trackNumber: track.track_number,
        durationMs: track.duration_ms,
        url: track.external_urls.spotify,
      }))
      .sort((a, b) => a.trackNumber - b.trackNumber),
  };
}

/** One retry, once, on a 401 — the cached token could have been revoked
 * or the clock skewed past its margin; anything else about the response
 * isn't going to change on a second try. */
export async function fetchAlbum(url: string): Promise<SpotifyAlbum> {
  const id = parseAlbumId(url);
  if (!id) throw new Error(`Not a Spotify album url: ${url}`);

  const request = async (): Promise<Response> => {
    const token = await getAccessToken();
    return fetch(`${API_BASE}/albums/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  };

  let response = await request();
  if (response.status === 401) {
    cachedToken = null;
    response = await request();
  }

  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Spotify doesn't have an album at that url."
        : `Spotify's album lookup answered ${response.status}.`,
    );
  }

  return albumFromRow((await response.json()) as SpotifyAlbumRow);
}
