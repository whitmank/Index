// Authored by Karter Whitman using Claude Sonnet 5
// A field's value is a string for every kind but one — `list`, where it
// is several. The three functions below are the only places that
// distinction has to be spelled out; everywhere else reads a field's
// value through them rather than assuming which shape it got.
import type { Field, FieldKind } from "@index/database/types";

/** What a freshly-chosen kind's value starts as. */
export function blankFieldValue(kind: FieldKind): Field["value"] {
  return kind === "list" ? [] : "";
}

/** Whether a value carries nothing — the empty string, or no entries. */
export function isBlankFieldValue(value: Field["value"]): boolean {
  return Array.isArray(value) ? value.length === 0 : value.trim() === "";
}

/** Reshape a value for a newly-chosen kind, keeping what it said rather
 * than discarding it — switching away from `list` joins the entries
 * back into one line; switching to it wraps the one line into one entry. */
export function coerceFieldValue(value: Field["value"], kind: FieldKind): Field["value"] {
  if (kind === "list") return Array.isArray(value) ? value : value.trim() === "" ? [] : [value];
  return Array.isArray(value) ? value.join(", ") : value;
}
