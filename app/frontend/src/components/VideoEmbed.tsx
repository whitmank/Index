// Authored by Karter Whitman using Claude Sonnet 5
// A YouTube embed. Always rendered inside ResourceContent.tsx's
// `.content-slot.fit-aspect-16-9`, which is the one place the 16:9
// ratio is declared (Focus.css) — this just fills that box.
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
