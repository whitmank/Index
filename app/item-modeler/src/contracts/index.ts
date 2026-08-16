// Authored by Karter Whitman using Claude Opus 5
// The vocabulary, in one import. Everything a caller needs to read a
// result is here; nothing here knows how any of it is produced.
export type { Origin, ExtractionMethod, FieldProvenance, ModelIdentity } from "./provenance.js";
export type { ResolvedValue } from "./resolved-value.js";
export { isNamingField } from "./resolved-value.js";
export type { ChangeAction, FieldChange } from "./changes.js";
export { isMaterial } from "./changes.js";
export type { WarningCode, ModelingWarning } from "./warnings.js";
export { dedupeWarnings, warningKey } from "./warnings.js";
export type { ConflictSide, ModelingConflict } from "./conflicts.js";
export type {
  ConflictPolicy,
  LanguageModelMode,
  ModelingOptions,
  ResolvedOptions,
} from "./modeling-options.js";
export {
  DEFAULT_MAX_SOURCES,
  DEFAULT_MAX_SOURCE_TEXT,
  DEFAULT_TIMEOUT_MS,
} from "./modeling-options.js";
export type {
  FailureReason,
  ItemModelingOutcome,
  ModelingFailure,
  ModelingMeta,
  ModelingSuccess,
} from "./item-modeling-result.js";
export { isModeled, MODELER_VERSION } from "./item-modeling-result.js";
