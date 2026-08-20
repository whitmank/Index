// Authored by Karter Whitman using Claude Sonnet 5
// A parent's ordered children — the track list an album's Focus view
// reads, and whatever else ever nests something under it the same way
// (`child: true` connections; PRODUCT-SPEC hierarchy). `pool.childrenOf`
// already does the real work (sorted by manual `order` then
// `created_at`, filtered to `child: true`); this only resolves each
// connection to the item at its far end.
import type { Connection, Item } from "@index/database/types";
import { pool, usePool } from "../../store/index.js";

export interface OrderedChild {
  connection: Connection;
  item: Item;
}

export function useOrderedChildren(itemId: string): OrderedChild[] {
  return usePool(() =>
    pool.childrenOf(itemId).flatMap((connection) => {
      const child = pool.getItem(connection.target);
      return child ? [{ connection, item: child }] : [];
    }),
  );
}
