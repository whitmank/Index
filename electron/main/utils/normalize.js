// Author: Claude Code
// ID normalization utility — centralizes SurrealDB RecordId handling at the IPC boundary.
// Prevents id?.id || id pattern from spreading throughout stores and components.

/**
 * Normalize a single record: flatten RecordId objects to plain string IDs.
 * @param {object|null} record
 * @returns {object|null}
 */
export function normalizeRecord(record) {
  if (!record) return record;
  return {
    ...record,
    id: record.id?.toString?.() ?? record.id,
  };
}

/**
 * Normalize an array of records.
 * @param {Array} records
 * @returns {Array}
 */
export function normalizeRecords(records) {
  if (!Array.isArray(records)) return records;
  return records.map(normalizeRecord);
}
