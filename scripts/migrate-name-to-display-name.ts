// Authored by Karter Whitman using Claude Sonnet 5
// One-time: before `name` becomes the modeler's unconditional field,
// preserve every item's already-typed title. Every item where `name`
// currently carries `prov: "user"` — today the only signal a person
// chose it — gets that value copied into `display_name`, additively:
// `name` itself is left exactly as it is, so an item nothing ever
// re-models still shows the same title it always has (`captionOf`,
// `display_name ?? name`, already reads `display_name` first
// everywhere the app draws one). Skips a blank `name` (nothing worth
// preserving) and an item that already carries a `display_name` (never
// happens today — nothing writes it yet — but idempotent regardless).
import { applyChange, defaultDirectory, listLiveItems, nameOf, startDatabase } from "@index/database";
import type { Data, Item } from "@index/database/types";

function isBlank(value: string | string[] | undefined): boolean {
  if (value === undefined) return true;
  return Array.isArray(value) ? value.every((v) => v.trim() === "") : value.trim() === "";
}

const dryRun = process.argv.includes("--dry-run");

const { stop } = await startDatabase({ directory: defaultDirectory(), port: 8422 });
try {
  const items = await listLiveItems();
  const candidates = items.filter(
    (item) =>
      item.data.name.prov === "user" &&
      !isBlank(item.data.name.value) &&
      !item.data.display_name &&
      // A Set/Space is never passed through the modeler — nothing ever
      // was at stake in its `name`, so it needs no migration. Excluding
      // it also sidesteps a real, unrelated quirk: seeded Set pseudo-
      // items carry a server-native, sub-millisecond `date_added` that
      // does not round-trip byte-identical through a plain JS string,
      // which trips `date_added`'s readonly assert on a full-record
      // rewrite even though nothing about the date actually changed.
      item.set === false,
  );

  console.log(`${items.length} live items, ${candidates.length} to migrate.`);
  for (const item of candidates) console.log(`  ${item.id}: "${nameOf(item)}"`);

  if (dryRun) {
    console.log("\n--dry-run: nothing written.");
  } else if (candidates.length > 0) {
    const pairs = candidates.map((item) => {
      const data: Data = {
        ...item.data,
        display_name: { attribute: "display_name", value: item.data.name.value, kind: "string", prov: "user" },
      };
      const after: Item = { ...item, data };
      return { before: item, after };
    });
    await applyChange({ description: "Preserve titles into display_name before the naming cutover", pairs });
    console.log(`\napplied to ${pairs.length} items.`);
  }
} finally {
  await stop();
}
