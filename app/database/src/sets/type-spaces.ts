// Authored by Karter Whitman using Claude Sonnet 5
// One Space per type (PRODUCT-SPEC extension, per a live conversation
// with Karter): every registered schema gets a Space whose rule is
// exactly "type is <that schema>", so a type is always also a saved
// query without anyone having to build one by hand. Called from
// records/schemas.ts the moment a *new* schema is minted — editing an
// existing one's fields never touches this.
import { getDb } from "../db.js";
import { sameTypeName } from "../derive.js";
import { typeSpaceId } from "../ids.js";
import { listLiveItems } from "../records/items.js";
import { recordId } from "../records/serialize.js";
import type { Item, SetQuery } from "../types.js";

/** A crude, good-enough English pluralization for a freshly minted
 * type Space's display name ("book" -> "Books", matching how Karter
 * names his own hand-built ones) — not linguistically complete, an
 * irregular plural ("child" -> "children") isn't covered, but every
 * type this app deals with is an ordinary noun, and a wrong guess is
 * one rename away from being fixed by hand. */
function pluralize(name: string): string {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  if (/[sxz]$/i.test(capitalized) || /[cs]h$/i.test(capitalized)) return `${capitalized}es`;
  if (/[^aeiou]y$/i.test(capitalized)) return `${capitalized.slice(0, -1)}ies`;
  return `${capitalized}s`;
}

/** The rule a type's dedicated Space carries. Deliberately a bare
 * predicate, not wrapped in a redundant `and: [...]` — the rule builder
 * reads a bare condition just as well as a one-row group, and this is
 * the more legible thing to find on disk or hand-edit further. */
export function typeQuery(typeName: string): SetQuery {
  return { data: { attribute: "type", kind: "string", eq: typeName } };
}

/** A query reduced past whatever single-child `and`/`or` wrapping the
 * rule builder always adds around a lone condition (RuleBuilder.tsx's
 * `groupToQuery`), so a hand-built Space with exactly one condition
 * reads the same as a bare predicate would. Only ever unwraps a group
 * with exactly one child — a real multi-condition rule stops here,
 * which is the point: a Space that filters on *more* than type isn't
 * "the type's Space" even if type happens to be one of its conditions. */
function unwrapSingleton(query: SetQuery): SetQuery {
  if ("and" in query && query.and.length === 1) return unwrapSingleton(query.and[0] as SetQuery);
  if ("or" in query && query.or.length === 1) return unwrapSingleton(query.or[0] as SetQuery);
  return query;
}

/** Whether `query` already means exactly "type is `typeName`" — what
 * makes an existing Space (however it was built) the one a fresh
 * `ensureTypeSpace` call should leave alone rather than duplicate.
 * Deliberately narrow: a `not`, an extra condition, or a looser operator
 * than a plain `eq` all say no, because none of them promise "this and
 * only this type" the way the auto-built rule does. */
export function isDedicatedToType(query: SetQuery, typeName: string): boolean {
  const unwrapped = unwrapSingleton(query);
  if (!("data" in unwrapped)) return false;
  const { attribute, kind, eq, contains, gte, lte } = unwrapped.data;
  if (attribute?.toLowerCase() !== "type" || kind !== "string") return false;
  if (contains !== undefined || gte !== undefined || lte !== undefined) return false;
  return eq !== undefined && sameTypeName(eq, typeName);
}

/** The Space already dedicated to `typeName`, if one exists — a hand-
 * built one (Karter's "Books", "Movies") as readily as one this module
 * minted earlier. */
export async function findDedicatedSpace(typeName: string): Promise<Item | null> {
  const items = await listLiveItems();
  return (
    items.find((item) => typeof item.set === "object" && isDedicatedToType(item.set, typeName)) ?? null
  );
}

/**
 * Make sure `typeName` has a dedicated Space, minting one if it doesn't.
 * Idempotent by construction: the new Space's id is deterministic
 * (`typeSpaceId`), so calling this twice for the same type is a no-op
 * the second time whether or not anything else has changed in between.
 * Returns whether it actually created one — a caller reporting what
 * happened (the backfill script) has to be able to tell "already
 * covered" from "just minted" apart rather than assuming the latter.
 *
 * Not run through the Change model — like the schema this is called
 * for, there is nothing about a type's existence to undo, and the Space
 * this mints is no different: undoing the type was never going to
 * un-mint it, so undoing its Space isn't either. Once it exists it's a
 * plain item like any other — renaming, editing its rule, deleting it,
 * all go through the ordinary Change path from here on.
 */
export async function ensureTypeSpace(typeName: string): Promise<boolean> {
  if (await findDedicatedSpace(typeName)) return false;

  const db = getDb();
  const id = recordId(typeSpaceId(typeName));

  // Checked and created as two plain queries, the same shape
  // records/schemas.ts's own upsertSchema uses to tell a create from an
  // edit — deliberately not folded into one query's IF/THEN, which
  // (surprised us once already, on the id itself — see typeSpaceId)
  // is worth not leaning on for anything this call site needs to trust.
  const [existing] = await db.query<[{ id: unknown }[]]>("SELECT VALUE id FROM $id", { id }).collect();
  if (existing.length > 0) return false;

  await db
    .query("CREATE $id CONTENT { set: $set, data: $data, resources: [] }", {
      id,
      set: typeQuery(typeName),
      // The rule matches on `typeName` verbatim (case folded at read
      // time by `sameTypeName`); the display name is a cosmetic plural
      // of it, same convention Karter's own hand-built Spaces use.
      data: { name: { attribute: "name", value: pluralize(typeName), kind: "string", prov: "auto" } },
    })
    .collect();
  return true;
}
