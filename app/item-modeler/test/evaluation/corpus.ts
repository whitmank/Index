// Authored by Karter Whitman using Claude Opus 5
// The ground truth: real sources paired with hand-made, accurate Items.
//
// The manifest lives outside the repo and is named by `INDEX_EVAL_CORPUS`,
// because the books themselves are large, private, and nobody's to
// redistribute. What is checked in is the shape and the scorer; what is
// pointed at is a library.
//
// The truth entries are literally Index `Item`s. That is deliberate: the
// module answers in Items, so truth written in the same vocabulary needs
// no translation to compare, and an entry can be produced by curating an
// item in the app and copying it out rather than by writing JSON from a
// mental model of the schema.
import fs from "node:fs";
import path from "node:path";
import type { Item, Schema } from "@index/database/types";

export interface CorpusEntry {
  /** An absolute path, or any uri the configured gateway can reach. */
  source: string;
  /** What the item *should* look like once modeled. Only `name` and
   * `fields` are read; everything else may be omitted. */
  item: Pick<Item, "name"> & Partial<Item> & { fields: Item["fields"] };
  /** Optional note for the report — why this book is in the corpus, what
   * it is meant to be hard about. */
  note?: string;
}

export interface Corpus {
  /** The type every entry is modeled against. Carried in the manifest so
   * the evaluation does not need a running database to know the shape of
   * a `book`. */
  schema: Schema;
  entries: CorpusEntry[];
}

export const DEFAULT_CORPUS_PATH = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "corpus.json",
);

export function corpusPath(): string {
  return process.env["INDEX_EVAL_CORPUS"] ?? DEFAULT_CORPUS_PATH;
}

/**
 * The book schema a template is generated with. Not authoritative — the
 * manifest's own schema is — but a sensible starting point that matches
 * what the readers know how to speak about.
 *
 * `fields[0]` is the item's name, the way `resources[0]` is the primary
 * resource. A book's title is what the book is called, so it leads.
 */
export const TEMPLATE_SCHEMA: Schema = {
  id: "schemas:book",
  name: "book",
  label: null,
  fields: [
    { name: "title", label: null, kind: "string" },
    { name: "author", label: null, kind: "string" },
    { name: "published", label: null, kind: "date" },
    { name: "publisher", label: null, kind: "string" },
    { name: "isbn", label: null, kind: "string", hidden: true },
    { name: "subject", label: null, kind: "list" },
  ],
};

export class CorpusError extends Error {}

function fail(message: string): never {
  throw new CorpusError(message);
}

/**
 * Read and check the manifest.
 *
 * Validated rather than trusted, because a scoring run against a
 * malformed corpus produces numbers that look like results. A missing
 * source file is caught here too — a corpus entry pointing at a book that
 * has moved would otherwise score as the module failing to read it.
 */
export function loadCorpus(from = corpusPath()): Corpus {
  if (!fs.existsSync(from)) {
    fail(
      `no corpus at ${from}\n` +
        `  Point INDEX_EVAL_CORPUS at your manifest, or write one to that path.\n` +
        `  \`npm run eval -- --template\` prints a starting one.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(from, "utf8"));
  } catch (error) {
    fail(`${from} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (!parsed || typeof parsed !== "object") fail(`${from} should hold an object`);
  const corpus = parsed as Partial<Corpus>;

  const schema = corpus.schema;
  if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
    fail(`${from} needs a \`schema\` with at least one field`);
  }
  if (!Array.isArray(corpus.entries) || corpus.entries.length === 0) {
    fail(`${from} needs a non-empty \`entries\` array`);
  }

  corpus.entries.forEach((entry, at) => {
    if (!entry?.source) fail(`entry ${at} has no \`source\``);
    if (!entry.item || !Array.isArray(entry.item.fields)) {
      fail(`entry ${at} (${entry.source}) needs an \`item\` with a \`fields\` array`);
    }
    const declared = new Set(schema.fields.map((field) => field.name.toLowerCase()));
    for (const field of entry.item.fields) {
      if (!declared.has(field.name.toLowerCase())) {
        fail(
          `entry ${at} (${entry.source}) asserts '${field.name}', which the schema does not declare`,
        );
      }
    }
  });

  return { schema, entries: corpus.entries };
}

/** An entry's source, resolved relative to the manifest so a corpus can
 * be moved as a unit. */
export function sourceOf(entry: CorpusEntry, manifest: string): string {
  if (/^[a-z]+:\/\//i.test(entry.source) || path.isAbsolute(entry.source)) return entry.source;
  return path.resolve(path.dirname(manifest), entry.source);
}

/** A starting manifest, so the corpus is filled in rather than invented. */
export function template(sources: string[]): string {
  return `${JSON.stringify(
    {
      schema: TEMPLATE_SCHEMA,
      entries: (sources.length > 0 ? sources : ["/absolute/path/to/a-book.pdf"]).map((source) => ({
        source,
        note: "",
        item: {
          name: "",
          fields: TEMPLATE_SCHEMA.fields
            .slice(1)
            .map((field) => ({ name: field.name, value: field.kind === "list" ? [] : "", kind: field.kind })),
        },
      })),
    },
    null,
    2,
  )}\n`;
}
