// Authored by Karter Whitman using Claude Sonnet 5
// A YouTube embed, sized to its own 16:9 box — shared by the video
// renderer (renderers/VideoRenderer.tsx, format-selected: the primary
// resource is the video) and MovieLayout (layouts/types/MovieLayout.tsx,
// which reaches past whichever resource is primary for a trailer among
// the item's others, so it can't rely on Focus.tsx's own content-slot
// wrapper to size it — this sizes itself instead).
export interface VideoEmbedProps {
  uri: string;
  title: string;
}

/** The video id out of any of the shapes the format ladder accepts
 * (watch/short/embed/youtu.be) — exported separately so a caller can
 * check "is this actually embeddable" before committing to a resource. */
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

export function VideoEmbed({ uri, title }: VideoEmbedProps) {
  const id = youtubeId(uri);
  if (!id) return null;
  return (
    <div className="video-embed">
      <iframe
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
        allowFullScreen
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
      />
    </div>
  );
}
