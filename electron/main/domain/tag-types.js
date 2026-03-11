// Author: Claude Code
// System tag type registry — single source of truth for all system tag rules.
// v0.4: domain logic lives here, not in UI components.

/**
 * Registry of system tag types.
 * Each entry describes display, editability, and ordering behavior.
 *
 * @type {Object.<string, {label: string, scope: string, display: boolean, editable: boolean, deletable: boolean, order: number}>}
 */
export const SYSTEM_TAG_TYPES = {
  media_type: {
    label: 'Media Type',
    scope: 'object',    // Assigned once per object (from first source)
    display: true,      // Shown in tag UI
    editable: true,     // Value can be changed by user
    deletable: false,
    order: 0,
  },
  file_type: {
    label: 'File Type',
    scope: 'source',    // One per unique file extension across sources
    display: false,     // Hidden in tag UI (queryable, not shown)
    editable: false,
    deletable: false,
    order: 1,
  },
  origin: {
    label: 'Origin',
    scope: 'source',    // One per unique device origin across sources
    display: false,
    editable: false,
    deletable: false,
    order: 2,
  },
};

/**
 * Check if a system tag of this type can be deleted.
 * User-defined tags (type not in registry) are always deletable.
 * @param {string} type
 * @returns {boolean}
 */
export function isSystemTagDeletable(type) {
  return SYSTEM_TAG_TYPES[type]?.deletable ?? true;
}
