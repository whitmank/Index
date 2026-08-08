// Authored by Karter Whitman using Claude Opus 4.8
// The renderer's view of the preload bridge (PRODUCT-SPEC §2.2). The
// shape itself lives in the backend's preload; this file only declares
// what the renderer is allowed to see on `window`.
import type { IndexBridge } from "@index/backend/bridge";

declare global {
  interface Window {
    index: IndexBridge;
  }
}

export {};
