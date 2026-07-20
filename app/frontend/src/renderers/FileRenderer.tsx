// Authored by Karter Whitman using Claude Opus 4.8
// A file Index has no better idea about: say what it is, where it lives,
// and offer to hand it to whatever app owns it.
import { deviceOf } from "../lib/derive.js";
import { errors } from "../store/index.js";
import type { RendererProps } from "./registry.tsx";

export function FileRenderer({ item }: RendererProps) {
  const resource = item.resources[0];
  if (!resource) return null;

  const device = deviceOf(resource.uri);

  return (
    <div className="renderer-file">
      <span className="renderer-file-name">{resource.name}</span>
      <span className="chip">{device}</span>
      <button
        onClick={() => {
          void window.index.shell.openExternal(resource.uri).then((result) => {
            if ("err" in result) errors.surface(result.err);
          });
        }}
        type="button"
      >
        open externally
      </button>
    </div>
  );
}
