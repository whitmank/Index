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
import { devicePrefix, formatOf, sameTypeName } from "../derive.js";
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
    // An empty bound is a bound the rule builder hasn't been given a
    // value for yet (RuleBuilder.tsx starts a fresh date row this way),
    // not a real "on or after the beginning of time" — so it's read the
    // same as the bound being absent, rather than compared literally
    // (which would happen to work for `gte` and always fail for `lte`,
    // by the accident of where "" sorts lexically).
    return (isUnset(gte) || day >= gte) && (isUnset(lte) || day <= lte);
  }

  if ("device" in predicate) {
    if (isUnset(predicate.device)) return true;
    const prefix = devicePrefix(predicate.device);
    return item.resources.some((resource) => resource.uri.startsWith(prefix));
  }

  if ("format" in predicate) return formatOf(item) === predicate.format;

  if ("arrowTo" in predicate) {
    if (isUnset(predicate.arrowTo)) return true;
    return ctx.arrowSources.get(predicate.arrowTo)?.has(item.id) ?? false;
  }

  return matchesData(predicate.data, item);
}

/** Whether a predicate's value is one the rule builder hasn't actually
 * been given yet — a row added but not finished, still showing its
 * placeholder (RuleBuilder.tsx's own doc comment: stored as a real
 * predicate rather than shadow draft state, so it survives a reload).
 * Treating it as unset rather than as the literal value "" is what keeps
 * a still-blank row from silently deciding an `and`/`or` it sits in —
 * without this, one unfinished condition could zero out every other
 * condition it's ANDed with, or something the searcher never asked for
 * (an id, a device) could accidentally happen to compare true. No stored
 * value is ever legitimately the empty string — clearing a field removes
 * its entry (`withoutEntry`) rather than blanking it. */
function isUnset(value: string | undefined): value is undefined | "" {
  return value === undefined || value === "";
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
  // `type` is an ordinary `data` predicate (no dedicated Predicate shape
  // — see RuleBuilder.tsx), but its value names a schema, whose identity
  // is case-insensitive (derive.ts's `sameTypeName`): a schema created as
  // `Song` and a classifier-written `song` are the same type, so `eq`
  // has to compare them the same way every other type lookup does.
  const isTypeAttribute = predicate.attribute?.toLowerCase() === "type";
  // Each operator is skipped, not evaluated, once its own bound is
  // unset (see `isUnset`) — a condition still being written (no value
  // typed into it yet) has to hold no one's else back rather than
  // silently comparing against a literal "", which for `eq`/`lte` is
  // near-impossible to satisfy and for `contains`/a numeric `gte` is
  // trivially satisfied by almost everything — neither is "not filled
  // in yet," both are surprises.
  if (!isUnset(predicate.eq)) {
    const matchesEq = isTypeAttribute
      ? sameTypeName(value, predicate.eq)
      : compareBy(kind, value, predicate.eq, (a, b) => a === b);
    if (!matchesEq) return false;
  }
  if (!isUnset(predicate.contains) && !value.toLowerCase().includes(predicate.contains.toLowerCase())) {
    return false;
  }
  if (!isUnset(predicate.gte) && !compareBy(kind, value, predicate.gte, (a, b) => a >= b)) return false;
  if (!isUnset(predicate.lte) && !compareBy(kind, value, predicate.lte, (a, b) => a <= b)) return false;
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
