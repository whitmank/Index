// Authored by Karter Whitman using Claude Opus 4.8
// How a resource is addressed from the renderer. Kept apart from
// protocols.ts, which handles these urls but pulls in main-process-only
// Electron modules the preload must not touch.
//
// [pinned here] The spec writes `res://<encodeURIComponent(uri)>`, which
// puts the encoded uri in the URL's *authority*. That cannot work: these
// schemes are registered as `standard` so the renderer can `fetch()` them
// (a non-standard scheme is blocked by CORS outright), a standard scheme
// requires a non-empty host, and Chromium normalises hosts — while a
// resource path is case-sensitive. The minted form is therefore
// `res://uri/<encoded>`: a fixed host, the encoded uri in the path, which
// is left alone. The handler accepts the spec's shape too.
export const RES_SCHEME = "res";
export const THUMB_SCHEME = "thumb";

const HOST = "uri";

export function resUrl(uri: string): string {
  return `${RES_SCHEME}://${HOST}/${encodeURIComponent(uri)}`;
}

export function thumbUrl(uri: string): string {
  return `${THUMB_SCHEME}://${HOST}/${encodeURIComponent(uri)}`;
}
