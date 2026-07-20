// Authored by Karter Whitman using Claude Opus 4.8
// The context-menu entries an item offers, in one place so canvas and
// list can't drift apart on what right-clicking something means.
import type { Item } from "@index/database/types";
import { apply, changes } from "../changes/index.js";
import { deviceOf } from "../lib/derive.js";
import { PUBLIC_SET_ID } from "../lib/seeds.js";
import { errors, pool } from "../store/index.js";
import type { MenuItem } from "./ContextMenu.tsx";

export function isPublic(item: Item): boolean {
  return Boolean(pool.findConnection(item.id, PUBLIC_SET_ID, null));
}

export function itemMenu(
  item: Item,
  handlers: { onOpen: (item: Item) => void; onDelete?: (item: Item) => void },
): MenuItem[] {
  const resource = item.resources[0];
  const local = resource ? deviceOf(resource.uri) !== "web" : false;
  const shared = isPublic(item);

  return [
    { label: "Open", onChoose: () => handlers.onOpen(item) },
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
      label: "Delete",
      danger: true,
      disabled: item.system,
      onChoose: () => {
        const change = changes.deleteItem(item);
        if (!change) return;
        void apply(change).then(() => handlers.onDelete?.(item));
      },
    },
  ];
}
