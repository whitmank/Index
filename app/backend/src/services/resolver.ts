// Authored by Karter Whitman using Claude Opus 4.8
// Resource uri → bytes. A uri is `<device>://<absolute path>` for a
// machine, or an ordinary http(s) url for the world computer. Nothing
// here takes custody of anything: resolving is reading a path that
// already exists.
//
// [pinned here] Remote-device network fetch is out of v1 (PRODUCT-SPEC
// §2.4). A device id resolves only if the config maps it to a mounted
// path prefix; anything else is unreachable, and unreachable is a 404 the
// renderer draws a placeholder for.
import fs from "node:fs";
import path from "node:path";
import { deviceOf } from "@index/database";
import { loadDeviceConfig, selfDevice } from "../config.js";

export interface LocalResource {
  kind: "file";
  filepath: string;
}

export interface WebResource {
  kind: "web";
  url: string;
}

export type Resolved = LocalResource | WebResource;

/** The absolute path inside a `<device>://<path>` uri. */
function pathOf(uri: string): string {
  const separator = uri.indexOf("://");
  const rest = separator === -1 ? uri : uri.slice(separator + 3);
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function resolve(uri: string): Resolved | null {
  const device = deviceOf(uri);
  if (device === "web") return { kind: "web", url: uri };

  const absolute = pathOf(uri);

  if (device === selfDevice()) return { kind: "file", filepath: absolute };

  const mount = loadDeviceConfig().mounts[device];
  if (mount) return { kind: "file", filepath: path.join(mount, absolute) };

  return null;
}

/** The local file behind a uri, if there is one and it exists. The
 * derivation services need the path itself, not a stream. */
export function resolveExistingFile(uri: string): string | null {
  const resolved = resolve(uri);
  if (resolved?.kind !== "file") return null;
  return fs.existsSync(resolved.filepath) ? resolved.filepath : null;
}

export function isLocalUri(uri: string): boolean {
  return resolve(uri)?.kind === "file";
}
