// Authored by Karter Whitman using Claude Opus 4.8
// The bridge surface (PRODUCT-SPEC §2.2) as a type, shared by the
// preload that implements it and the renderer that consumes it. Phase 0
// declares only the shape's envelope; the handlers land in phase 2.

/** Every handler answers with data or a message, never a thrown error. */
export type Result<T> = { ok: T } | { err: string };

export interface IndexBridge {
  /** Subscribe to a main-process event; returns the unsubscribe. */
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}
