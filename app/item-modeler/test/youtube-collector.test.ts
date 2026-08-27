// Authored by Karter Whitman using Claude Sonnet 5
// The regression anchor for the youtube collector (../src/collector/formats/youtube.ts):
// that it reads a watch page's own VideoObject microdata rather than the
// channel's or the breadcrumb's — all three sharing the `name` itemprop
// on a real page — that it reads `source.head` rather than `source.text()`
// so a watch page's giant inline bootstrap script (which routinely runs
// past `maxSourceTextLength` before `<head>` even closes) never hides the
// facts, and that it stays out of urls and sources it was never built
// for. Same house style as collector.test.ts: no framework, an inline
// `check()` runner, extractClaims as the entry point rather than reaching
// into collectBasket directly.
import assert from "node:assert/strict";
import type { Resource, Schema, SchemaAttribute } from "@index/database/types";
import { extractClaims } from "../src/collector/index.js";
import type { SourceGateway } from "../src/collector/evidence/source-resolution.js";

let passed = 0;

function check(what: string, assertion: () => void | Promise<void>): Promise<void> {
  return Promise.resolve(assertion()).then(() => {
    passed += 1;
    console.log(`  ✓ ${what}`);
  });
}

const field = (attribute: string): SchemaAttribute => ({ attribute, kind: "string", display: true });
const SCHEMA: Schema = { id: "schemas:video", name: "video", attributes: [field("title")] };
const VIDEO_SCHEMA: Schema = {
  id: "schemas:video-full",
  name: "video",
  attributes: [field("title"), field("author"), field("published")],
};

/** A watch page's own microdata, in the shape a real one renders it: the
 * video's properties and the channel's `Person` scope nested inside one
 * outer `VideoObject` div, `name` declared three times — once for the
 * video, once for the channel (as a `<link>`), once more inside a
 * breadcrumb repeating the channel's — because that ambiguity is exactly
 * what the collector has to resolve correctly to be worth anything.
 */
function watchPageHtml(options: { padding?: string } = {}): string {
  return `<!doctype html><html><head><title>How Something Works - YouTube</title>
${options.padding ?? ""}
<meta property="og:site_name" content="YouTube">
<div id="watch7-content" itemscope itemid="https://www.youtube.com/watch?v=abc123XYZ0" itemtype="http://schema.org/VideoObject">
<link itemprop="url" href="https://www.youtube.com/watch?v=abc123XYZ0">
<meta itemprop="name" content="How Something Works">
<meta itemprop="description" content="A description of the video.">
<meta itemprop="identifier" content="abc123XYZ0">
<meta itemprop="duration" content="PT12M3S">
<span itemprop="author" itemscope itemtype="http://schema.org/Person">
<link itemprop="url" href="https://www.youtube.com/@SomeChannel">
<link itemprop="name" content="Some Channel">
</span>
<span itemscope itemtype="https://schema.org/BreadcrumbList">
<span itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
<meta itemprop="position" content="1">
<span itemprop="item" itemid="https://www.youtube.com/@SomeChannel" itemscope itemtype="https://schema.org/Thing">
<meta itemprop="name" content="Some Channel">
</span>
</span>
</span>
<meta itemprop="datePublished" content="2024-03-01T09:00:00-08:00">
<meta itemprop="uploadDate" content="2024-03-01T09:00:00-08:00">
<meta itemprop="genre" content="Science &amp; Technology">
<meta itemprop="keywords" content="physics,demo,experiment">
</div>
</head><body></body></html>`;
}

function gatewayFor(html: string): SourceGateway {
  return {
    localPath: () => null,
    fetch: async () => Buffer.from(html, "utf8"),
  };
}

const resourceFor = (uri: string): Resource => ({ uri, name: uri });

function baseRequest(resources: Resource[], gateway: SourceGateway) {
  return {
    resources,
    schema: SCHEMA,
    gateway,
    allowNetworkAccess: true,
    maxSources: 8,
    maxSourceTextLength: 200_000,
    languageModelMode: "never" as const,
    timeoutMs: 5_000,
    now: () => new Date("2026-08-26T00:00:00Z"),
  };
}

async function basketFor(uri: string, html: string, maxSourceTextLength = 200_000) {
  const result = await extractClaims({
    ...baseRequest([resourceFor(uri)], gatewayFor(html)),
    maxSourceTextLength,
  });
  return result.basketEntries;
}

function valueOf(entries: { key: string; value: string }[], key: string): string | undefined {
  return entries.find((entry) => entry.key === key)?.value;
}

