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
