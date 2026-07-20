// Authored by Karter Whitman using Claude Opus 4.8
// Bundles the main process and the preload into app/backend/dist.
// The main process is ESM (the repo is type: module, Electron 39 loads
// it fine); the preload must be CommonJS — a sandboxed preload has no
// module loader — so it is emitted as .cjs.
import { build, context } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

// Native modules and Electron itself resolve at runtime, never bundled.
const external = ["electron", "sharp"];

const targets = [
  {
    entryPoints: [path.join(here, "src/main.ts")],
    outfile: path.join(here, "dist/main.js"),
    format: "esm",
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
