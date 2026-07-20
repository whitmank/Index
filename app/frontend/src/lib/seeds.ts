// Authored by Karter Whitman using Claude Opus 4.8
// The two seeded sets, by id. Mirrored from @index/database's constants
// for the same reason the derivations are (ARCHITECTURE's dependency
// rule): the renderer takes types from that package, not values.
//
// SurrealDB brackets only the ids that need it, and the wire id is
// whatever it renders — so `~` keeps its brackets and `public` does not.
export const HOME_SET_ID = "items:⟨~⟩";
export const PUBLIC_SET_ID = "items:public";
