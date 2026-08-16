// Authored by Karter Whitman using Claude Opus 5
// The module's public surface.
//
// One verb — `modelItem` — plus the vocabulary needed to read what it
// returns, the gateways that say how a source is reached, and the model
// store, since installing the weights is the caller's decision and not
// something a modeling run should start on anyone's behalf.
export { modelItem, resolveOptions } from "./item-modeler.js";
export * from "./contracts/index.js";
export { nodeGateway, offlineGateway, type SourceGateway } from "./evidence/source-resolution.js";
export type { SourceEvidence } from "./evidence/source-evidence.js";
export type { BasketEntry, EvidenceBasket } from "./evidence/basket.js";
export {
  downloadModel,
  modelAvailable,
  modelPath,
  MODEL_FILE,
} from "./extraction/language-model/model-store.js";
export { closeModel } from "./extraction/language-model/local-model-client.js";
export {
  countActions,
  countWarnings,
  summarize,
  type ModelingCounts,
} from "./observability/modeling-events.js";
export {
  classifyItemType,
  type ClassifyItemTypeRequest,
  type ClassifyItemTypeResult,
  type ItemType,
} from "./item-classifier/classify.js";
export { closeItemClassifierModel } from "./item-classifier/model-client.js";
