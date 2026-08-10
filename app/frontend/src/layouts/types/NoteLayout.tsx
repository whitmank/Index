// Authored by Karter Whitman using Claude Sonnet 5
// Content only; the editor waits behind an affordance.
import type { LayoutProps } from "../registry.tsx";
import { SingleColumn } from "../parts/SingleColumn.tsx";

export function NoteLayout({ content, editor, connections }: LayoutProps) {
  return <SingleColumn connections={connections} content={content} editor={editor} fold />;
}
