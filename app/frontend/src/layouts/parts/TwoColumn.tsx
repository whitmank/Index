// Authored by Karter Whitman using Claude Sonnet 5
// Content beside a side column (claimed connections, then the editor) —
// Movie's and Photo's shape, and Album's too: an album's "content" is a
// cover above a tracklist rather than one centered thing, which is all
// `stackContent` changes.
import type { ReactNode } from "react";
import type { ClaimedConnection } from "../registry.tsx";
import { ClaimedConnections } from "./ClaimedConnections.tsx";

export interface TwoColumnProps {
  content: ReactNode;
  editor: ReactNode;
  connections: ClaimedConnection[];
  /** Album: the content slot holds more than one thing stacked
   * vertically (a cover, then a list) rather than one centered thing. */
  stackContent?: boolean;
}

export function TwoColumn({ content, editor, connections, stackContent }: TwoColumnProps) {
  return (
    <div className="layout layout-two-column">
      <div className={stackContent ? "layout-content is-stacked" : "layout-content"}>{content}</div>
      <div className="layout-side">
        <ClaimedConnections connections={connections} />
        <div className="layout-editor">{editor}</div>
      </div>
    </div>
  );
}
