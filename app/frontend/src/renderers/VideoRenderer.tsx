// Authored by Karter Whitman using Claude Opus 4.8
// A YouTube embed. The format ladder only calls something `video` when
// its url matches a watch/short/embed pattern, so the id is always
// extractable — but if it somehow isn't, say so rather than showing an
// empty frame.
import type { RendererProps } from "./registry.tsx";

/** The video id out of any of the shapes the format ladder accepts. */
export function youtubeId(uri: string): string | null {
  try {
    const url = new URL(uri);
    if (url.hostname.endsWith("youtu.be")) return url.pathname.slice(1) || null;
    if (url.pathname.startsWith("/watch")) return url.searchParams.get("v");
    const embedded = /^\/(?:embed|shorts)\/([^/?#]+)/.exec(url.pathname);
    return embedded?.[1] ?? null;
  } catch {
    return null;
  }
}

export function VideoRenderer({ item }: RendererProps) {
  const resource = item.resources[0];
  if (!resource) return null;

  const id = youtubeId(resource.uri);
  if (!id) return <p className="renderer-missing">this link isn’t a video after all</p>;

  return (
    <iframe
      allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
      allowFullScreen
      className="renderer-video"
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title={item.display_name ?? item.name}
    />
  );
}
