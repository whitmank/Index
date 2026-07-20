// Authored by Karter Whitman using Claude Opus 4.8
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** An absolute path to a local image, for the phase-2 bridge check. */
  readonly VITE_INDEX_SAMPLE_IMAGE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
