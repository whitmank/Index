// Authored by Karter Whitman using Claude Opus 4.8
// A link, drawn from what the page said about itself when the resource
// was made: favicon, preview image, title, extract. All of it is cached
// derivation, so all of it may be absent — the card degrades to the url,
// which is still the whole truth about where this points.
import { errors } from "../store/index.js";
import type { RendererProps } from "./registry.tsx";

export function LinkRenderer({ resource }: RendererProps) {
  const cached = resource.cached ?? {};
  const host = hostOf(resource.uri);

  return (
    <button
      className="renderer-link"
      onClick={() => {
        void window.index.shell.openExternal(resource.uri).then((result) => {
          if ("err" in result) errors.surface(result.err);
        });
      }}
      type="button"
    >
      {cached.preview_image && (
        <img
          alt=""
          className="renderer-link-image"
          src={window.index.url.thumb(cached.preview_image)}
        />
      )}
      <span className="renderer-link-body">
        <span className="renderer-link-site">
          {cached.favicon && (
            <img alt="" className="renderer-link-favicon" src={window.index.url.thumb(cached.favicon)} />
          )}
          {host}
        </span>
        <span className="renderer-link-title">{cached.card_title ?? resource.name}</span>
        {cached.card_extract && (
          <span className="renderer-link-extract">{cached.card_extract}</span>
        )}
      </span>
    </button>
  );
}

function hostOf(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, "");
  } catch {
    return uri;
  }
}
