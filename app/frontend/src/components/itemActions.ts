// Authored by Karter Whitman using Claude Opus 4.8
// The context-menu entries an item offers, in one place so canvas and
// list can't drift apart on what right-clicking something means.
import type { Item } from "@index/database/types";
import { apply, changes } from "../changes/index.js";
import { captionOf, deviceOf } from "../lib/derive.js";
import { PUBLIC_SET_ID } from "../lib/seeds.js";
import { holdsEverything } from "../lib/sets.js";
import { errors, pool } from "../store/index.js";
import type { MenuItem } from "./ContextMenu.tsx";

export function isPublic(item: Item): boolean {
  return Boolean(pool.findConnection(item.id, PUBLIC_SET_ID, null));
}

/**
 * Whether this item can be taken out of the set it is being viewed in.
 *
 * Membership is a union (DESIGN-CONCEPT §3): the items a set's query
 * matches, plus the items with an arrow into it. Only the arrow is an
 * opinion someone expressed, so only the arrow can be withdrawn — and
 * saying so up front is better than removing one and watching the query
 * put the item straight back.
 */
function removableFrom(item: Item, set: Item | undefined): { can: boolean; why?: string } {
  if (!set) return { can: false, why: "there is no set in view" };
  const name = captionOf(set) || "this set";

  // A set that holds everything holds this too, arrow or not.
  if (holdsEverything(set)) {
    return { can: false, why: `${name} holds everything, so nothing can be taken out of it` };
  }
  if (!pool.findConnection(item.id, set.id, null)) {
    return { can: false, why: `${name} matches this by its query — there is no arrow to take away` };
  }
  return { can: true };
}

export function itemMenu(
  item: Item,
  handlers: {
    onGoTo: (item: Item) => void;
    onDelete?: (item: Item) => void;
    /** The set being viewed, which is what "remove from" removes it from. */
    setId?: string;
    /** Membership changed under the view; it should read the set again. */
    onRemoved?: () => void;
  },
): MenuItem[] {
  const resource = item.resources[0];
  const local = resource ? deviceOf(resource.uri) !== "web" : false;
  const shared = isPublic(item);
  const set = handlers.setId ? pool.getItem(handlers.setId) : undefined;
  const removable = removableFrom(item, set);

  return [
    // The menu names what the click will actually do, so the two never
    // disagree about what this item is.
    {
      label: pool.isPlace(item.id) ? "Go in" : "Open",
      onChoose: () => handlers.onGoTo(item),
    },
    {
      label: local ? "Reveal in Finder" : "Open in browser",
      disabled: !resource,
      onChoose: () => {
        if (!resource) return;
        const answer = local
          ? window.index.shell.reveal(resource.uri)
          : window.index.shell.openExternal(resource.uri);
        void answer.then((result) => {
          if ("err" in result) errors.surface(result.err);
        });
      },
    },
    {
      label: shared ? "Make private" : "Make public",
      onChoose: () => {
        const change = changes.setPublic(item, !shared);
        if (change) void apply(change);
      },
    },
    {
      // Taking something out of a set leaves the thing itself alone —
      // which is the whole difference between this entry and the next.
      label: set ? `Remove from ${captionOf(set) || "this set"}` : "Remove from this set",
      tone: "warn",
      disabled: !removable.can,
      title: removable.why,
      onChoose: () => {
        if (!set) return;
        const change = changes.untag(item, set);
        if (!change) return;
        void apply(change).then((ok) => {
          if (ok) handlers.onRemoved?.();
        });
      },
    },
    {
      label: "Delete",
      tone: "danger",
      disabled: item.system,
      onChoose: () => {
        const change = changes.deleteItem(item);
        if (!change) return;
        void apply(change).then(() => handlers.onDelete?.(item));
      },
    },
  ];
}
