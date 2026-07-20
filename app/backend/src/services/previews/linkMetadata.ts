// Authored by Karter Whitman using Claude Opus 4.8
// Ported from kwhitman.xyz. What a link resource can say about itself
// before anyone opens it: a favicon, a preview image, and — where the
// page offers one — a title and extract for the card.
import * as cheerio from "cheerio";
import { previewFetch, withPreviewTimeout } from "./fetch.js";
import { fetchWikipediaSummary, isWikipediaUrl } from "./wikipedia.js";

export interface LinkMetadata {
  favicon: string | null;
  preview_image: string | null;
  card_title: string | null;
  card_extract: string | null;
}

const EMPTY: LinkMetadata = {
  favicon: null,
  preview_image: null,
  card_title: null,
  card_extract: null,
};

const MAX_HTML_BYTES = 1_000_000; // PRODUCT-SPEC §2.4

const FAVICON_SELECTORS = [
  'link[rel="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
];

function resolveAgainst(href: string | undefined, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Reads at most MAX_HTML_BYTES of the body — link and meta tags live in
 * <head>, so the full page is never needed. */
async function readCappedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytesRead = 0;
  while (bytesRead < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  void reader.cancel().catch(() => {});
  return text;
}

export async function fetchLinkMetadata(url: string): Promise<LinkMetadata> {
  const scraped = await scrape(url);

  if (!isWikipediaUrl(url)) return scraped;

  // The REST fallback fills what the page itself didn't say.
  const summary = await fetchWikipediaSummary(url);
  if (!summary) return scraped;
  return {
    favicon: scraped.favicon,
    preview_image: scraped.preview_image ?? summary.thumbnailUrl,
    card_title: scraped.card_title ?? (summary.title || null),
    card_extract: scraped.card_extract ?? summary.extract,
  };
}

async function scrape(url: string): Promise<LinkMetadata> {
  try {
    return await withPreviewTimeout(async (signal) => {
      const response = await previewFetch(url, signal);
      if (!response.ok) return EMPTY;

      const $ = cheerio.load(await readCappedText(response));

      let favicon: string | null = null;
      for (const selector of FAVICON_SELECTORS) {
        favicon = resolveAgainst($(selector).first().attr("href"), url);
        if (favicon) break;
      }
      favicon ??= resolveAgainst("/favicon.ico", url);

      const ogImage =
        $('meta[property="og:image"]').attr("content") ??
        $('meta[name="twitter:image"]').attr("content");

      const title =
        $('meta[property="og:title"]').attr("content") ?? $("title").first().text().trim();

      const extract =
        $('meta[property="og:description"]').attr("content") ??
        $('meta[name="description"]').attr("content");

      return {
        favicon,
        preview_image: resolveAgainst(ogImage, url),
        card_title: title || null,
        card_extract: extract?.trim() || null,
      };
    });
  } catch {
    return EMPTY;
  }
}
