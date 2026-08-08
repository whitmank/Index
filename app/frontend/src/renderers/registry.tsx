// Authored by Karter Whitman using Claude Opus 4.8
// The renderer registry (PRODUCT-SPEC §3.5). A renderer draws an item's
// content into its box and nothing else — it never arranges the screen,
// and it is always chosen by *format*, never by the layout. The two
// machines compose; neither overrides the other (DESIGN-CONCEPT §5).
//
// Each entry declares its fit: how its box wants to be shaped.
import type { Format, Item } from "@index/database/types";
import { BareRenderer } from "./BareRenderer.tsx";
import { BookRenderer } from "./BookRenderer.tsx";
import { FileRenderer } from "./FileRenderer.tsx";
import { ImageRenderer } from "./ImageRenderer.tsx";
import { LinkRenderer } from "./LinkRenderer.tsx";
import { MarkdownRenderer } from "./MarkdownRenderer.tsx";
import { VideoRenderer } from "./VideoRenderer.tsx";

/** How a renderer wants its box shaped. */
export type Fit = "contain" | "flow" | "aspect-16-9" | "aspect-3-4" | "bare";

export interface RendererProps {
  item: Item;
}

export interface RendererEntry {
  fit: Fit;
  Component: (props: RendererProps) => React.ReactNode;
}

export const renderers: Record<Format, RendererEntry> = {
  image: { fit: "contain", Component: ImageRenderer },
  markdown: { fit: "flow", Component: MarkdownRenderer },
  video: { fit: "aspect-16-9", Component: VideoRenderer },
  book: { fit: "aspect-3-4", Component: BookRenderer },
  link: { fit: "contain", Component: LinkRenderer },
  file: { fit: "bare", Component: FileRenderer },
  bare: { fit: "bare", Component: BareRenderer },
};

export function rendererFor(format: Format): RendererEntry {
  return renderers[format];
}
