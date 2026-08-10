// Authored by Karter Whitman using Claude Opus 4.8
// An epub: its cover, and a reader you can page through. epubjs wants the
// whole file, so the resource is fetched over `res://` as an ArrayBuffer
// and handed over — nothing is copied anywhere, and the book stays where
// it lives on disk.
import { useCallback, useEffect, useRef, useState } from "react";
import ePub, { type Book, type Rendition } from "epubjs";
import { CoverArt } from "../components/CoverArt.tsx";
import type { RendererProps } from "./registry.tsx";

type State = "loading" | "cover" | "reading" | "missing";

export function BookRenderer({ item, resource }: RendererProps) {
  const uri = resource.uri;

  const [state, setState] = useState<State>("loading");
  const [cover, setCover] = useState<string | null>(null);
  const book = useRef<Book | null>(null);
  const rendition = useRef<Rendition | null>(null);
  const surface = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    void (async () => {
      try {
        const response = await fetch(window.index.url.res(uri));
        if (!response.ok) throw new Error(String(response.status));
        const opened = ePub(await response.arrayBuffer());
        if (cancelled) return;
        book.current = opened;

        const coverUrl = await opened.coverUrl();
        if (cancelled) return;
        objectUrl = coverUrl ?? null;
        setCover(coverUrl ?? null);
        setState("cover");
      } catch {
        if (!cancelled) setState("missing");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      rendition.current?.destroy();
      rendition.current = null;
      book.current?.destroy();
      book.current = null;
    };
  }, [uri]);

  const startReading = useCallback(() => {
    const opened = book.current;
    const target = surface.current;
    if (!opened || !target) return;
    setState("reading");
    // The surface only exists once `reading` has rendered, so hand the
    // render off after this commit.
    queueMicrotask(() => {
      if (!surface.current) return;
      rendition.current = opened.renderTo(surface.current, {
        width: "100%",
        height: "100%",
        spread: "none",
      });
      void rendition.current.display();
    });
  }, []);

  if (state === "loading") return <p className="renderer-quiet">opening…</p>;
  if (state === "missing") {
    return <p className="renderer-missing">this book isn’t where it used to be</p>;
  }

  if (state === "cover") {
    return cover ? (
      <CoverArt actionLabel="read" alt={item.name} onClick={startReading} shape="portrait" src={cover} />
    ) : (
      <button className="book-cover-fallback" onClick={startReading} type="button">
        {item.name || resource.name}
      </button>
    );
  }

  return (
    <div className="renderer-book">
      <div className="renderer-book-surface" ref={surface} />
      <div className="renderer-book-controls">
        <button onClick={() => void rendition.current?.prev()} type="button">
          ‹
        </button>
        <button onClick={() => void rendition.current?.next()} type="button">
          ›
        </button>
      </div>
    </div>
  );
}
