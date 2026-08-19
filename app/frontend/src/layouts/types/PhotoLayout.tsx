// Authored by Karter Whitman using Claude Sonnet 5
// Two columns: content beside a data column — a photo, and its exif
// alongside it. MovieLayout used to be identical; it's since moved to a
// full-width media zone with the data below instead, which is why this
// stayed its own file rather than a shared alias in the first place.
import type { LayoutProps } from "../registry.tsx";
import { TwoColumn } from "../parts/TwoColumn.tsx";

export function PhotoLayout({ content, editor, connections }: LayoutProps) {
  return <TwoColumn connections={connections} content={content} editor={editor} />;
}
