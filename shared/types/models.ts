/**
 * Shared type definitions for Index v0.3
 * Used across backend, frontend, and Electron layers
 */

/**
 * Core object representing any indexed item (file, URL, etc.)
 */
export interface IndexObject {
  id: string;
  source: string; // URI format: file:///path, https://example.com, etc.
  type: 'file' | 'url'; // scheme type
  name: string;
  content_hash?: string; // SHA-256 hash of content
  created_at: string; // ISO timestamp
  modified_at: string; // ISO timestamp
  source_modified_at?: string; // When source file was last modified
  source_meta?: Record<string, unknown>; // Extracted metadata (size, mime_type, etc.)
  user_meta?: Record<string, unknown>; // User annotations and custom fields
}

/**
 * Tag definition (metadata about a tag)
 */
export interface TagDefinition {
  id: string;
  name: string; // unique
  color?: string; // hex color or CSS color name
  description?: string;
  created_at: string;
}

/**
 * Assignment of a tag to an object
 */
export interface TagAssignment {
  id: string;
  tag_id: string;
  object_id: string;
  created_at: string;
}

/**
 * Collection query structure
 * Implements AND/OR/NOT logic:
 * - all: must have ALL these tags (AND)
 * - any: must have ANY of these tags (OR)
 * - none: must NOT have ANY of these tags (NOT)
 */
export interface CollectionQuery {
  all?: string[]; // tag names that must all be present
  any?: string[]; // at least one tag must be present
  none?: string[]; // none of these tags should be present
}

/**
 * Collection of objects (saved searches/filters)
 */
export interface Collection {
  id: string;
  name: string;
  description?: string;
  query: CollectionQuery;
  color?: string;
  pinned?: boolean;
  created_at: string;
  modified_at: string;
}

/**
 * Link between two objects
 */
export interface Link {
  id: string;
  source_object: string; // object_id
  target_object: string; // object_id
  type: 'related' | 'derivative' | 'reference';
  label?: string;
  bidirectional: boolean;
  created_at: string;
  modified_at: string;
  metadata?: Record<string, unknown>;
}

/**
 * API request/response types
 */

export interface ImportSourceRequest {
  source: string; // URI
  tags?: string[]; // tag names to assign
  notes?: string;
}

export interface ImportSourceResponse {
  object: IndexObject;
  tags_assigned?: string[];
}

export interface CreateCollectionRequest {
  name: string;
  description?: string;
  query: CollectionQuery;
  color?: string;
  pinned?: boolean;
}

export interface UpdateCollectionRequest {
  name?: string;
  description?: string;
  query?: CollectionQuery;
  color?: string;
  pinned?: boolean;
}
