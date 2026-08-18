// Authored by Karter Whitman using Claude Opus 4.8
// The query-predicate compiler (PRODUCT-SPEC §1.5): a structured
// predicate object becomes a SurrealQL boolean expression plus bindings.
//
// [pinned here] `format` does not compile to SurrealQL. It is a ladder of
// mime/extension/url-shape tests (§1.6) whose only authoritative
// implementation is `derive.ts`; expressing it a second time in SurrealQL
// would guarantee the two drift. Format predicates are therefore applied
// in JS after the read, over the rows the other predicates already
// narrowed. Personal scale makes this free (DESIGN-CONCEPT §8 blesses
// full scans over freeform fields); revisit if a format-only set over a
// large store ever feels slow.
import { devicePrefix } from "../derive.js";
import { MEMBER_OF_LABEL_ID, type Format, type Predicate, type SetQuery } from "../types.js";
import { recordId } from "./serialize.js";

export interface CompiledQuery {
  /** A boolean expression over an `items` row. Never empty. */
  where: string;
  bindings: Record<string, unknown>;
  /** Applied in JS after the read; empty when the query names no format. */
  formats: Format[];
}

class Bindings {
  private readonly values: Record<string, unknown> = {};
  private next = 0;

  add(value: unknown): string {
    const name = `q${this.next}`;
    this.next += 1;
    this.values[name] = value;
    return `$${name}`;
  }

  all(): Record<string, unknown> {
    return this.values;
  }
}

function compareTerm(kind: string, left: string, operator: string, bound: string): string {
  // `number` compares numerically, `string` and `date` lexically — and
  // ISO dates sort lexically by construction, which is why `date` needs
  // no cast.
  return kind === "number"
    ? `<float> ${left} ${operator} <float> ${bound}`
    : `${left} ${operator} ${bound}`;
}

function compilePredicate(predicate: Predicate, bindings: Bindings, formats: Format[]): string | null {
  if ("date" in predicate) {
    // The grammar's `date` key targets `date_added` — the day an item
    // was indexed, same as it always has. Filtering a set by the
    // intrinsic `date_created` is not part of the v1 grammar (PRODUCT-
    // SPEC §1.5); nothing needs it yet. `date_added` is a `datetime`
    // field; the grammar's bounds are day strings, so the field is
    // sliced down to a day before comparing.
    const day = "string::slice(<string> date_added, 0, 10)";
    const terms: string[] = [];
    if (predicate.date.gte !== undefined) terms.push(`${day} >= ${bindings.add(predicate.date.gte)}`);
    if (predicate.date.lte !== undefined) terms.push(`${day} <= ${bindings.add(predicate.date.lte)}`);
    return terms.length ? `(${terms.join(" AND ")})` : null;
  }

  if ("device" in predicate) {
    const prefix = bindings.add(devicePrefix(predicate.device));
    return `array::len(resources[WHERE string::starts_with(uri, ${prefix})]) > 0`;
  }

  if ("format" in predicate) {
    formats.push(predicate.format);
    return null;
  }

  if ("arrowTo" in predicate) {
    const target = bindings.add(recordId(predicate.arrowTo));
    return `id IN (SELECT VALUE in FROM connections WHERE out = ${target} AND label = ${MEMBER_OF_LABEL_ID} AND deleted_at IS NONE)`;
  }

  const { attribute, kind, gte, lte, eq } = predicate.metadata;
  // An attribute's *name* is a key and is matched case-insensitively, the
  // way every other name comparison in the app is: an item's metadata
  // arrives capitalised however their type declares it, however the
  // Spotify import writes it, and however the user typed it into a row.
  // The *value* is content and is compared as given. No index is lost —
  // `metadata` is an array scanned inside the row either way.
  const terms =
    attribute !== undefined
      ? [`string::lowercase(attribute) = ${bindings.add(attribute.toLowerCase())}`]
      : [];
  if (eq !== undefined) terms.push(compareTerm(kind, "value", "=", bindings.add(eq)));
  if (gte !== undefined) terms.push(compareTerm(kind, "value", ">=", bindings.add(gte)));
  if (lte !== undefined) terms.push(compareTerm(kind, "value", "<=", bindings.add(lte)));
  return terms.length ? `array::len(metadata[WHERE ${terms.join(" AND ")}]) > 0` : null;
}

export function compileQuery(query: SetQuery): CompiledQuery {
  const bindings = new Bindings();
  const formats: Format[] = [];

  if ("all" in query) {
    return { where: "true", bindings: bindings.all(), formats };
  }

  const clauses = query.and
    .map((predicate) => compilePredicate(predicate, bindings, formats))
    .filter((clause): clause is string => clause !== null);

  return {
    where: clauses.length ? clauses.join(" AND ") : "true",
    bindings: bindings.all(),
    formats,
  };
}
