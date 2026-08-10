// Authored by Karter Whitman using Claude Sonnet 5
// A parent's ordered children, optionally narrowed to one label — the
// track list an AlbumLayout reads, and whatever a future chapter list
// reads the same way. `pool.childrenOf` already does the real work
// (sorted by manual `order` then `created_at`, filtered to `child: true`
// connections); this only adds the label narrowing and resolves each
// connection to the item at its far end.
import type { Connection, Item } from "@index/database/types";
import { pool, usePool } from "../../store/index.js";

export interface OrderedChild {
  connection: Connection;
  item: Item;
}

export function useOrderedChildren(itemId: string, label?: string): OrderedChild[] {
  return usePool(() =>
    pool
      .childrenOf(itemId)
      .filter((connection) => !label || connection.label === label)
      .flatMap((connection) => {
        const child = pool.getItem(connection.target);
        return child ? [{ connection, item: child }] : [];
      }),
  );
}
