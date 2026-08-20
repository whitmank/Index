// Authored by Karter Whitman using Claude Sonnet 5
// A plain cover image — no card chrome, no shadow — shared by whatever
// content genuinely has one as its identity rather than incidental
// decoration: a book's jacket (renderers/BookRenderer.tsx).
//
// Deliberately has no "missing cover" state of its own — a caller
// already knows its own data source, so it decides what to render
// *instead* of this when it has no image, rather than this guessing at
// a placeholder that fits every context.
export interface CoverArtProps {
  src: string;
  alt: string;
  /** 1:1 (album art) by default; 3:4 for a book jacket. */
  shape?: "square" | "portrait";
  /** Shown as a hover/focus-revealed overlay — "read" for a book,
   * omitted for a plain click-to-open cover like an album's. */
  actionLabel?: string;
  onClick?: () => void;
}

export function CoverArt({ src, alt, shape = "square", actionLabel, onClick }: CoverArtProps) {
  const image = (
    <>
      <img alt={alt} className={shape === "portrait" ? "cover-art is-portrait" : "cover-art"} src={src} />
      {actionLabel && (
        <span aria-hidden="true" className="cover-art-label">
          {actionLabel}
        </span>
      )}
    </>
  );

  // A cover with nothing to do on click isn't a button — it's just a
  // picture.
  if (!onClick) return <div className="cover-art-button">{image}</div>;
  return (
    <button className="cover-art-button" onClick={onClick} type="button">
      {image}
    </button>
  );
}
