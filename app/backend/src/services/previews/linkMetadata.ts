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

/**
 * What a page says about itself, read from html the ingestor's probe
 * already fetched (ingest/probe.ts) rather than fetched again here —
 * this module used to do its own request, parse it for four tags and
 * discard the parse, which meant nothing else could ask the page a
 * question without paying for a second round trip.
 *
 * `html` is empty when the page couldn't be reached, which is not an
 * error: the Wikipedia fallback below still runs, so an unreachable
 * article still gets a title and an extract.
 */
export async function linkMetadataFrom(url: string, html: string): Promise<LinkMetadata> {
  const scraped = html ? scrape(url, html) : EMPTY;

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

export function scrape(url: string, html: string): LinkMetadata {
  try {
    const $ = cheerio.load(html);

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
  } catch {
    return EMPTY;
  }
}
