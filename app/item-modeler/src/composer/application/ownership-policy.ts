// Authored by Karter Whitman using Claude Opus 5
// Who owns a field, and therefore what may be written to it.
//
// The spec's precedence:
//
//   user-entered > explicitly approved > high-confidence modeled
//                > lower-confidence modeled > missing
//
// `@index/database/types` now records `prov` on every data entry, so
// ownership has a stored answer: `options.userFields`/`modeledFields`
// remain valid overrides — a caller may know something the item's own
// `prov` does not capture, like a field the current run just modeled but
// has not written yet — but the fallback below no longer has to guess
// conservatively. It reads `prov` directly.
import type { Item } from "@index/database/types";
import { isBlank } from "../normalization/normalize-value.js";

export type Ownership =
  /** Nothing is there. Anything supported may be written. */
  | "empty"
  /** The user put it there, or we cannot rule that out. Never overwritten;
   * only confirmed or conflicted. */
  | "user"
  /** A previous modeling run put it there. May be replaced by stronger
   * evidence when the caller allows it. */
  | "modeled";

export interface OwnershipContext {
  item: Item;
  userFields: string[];
  /** Fields a previous run is known to have modeled, beyond what the
   * item's own `prov` already says — an override for the current run,
   * not the general case. */
  modeledFields?: string[];
}

/** A freeform tag is keyed by a generated id, never a lowercased
 * attribute name, so a named lookup can never land on one. */
function entryFor(item: Item, field: string) {
  return item.data[field.toLowerCase()];
}

function valueOf(item: Item, field: string): string | string[] | undefined {
  return entryFor(item, field)?.value;
}

export function ownershipOf(field: string, context: OwnershipContext): Ownership {
  const entry = entryFor(context.item, field);
  if (isBlank(entry?.value)) return "empty";

  const named = context.userFields.some((name) => name.toLowerCase() === field.toLowerCase());
  if (named) return "user";

  const modeled = (context.modeledFields ?? []).some(
    (name) => name.toLowerCase() === field.toLowerCase(),
  );
  if (modeled) return "modeled";

  return entry?.prov === "auto" ? "modeled" : "user";
}

export function currentValue(item: Item, field: string): string | string[] | undefined {
  return valueOf(item, field);
}

/**
 * May the item's name be replaced?
 *
 * Only while it is still the one the item was minted with — its primary
 * resource's own filename. At that point nothing of the user's is at
 * stake, because nobody has chosen it. Once somebody has renamed the
 * item, the name is theirs and a book's internal title does not get to
 * argue with it.
 *
 * Without `derivedName` the caller has not said what the item was minted
 * with, and the safe reading of that is that the name is the user's.
 */
export function mayRename(item: Item, derivedName: string | null): boolean {
  if (derivedName === null) return false;
  return (item.data.name.value as string).trim() === derivedName.trim();
}
