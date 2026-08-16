// Authored by Karter Whitman using Claude Opus 5
// Who owns a field, and therefore what may be written to it.
//
// The spec's precedence:
//
//   user-entered > explicitly approved > high-confidence modeled
//                > lower-confidence modeled > missing
//
// The complication is that **the Item cannot say who entered a field**.
// `@index/database/types` records `type_source` for the type and nothing
// equivalent for a field, so ownership has no stored answer yet — and
// this pass does not change the schema.
//
// So the policy is: believe the caller when it knows (`options.userFields`),
// and otherwise treat *any non-blank field as the user's*. That is
// conservative in the direction that matters — it can only cause a field
// to be left alone that might have been safely filled, never the reverse —
// and it is exactly what the shipped `parse` verb already does, so
// behaviour does not change under anyone as a side effect of this module
// arriving. When provenance is eventually persisted, this is the one
// function that has to learn about it.
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
  /** Fields a previous run is known to have modeled. Empty today —
   * nothing persists provenance yet — which is precisely why the
   * fallback below has to be the safe one. */
  modeledFields?: string[];
}

function valueOf(item: Item, field: string): string | string[] | undefined {
  const found = (item.fields ?? []).find(
    (entry) => entry.name.toLowerCase() === field.toLowerCase(),
  );
  return found?.value;
}

export function ownershipOf(field: string, context: OwnershipContext): Ownership {
  const value = valueOf(context.item, field);
  if (isBlank(value)) return "empty";

  const named = context.userFields.some((entry) => entry.toLowerCase() === field.toLowerCase());
  if (named) return "user";

  const modeled = (context.modeledFields ?? []).some(
    (entry) => entry.toLowerCase() === field.toLowerCase(),
  );
  if (modeled) return "modeled";

  // Carrying a value and nothing saying otherwise. Treated as the user's:
  // undo makes an overwrite recoverable rather than acceptable.
  return "user";
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
  return (item.name ?? "").trim() === derivedName.trim();
}
