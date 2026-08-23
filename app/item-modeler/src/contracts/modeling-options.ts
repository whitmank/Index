// Authored by Karter Whitman using Claude Opus 5
// What the caller asks for, stated rather than assumed.
//
// The spec is explicit that major behaviour should not hide behind
// defaults (§Modeling options). So every switch that changes what gets
// written is here, named, with a documented default — and `resolveOptions`
// is the one place those defaults live, so no call site invents its own.
import type { SourceGateway } from "../extractor/evidence/source-resolution.js";
import type { ModelClient } from "../extractor/language-model/local-model-client.js";

/**
 * When the language model may speak.
 *
 * `fallback-only` is the default and what the corpus argues for: a field
 * a file states outright is transcribed and never sent, so a well-formed
 * epub loads no model at all. `never` makes a run deterministic-only,
 * which is the right setting for a caller that cannot tolerate the
 * latency; `always` and `when-needed` differ from `fallback-only` only
 * once there is something between "stated" and "missing" to distinguish,
 * so today they behave the same.
 */
export type LanguageModelMode = "never" | "when-needed" | "always" | "fallback-only";

/** What to do when evidence disagrees with a value already on the Item. */
export type ConflictPolicy =
  /** Keep the incumbent, record the disagreement. The spec's default and
   * the only safe one while nothing can yet ask the user to choose. */
  | "record"
  /** Keep the incumbent, say nothing. For a caller that wants a quiet
   * best-effort fill and will not surface conflicts anyway. */
  | "ignore";

export interface ModelingOptions {
  /** Infer the item's type when it has none. Not implemented — the
   * classifier is a later component — so `true` is refused rather than
   * silently ignored. An item reaching `modelItem` has a type its user
   * chose. */
  inferType?: boolean;
  languageModelMode?: LanguageModelMode;
  /** Whether a source may be fetched over the network. `false` limits
   * the run to what is already on this machine. Default true. */
  allowNetworkAccess?: boolean;
  /** How many of the item's resources to read, in order. Default 8 —
   * `resources[0]` is primary and the tail of a long list is rarely
   * about the work. */
  maxSources?: number;
  /** Characters of readable text kept per source. Default 200_000. */
  maxSourceTextLength?: number;
  /** Include provenance in the result. Default true; `false` returns the
   * change set without citations, for a caller that only wants values. */
  includeProvenance?: boolean;
  /** Allow a *modeled* value to be replaced by stronger evidence.
   * Default true. Never applies to a user value, which no option can
   * overwrite. */
  overwriteModeledValues?: boolean;
  conflictPolicy?: ConflictPolicy;
  /** Whole-run budget in ms. Default 30_000. */
  timeout?: number;
  /** Keep per-claim diagnostics in the result. Off by default: it is
   * verbose and can carry source excerpts. */
  debugDiagnostics?: boolean;

  /**
   * Fields the caller knows the user entered by hand.
   *
   * The Item cannot say. `@index/database/types` records `type_source`
   * for the type and nothing equivalent for a field, so ownership has no
   * stored answer yet. When this is absent the policy falls back to
   * treating *any* non-blank field as the user's — conservative in the
   * direction that matters, and identical to what the shipped `parse`
   * verb already does.
   */
  userFields?: string[];

  /**
   * The name the item was minted with — its primary resource's own.
   *
   * The name may be replaced only while the item still carries this,
   * because at that point nothing of the user's is at stake. Once
   * somebody has renamed the item, the name is theirs.
   *
   * Null is meaningful and is the safe default: a caller that does not
   * know what the item was minted with has not established that the name
   * is anyone's but the user's.
   */
  derivedName?: string | null;

  /** How sources are read. Defaults to `nodeGateway`; the Electron main
   * process passes one backed by its own resolver so device-aware uris
   * resolve the way they do everywhere else in the app. */
  gateway?: SourceGateway;

  /**
   * How the extraction model is reached. Defaults to the local
   * `node-llama-cpp` client over the weights in `~/.index/models`.
   *
   * A port for the same reason `gateway` is one: the module should not
   * be welded to a particular runtime, and a pipeline whose only model is
   * a 730 MB download is a pipeline nobody can test. Passing a stub makes
   * the whole path — including grounding, which only applies to model
   * values — exercisable with no weights on disk.
   */
  model?: ModelClient;

  /** Injectable for tests and for reproducible fingerprints. */
  now?: () => Date;
}

export interface ResolvedOptions
  extends Required<Omit<ModelingOptions, "userFields" | "derivedName" | "gateway" | "model">> {
  userFields: string[];
  derivedName: string | null;
  gateway: SourceGateway;
  model: ModelClient | null;
}

export const DEFAULT_MAX_SOURCES = 8;
export const DEFAULT_MAX_SOURCE_TEXT = 200_000;
export const DEFAULT_TIMEOUT_MS = 30_000;
