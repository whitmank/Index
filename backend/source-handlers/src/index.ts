/**
 * Source Handler Architecture
 *
 * Extensible system for handling different source types (file://, https://, etc.)
 */

// Base classes and interfaces
export { SourceHandler, type SourceCapabilities, type ExtractedMetadata, type HandlerConfig } from './handler-base';

// Registry
export { HandlerRegistry, registry } from './handler-registry';

// File handler
export { FileHandler, fileHandler } from './handlers/file-handler';

// Utilities
export { calculateFileHash } from './utils/hash-service';
export { extractFileMetadata, type FileMetadata } from './utils/metadata-extractor';
