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

/** The name a resource capture shows before the backend has answered at
 * all — mirrors the backend's own `nameFor` (services/intake.ts), minus
 * Node's `path` module, which the renderer has no access to. Only ever a
 * first guess: `captureFromPaths` overwrites it with whatever the
 * extractor found once that resolves, same as the backend name already
 * beat `resource.name`. */
function clientNameFor(input: string): string {
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      return url.hostname + (url.pathname === "/" ? "" : url.pathname);
    } catch {
      return input;
    }
  }
  return input.split(/[\\/]/).pop() || input;
}

/** What a new item's card can show, before the item exists — either a
 * captured resource, or nothing at all for a manually-created item,
 * which has no evidence to show and no guessed type.
 *
 * A resource capture's `name` is known the instant a drop/paste happens
 * (`clientNameFor`, no backend round trip needed), but the classifier's
 * guess and the extractor's fields are not — `resolved` stays `null`
 * until `pathsToResources` answers, so the card can render immediately
 * and show a loading state for whatever isn't in yet. */
export type ItemCardMode =
  | {
      kind: "resource";
      name: string;
      resolved: {
        /** The deterministic/AI classifier's guess, or null. Never
         * re-classified from anything typed into the card — see
         * `captureFromPaths`. */
        type: string | null;
        fields: { attribute: string; value: DataEntry["value"]; kind: AttributeKind }[];
      } | null;
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

/** What the card hands back on submit — every field optional, since
 * "submitted with nothing typed" is a real, different answer from
 * dismissing the card entirely (see `ItemCardPrompt`).
 *
 * `name`/`type`/`fieldEdits` are set only when a resource capture's user
 * actually changed a value away from what resolution proposed — the card
 * shows every field plainly (no "guessed" qualifier) and lets any of them
 * be edited, but an untouched field should keep whatever provenance
 * intake already gave it rather than being stamped "user" for free. */
export interface ItemCardAnswer {
  description: string;
  tags: TagEntry[];
  name?: string;
  type?: string | null;
  fieldEdits?: Record<string, string>;
}

/** What opening the card hands back: `answer` resolves to what the user
 * typed — possibly both fields empty, when they submitted without adding
 * anything — or `null` when they dismissed the card, which aborts the
 * creation. `patch` pushes new data into the still-open card, for a
 * caller that opened it before everything was known (`captureFromPaths`);
 * it is a no-op once the card has already been dismissed. */
export interface ItemCardHandle {
  answer: Promise<ItemCardAnswer | null>;
  patch: (updater: (mode: ItemCardMode) => ItemCardMode) => void;
}

/** Asked at the creation of every new item, resource-backed or manual.
 * The UI side lives in `hooks/useItemCard.ts`, so this module stays free
 * of React. */
export type ItemCardPrompt = (mode: ItemCardMode) => ItemCardHandle;

/** Bakes a card's answer into an item's data, the same way every other
 * machine-derived field lands there: description under its reserved key
 * (prov "user" — the user wrote it, even though the card is what asked),
 * each tag under its attribute's own key when it has one, or a generated
 * key for a freeform tag — the same split `draftFrom` already applies to
 * extracted entries, and what `DataFields.tsx`'s own composer produces
 * for an existing item. Never a follow-up change — the caller bakes this
 * into the item before its one `createItem` change, so creating and
 * describing an item is one undo, not two.
 *
 * `name`/`type`/`fieldEdits` overwrite whatever `draftFrom` already put
 * on `item` — same "user" provenance every other hand-typed value here
 * gets, since editing the guess is exactly as much a user choice as
 * typing a tag is. Clearing the type back to untyped drops the entry
 * entirely rather than writing an empty string. */
function withCardAnswer(item: Item, answer: ItemCardAnswer): Item {
  let data = item.data;
  const description = answer.description.trim();
  if (description) {
    data = { ...data, description: { attribute: "description", value: description, kind: "string", prov: "user" } };
  }
  if (answer.name !== undefined) {
    data = { ...data, name: { attribute: "name", value: answer.name, kind: "string", prov: "user" } };
  }
  if (answer.type !== undefined) {
    if (answer.type) {
      data = { ...data, type: { attribute: "type", value: answer.type, kind: "string", prov: "user" } };
    } else {
      const { type: _type, ...rest } = data;
      data = rest as Data;
    }
  }
  if (answer.fieldEdits) {
    for (const [attribute, value] of Object.entries(answer.fieldEdits)) {
      data = { ...data, [attribute.toLowerCase()]: { attribute, value, kind: "string", prov: "user" } };
    }
  }
  for (const tag of answer.tags) {
    const key = tag.attribute ? tag.attribute.toLowerCase() : ulid();
    data = { ...data, [key]: { attribute: tag.attribute, value: tag.value, kind: "string", prov: "user" } };
  }
  return { ...item, data };
}

/**
 * The single-capture path: the card (components/ItemIntakeCard.tsx) opens
 * the instant a drop/paste happens, showing only the name it can compute
 * client-side — `pathsToResources` runs in the background and patches the
 * card with the classifier's guess and the extractor's fields once it
 * lands, rather than gating the card's first paint on it. A batch of more
 * than one path skips the card entirely and falls through to
 * `createItemsFromPaths`, unchanged — a condensed preview of a pile of
 * files has no one shape.
 */
export async function captureFromPaths(
  paths: string[],
  prompt: ItemCardPrompt,
  date?: string,
): Promise<Item[]> {
  const [path, ...rest] = paths;
  if (!path || rest.length > 0) return createItemsFromPaths(paths, date);

  const resultPromise = window.index.intake.pathsToResources([path]);
  const handle = prompt({ kind: "resource", name: clientNameFor(path), resolved: null });

  // What the classifier and composer found stands as-is once it lands:
  // the card only ever adds a description and tags on top of it, and
  // never re-classifies from either. An error or an empty answer still
  // settles the card — into the same plain look a resource with no
  // guess and no fields would show — rather than leaving it loading
  // forever.
  void resultPromise.then((answer) => {
    const [result] = "err" in answer ? [] : answer.ok.results;
    handle.patch((mode) =>
      mode.kind === "resource"
        ? {
            ...mode,
            name: result?.name ?? mode.name,
            resolved: { type: result?.type ?? null, fields: fieldsOf(result) },
          }
        : mode,
    );
  });

  const cardAnswer = await handle.answer;
  if (cardAnswer === null) return [];

  const answer = await resultPromise;
  if ("err" in answer) return [];
  const [result] = answer.ok.results;
  if (!result) return [];

  const draft = draftFrom(result, date);
  draft.item = withCardAnswer(draft.item, cardAnswer);
  return commitDrafts([draft]);
}

function fieldsOf(result: IntakeResult | undefined): { attribute: string; value: DataEntry["value"]; kind: AttributeKind }[] {
  if (!result) return [];
  return result.entries
    .filter((entry) => entry.attribute !== null)
    .map((entry) => ({ attribute: entry.attribute as string, value: entry.value, kind: entry.kind }));
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
  const { answer } = prompt({ kind: "manual" });
  const cardAnswer = await answer;
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
