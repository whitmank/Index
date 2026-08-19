// Authored by Karter Whitman using Claude Sonnet 5
// OS file drop, wherever it lands: one item per file, classified and
// ingested by the backend's intake pipeline (services/intake.ts),
// dated onto the given day — today's, unless a specific page is in
// view. Shared by every drop target so each is a one-line call rather
// than its own copy of the loop.
import type { IntakeResult } from "@index/backend/bridge";
import type { Data, Item, Resource } from "@index/database/types";
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

/** Asked of exactly one captured resource, before it becomes an item.
 * Resolves to the description the user gave — possibly empty, when they
 * submitted without typing anything — or `null` when they dismissed the
 * prompt, which aborts the capture. The UI side lives in
 * `hooks/useCapturePrompt.ts`, so this module stays free of React. */
export type DescribePrompt = (resource: Resource) => Promise<string | null>;

/**
 * The single-capture path: pause between resolving what was dropped and
 * minting the item, to ask what it is (components/DescribeCapture.tsx). A
 * batch of more than one path skips the prompt entirely and falls
 * through to `createItemsFromPaths`, unchanged — asking "what is this?"
 * of a pile of files has no one answer.
 */
export async function captureFromPaths(
  paths: string[],
  describe: DescribePrompt,
  date?: string,
): Promise<Item[]> {
  const [path, ...rest] = paths;
  if (!path || rest.length > 0) return createItemsFromPaths(paths, date);

  const answer = await window.index.intake.pathsToResources([path]);
  if ("err" in answer) return [];
  const [result] = answer.ok.results;
  if (!result) return [];

  const description = await describe(result.resource);
  if (description === null) return [];

  // `draftFrom` already carries the deterministic classifier's guess
  // (classifyResource, run inside pathsToResources) in `type`. The
  // description is the primary signal when there is one: ask the item
  // classifier first, and only a real (non-null) answer overwrites the
  // deterministic guess. A blank description, or an inconclusive answer,
  // leaves the deterministic guess exactly as `draftFrom` set it. Never
  // blocks or fails item creation either way — an `err` from the bridge is
  // treated the same as "no opinion".
  const draft = draftFrom(result, date);
  const trimmed = description.trim();
  if (trimmed) {
    draft.item = {
      ...draft.item,
      data: { ...draft.item.data, description: { attribute: "description", value: description, kind: "string", prov: "user" } },
    };
    const guess = await window.index.itemClassifier.classify(trimmed);
    if ("ok" in guess && guess.ok.type) {
      draft.item = {
        ...draft.item,
        data: { ...draft.item.data, type: { attribute: "type", value: guess.ok.type, kind: "string", prov: "auto" } },
      };
    }
  }
  return commitDrafts([draft]);
}
