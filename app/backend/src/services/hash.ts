// Authored by Karter Whitman using Claude Sonnet 5
// Content hashing for relocation (services/relink.ts): a resource's
// identity independent of where it currently sits. Streamed, not
// `readFileSync`'d — this runs in the Electron main process, and a
// synchronous read of a large book or video would stall every window's
// IPC and the hotkey for as long as it took.
import crypto from "node:crypto";
import fs from "node:fs";

export function sha256File(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filepath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
