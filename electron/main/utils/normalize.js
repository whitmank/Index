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
  const out = {
    ...record,
    id: record.id?.toString?.() ?? record.id,
  };
  // Flatten edge fields — present on RELATE/edge records (tagged, typed, contains, etc.)
  if (record.in  !== undefined) out.in  = record.in?.toString?.()  ?? record.in;
  if (record.out !== undefined) out.out = record.out?.toString?.() ?? record.out;
  return out;
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
