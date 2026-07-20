// Authored by Karter Whitman using Claude Opus 4.8
// A temporary surface that exercises phase 2's done-when from the
// renderer: apply a change and read it back, stream a local photo over
// `res://`, and make `thumb://` mint a cache file. Phase 3 replaces it
// with the real debug panel (which stays behind a dev flag forever); it
// exists now so the bridge can be proved without typing into devtools.
//
// Set INDEX_SAMPLE_IMAGE to an absolute path to see the protocols work.
import { useEffect, useState } from "react";
import type { Item, Resource } from "@index/database/types";

const HOME_SET_ID = "items:⟨~⟩";

// The renderer mints ids so the store can apply optimistically, before
// the write lands. Phase 3 gives this a proper home in `changes/`.
function ulid(): string {
  const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let time = "";
  let remaining = Date.now();
  for (let index = 0; index < 10; index += 1) {
    time = crockford[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }
  return time + [...bytes].map((byte) => crockford[byte % 32]).join("");
}

function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

interface Report {
  lines: string[];
  imageUri: string | null;
}

async function run(samplePath: string | null): Promise<Report> {
  const lines: string[] = [];
  let imageUri: string | null = null;

  let attached: Resource[] = [];
  if (samplePath) {
    const intake = await window.index.intake.pathsToResources([samplePath]);
    if ("err" in intake) {
      lines.push(`intake failed: ${intake.err}`);
    } else {
      attached = intake.ok.resources;
      const resource = attached[0];
      if (resource) {
        imageUri = resource.uri;
        lines.push(`intake → ${resource.uri}`);
        lines.push(`derivations → ${Object.keys(resource.cached ?? {}).join(", ") || "none"}`);
      }
    }
  }

  const item: Item = {
    id: `items:${ulid()}`,
    name: "bridge check",
    display_name: null,
    date: today(),
    created_at: new Date().toISOString(),
    opens: null,
    query: null,
    system: false,
    fields: [],
    resources: attached,
    deleted_at: null,
  };

  const applied = await window.index.changes.apply({
    description: "Create item (bridge check)",
    pairs: [{ before: null, after: item }],
  });
  lines.push("err" in applied ? `apply failed: ${applied.err}` : `applied → ${applied.ok.records.length} record(s)`);

  const members = await window.index.sets.members(HOME_SET_ID, { partition: { date: today() } });
  if ("err" in members) {
    lines.push(`members failed: ${members.err}`);
  } else {
    const found = members.ok.items.find((member) => member.id === item.id);
    lines.push(`read back → ${found ? `"${found.name}" on ${found.date}` : "NOT FOUND"}`);
  }

  const undone = await window.index.changes.apply({
    description: "Undo the bridge check",
    pairs: [{ before: item, after: null }],
  });
  lines.push("err" in undone ? `undo failed: ${undone.err}` : "undone → the check leaves nothing behind");

  if (imageUri) {
    for (const [scheme, url] of [
      ["res", window.index.url.res(imageUri)],
      ["thumb", window.index.url.thumb(imageUri)],
    ] as const) {
      try {
        const response = await fetch(url);
        const bytes = (await response.blob()).size;
        lines.push(`${scheme}:// → ${response.status}, ${bytes} bytes`);
      } catch (error) {
        lines.push(`${scheme}:// threw: ${String(error)}`);
      }
    }
  }

  return { lines, imageUri };
}

export function BridgeCheck({ samplePath }: { samplePath: string | null }) {
  const [report, setReport] = useState<Report | null>(null);

  useEffect(() => {
    run(samplePath).then(
      (result) => {
        for (const line of result.lines) console.log(`bridge check: ${line}`);
        setReport(result);
      },
      (error: unknown) => {
        setReport({ lines: [`threw: ${String(error)}`], imageUri: null });
      },
    );
  }, [samplePath]);

  if (!report) return <p className="check-line">checking the bridge…</p>;

  return (
    <div className="check">
      {report.lines.map((line) => (
        <p className="check-line" key={line}>
          {line}
        </p>
      ))}
      {report.imageUri && (
        <div className="check-images">
          <figure>
            <img alt="over res://" src={window.index.url.res(report.imageUri)} />
            <figcaption>res://</figcaption>
          </figure>
          <figure>
            <img alt="over thumb://" src={window.index.url.thumb(report.imageUri)} />
            <figcaption>thumb://</figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
