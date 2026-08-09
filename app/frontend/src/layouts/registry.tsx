// Authored by Karter Whitman using Claude Sonnet 5
// The layout registry and the presentation cascade (DESIGN-CONCEPT §5,
// PRODUCT-SPEC §3.6), extended with a third inference source: a type's
// schema (database/records/schemas.ts). A layout arranges the screen —
// its shape, which fields and labelled arrows it claims into dedicated
// slots, whether the editing surface shows. It never picks the renderer
// — that is always the format's job.
//
// Tagging something "movie" *is* the user experience of choosing its
// layout: one action, and inference does the rest. Classifying something
// "book" now does the same, through data (a schemas row) instead of a
// code file per type — see KnownFields below. The `opens` override
// exists only to record disagreement with either.
import type { Field, Item, Schema } from "@index/database/types";
import type { ReactNode } from "react";
import { apply, changes } from "../changes/index.js";
import { SettleInput } from "../components/SettleInput.tsx";

export interface ClaimedConnection {
  label: string;
  targetId: string;
  targetName: string;
}

export interface LayoutProps {
  item: Item;
  /** The renderer's output — the content slot. */
  content: ReactNode;
  /** The editing surface: name, known fields, the rest, sources, tags. */
  editor: ReactNode;
  /** Labelled connections the layout asked for — read-only display here;
   * retargeting happens through the connection composer below. */
  connections: ClaimedConnection[];
}

export interface LayoutEntry {
  /** Field names this layout pulls out of the generic list into their
   * own always-present, editable rows. */
  fields?: string[];
  /** Label names this layout pulls out of the generic chips. */
  labels?: string[];
  Component: (props: LayoutProps) => ReactNode;
}

function upsertByName(fields: Field[], name: string, value: string): Field[] {
  const at = fields.findIndex((field) => field.name.toLowerCase() === name.toLowerCase());
  if (at === -1) return [...fields, { name, value, kind: "string" }];
  return fields.map((field, index) => (index === at ? { ...field, value } : field));
}

/**
 * A layout's own recognized fields — dedicated, always-present rows
 * (whether or not the item has them yet), matching a schema's or code
 * layout's declared field list. Editing a still-empty row creates the
 * real field on first commit (upsert by name); editing an existing one
 * updates it in place. Unlike the generic FieldsEditor, names here
 * aren't user-editable and there's no add/remove — the layout itself is
 * what decides which rows exist.
 */
export function KnownFields({ item, names }: { item: Item; names: string[] }) {
  if (names.length === 0) return null;
  return (
    <ul className="fields-list fields-list-unlabeled">
      {names.map((name) => {
        const field = item.fields.find((candidate) => candidate.name.toLowerCase() === name.toLowerCase());
        return (
          <li className="fields-row" key={name}>
            <span className="known-fields-name">{name}</span>
            <SettleInput
              ariaLabel={name}
              className="fields-value-input"
              onCommit={(value) =>
                void apply(changes.setFields(item, upsertByName(item.fields, name, value)))
              }
              placeholder="value"
              value={field?.value ?? ""}
            />
          </li>
        );
      })}
    </ul>
  );
}

function ClaimedConnections({ connections }: { connections: ClaimedConnection[] }) {
  if (connections.length === 0) return null;
  return (
    <dl className="claimed">
      {connections.map((connection) => (
        <div key={`${connection.label}${connection.targetId}`}>
          <dt>{connection.label}</dt>
          <dd>{connection.targetName}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Single column: content, then the editor below it. */
function DefaultLayout({ content, editor, connections }: LayoutProps) {
  return (
    <div className="layout layout-default">
      <div className="layout-content">{content}</div>
      <ClaimedConnections connections={connections} />
      <div className="layout-editor">{editor}</div>
    </div>
  );
}

/** Two columns: content beside a metadata column — what a schema-typed
 * item, or a tagged movie/photo, gets. */
function TwoColumnLayout({ content, editor, connections }: LayoutProps) {
  return (
    <div className="layout layout-two-column">
      <div className="layout-content">{content}</div>
      <div className="layout-side">
        <ClaimedConnections connections={connections} />
        <div className="layout-editor">{editor}</div>
      </div>
    </div>
  );
}

/** Content only; the editor waits behind an affordance. */
function NoteLayout({ content, editor, connections }: LayoutProps) {
  return (
    <div className="layout layout-note">
      <div className="layout-content">{content}</div>
      <ClaimedConnections connections={connections} />
      <details className="layout-editor-fold">
        <summary>edit</summary>
        <div className="layout-editor">{editor}</div>
      </details>
    </div>
  );
}

/** Full-width player, editor below. */
function VideoLayout({ content, editor, connections }: LayoutProps) {
  return (
    <div className="layout layout-video">
      <div className="layout-content is-wide">{content}</div>
      <ClaimedConnections connections={connections} />
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
  note: { Component: NoteLayout },
  video: { Component: VideoLayout },
};

export interface Resolution {
  key: string;
  entry: LayoutEntry;
  /** Where the choice came from — the opens-as chip says which. */
  source: "override" | "tag" | "type" | "default";
  /** The tag that would be chosen if there were no override. */
  inferred: string | null;
}

/**
 * The cascade: an explicit `opens` wins; else the first tag (by the
 * arrow's `created_at`) whose name names a code layout; else — new —
 * the item's classified `type`, if it names a schema with fields, gets
 * a two-column layout built from that schema's field list; else
 * `default`.
 *
 * `tags` must arrive oldest-first — the order the arrows were made.
 */
export function resolveLayout(item: Item, tags: { name: string }[], schemas: Schema[]): Resolution {
  const inferred = tags.find((tag) => tag.name in layouts)?.name ?? null;

  if (item.opens && item.opens in layouts) {
    const entry = layouts[item.opens];
    if (entry) return { key: item.opens, entry, source: "override", inferred };
  }

  if (inferred) {
    const entry = layouts[inferred];
    if (entry) return { key: inferred, entry, source: "tag", inferred };
  }

  if (item.type) {
    const schema = schemas.find((candidate) => candidate.name === item.type);
    if (schema && schema.fields.length > 0) {
      return {
        key: item.type,
        entry: { fields: schema.fields.map((field) => field.name), Component: TwoColumnLayout },
        source: "type",
        inferred,
      };
    }
  }

  return { key: "default", entry: layouts.default as LayoutEntry, source: "default", inferred };
}
