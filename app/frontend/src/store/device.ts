// Authored by Karter Whitman using Claude Sonnet 5
// This machine's own device id — fetched once and cached module-wide,
// the same spirit as viewMode.ts's read of localStorage: a value every
// resource row needs (to tell "on this device" from "on some other,
// mounted one") but that never changes over a session, so one fetch
// serves every mount rather than each asking the bridge on its own.
import { useEffect, useState } from "react";

let cached: string | null = null;
let pending: Promise<string> | null = null;

function fetchSelf(): Promise<string> {
  if (cached !== null) return Promise.resolve(cached);
  if (!pending) {
    pending = window.index.device.self().then((answer) => {
      // A device id absent or unreadable is not fatal — deviceOf still
      // has a uri's scheme to fall back on, just without a "this
      // machine" fact to compare it against.
      cached = "ok" in answer ? answer.ok.id : "";
      return cached;
    });
  }
  return pending;
}

/** Null until the fetch resolves; empty string if it failed. */
export function useSelfDevice(): string | null {
  const [id, setId] = useState(cached);
  useEffect(() => {
    if (cached !== null) return;
    void fetchSelf().then(setId);
  }, []);
  return id;
}
