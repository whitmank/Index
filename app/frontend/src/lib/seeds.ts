// Authored by Karter Whitman using Claude Opus 4.8
// The three seeded sets, by id. Mirrored from @index/database's constants
// for the same reason the derivations are (ARCHITECTURE's dependency
// rule): the renderer takes types from that package, not values.
//
// SurrealDB brackets only the ids that need it, and the wire id is
// whatever it renders — so `~` keeps its brackets and `public`/`spaces`
// do not.
export const HOME_SET_ID = "items:⟨~⟩";
export const PUBLIC_SET_ID = "items:public";
export const SPACES_SET_ID = "items:spaces";

/** Whether an item is one of these three fixed, built-in seeds rather than
 * something the user made. Mirrors @index/database/types' own — computed
 * from `id`, not stored, since all three ids are known constants. */
export function isSystemId(id: string): boolean {
  return id === HOME_SET_ID || id === PUBLIC_SET_ID || id === SPACES_SET_ID;
}

/** The one reserved, structural label — see @index/database/types for
 * the full rationale. Every unlabelled connection, and every connection
 * carrying any other label, is a plain relationship. */
export const MEMBER_OF_LABEL_ID = "labels:member_of";
