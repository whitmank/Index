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
  /** An absolute path for the parsing check to read — that check needs a
   * real file on disk, so it runs only when pointed at one. */
  readonly VITE_INDEX_UICHECK_FILE?: string;
  /** Open the first item whose name contains this, on launch. */
  readonly VITE_INDEX_OPEN?: string;
  /** The view kind to open on: timeline (default), canvas or list. */
  readonly VITE_INDEX_VIEW?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
