// Authored by Karter Whitman using Claude Sonnet 5
// The predicate evaluator (PRODUCT-SPEC §1.5, extended for Space): a
// SetQuery is a recursive boolean tree, walked entirely in JS/TS rather
// than compiled to SurrealQL. Two reasons, both from a real design
// conversation with Karter: only two of five predicate kinds were ever
// indexed to begin with, so most of this was already an unindexed scan
// happening inside SurrealDB's own engine; and arbitrary OR/NOT breaks
// the old "SQL narrows, then AND a JS format-filter on top" split (OR
// doesn't decompose that way — `format` has always lived in derive.ts
// only, to avoid a second implementation drifting from it).
//
// No database access anywhere in this file — every predicate kind is
// answered from the item and the MatchContext alone (built ahead of time
// by context.ts). That's what lets sets/ and search/ share this one
// evaluator instead of each growing their own matching logic.
import { devicePrefix, formatOf } from "../derive.js";
import type { AttributeKind, DataEntry, DataPredicate, Item, Predicate, SetQuery } from "../types.js";

export interface MatchContext {
  /** targetId -> ids with a live `member of` arrow into it. Built once
   * per evaluation pass (context.ts's `buildContext`), not once per
   * item — the one predicate kind that needs data beyond the item being
   * tested. */
  arrowSources: Map<string, Set<string>>;
}

export function matches(query: SetQuery, item: Item, ctx: MatchContext): boolean {
  if ("all" in query) return true;
  if ("and" in query) return query.and.every((sub) => matches(sub, item, ctx));
  if ("or" in query) return query.or.some((sub) => matches(sub, item, ctx));
  if ("not" in query) return !matches(query.not, item, ctx);
  return matchesPredicate(query, item, ctx);
}

function matchesPredicate(predicate: Predicate, item: Item, ctx: MatchContext): boolean {
  if ("date" in predicate) {
    // Targets date_added, same as the old SQL compiler — filtering by
    // the intrinsic date_created is a `data` predicate instead (below).
    const day = item.date_added.slice(0, 10);
    const { gte, lte } = predicate.date;
    return (gte === undefined || day >= gte) && (lte === undefined || day <= lte);
  }

  if ("device" in predicate) {
    const prefix = devicePrefix(predicate.device);
    return item.resources.some((resource) => resource.uri.startsWith(prefix));
  }

  if ("format" in predicate) return formatOf(item) === predicate.format;

  if ("arrowTo" in predicate) return ctx.arrowSources.get(predicate.arrowTo)?.has(item.id) ?? false;

  return matchesData(predicate.data, item);
}

function matchesData(predicate: DataPredicate, item: Item): boolean {
  const attribute = predicate.attribute;
  let entries: DataEntry[];
  if (attribute === undefined) {
    // Absent attribute: a freeform-tag search, scanning every entry —
    // the JS equivalent of the old `object::values(data)[WHERE ...]`.
    entries = Object.values(item.data);
  } else {
    // Attribute names are matched case-insensitively everywhere else in
    // this codebase; `data`'s keys are already lowercased, so this is a
    // direct O(1) lookup rather than the old array scan.
    const entry = item.data[attribute.toLowerCase()];
    entries = entry ? [entry] : [];
  }
  return entries.some((entry) => matchesEntry(predicate, entry));
}

/** "Any element" semantics for a list-kind entry (confirmed with
 * Karter): `genre: ["rock", "alternative"]` satisfies `genre eq "rock"`.
 * A scalar entry is just a one-element array of itself, so no special
 * casing is needed between scalar and list kinds. */
function matchesEntry(predicate: DataPredicate, entry: DataEntry): boolean {
  const values = Array.isArray(entry.value) ? entry.value : [entry.value];
  return values.some((value) => valueSatisfies(predicate, entry.kind, value));
}

/** Every operator actually present on the predicate has to hold — `eq`,
 * `contains`, `gte`, `lte` AND together when more than one is given. */
function valueSatisfies(predicate: DataPredicate, kind: AttributeKind, value: string): boolean {
  if (predicate.eq !== undefined && !compareBy(kind, value, predicate.eq, (a, b) => a === b)) return false;
  if (predicate.contains !== undefined && !value.toLowerCase().includes(predicate.contains.toLowerCase())) {
    return false;
  }
  if (predicate.gte !== undefined && !compareBy(kind, value, predicate.gte, (a, b) => a >= b)) return false;
  if (predicate.lte !== undefined && !compareBy(kind, value, predicate.lte, (a, b) => a <= b)) return false;
  return true;
}

/** `number`/`duration` compare numerically; `string`/`date`/`list`
 * compare lexically — ISO dates sort lexically by construction, and a
 * `duration`'s value is a plain unpadded integer-seconds string, so it
 * needs the numeric cast the way a zero-padded date doesn't. Mirrors the
 * old SQL compiler's `compareTerm`, ported to JS. */
function compareBy(
  kind: AttributeKind,
  value: string,
  bound: string,
  test: (a: number | string, b: number | string) => boolean,
): boolean {
  if (kind === "number" || kind === "duration") return test(Number(value), Number(bound));
  return test(value, bound);
}
