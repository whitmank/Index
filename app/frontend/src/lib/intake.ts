// Authored by Karter Whitman using Claude Sonnet 5
// OS file drop, wherever it lands: one item per file, classified and
// ingested by the backend's intake pipeline (services/intake.ts),
// dated onto the given day — today's, unless a specific page is in
// view. Shared by every drop target so each is a one-line call rather
// than its own copy of the loop.
import type { IntakeResult } from "@index/backend/bridge";
import type { AttributeKind, Data, DataEntry, Item, Resource } from "@index/database/types";
import { apply, changes } from "../changes/index.js";
import { ulid } from "./ids.js";
import { expandSpotifyAlbum } from "./spotify.js";

interface Draft {
  resource: Resource;
  item: Item;
}

// This resource *is* the item's primary — it is the only one there — so
// the guess applies and is recorded as the classifier's own, which is
// what leaves a later promotion free to replace it (lib/resources.ts).
//
// `name` beats `resource.name` when the ingestor found one: a book's
// title is what the thing is called, where the filename is only where
// it happened to be saved. Nothing to overwrite at this point — the
// item is being minted, so the derived name has never been seen.
function draftFrom({ resource, type, entries, name }: IntakeResult, date?: string): Draft {
  const blank = changes.blankItem(date);
  const data: Data = {
    ...blank.data,
    name: { attribute: "name", value: name ?? resource.name, kind: "string", prov: "auto" },
  };
  if (type) data.type = { attribute: "type", value: type, kind: "string", prov: "auto" };
  for (const entry of entries) data[entry.attribute ? entry.attribute.toLowerCase() : ulid()] = entry;

  return { resource, item: { ...blank, resources: [resource], data } };
}

/**
 * A Spotify album link is still one draft in, one item out here — its
 * songs ride along as extra pairs in the *same* `Change` that creates the
 * album item, so one undo takes the whole import back out, and every
 * other draft in the same batch still becomes its own separate item with
 * its own undo entry, exactly as before.
 */
async function commitDrafts(drafts: Draft[]): Promise<Item[]> {
  const created = await Promise.all(
    drafts.map(async ({ item, resource }) => {
      const expansion = await expandSpotifyAlbum(item, resource);
      if (!expansion) return { item, ok: await apply(changes.createItem(item)) };

      const named: Item = {
        ...item,
        data: {
          ...item.data,
          ...expansion.itemPatch.data,
          name: { attribute: "name", value: expansion.albumName, kind: "string", prov: "auto" },
        },
      };
      const change = {
        description: `Create '${expansion.albumName}' as an album`,
        pairs: [{ before: null, after: named }, ...expansion.extraPairs],
      };
      return { item: named, ok: await apply(change) };
    }),
  );
  return created.filter((entry) => entry.ok).map((entry) => entry.item);
}

/** Returns the items that actually landed, in drop order — so a caller
 * can open the last one (PRODUCT-SPEC precedent: `+` opens what it just
 * made) regardless of how many files came in at once. */
export async function createItemsFromPaths(paths: string[], date?: string): Promise<Item[]> {
  if (paths.length === 0) return [];
  const answer = await window.index.intake.pathsToResources(paths);
  if ("err" in answer) return [];
  return commitDrafts(answer.ok.results.map((result) => draftFrom(result, date)));
}

/** What a new item's card can show, before the item exists — either a
 * captured resource with whatever the classifier and composer already
 * found (`pathsToResources` has fully resolved by the time this is
 * built, so there is nothing async left for the card to wait on), or
 * nothing at all for a manually-created item, which has no evidence to
 * show and no guessed type. */
export type ItemCardMode =
  | {
      kind: "resource";
      resource: Resource;
      /** The deterministic/AI classifier's guess, or null. Never
       * re-classified from anything typed into the card — see
       * `captureFromPaths`. */
      type: string | null;
      name: string;
      fields: { attribute: string; value: DataEntry["value"]; kind: AttributeKind }[];
    }
  | { kind: "manual" };

/** One tag the card's composer produced — freeform (`attribute: null`,
 * what a bare word becomes) or typed (`attribute` named, the same
 * tab-to-attribute gesture `DataFields.tsx`'s own composer uses). Same
 * shape either way because both land in `item.data` the same way, just
 * keyed differently (`withCardAnswer`). */
