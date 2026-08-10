// Authored by Karter Whitman using Claude Sonnet 5
// Paging through an item's resources in the same content pane — a movie
// item's trailer, Wikipedia page, and IMDb page are all "the content,"
// not just whichever one happens to be primary. Click-only navigation:
// Focus's own window-level Escape/←/A listener already treats a bare ←
// as "dismiss the view" (its own comment: "the trail's own back gesture
// stands down while an overlay is up, so this is the only way left/A
// means back once you're in one"), so binding the same key to "previous
// slide" here would fire both on one keypress. Not worth the conflict
// for a feature this small.
import { useState } from "react";
import type { Item, Resource } from "@index/database/types";
import { ResourceContent } from "./ResourceContent.tsx";

export interface ResourceCarouselProps {
  item: Item;
  resources: Resource[];
  /** Which resource to open on — a layout's own preference
   * (`LayoutEntry.preferredResource`), or 0 (the primary resource) when
   * it has none. */
  initialIndex?: number;
}

export function ResourceCarousel({ item, resources, initialIndex = 0 }: ResourceCarouselProps) {
  const [index, setIndex] = useState(initialIndex);
  // Clamped rather than trusted: a resource removed while this is open
  // (or an `initialIndex` from a stale render) must not point past the
  // end of the array.
  const current = Math.min(Math.max(index, 0), resources.length - 1);
  const resource = resources[current];

  const go = (delta: number): void => {
    setIndex((at) => (at + delta + resources.length) % resources.length);
  };

  return (
    <div className="resource-carousel">
      <ResourceContent item={item} resource={resource} />

      <button
        aria-label="previous source"
        className="carousel-nav is-prev"
        onClick={() => go(-1)}
        type="button"
      >
        ‹
      </button>
      <button aria-label="next source" className="carousel-nav is-next" onClick={() => go(1)} type="button">
        ›
      </button>

      <div className="carousel-dots">
        {resources.map((candidate, at) => (
          <button
            aria-current={at === current}
            aria-label={`source ${at + 1}: ${candidate.name}`}
            className={at === current ? "carousel-dot is-current" : "carousel-dot"}
            key={candidate.uri}
            onClick={() => setIndex(at)}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
