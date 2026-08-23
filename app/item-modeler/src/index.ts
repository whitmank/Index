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
} from "./extractor/index.js";
export {
  composeSchema,
  type ComposeRequest,
  type ComposeResult,
} from "./composer/index.js";
export { nodeGateway, offlineGateway, type SourceGateway } from "./extractor/evidence/source-resolution.js";
export type { SourceEvidence } from "./extractor/evidence/source-evidence.js";
export type { BasketEntry, EvidenceBasket } from "./extractor/evidence/basket.js";
export {
  downloadModel,
  modelAvailable,
  modelPath,
  MODEL_FILE,
} from "./extractor/language-model/model-store.js";
export { closeModel } from "./extractor/language-model/local-model-client.js";
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
} from "./classification/ai/classify.js";
export { closeItemClassifierModel } from "./classification/ai/model-client.js";
export {
  classifyResource,
  type ClassificationStages,
  type ClassifyResourceRequest,
  type ClassifyResourceResult,
} from "./classification/classify-resource.js";
export { classifyTrad, type ClassificationSource } from "./classification/trad/trad-classifier.js";
export {
  PDF_MIME,
  readPdf,
  typeOfPdf,
  type BinarySource,
  type PdfMetadata,
} from "./classification/trad/pdf-reader.js";
export { declaresArticle, declaredTypes } from "./classification/trad/schema-org.js";
