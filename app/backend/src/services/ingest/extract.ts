// Authored by Karter Whitman using Claude Opus 5
// The join: observations in a format's own words → the rows a type
// declares. Where those observations come from is sources.ts's business;
// this file is only about what they end up called.
//
// Sources return *observations*, not metadata: a key in whatever
// vocabulary the thing itself uses (an epub's OPF says "creator"; the
// v1 book reader calls it "author"), which is a different thing from
// the attribute name a user's schema happens to declare. `toMetadata` is
// the join between the two, and the only thing that has to change when
// the matching gets smarter — no source knows a schema exists.
//
// Before the join, a `book` schema declaring `writer` got an empty
// `writer` row from the layout and an orphan `author` row underneath it:
// two rows for one fact, one of them blank, in the panel opened to see
// what was extracted.
import type { AttributeKind, MetadataEntry, Schema, SchemaAttribute } from "@index/database/types";
import type { Probe } from "./probe.js";
import { observeAll } from "./sources.js";

/** One thing a resource declared about itself, in its own words. */
export interface Observation {
  key: string;
  value: MetadataEntry["value"];
  kind: AttributeKind;
  /** Which source said it, when anything cares to explain itself — the
   * change `index` writes names where each value came from, since a
   * filename beating a file's own metadata is surprising enough to be
   * worth saying out loud. Nothing matches on this. */
  source?: string;
}

export type Extractor = (probe: Probe) => Promise<Observation[]>;

/**
 * What the join produced: rows for the item, and — when the type says so
 * — what the item should be called.
 *
 * The name is the schema's decision, not a reader's. A book's title is
 * the item's name and an author is metadata, but a `person` type's
 * `title` means Dr. or a job, and no amount of looking at the word tells
 * the two apart. So the type says which by putting it first — the way
 * `resources[0]` is the primary resource — and readers go on reporting
 * what they read.
 */
export interface Extracted {
  name?: string;
  metadata: MetadataEntry[];
}

/**
 * Other names for the ingestor's own vocabulary — a claim about what
 * *this* module's `author` could reasonably be called, not a guess at
 * what any particular schema means by a word. Kept short and obvious on
 * purpose: a synonym that fires wrongly puts a value in the wrong field
 * silently, which is worse than leaving it unmatched where it is at
 * least visible as its own row.
 *
 * Notably absent: `title → name` and `isbn → identifier`. Both are too
 * generic to claim — an item already has a name of its own, and plenty
 * of things carry an identifier that is not an ISBN.
 */
const SYNONYMS: Record<string, string[]> = {
  author: ["writer", "creator", "by", "authors"],
  published: ["published date", "publication date", "release date", "year", "date"],
  genre: ["genres", "subject", "subjects", "category", "categories"],
  isbn: ["isbn13", "isbn10"],
  pages: ["page count", "length"],
  publication: ["journal", "publication name", "periodical", "venue"],
  description: ["summary", "abstract", "blurb"],
};

/** Case, spaces, underscores and hyphens all stop mattering: `Release
 * Date`, `release_date` and `releaseDate` are one name. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function namesFor(key: string): string[] {
  return [key, ...(SYNONYMS[key.trim().toLowerCase()] ?? [])].map(normalize);
}

/**
 * Tried in order, and the order is the point: a schema attribute named
 * exactly what the observation is called wins over a synonym. Without
 * the ordering, a schema declaring both `author` and `writer` could hand
 * the author to whichever came first in the list.
 *
 * There used to be two more rules here, matching against a field's
 * `label` — retired along with `label` itself (attributes have no
 * display-label distinct from their name now). What's genuinely lost: a
 * schema attribute named one thing (`code`) matching an observation
 * called something unrelated (`ISBN`) purely via a manually-set label.
 * Under the current model, you'd just name the attribute `ISBN`
 * directly.
 */
const RULES: ((observation: Observation, attribute: SchemaAttribute) => boolean)[] = [
  (observation, attribute) => normalize(attribute.attribute) === normalize(observation.key),
  (observation, attribute) => namesFor(observation.key).includes(normalize(attribute.attribute)),
];

/**
 * Reshape a value for the kind its attribute actually declares. Mirrors
 * the renderer's `coerceFieldValue` (frontend/src/lib/fields.ts), which
 * the dependency rule keeps out of reach from here — the same trade the
 * derivation ladder already makes, and for the same reason.
 */
