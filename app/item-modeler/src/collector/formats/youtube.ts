// Authored by Karter Whitman using Claude Sonnet 5
// What a YouTube watch page declares about its own video, server-rendered
// as schema.org `VideoObject` microdata — the same category of
// self-description an epub's OPF or a PDF's XMP packet is: a fact the
// *page* asserts about itself, not something inferred from its shape or
// its url.
//
// The video's own properties and the channel's are both scoped inside one
// outer `itemscope itemtype=".../VideoObject"` element, and `name` is
// declared three times on a real watch page — the video's title, the
// channel's, and its repeat inside a breadcrumb — all three sharing the
// one attribute a naive `meta[itemprop="name"]` selector would collide
// on. So a value's *nearest* itemscope ancestor is walked to tell which
// scope it belongs to, the same discipline pdf.ts uses to avoid reading
// an embedded image's XMP packet as the document's.
//
// Everything here is read from `source.head`, not `source.text()`: a
// watch page's own inline bootstrap script routinely runs past
// `maxSourceTextLength`'s default before its `<head>` even closes —
// measured on a real watch page, every meta and microdata tag sat past
// 690 KB in — while `head` is bounded only by `WEB_MAX_BYTES` (1 MB),
// which is the limit this collector actually needs.
//
// Deliberately narrow to `/watch` and `youtu.be`: a Shorts page fetched
// the same way carries none of this microdata server-side, so matching
// it here would only cost a wasted parse for no evidence — the honest
// answer is "not handled" rather than "handled, finds nothing."
import * as cheerio from "cheerio";
import { add, type BasketEntry } from "../evidence/basket.js";
import type { SourceEvidence } from "../evidence/source-evidence.js";
import type { Collector } from "./collector.js";

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

function isYoutubeWatchUrl(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === "youtu.be") return url.pathname.length > 1;
  return YOUTUBE_HOSTS.has(host) && url.pathname === "/watch" && url.searchParams.has("v");
}

const VIDEO_SCOPE = /VideoObject/;
const CHANNEL_SCOPE = /Person/;

/**
 * The first `selector` match whose nearest itemscope ancestor declares
 * `ownScope`. "Nearest ancestor" rather than "any ancestor" because the
 * video's own outer div and the channel's inner `Person` span are nested
 * one inside the other, so every element on the page has *both* in its
 * ancestry — only the closer one is the scope a property actually
 * belongs to.
 *
 * The value itself is read from whichever of `content`/`href` the tag
 * carries: a `<meta>` states its value in `content`, but microdata's
 * `<link>` — used wherever the value is itself a url, YouTube's channel
 * link among them — states it in `href` instead.
 */
function propertyIn($: cheerio.CheerioAPI, selector: string, ownScope: RegExp): string | undefined {
  let found: string | undefined;
  $(selector).each((_, element) => {
    if (found !== undefined) return;

    let scope = $(element).parent();
    let itemtype: string | undefined;
    while (scope.length > 0) {
      itemtype = scope.attr("itemtype");
      if (itemtype !== undefined) break;
      scope = scope.parent();
    }
    if (itemtype === undefined || !ownScope.test(itemtype)) return;

    const value = ($(element).attr("content") ?? $(element).attr("href"))?.trim();
    if (value) found = value;
  });
  return found;
}

export const youtubeCollector: Collector = {
  name: "youtube",

  handles(source: SourceEvidence): boolean {
    return source.kind === "web" && isYoutubeWatchUrl(source.uri);
  },

  async collect(source: SourceEvidence, basket: BasketEntry[]): Promise<void> {
    const html = source.head.toString("utf8");
    if (html === "") return;

    const $ = cheerio.load(html);
    const video = (name: string) => propertyIn($, `meta[itemprop="${name}"]`, VIDEO_SCOPE);
    const channel = (name: string) => propertyIn($, `link[itemprop="${name}"]`, CHANNEL_SCOPE);

    add(basket, "youtube.title", video("name"), source.sourceId);
    add(basket, "youtube.description", video("description"), source.sourceId);
    add(basket, "youtube.datePublished", video("datePublished"), source.sourceId);
    add(basket, "youtube.duration", video("duration"), source.sourceId);
    add(basket, "youtube.genre", video("genre"), source.sourceId);
    add(basket, "youtube.keywords", video("keywords"), source.sourceId);
    add(basket, "youtube.videoId", video("identifier"), source.sourceId);

    add(basket, "youtube.channel", channel("name"), source.sourceId);
    add(basket, "youtube.channelUrl", channel("url"), source.sourceId);
  },
};
