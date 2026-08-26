// Authored by Karter Whitman using Claude Opus 5
// The module's public surface.
//
// `modelItem` — plus the vocabulary needed to read what it returns — is
// the Item-in/Item-out convenience wrapper. It is `extractClaims` then
// `composeSchema` (item-modeler.ts), and both of those are exported here
// too: a caller with a resource but no Item yet (intake, before anything
// is saved) has no use for the wrapper's Item-shaped contract.
export { modelItem, resolveOptions } from "./item-modeler.js";
export * from "./contracts/index.js";
export {
  extractClaims,
  type ExtractRequest,
  type ExtractResult,
} from "./collector/index.js";
export {
  composeSchema,
  type ComposeRequest,
  type ComposeResult,
} from "./composer/index.js";
export { nodeGateway, offlineGateway, type SourceGateway } from "./collector/evidence/source-resolution.js";
export type { SourceEvidence } from "./collector/evidence/source-evidence.js";
export type { BasketEntry, EvidenceBasket } from "./collector/evidence/basket.js";
export {
  downloadModel,
  modelAvailable,
  modelPath,
  MODEL_FILE,
} from "./collector/language-model/model-store.js";
export { closeModel } from "./collector/language-model/local-model-client.js";
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
} from "./classifier/ai/classify.js";
export { closeItemClassifierModel } from "./classifier/ai/model-client.js";
export {
  classifyResource,
  type ClassificationStages,
  type ClassifyResourceRequest,
  type ClassifyResourceResult,
} from "./classifier/classify-resource.js";
export { classifyTrad, type ClassificationSource } from "./classifier/trad/trad-classifier.js";
export {
  PDF_MIME,
  readPdf,
  typeOfPdf,
  type BinarySource,
  type PdfMetadata,
} from "./classifier/trad/pdf-reader.js";
export { declaresArticle, declaredTypes } from "./classifier/trad/schema-org.js";
