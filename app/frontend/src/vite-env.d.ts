// Authored by Karter Whitman using Claude Opus 4.8
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** An absolute path to a local image, for the debug panel. */
  readonly VITE_INDEX_SAMPLE_IMAGE?: string;
  /** Set to run the debug panel's change sequence on launch. */
  readonly VITE_INDEX_AUTORUN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
