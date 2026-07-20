// Authored by Karter Whitman using Claude Opus 4.8
// The resources list: ordered pointers, first is primary — which is what
// decides the item's format, and so its renderer. Adding one is a file
// dialog or a pasted url; both go through intake, which stamps the uri
// and fetches the derivations before the change is built.
//
// Nothing here copies bytes. Adding a file is recording where it already
// is.
import { useState } from "react";
import type { Item } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { SettleInput } from "../../components/SettleInput.tsx";
import { deviceOf } from "../../lib/derive.js";
import { errors } from "../../store/index.js";

export function ResourcesEditor({ item }: { item: Item }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const attach = async (inputs: string[]): Promise<void> => {
    if (inputs.length === 0) return;
    setBusy(true);
    try {
      const answer = await window.index.intake.pathsToResources(inputs);
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      // One change per resource keeps each undoable on its own.
      for (const resource of answer.ok.resources) {
        await apply(changes.addResource(item, resource));
      }
    } finally {
      setBusy(false);
    }
  };

  const pick = async (): Promise<void> => {
    setBusy(true);
    try {
      const answer = await window.index.intake.pick();
      if ("err" in answer) {
        errors.surface(answer.err);
        return;
      }
      for (const resource of answer.ok.resources) {
        await apply(changes.addResource(item, resource));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="editor-block">
      <h3>resources</h3>

      <ul className="resources">
        {item.resources.map((resource, index) => (
          <li className="resource-row" key={resource.uri}>
            {index === 0 ? (
              <span className="chip is-primary" title="the primary resource decides the format">
                primary
              </span>
            ) : (
              <button
                className="resource-promote"
                onClick={() => void apply(changes.reorderResources(item, index, 0))}
                title="make primary"
                type="button"
              >
                ↑
              </button>
            )}

            <span className="resource-name" title={resource.uri}>
              {resource.name}
            </span>
            <span className="chip">{deviceOf(resource.uri)}</span>

            <button
              onClick={() => {
                const local = deviceOf(resource.uri) !== "web";
                const answer = local
                  ? window.index.shell.reveal(resource.uri)
                  : window.index.shell.openExternal(resource.uri);
                void answer.then((result) => {
                  if ("err" in result) errors.surface(result.err);
                });
              }}
              type="button"
            >
              {deviceOf(resource.uri) === "web" ? "open" : "reveal"}
            </button>

            <button
              aria-label={`remove ${resource.name}`}
              onClick={() => void apply(changes.removeResource(item, index))}
              type="button"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="resource-add">
        <button disabled={busy} onClick={() => void pick()} type="button">
          add a file…
        </button>
        <SettleInput
          ariaLabel="paste a url"
          onCommit={(next) => {
            const trimmed = next.trim();
            if (!trimmed) return;
            setUrl("");
            void attach([trimmed]);
          }}
          placeholder="or paste a url"
          value={url}
        />
      </div>
    </section>
  );
}
