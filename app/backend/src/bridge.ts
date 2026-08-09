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
  Schema,
  StoredRecord,
} from "@index/database/types";
import type { SchemaInput } from "@index/database";
import type { IntakeResult } from "./services/intake.js";
import type { SpotifyAlbum } from "./services/spotify.js";

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
  /** A change landed in the database — possibly from another window. The
   * pairs move the pool, the records are what the database actually
   * wrote. */
  "records:changed": [change: Change, records: StoredRecord[]];
  /** Some resource's on-disk availability changed shape — one went
   * missing, or one stopped being. No payload: it's a cue to re-check,
   * not an account of what changed. */
  "resources:availabilityChanged": [];
}

export interface IndexBridge {
  device: {
    /** This machine's device id (config.ts's `DeviceConfig.self`) — the
     * authority a resource's own uri scheme is checked against to tell
     * "on this device" from "on some other, mounted one". */
    self(): Promise<Result<{ id: string }>>;
  };
  sets: {
    /** Every item that plays the set role — the home screen's listing. */
    list(): Promise<Result<{ sets: Item[] }>>;
    members(setId: string, options?: MembersOptions): Promise<Result<Members>>;
    /** The dates a set has members on — the calendar popover's marks. */
    dates(setId: string): Promise<Result<string[]>>;
  };
  items: {
    get(id: string): Promise<Result<ItemDetail>>;
    /** Substring search over names, best match first, with the hits that
     * play the set role named — a hit is somewhere to go or something to
     * open, and only the backend can say which. */
    search(term: string, limit?: number): Promise<Result<{ items: Item[]; places: string[] }>>;
  };
  labels: {
    list(): Promise<Result<{ labels: Label[] }>>;
    /** Mint-on-first-use; labels sit outside the change model. */
    ensure(name: string): Promise<Result<Label>>;
  };
  schemas: {
    list(): Promise<Result<{ schemas: Schema[] }>>;
    /** Create or edit a type; sits outside the change model like a
     * label does. `name` is immutable — editing always targets the
     * schema that name already minted. */
    upsert(schema: SchemaInput): Promise<Result<Schema>>;
  };
  changes: {
    apply(change: Change): Promise<Result<{ records: StoredRecord[] }>>;
  };
  intake: {
    pathsToResources(paths: string[]): Promise<Result<{ results: IntakeResult[] }>>;
    /** The file dialog; returns the chosen paths already as resources. */
    pick(): Promise<Result<{ results: IntakeResult[] }>>;
    /** The absolute path behind a dropped File. Only the preload can ask
     * this — the renderer has no filesystem of its own. */
    pathForFile(file: File): string;
  };
  resources: {
    /** Which of these uris currently 404 locally — drives the missing
     * badge in ResourcesEditor. */
    checkMissing(uris: string[]): Promise<Result<{ missing: Record<string, boolean> }>>;
    /** Manual fallback: pick a folder, search it for this resource's
     * content by hash, relink+broadcast server-side if found. */
    locate(itemId: string, uri: string): Promise<Result<{ found: boolean }>>;
    /** Force a fresh search by content hash against the whole watch
     * list (respecting the exclude list) — for a resource that still
     * resolves but points somewhere wrong, not just a missing one. */
    reseek(itemId: string, uri: string): Promise<Result<{ found: boolean }>>;
    /** The folders relink.ts watches live and searches, in the order
     * given — search tries each in turn and stops at the first match, so
     * this order is search priority. Settings' Files tab. */
    watchlist: {
      list(): Promise<Result<{ folders: string[] }>>;
      /** Opens a folder picker; adding restarts live watching and
       * searches the new folder immediately. */
      add(): Promise<Result<{ folders: string[] }>>;
      /** Persists exactly this list/order and restarts live watching —
       * covers both reordering and removal, computed client-side. */
      update(folders: string[]): Promise<Result<{ folders: string[] }>>;
    };
    /** Folders a search must never treat as a match — a place known to
     * hold stale duplicate content. Order doesn't matter here, so unlike
     * `watchlist` there's no `update`, just add/remove. */
    excludelist: {
      list(): Promise<Result<{ folders: string[] }>>;
      add(): Promise<Result<{ folders: string[] }>>;
      remove(folder: string): Promise<Result<{ folders: string[] }>>;
    };
  };
  shell: {
    /** Finder reveal; local uris only. */
    reveal(uri: string): Promise<Result<null>>;
    openExternal(uri: string): Promise<Result<null>>;
  };
  spotify: {
    credentials: {
      /** Empty strings, not an error, when nothing has been saved yet —
       * Settings shows blank fields either way. */
      get(): Promise<Result<{ clientId: string; clientSecret: string }>>;
      save(clientId: string, clientSecret: string): Promise<Result<{ clientId: string; clientSecret: string }>>;
    };
    /** The real tracklist behind an `open.spotify.com/album/...` url, via
     * the official Web API — errs with no credentials configured, a bad
     * url, or an API/network failure; never partial. */
    album(url: string): Promise<Result<SpotifyAlbum>>;
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
