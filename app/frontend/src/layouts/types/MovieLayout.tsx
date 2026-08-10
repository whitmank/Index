// Authored by Karter Whitman using Claude Sonnet 5
// A full-width media zone — content spans the panel — with the data
// below it, not beside it: title, year, director, cast, then the
// generic fields/resources/connections. The same shape VideoLayout
// already uses (`SingleColumn` with `wide` content).
//
// `content` is the resource carousel now (Focus.tsx, whenever an item
// has more than one resource) — a movie's trailer, Wikipedia page, and
// IMDb page are all pageable in the same pane, opened on the trailer
// via `layouts.movie.preferredResource` (registry.tsx) rather than this
// component hunting for one itself.
import type { LayoutProps } from "../registry.tsx";
import { SingleColumn } from "../parts/SingleColumn.tsx";

export function MovieLayout({ content, editor, connections }: LayoutProps) {
  return <SingleColumn connections={connections} content={content} editor={editor} wide />;
}
