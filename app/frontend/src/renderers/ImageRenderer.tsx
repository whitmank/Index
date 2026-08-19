// Authored by Karter Whitman using Claude Opus 4.8
// The full image, streamed over `res://`. The thumbnail is only ever a
// node's business; opening something means seeing it properly.
import { useState } from "react";
import type { RendererProps } from "./registry.tsx";

export function ImageRenderer({ item, resource }: RendererProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="renderer-missing">this file isn’t where it used to be</p>;
  }

  return (
    <img
      alt={(item.data.display_name?.value as string | undefined) ?? (item.data.name.value as string)}
      className="renderer-image"
      onError={() => setFailed(true)}
      src={window.index.url.res(resource.uri)}
    />
  );
}
