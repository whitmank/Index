// Authored by Karter Whitman using Claude Sonnet 5
// One-time backfill for "every type gets a dedicated Space"
// (app/database/src/sets/type-spaces.ts): the invariant it adds —
// creating a type also mints a Space whose rule is "type is that type,"
// unless one already exists — only fires from upsertSchema going
// forward. A type registered before this shipped needs this run once to
// catch up.
//
// For each registered type: if a Space already dedicates itself to it
// (hand-built, like Karter's own Books/Movies, or minted by an earlier
// run of this script), it's left alone — reported, not touched. Only a
// type with no such Space gets a new one.
//
//   npx tsx scripts/create-type-spaces.ts [--target <dir>] [--target-port <n>] [--dry-run]
//
// Run with the app closed: this binds the same port the app does (8422
// by default) against the same RocksDB directory. `--dry-run` reports
// what it would do without writing anything.
//
// Idempotent: ensureTypeSpace only mints a Space when neither a
// hand-built nor a previously auto-built one already covers that type,
// so a second run (accidental or deliberate) finds nothing left to do.
import path from "node:path";
import { ensureTypeSpace, findDedicatedSpace, listSchemas, startDatabase } from "@index/database";

const HOME = process.env.HOME ?? "";

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 && process.argv[index + 1] ? (process.argv[index + 1] as string) : fallback;
}

async function main(): Promise<void> {
  const targetDir = arg("target", path.join(HOME, ".index", "surreal"));
  const targetPort = Number(arg("target-port", "8422"));
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `[type-spaces] target: ${targetDir} (port ${targetPort})${dryRun ? " — dry run, nothing will be written" : ""}`,
  );

  const handle = await startDatabase({ directory: targetDir, port: targetPort });
  try {
    const schemas = await listSchemas();
    console.log(`[type-spaces] ${schemas.length} type(s) registered`);

    let created = 0;
    let left = 0;

    for (const schema of schemas) {
      const existing = await findDedicatedSpace(schema.name);
      if (existing) {
        const existingName = (existing.data.name?.value as string | undefined) ?? existing.id;
        console.log(`[type-spaces] "${schema.name}" — already has a dedicated Space ("${existingName}"), leaving it`);
        left += 1;
        continue;
      }

      if (dryRun) {
        console.log(`[type-spaces] "${schema.name}" — would create a new Space`);
        continue;
      }

      // Reported off what actually happened, not assumed — the id
      // collision this backfill's first run hit (typeSpaceId's `-` bug)
      // would otherwise have this print "created" for eight Spaces that
      // were each silently skipped underneath it.
      const didCreate = await ensureTypeSpace(schema.name);
      console.log(`[type-spaces] "${schema.name}" — ${didCreate ? "created a new Space" : "nothing to do"}`);
      if (didCreate) created += 1;
      else left += 1;
    }

    console.log(
      dryRun
        ? `[type-spaces] dry run done — ${schemas.length - left} type(s) would get a new Space, ${left} already covered`
        : `[type-spaces] done — created ${created} Space(s), ${left} type(s) already covered`,
    );
  } finally {
    await handle.stop();
  }
}

main().catch((error) => {
  console.error("[type-spaces] failed:", error);
  process.exit(1);
});
