// Authored by Karter Whitman using Claude Sonnet 5
// Full-width player, editor below.
import type { LayoutProps } from "../registry.tsx";
import { SingleColumn } from "../parts/SingleColumn.tsx";

export function VideoLayout({ content, editor, connections }: LayoutProps) {
  return <SingleColumn connections={connections} content={content} editor={editor} wide />;
}
