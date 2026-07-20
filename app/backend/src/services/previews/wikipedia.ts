// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz. Wikipedia articles don't reliably publish
// og:image (many have no lead image at all), but Wikipedia's own REST
// summary API returns a short extract for virtually any article, and a
// thumbnail when one exists. Without a thumbnail the extract is still
// enough for the link renderer to compose a card.
import { previewFetch, withPreviewTimeout } from "./fetch.js";

export interface WikipediaSummary {
  title: string;
  extract: string;
  thumbnailUrl: string | null;
}

export function isWikipediaUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith(".wikipedia.org") && parsed.pathname.startsWith("/wiki/");
  } catch {
    return false;
  }
}

export async function fetchWikipediaSummary(url: string): Promise<WikipediaSummary | null> {
  let apiUrl: string;
  try {
    const parsed = new URL(url);
    const lang = parsed.hostname.split(".")[0];
    const title = parsed.pathname.slice("/wiki/".length);
    if (!title) return null;
    apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${title}`;
  } catch {
    return null;
  }

  try {
    return await withPreviewTimeout(async (signal) => {
      const response = await previewFetch(apiUrl, signal);
      if (!response.ok) return null;

      const data = (await response.json()) as {
        title?: unknown;
        extract?: unknown;
        thumbnail?: { source?: unknown };
      };
      if (typeof data.extract !== "string" || !data.extract) return null;

      return {
        title: typeof data.title === "string" ? data.title : "",
        extract: data.extract,
        thumbnailUrl: typeof data.thumbnail?.source === "string" ? data.thumbnail.source : null,
      };
    });
  } catch {
    return null;
  }
}
