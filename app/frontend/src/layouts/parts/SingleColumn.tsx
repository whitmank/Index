// Authored by Karter Whitman using Claude Sonnet 5
// Content, then the editor below it — Default's shape, and Note's and
// Video's too (`fold`/`wide` are the only ways they differ, so they
// share this rather than each carrying its own copy of the same wrapper).
import type { ReactNode } from "react";
import type { ClaimedConnection } from "../registry.tsx";
import { ClaimedConnections } from "./ClaimedConnections.tsx";

export interface SingleColumnProps {
  content: ReactNode;
  editor: ReactNode;
  connections: ClaimedConnection[];
  /** Video: content spans full width instead of the usual measure. */
  wide?: boolean;
  /** Note: the editor waits behind a disclosure instead of showing outright. */
  fold?: boolean;
}

export function SingleColumn({ content, editor, connections, wide, fold }: SingleColumnProps) {
  const editorBlock = <div className="layout-editor">{editor}</div>;

  return (
    <div className="layout layout-single">
      <div className={wide ? "layout-content is-wide" : "layout-content"}>{content}</div>
      <ClaimedConnections connections={connections} />
      {fold ? (
        <details className="layout-editor-fold">
          <summary>edit</summary>
          {editorBlock}
        </details>
      ) : (
        editorBlock
      )}
    </div>
  );
}
