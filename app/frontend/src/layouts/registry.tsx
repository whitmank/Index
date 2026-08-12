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
// code file per type.
//
// This file is deliberately thin: the types below, the cascade, and the
// registry map. Every layout's own arrangement lives in its own file
// under types/, composed from the shared pieces under parts/ — a layout
// that needs a bespoke composition (AlbumLayout) has somewhere to write
// it; one that doesn't (Default, Note, Video, Movie, Photo) is a couple
// of lines.
import type { FieldKind, Item, Resource, Schema } from "@index/database/types";
import type { ReactNode } from "react";
import { youtubeId } from "../components/VideoEmbed.tsx";
import { TwoColumn } from "./parts/TwoColumn.tsx";
import { AlbumLayout } from "./types/AlbumLayout.tsx";
import { DefaultLayout } from "./types/DefaultLayout.tsx";
import { MovieLayout } from "./types/MovieLayout.tsx";
import { NoteLayout } from "./types/NoteLayout.tsx";
import { PhotoLayout } from "./types/PhotoLayout.tsx";
import { VideoLayout } from "./types/VideoLayout.tsx";

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

/** A layout's own field: its name, and the kind its value editor should
 * present as — `list` gets chips (ListValueInput), everything else a
 * single line (SettleInput). */
export interface KnownField {
  name: string;
  kind: FieldKind;
}

export interface LayoutEntry {
  /** Fields this layout pulls out of the generic list into their own
   * always-present, editable rows. */
  fields?: KnownField[];
  /** Label names this layout pulls out of the generic chips. */
  labels?: string[];
  /** Which resource the content carousel should open on, when there's
   * more than one — a layout's own domain knowledge (a movie prefers
   * its trailer over its IMDb page) the generic carousel-building code
   * in Focus.tsx doesn't have. Absent means "start on the primary
   * resource" — every layout's default. */
  preferredResource?: (resource: Resource) => boolean;
  Component: (props: LayoutProps) => ReactNode;
}

export const layouts: Record<string, LayoutEntry> = {
  default: { Component: DefaultLayout },
  movie: {
    fields: [{ name: "year", kind: "string" }],
    labels: ["author", "director"],
    // A movie's primary resource is often its IMDb or Wikipedia page —
    // the definitive record, not the thing to play — so the carousel
    // opens on whichever resource is actually a trailer instead.
    preferredResource: (resource) => Boolean(youtubeId(resource.uri)),
    Component: MovieLayout,
  },
  photo: { fields: [{ name: "exif", kind: "string" }], Component: PhotoLayout },
  note: { Component: NoteLayout },
  video: { Component: VideoLayout },
  album: { labels: ["track"], Component: AlbumLayout },
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
 * that schema's field list, in a code layout of the same name if one is
 * registered (album), or the generic two-column shape otherwise; else
 * `default`.
 *
 * The schema's own field list — when `item.type` names one — always
 * wins over whatever a code layout statically declares, regardless of
 * which branch above picked the *Component*. A field's presence is only
 * ever user-editable in one place (the type manager in Settings), so
 * KnownFields has to read the same list no matter how the arrangement
 * got chosen — an item resolved by an old `opens` value or a tag still
 * gets its type's real fields, not the empty list a code layout like
 * `album` declares for itself.
 *
 * `tags` must arrive oldest-first — the order the arrows were made.
 */
export function resolveLayout(item: Item, tags: { name: string }[], schemas: Schema[]): Resolution {
  const inferred = tags.find((tag) => tag.name in layouts)?.name ?? null;

  const schema = item.type ? schemas.find((candidate) => candidate.name === item.type) : undefined;
  // A type's first field is drawn already — as the item's name, at the
  // top of the panel — so drawing it again here would be two controls
  // editing one fact. `hidden` drops the rest a type would rather not
  // lead with; their values still reach the generic list below, which
  // takes whatever this block does not claim. Both filtered before the
  // length check, so a type with nothing left to lay out resolves the
  // same as one with no fields at all.
  const declared = schema?.fields.slice(1).filter((field) => !field.hidden) ?? [];
  const schemaFields: KnownField[] | undefined =
    declared.length > 0
      ? declared.map((field) => ({ name: field.name, kind: field.kind }))
      : undefined;

  if (item.opens && item.opens in layouts) {
    const entry = layouts[item.opens];
    if (entry) return { key: item.opens, entry: withFields(entry, schemaFields), source: "override", inferred };
  }

  if (inferred) {
    const entry = layouts[inferred];
    if (entry) return { key: inferred, entry: withFields(entry, schemaFields), source: "tag", inferred };
  }

  if (item.type && schemaFields) {
    // A type can also name a real code layout — "album" pulls its own
    // tracklist Component the same way "movie" does, rather than
    // settling for the generic two-column shape every other type gets.
    const named = layouts[item.type];
    return {
      key: item.type,
      entry: {
        fields: schemaFields,
        labels: named?.labels,
        preferredResource: named?.preferredResource,
        Component: named?.Component ?? TwoColumn,
      },
      source: "type",
      inferred,
    };
  }

  return { key: "default", entry: layouts.default as LayoutEntry, source: "default", inferred };
}

function withFields(entry: LayoutEntry, fields: KnownField[] | undefined): LayoutEntry {
  return fields ? { ...entry, fields } : entry;
}