async function run(): Promise<void> {
  console.log("\nreads the video's own scope, not the channel's or the breadcrumb's");

  await check("collects the video's declared facts under youtube.*", async () => {
    const entries = await basketFor("https://www.youtube.com/watch?v=abc123XYZ0", watchPageHtml());
    assert.equal(valueOf(entries, "youtube.title"), "How Something Works");
    assert.equal(valueOf(entries, "youtube.description"), "A description of the video.");
    assert.equal(valueOf(entries, "youtube.videoId"), "abc123XYZ0");
    assert.equal(valueOf(entries, "youtube.duration"), "PT12M3S");
    assert.equal(valueOf(entries, "youtube.datePublished"), "2024-03-01T09:00:00-08:00");
    assert.equal(valueOf(entries, "youtube.genre"), "Science & Technology");
    assert.equal(valueOf(entries, "youtube.keywords"), "physics,demo,experiment");
  });

  await check("the channel's name comes from its own Person scope, not the video's or the breadcrumb's", async () => {
    const entries = await basketFor("https://www.youtube.com/watch?v=abc123XYZ0", watchPageHtml());
    assert.equal(valueOf(entries, "youtube.channel"), "Some Channel");
    assert.equal(valueOf(entries, "youtube.channelUrl"), "https://www.youtube.com/@SomeChannel");
    // Three `name` declarations on the page; exactly two facts out.
    assert.notEqual(valueOf(entries, "youtube.title"), valueOf(entries, "youtube.channel"));
  });

  console.log("\nreads source.head, not source.text()");

  await check("still finds the facts when they sit past maxSourceTextLength", async () => {
    const padding = `<!-- ${"padding ".repeat(50)} -->`; // well past a maxSourceTextLength of 100
    assert.ok(padding.length > 100);
    const entries = await basketFor(
      "https://www.youtube.com/watch?v=abc123XYZ0",
      watchPageHtml({ padding }),
      100,
    );
    assert.equal(valueOf(entries, "youtube.title"), "How Something Works");
  });

  console.log("\nonly a watch page or a youtu.be link, not the web at large");

  await check("a youtu.be link is handled the same as a full watch url", async () => {
    const entries = await basketFor("https://youtu.be/abc123XYZ0", watchPageHtml());
    assert.equal(valueOf(entries, "youtube.title"), "How Something Works");
  });

  await check("a youtube url with no video id is left alone", async () => {
    const entries = await basketFor("https://www.youtube.com/watch", watchPageHtml());
    assert.equal(valueOf(entries, "youtube.title"), undefined);
  });

  await check("a channel page is left alone", async () => {
    const entries = await basketFor("https://www.youtube.com/@SomeChannel", watchPageHtml());
    assert.equal(valueOf(entries, "youtube.title"), undefined);
  });

  await check("a non-youtube host serving the exact same markup is left alone", async () => {
    const entries = await basketFor("https://example.com/watch?v=abc123XYZ0", watchPageHtml());
    assert.equal(valueOf(entries, "youtube.title"), undefined);
  });

  console.log("\ntitle, channel and published date are transcribed, not synthesised");

  // Measured, not assumed: a small local model reading these off the
  // basket itself got both wrong on real videos — one run reported
  // `published` from a keyword tag reading "Rick Astley 2022" instead of
  // the correct `youtube.datePublished` sitting beside it, another
  // swapped the title and channel outright, naming an item after its
  // channel and its author after a name buried in the keywords list.
  // stated-facts.ts promotes these three so the model is never asked.
  await check("come back as deterministic claims, no model consulted", async () => {
    const result = await extractClaims({
      ...baseRequest(
        [resourceFor("https://www.youtube.com/watch?v=abc123XYZ0")],
        gatewayFor(watchPageHtml()),
      ),
      schema: VIDEO_SCHEMA,
    });

    const title = result.claims.find((claim) => claim.field === "title");
    const author = result.claims.find((claim) => claim.field === "author");
    const published = result.claims.find((claim) => claim.field === "published");

    assert.equal(title?.value, "How Something Works");
    assert.equal(author?.value, "Some Channel");
    assert.equal(published?.value, "2024-03-01T09:00:00-08:00");
    for (const claim of [title, author, published]) {
      assert.equal(claim?.provenance.origin, "deterministic");
      assert.equal(claim?.provenance.method, "youtube-microdata");
    }
    assert.equal(result.deterministicCount, 3);
    assert.equal(result.languageModelCount, 0);
  });

  await check("a name that only appears in the keywords list never becomes the author", async () => {
    const html = watchPageHtml().replace(
      "physics,demo,experiment",
      "physics,demo,experiment,Thomas Malone",
    );
    const result = await extractClaims({
      ...baseRequest([resourceFor("https://www.youtube.com/watch?v=abc123XYZ0")], gatewayFor(html)),
      schema: VIDEO_SCHEMA,
    });
    assert.equal(result.claims.find((claim) => claim.field === "author")?.value, "Some Channel");
  });

  console.log(`\n${passed} checks passed\n`);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
