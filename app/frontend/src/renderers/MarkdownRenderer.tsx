// Authored by Karter Whitman using Claude Opus 4.8
// Markdown fetched over `res://` and rendered at a reading measure.
// Everything marked produces goes through DOMPurify before it reaches
// the DOM: the file is the user's own, but it is still a file on disk
// that Index did not write, and `dangerouslySetInnerHTML` deserves the
// name.
import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import type { RendererProps } from "./registry.tsx";

type State = { status: "loading" } | { status: "ready"; html: string } | { status: "missing" };

export function MarkdownRenderer({ item }: RendererProps) {
  const resource = item.resources[0];
  const uri = resource?.uri;
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (!uri) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(window.index.url.res(uri));
        if (!response.ok) throw new Error(String(response.status));
        const source = await response.text();
        const html = DOMPurify.sanitize(await marked.parse(source));
        if (!cancelled) setState({ status: "ready", html });
      } catch {
        if (!cancelled) setState({ status: "missing" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  if (!resource) return null;
  if (state.status === "loading") return <p className="renderer-quiet">reading…</p>;
  if (state.status === "missing") {
    return <p className="renderer-missing">this file isn’t where it used to be</p>;
  }

  return (
    <article
      className="renderer-markdown"
      // Sanitised immediately above; this is the one place in the app
      // that sets HTML it did not build.
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  );
}
