// Authored by Karter Whitman using Claude Opus 4.8
// Bundles the main process and the preload into app/backend/dist.
// The main process is ESM (the repo is type: module, Electron 39 loads
// it fine); the preload must be CommonJS — a sandboxed preload has no
// module loader — so it is emitted as .cjs.
import { build, context } from "esbuild";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Only our own workspace code is bundled. Third-party packages resolve
// from node_modules at runtime, which keeps the bundle small and — more
// importantly — keeps CommonJS packages (cheerio's iconv-lite, sharp's
// native binding) out of an ESM bundle, where their dynamic `require`
// calls do not survive.
const dependenciesOf = (workspace) =>
  Object.keys(
    JSON.parse(readFileSync(path.join(here, workspace, "package.json"), "utf8")).dependencies ?? {},
  );

const external = ["electron", ...dependenciesOf("."), ...dependenciesOf("../database")].filter(
  (name) => !name.startsWith("@index/"),
);

const targets = [
  {
    entryPoints: [path.join(here, "src/main.ts")],
    outfile: path.join(here, "dist/main.js"),
    format: "esm",
    // The bundle is ESM but its externals may be CommonJS; give them the
    // `require` they expect.
    banner: {
      js: [
        'import { createRequire as __createRequire } from "node:module";',
        "const require = __createRequire(import.meta.url);",
      ].join("\n"),
    },
  },
  {
    entryPoints: [path.join(here, "src/preload.ts")],
    outfile: path.join(here, "dist/preload.cjs"),
    format: "cjs",
  },
];

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  sourcemap: true,
  external,
  logLevel: "info",
};

const watch = process.argv.includes("--watch");

if (watch) {
  for (const target of targets) {
    const ctx = await context({ ...common, ...target });
    await ctx.watch();
  }
} else {
  await Promise.all(targets.map((target) => build({ ...common, ...target })));
}
