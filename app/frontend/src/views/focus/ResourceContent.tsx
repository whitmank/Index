// Authored by Karter Whitman using Claude Sonnet 5
// One resource, drawn into its box — the single-resource path and each
// slide of ResourceCarousel both go through this, so there is exactly
// one place that turns "a resource" into "a rendered content-slot."
import type { Item, Resource } from "@index/database/types";
import { formatOfResource } from "../../lib/derive.js";
import { rendererFor } from "../../renderers/registry.tsx";

export function ResourceContent({ item, resource }: { item: Item; resource: Resource | undefined }) {
  // An item with no resources at all — the layout still renders (name,
  // fields, connections), there's just nothing here to draw. Handled
  // directly rather than routed through the registry's own `bare` entry:
  // the rendered output is identical (BareRenderer draws nothing) and
  // this skips a resource-shaped renderer having to tolerate `undefined`.
  if (!resource) return <div className="content-slot fit-bare" />;

  const renderer = rendererFor(formatOfResource(resource));
  const Content = renderer.Component;

  return (
    <div className={`content-slot fit-${renderer.fit}`}>
      {/* Keyed on the resource, not the item: paging the carousel to a
          different resource has to remount whatever renderer draws it —
          otherwise a renderer's own state (ImageRenderer's `failed`,
          BookRenderer's reading position) would carry over from the
          resource it belonged to. */}
      <Content item={item} key={resource.uri} resource={resource} />
    </div>
  );
}
