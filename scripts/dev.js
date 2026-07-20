#!/usr/bin/env node
// Authored by Karter Whitman using Claude Opus 4.8
// One command: Vite serving the renderer, esbuild watching the main
// process, Electron pointed at both. The main process spawns and
// supervises SurrealDB itself, so there is no separate database step.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RENDERER_URL = "http://localhost:5273";

const children = [];

function run(name, command, args, options = {}) {
  const child = spawn(command, args, { cwd: root, stdio: "inherit", ...options });
  child.on("error", (error) => {
    console.error(`[${name}] ${error.message}`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

function shutdown(code) {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exit(code);
}

async function waitForRenderer(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(RENDERER_URL);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  throw new Error(`Vite did not come up at ${RENDERER_URL}`);
}

// esbuild first: Electron needs dist/main.js to exist before it starts.
await new Promise((resolve, reject) => {
  const build = run("build", "npm", ["run", "build", "--workspace=@index/backend"]);
  build.on("close", (code) => (code === 0 ? resolve() : reject(new Error("backend build failed"))));
});

run("watch", "node", ["app/backend/build.js", "--watch"]);
run("vite", "npx", ["vite"], { cwd: path.join(root, "app/frontend") });

await waitForRenderer();

const electron = run("electron", "npx", ["electron", "."], {
  env: { ...process.env, NODE_ENV: "development", INDEX_RENDERER_URL: RENDERER_URL },
});

electron.on("close", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
