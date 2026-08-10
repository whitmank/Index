// Authored by Karter Whitman using Claude Sonnet 5
// Single column: content, then the editor below it.
import type { LayoutProps } from "../registry.tsx";
import { SingleColumn } from "../parts/SingleColumn.tsx";

export function DefaultLayout({ content, editor, connections }: LayoutProps) {
  return <SingleColumn connections={connections} content={content} editor={editor} />;
}
