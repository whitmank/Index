// Authored by Karter Whitman using Claude Sonnet 5
// Ad-hoc: run the real extractClaims pipeline (the same function
// intake.ts / ingestParse calls) against one YouTube url, live over the
// network, and print what the collector put in the basket plus whatever
// claims came out of it. No database, no Electron, no synthetic fixture.
//
// Usage (from the workspace root):
//   npx tsx /path/to/this/file.ts <youtube-url>
import { extractClaims, nodeGateway } from "@index/item-modeler";
import type { Schema, SchemaAttribute } from "@index/database/types";

const url = process.argv[2];
if (!url) {
  console.error("usage: tsx test-youtube-flow.ts <youtube-url>");
  process.exit(1);
}

const field = (attribute: string): SchemaAttribute => ({ attribute, kind: "string", display: true });

// Stand-in for your real "video" type's schema. Edit the attribute names
// to match yours exactly if you want field-hints (title/author/published)
// to resolve the same way they would in the app.
const SCHEMA: Schema = {
  id: "schemas:video",
  name: "video",
  attributes: [field("title"), field("author"), field("published"), field("description")],
};

async function main(): Promise<void> {
  const result = await extractClaims({
    resources: [{ uri: url, name: url }],
    schema: SCHEMA,
    gateway: nodeGateway,
    allowNetworkAccess: true,
    maxSources: 8,
    maxSourceTextLength: 200_000,
    languageModelMode: "fallback-only", // same default the app uses
    timeoutMs: 30_000,
    now: () => new Date(),
  });

  console.log("\n=== basket (what the collector found) ===");
  for (const entry of result.basketEntries) console.log(`${entry.key}: ${entry.value}`);

  console.log("\n=== claims (what made it into fields) ===");
  for (const claim of result.claims) {
    console.log(`${claim.field} = ${JSON.stringify(claim.value)}  [${claim.provenance.origin}]`);
  }

  console.log("\n=== warnings ===");
  for (const warning of result.warnings) console.log(`${warning.code}: ${warning.message}`);

  console.log(`\nsources: ${JSON.stringify(result.sources)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
