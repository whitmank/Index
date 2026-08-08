// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz — shared plumbing for the preview fetchers: a
// bounded-time fetch with a link-preview User-Agent. The timeout covers
// the whole operation (headers *and* body reading), not just the initial
// response, so a slow body cannot hang resource creation.
const FETCH_TIMEOUT_MS = 10_000; // PRODUCT-SPEC §2.4
const USER_AGENT = "Mozilla/5.0 (compatible; Index link preview)";

export async function withPreviewTimeout<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export function previewFetch(url: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, { signal, headers: { "User-Agent": USER_AGENT } });
}
