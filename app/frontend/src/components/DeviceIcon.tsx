// Authored by Karter Whitman using Claude Sonnet 5
// The mark a resource's location wears: a globe for the open web, a
// hard disk for the device you're on right now, a cloud for some other
// device this one merely reaches (a mount, a synced folder — visible
// but not present). One consistent outline style across the three, so
// they read as a set. Plain currentColor strokes, like every other
// glyph in the app (FORMAT_GLYPH, PLACE_GLYPH), so hover and ink-quiet
// states reach these the same way they reach text — an emoji couldn't
// take a `color` the same way.
import type { DeviceKind } from "../lib/derive.ts";

const COMMON = {
  "aria-hidden": "true",
  className: "device-icon",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: "1.8",
  viewBox: "0 0 24 24",
} as const;

export function DeviceIcon({ kind }: { kind: DeviceKind }) {
  if (kind === "web") {
    return (
      <svg {...COMMON}>
        <circle cx="12" cy="12" r="10" />
        <line x1="2" x2="22" y1="12" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z" />
      </svg>
    );
  }

  if (kind === "local") {
    return (
      <svg {...COMMON}>
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
        <line x1="2" x2="22" y1="12" y2="12" />
        <line x1="6" x2="6.01" y1="16" y2="16" />
        <line x1="10" x2="10.01" y1="16" y2="16" />
      </svg>
    );
  }

  return (
    <svg {...COMMON}>
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
}
