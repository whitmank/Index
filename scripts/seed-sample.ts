// Authored by Karter Whitman using Claude Opus 4.8
// Puts a handful of real items into the development store so the views
// have something to draw. Run it with the app closed — it starts its own
// SurrealDB against ~/.index/surreal:
//
//   npx tsx scripts/seed-sample.ts <path-to-image>...
//
// Everything it makes is an ordinary item, so the app can delete it.
import path from "node:path";
import {
  applyChange,
  itemId,
  connectionId,
  startDatabase,
  type Change,
  type Item,
} from "@index/database";

const DEVICE = "local";

function blank(name: string, dateAdded: string, resources: Item["resources"] = []): Item {
  return {
    id: itemId(),
    name,
    display_name: null,
    date_added: dateAdded,
    date_created: null,
    created_at: new Date().toISOString(),
    opens: null,
    query: null,
    system: false,
    metadata: [],
    resources,
    deleted_at: null,
  };
}

function daysAgo(days: number): string {
  const when = new Date();
  when.setDate(when.getDate() - days);
  return new Date(when.getTime() - when.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

async function main(): Promise<void> {
  const images = process.argv.slice(2);
  const handle = await startDatabase();

  try {
    const album = blank("summer", daysAgo(0));
    const pairs: Change["pairs"] = [{ before: null, after: album }];

    images.forEach((image, index) => {
      const absolute = path.resolve(image);
      const item = blank(path.basename(absolute, path.extname(absolute)), daysAgo(index % 3), [
        { uri: `${DEVICE}://${absolute}`, name: path.basename(absolute) },
      ]);
      pairs.push({ before: null, after: item });
      pairs.push({
        before: null,
        after: {
          id: connectionId(),
          source: item.id,
          target: album.id,
          label: null,
          position: null,
          order: null,
          created_at: new Date().toISOString(),
          deleted_at: null,
        },
      });
    });

    pairs.push({
      before: null,
      after: blank("Anthropic", daysAgo(1), [
        { uri: "https://www.anthropic.com", name: "anthropic.com" },
      ]),
    });
    pairs.push({ before: null, after: blank("a note with no resource", daysAgo(2)) });

    await applyChange({ description: "Seed sample items", pairs });
    console.log(`seeded ${pairs.length} records`);
  } finally {
    await handle.stop();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