export interface TagEntry {
  attribute: string | null;
  value: string;
}

/** What the card hands back on submit — both fields optional, since
 * "submitted with nothing typed" is a real, different answer from
 * dismissing the card entirely (see `ItemCardPrompt`). */
export interface ItemCardAnswer {
  description: string;
  tags: TagEntry[];
}

/** Asked at the creation of every new item, resource-backed or manual.
 * Resolves to what the user typed — possibly both fields empty, when
 * they submitted without adding anything — or `null` when they
 * dismissed the card, which aborts the creation. The UI side lives in
 * `hooks/useItemCard.ts`, so this module stays free of React. */
export type ItemCardPrompt = (mode: ItemCardMode) => Promise<ItemCardAnswer | null>;

/** Bakes a card's answer into an item's data, the same way every other
 * machine-derived field lands there: description under its reserved key
 * (prov "user" — the user wrote it, even though the card is what asked),
 * each tag under its attribute's own key when it has one, or a generated
 * key for a freeform tag — the same split `draftFrom` already applies to
 * extracted entries, and what `DataFields.tsx`'s own composer produces
 * for an existing item. Never a follow-up change — the caller bakes this
 * into the item before its one `createItem` change, so creating and
 * describing an item is one undo, not two. */
function withCardAnswer(item: Item, answer: ItemCardAnswer): Item {
  let data = item.data;
  const description = answer.description.trim();
  if (description) {
    data = { ...data, description: { attribute: "description", value: description, kind: "string", prov: "user" } };
  }
  for (const tag of answer.tags) {
    const key = tag.attribute ? tag.attribute.toLowerCase() : ulid();
    data = { ...data, [key]: { attribute: tag.attribute, value: tag.value, kind: "string", prov: "user" } };
  }
  return { ...item, data };
}

/**
 * The single-capture path: pause between resolving what was dropped and
 * minting the item, to show the card (components/ItemIntakeCard.tsx). A
 * batch of more than one path skips the card entirely and falls through
 * to `createItemsFromPaths`, unchanged — a condensed preview of a pile of
 * files has no one shape.
 */
export async function captureFromPaths(
  paths: string[],
  prompt: ItemCardPrompt,
  date?: string,
): Promise<Item[]> {
  const [path, ...rest] = paths;
  if (!path || rest.length > 0) return createItemsFromPaths(paths, date);

  const answer = await window.index.intake.pathsToResources([path]);
  if ("err" in answer) return [];
  const [result] = answer.ok.results;
  if (!result) return [];

  const draft = draftFrom(result, date);
  const mode: ItemCardMode = {
    kind: "resource",
    resource: result.resource,
    type: result.type,
    name: result.name ?? result.resource.name,
    fields: result.entries
      .filter((entry) => entry.attribute !== null)
      .map((entry) => ({ attribute: entry.attribute as string, value: entry.value, kind: entry.kind })),
  };

  // What the classifier and composer already found stands as-is: the
  // card only ever adds a description and tags on top of it, and never
  // re-classifies from either.
  const cardAnswer = await prompt(mode);
  if (cardAnswer === null) return [];

  draft.item = withCardAnswer(draft.item, cardAnswer);
  return commitDrafts([draft]);
}

/**
 * The manual-creation path (canvas's `+`): nothing has been read yet, so
 * the card shows in its emptiest form — a description and tags input
 * with no preview. Unlike `captureFromPaths`, there is no deterministic
 * guess to protect, so a typed description remains the one classification
 * signal available, same mechanism `captureFromPaths` used to use
 * unconditionally. Creation itself waits on the card: cancelling it
 * creates nothing, the same way dismissing a resource capture's card
 * always has.
 */
export async function createBlankItemInteractive(prompt: ItemCardPrompt, date?: string): Promise<Item | null> {
  const cardAnswer = await prompt({ kind: "manual" });
  if (cardAnswer === null) return null;

  let item = withCardAnswer(changes.blankItem(date), cardAnswer);
  const description = cardAnswer.description.trim();
  if (description) {
    const guess = await window.index.itemClassifier.classify(description);
    if ("ok" in guess && guess.ok.type) {
      item = { ...item, data: { ...item.data, type: { attribute: "type", value: guess.ok.type, kind: "string", prov: "auto" } } };
    }
  }

  return (await apply(changes.createItem(item))) ? item : null;
}
