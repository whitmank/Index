// Authored by Karter Whitman using Claude Opus 5
// An Item's attached sources, turned into evidence — step 2 of the spec's
// lifecycle, and the only place in the module that touches a resource.
//
// Everything downstream reads `SourceEvidence` and never a uri, which is
// what lets the whole pipeline be tested against sources built in a temp
// directory, and what will let it later be handed evidence that was
// collected elsewhere entirely.
import type { Item } from "@index/database/types";
import type { ModelingWarning } from "../contracts/warnings.js";
import { readSource } from "./read-source.js";
import type { SourceEvidence } from "./source-evidence.js";
import type { SourceGateway } from "./source-resolution.js";

export interface EvidenceRequest {
  gateway: SourceGateway;
  maxSources: number;
  maxSourceTextLength: number;
  allowNetworkAccess: boolean;
}

export interface CollectedEvidence {
  sources: SourceEvidence[];
  warnings: ModelingWarning[];
  attached: number;
  skipped: number;
  bytes: number;
  truncated: boolean;
}

/**
 * Read what is attached, in order, and say what could not be read.
 *
 * Every failure here is survivable and none of them stop the run: a
 * source that will not open produces a warning and the others are still
 * read. The distinction the spec draws is between *this* — incomplete but
 * successful — and a run where nothing at all could be read, which is the
 * caller's cue to fail (`no-evidence`) rather than return an Item filled
 * in from nothing.
 *
 * Sources are read in parallel because they are independent, and capped
 * because a pathological item should not be able to make one call
 * unbounded. The cap takes the *first* `maxSources`, since
 * `resources[0]` is primary and a long tail is rarely about the work.
 */
export async function collectItemEvidence(
  item: Item,
  request: EvidenceRequest,
): Promise<CollectedEvidence> {
  const resources = item.resources ?? [];
  const considered = resources.slice(0, request.maxSources);
  const warnings: ModelingWarning[] = [];

  if (resources.length > considered.length) {
    warnings.push({
      code: "sources-capped",
      message: `${resources.length} sources attached; read the first ${considered.length}`,
    });
  }

  const read = await Promise.all(
    considered.map((resource, position) =>
      readSource({
        uri: resource.uri,
        name: resource.name,
        position,
        gateway: request.gateway,
        maxTextLength: request.maxSourceTextLength,
        allowNetworkAccess: request.allowNetworkAccess,
      }).catch(() => null),
    ),
  );

  const sources: SourceEvidence[] = [];
  read.forEach((source, position) => {
    const resource = considered[position];
    if (!source) {
      warnings.push({
        code: "source-unreadable",
        sourceId: `s${position}:${resource?.uri ?? ""}`,
        message: `could not read '${resource?.name ?? resource?.uri ?? "source"}'`,
      });
      return;
    }
    sources.push(source);
    if (source.truncated) {
      warnings.push({
        code: "source-truncated",
        sourceId: source.sourceId,
        message: `'${source.name}' is larger than the read limit; only part of it was examined`,
      });
    }
  });

  return {
    sources,
    warnings,
    attached: resources.length,
    skipped: resources.length - sources.length,
    bytes: sources.reduce((total, source) => total + source.head.length, 0),
    truncated: sources.some((source) => source.truncated),
  };
}

/**
 * The identity of the whole evidence set, for the run fingerprint.
 * Order-independent, so re-ordering resources without changing them does
 * not read as new content — the ordering matters to *priority*, and that
 * is fingerprinted separately as part of the options.
 */
export function evidenceFingerprint(sources: SourceEvidence[]): string {
  return sources
    .map((source) => source.fingerprint)
    .sort()
    .join("-");
}
