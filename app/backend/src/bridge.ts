// Authored by Karter Whitman using Claude Opus 4.8
// The bridge surface (PRODUCT-SPEC §2.2) as a type, shared by the preload
// that implements it and the renderer that consumes it. This is the whole
// of what the renderer can see: records and changes in, records out.
import type {
  Change,
  Item,
  ItemDetail,
  Label,
  Members,
  MembersOptions,
  Resource,
  StoredRecord,
} from "@index/database/types";

/** Every handler answers with data or a message, never a thrown error. */
export type Result<T> = { ok: T } | { err: string };

export interface Sweep {
  items: number;
  connections: number;
  derivations: number;
}

/** The channels the main process pushes on. */
export interface BridgeEvents {
  "intake:dropped": [paths: string[]];
  "gc:swept": [sweep: Sweep];
}

export interface IndexBridge {
  sets: {
    /** Every item that plays the set role — the home screen's listing. */
    list(): Promise<Result<{ sets: Item[] }>>;
    members(setId: string, options?: MembersOptions): Promise<Result<Members>>;
    /** The dates a set has members on — the calendar popover's marks. */
    dates(setId: string): Promise<Result<string[]>>;
  };
  items: {
    get(id: string): Promise<Result<ItemDetail>>;
    search(prefix: string, limit?: number): Promise<Result<{ items: Item[] }>>;
  };
  labels: {
    list(): Promise<Result<{ labels: Label[] }>>;
    /** Mint-on-first-use; labels sit outside the change model. */
    ensure(name: string): Promise<Result<Label>>;
  };
  changes: {
    apply(change: Change): Promise<Result<{ records: StoredRecord[] }>>;
  };
  intake: {
    pathsToResources(paths: string[]): Promise<Result<{ resources: Resource[] }>>;
    /** The file dialog; returns the chosen paths already as resources. */
    pick(): Promise<Result<{ resources: Resource[] }>>;
    /** The absolute path behind a dropped File. Only the preload can ask
     * this — the renderer has no filesystem of its own. */
    pathForFile(file: File): string;
  };
  shell: {
    /** Finder reveal; local uris only. */
    reveal(uri: string): Promise<Result<null>>;
    openExternal(uri: string): Promise<Result<null>>;
  };
  /** How the renderer addresses resource bytes and thumbnails. */
  url: {
    res(uri: string): string;
    thumb(uri: string): string;
  };
  on<C extends keyof BridgeEvents>(
    channel: C,
    listener: (...args: BridgeEvents[C]) => void,
  ): () => void;
}
