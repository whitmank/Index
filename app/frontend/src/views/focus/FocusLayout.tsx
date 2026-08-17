// Authored by Karter Whitman using Claude Sonnet 5
// Focus's arrangement: content, then the editor below it. Purely
// presentational — no per-type logic lives here, and none should. Focus
// decides what a screen contains (identity, known fields, ordered
// children, connections, resources); this only decides where the two
// resulting bundles sit. Swapping in a different arrangement later is a
// one-line change at the render call site in Focus.tsx, not a change
// here or there.
import type { ReactNode } from "react";

export interface FocusLayoutProps {
  content: ReactNode;
  editor: ReactNode;
}

export function FocusLayout({ content, editor }: FocusLayoutProps) {
  return (
    <div className="layout layout-single">
      <div className="layout-content">{content}</div>
      <div className="layout-editor">{editor}</div>
    </div>
  );
}
