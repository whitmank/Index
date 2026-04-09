// Author: Claude Code
// System tag type registry — single source of truth for system tag rules and behavior flags.
// Seeded via UPSERT into tag_types on every startup.

/**
 * Registry of system tag types.
 * Each entry describes display, editability, and ordering behavior.
 *
 * Types:
 *   medium — signal/format (audio, video, image, text). Derived, closed set.
 *   type   — object type (book, song, movie, essay). Asserted by user; open set.
 *            Governs which metadata fields the UI surfaces for an object.
 *   file   — file extension per source. Derived, hidden.
 *   origin — device identifier per source. Derived, hidden.
 */
export const SYSTEM_TAG_TYPES = {
  medium: {
    label: 'Medium',
    description: 'The signal format of the content — audio, video, image, text. Derived from the source URI at capture time.',
    scope: 'object',
    display: true,
    editable: true,
    deletable: true,
    order: 0,
  },
  type: {
    label: 'Type',
    description: 'The type of the object — book, song, movie, essay. Asserted by the user; open set. Determines which metadata fields the UI suggests.',
    scope: 'object',
    display: true,
    editable: true,
    deletable: true,
    order: 1,
  },
  file: {
    label: 'File',
    description: 'The file extension of the source. Derived from the source URI at capture time.',
    scope: 'source',
    display: false,
    editable: false,
    deletable: false,
    order: 2,
  },
  origin: {
    label: 'Origin',
    description: 'The device or host that provided the source. Derived from the source URI or device identity at capture time.',
    scope: 'source',
    display: false,
    editable: false,
    deletable: false,
    order: 3,
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

/**
 * Upsert all SYSTEM_TAG_TYPES into the tag_types table.
 * Idempotent — safe to call on every startup.
 * @param {Surreal} db
 */
export async function seedTagTypes(db) {
  for (const [name, attrs] of Object.entries(SYSTEM_TAG_TYPES)) {
    const record = {
      name,
      label: attrs.label,
      description: attrs.description ?? null,
      system: true,
      display: attrs.display,
      editable: attrs.editable,
      deletable: attrs.deletable,
      order: attrs.order,
    };
    await db.query(`UPSERT tag_types:${name} CONTENT ${JSON.stringify(record)}`);
  }
}
