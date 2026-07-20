// Authored by Karter Whitman using Claude Opus 4.8
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** An absolute path to a local image, for the debug panel. */
  readonly VITE_INDEX_SAMPLE_IMAGE?: string;
  /** Set to run the debug panel's change sequence on launch. */
  readonly VITE_INDEX_AUTORUN?: string;
  /** Set to show the debug panel instead of the app. */
  readonly VITE_INDEX_DEBUG?: string;
  /** Set to drive the live UI with synthetic gestures on launch. */
  readonly VITE_INDEX_UICHECK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