function coerce(value: MetadataEntry["value"], kind: AttributeKind): MetadataEntry["value"] {
  if (kind === "list") {
    if (Array.isArray(value)) return value;
    return value.trim() === "" ? [] : [value];
  }
  return Array.isArray(value) ? value.join(", ") : value;
}

function asEntry(observation: Observation): MetadataEntry {
  return { attribute: observation.key, value: observation.value, kind: observation.kind, prov: "auto" };
}

/** A name is one line, whatever shape the observation arrived in. */
function asText(value: MetadataEntry["value"]): string {
  return Array.isArray(value) ? value.join(", ") : value;
}

/**
 * Observations → the rows written onto an item, against the schema for
 * the type they were extracted for.
 *
 * Three decisions worth stating, because none of them are forced:
 *
 * - **The schema's kind wins.** A schema is the declaration of what a
 *   type carries; an observation only knows what the file said. So the
 *   entry takes the declared kind and the value is reshaped to fit.
 * - **Unmatched observations are kept**, as rows of their own, rather
 *   than dropped. The file really did say them, and a visible row the
 *   user can delete beats data that silently never arrived. `index`
 *   turns this off (`keepUnmatched: false`): a person filling in a type
 *   on an item they already curated asked for that type's attributes,
 *   and loose rows they never asked for are noise there rather than
 *   rescue.
 * - **Unmatched schema attributes are not emitted.** The layout already
 *   draws a type's declared attributes from the schema itself
 *   (layouts/registry.tsx), so writing empty rows here would put the
 *   same blanks on the item twice.
 *
 * The type's **first** attribute takes its match as the item's name and
 * writes no row — `resources[0]` is the primary resource for the same
 * reason, and reordering is the same gesture in both places. The name is
 * one fact, and the input at the top of Focus is already the control for
 * editing it.
 *
 * With no schema — an untyped item, or a type nobody has defined
 * attributes for — every key passes through verbatim, which is what
 * shipped before this join existed. Everything this file produces is
 * machine-derived, so every entry carries `prov: "auto"`.
 */
export function toMetadata(
  observations: Observation[],
  schema?: Schema,
  options: { keepUnmatched?: boolean } = {},
): Extracted {
  const keepUnmatched = options.keepUnmatched ?? true;
  const attributes = schema?.attributes ?? [];
  if (attributes.length === 0) return { metadata: keepUnmatched ? observations.map(asEntry) : [] };

  const pairs = new Map<SchemaAttribute, Observation>();
  const claimed = new Set<Observation>();

  for (const rule of RULES) {
    for (const attribute of attributes) {
      if (pairs.has(attribute)) continue;
      const match = observations.find(
        (observation) => !claimed.has(observation) && rule(observation, attribute),
      );
      if (!match) continue;
      pairs.set(attribute, match);
      claimed.add(match);
    }
  }

  const [naming, ...rest] = attributes;
  const named = naming ? pairs.get(naming) : undefined;

  // Matched rows in the order the type declares them, so an item reads
  // the way its schema does; whatever the file said that the schema has
  // no word for follows, in the order it was read.
  const matched = rest
    .filter((attribute) => pairs.has(attribute))
    .map((attribute) => {
      const observation = pairs.get(attribute) as Observation;
      return {
        attribute: attribute.attribute,
        value: coerce(observation.value, attribute.kind),
        kind: attribute.kind,
        prov: "auto" as const,
      };
    });

  const unmatched = keepUnmatched
    ? observations.filter((observation) => !claimed.has(observation)).map(asEntry)
    : [];

  return {
    ...(named ? { name: asText(named.value) } : {}),
    metadata: [...matched, ...unmatched],
  };
}

/**
 * Best-effort, like every derivation: no type, nothing to read it with,
 * or no probe means no metadata — never an error. An item whose metadata
 * is unreadable still gets created and still gets classified, just with
 * nothing pre-filled.
 *
 * The type gate is deliberately only a gate. It asks whether this is a
 * thing worth reading a file for, and nothing else: which reader runs is
 * the file's business (`observe`), and which type this is says nothing
 * about that. So an unfamiliar type still gets read, and no type at all
 * still gets nothing.
 */
export async function extract(
  type: string | null,
  probe: Probe | null,
  schema?: Schema,
  options?: { keepUnmatched?: boolean },
): Promise<Extracted> {
  if (!type || !probe) return { metadata: [] };
  try {
    return toMetadata(await observeAll(probe), schema, options);
  } catch {
    return { metadata: [] };
  }
}
