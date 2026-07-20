// Authored by Karter Whitman using Claude Opus 4.8
// The layout registry and the presentation cascade (DESIGN-CONCEPT §5,
// PRODUCT-SPEC §3.6).
//
// A layout arranges the screen: its shape, which fields and labelled
// arrows it claims into dedicated slots, whether the editing surface
// shows. It never picks the renderer — that is always the format's job.
//
// Tagging something "movie" *is* the user experience of choosing its
// layout: one action, and inference does the rest. The `opens` override
// exists only to record disagreement.
import type { Item } from "@index/database/types";
import type { ReactNode } from "react";

export interface Claimed {
  /** Fields the layout asked for, in the order it asked. */
  fields: { name: string; value: string }[];
  /** Labelled connections the layout asked for, by label name. */
  connections: { label: string; targetId: string; targetName: string }[];
}

export interface LayoutProps {
  item: Item;
  /** The renderer's output — the content slot. */
  content: ReactNode;
  /** The editing surface. */
  editor: ReactNode;
  /** What this layout asked to be handed separately. */
  claimed: Claimed;
}

export interface LayoutEntry {
  /** Field names this layout pulls out of the generic list. */
  fields?: string[];
  /** Label names this layout pulls out of the generic chips. */
  labels?: string[];
  /** Whether the editing surface starts collapsed behind an affordance. */
  quietEditor?: boolean;
  Component: (props: LayoutProps) => ReactNode;
}

function ClaimedBlock({ claimed }: { claimed: Claimed }) {
  if (claimed.fields.length === 0 && claimed.connections.length === 0) return null;
  return (
    <dl className="claimed">
      {claimed.connections.map((connection) => (
        <div key={`${connection.label}${connection.targetId}`}>
          <dt>{connection.label}</dt>
          <dd>{connection.targetName}</dd>
        </div>
      ))}
      {claimed.fields.map((field) => (
        <div key={field.name}>
          <dt>{field.name}</dt>
          <dd>{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Single column: content, then the editor below it. */
function DefaultLayout({ content, editor, claimed }: LayoutProps) {
  return (
    <div className="layout layout-default">
      <div className="layout-content">{content}</div>
      <ClaimedBlock claimed={claimed} />
      <div className="layout-editor">{editor}</div>
    </div>
  );
}

/** Two columns, with the claimed statements given their own block. */
function TwoColumnLayout({ content, editor, claimed }: LayoutProps) {
  return (
    <div className="layout layout-two-column">
      <div className="layout-content">{content}</div>
      <div className="layout-side">
        <ClaimedBlock claimed={claimed} />
        <div className="layout-editor">{editor}</div>
      </div>
    </div>
  );
}

/** Content only; the editor waits behind an affordance. */
function NoteLayout({ content, editor, claimed }: LayoutProps) {
  return (
    <div className="layout layout-note">
      <div className="layout-content">{content}</div>
      <ClaimedBlock claimed={claimed} />
      <details className="layout-editor-fold">
        <summary>edit</summary>
        <div className="layout-editor">{editor}</div>
      </details>
    </div>
  );
}

/** Full-width player, editor below. */
function VideoLayout({ content, editor, claimed }: LayoutProps) {
  return (
    <div className="layout layout-video">
      <div className="layout-content is-wide">{content}</div>
      <ClaimedBlock claimed={claimed} />
      <div className="layout-editor">{editor}</div>
    </div>
  );
}

export const layouts: Record<string, LayoutEntry> = {
  default: { Component: DefaultLayout },
  movie: {
    fields: ["year"],
    labels: ["author", "director"],
    Component: TwoColumnLayout,
  },
  photo: { fields: ["exif"], Component: TwoColumnLayout },
  note: { quietEditor: true, Component: NoteLayout },
  video: { Component: VideoLayout },
};

export interface Resolution {
  key: string;
  entry: LayoutEntry;
  /** Where the choice came from — the opens-as chip says which. */
  source: "override" | "tag" | "default";
  /** The tag that would be chosen if there were no override. */
  inferred: string | null;
}

/**
 * The cascade: an explicit `opens` wins; else the first tag (by the
 * arrow's `created_at`) whose name names a layout; else `default`.
 *
 * `tags` must arrive oldest-first — the order the arrows were made.
 */
export function resolveLayout(item: Item, tags: { name: string }[]): Resolution {
  const inferred = tags.find((tag) => tag.name in layouts)?.name ?? null;

  if (item.opens && item.opens in layouts) {
    const entry = layouts[item.opens];
    if (entry) return { key: item.opens, entry, source: "override", inferred };
  }

  if (inferred) {
    const entry = layouts[inferred];
    if (entry) return { key: inferred, entry, source: "tag", inferred };
  }

  return { key: "default", entry: layouts.default as LayoutEntry, source: "default", inferred };
}
