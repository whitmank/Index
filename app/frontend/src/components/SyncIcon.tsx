// Authored by Karter Whitman using Claude Sonnet 5
// The mark the "refetch" verb wears: two arrows chasing each other around
// a circle, the ordinary sense of "go get this again" — outline strokes in
// currentColor like every other glyph here (ParseIcon, DeviceIcon), so it
// takes hover and disabled ink the way text does.
export function SyncIcon() {
  return (
    <svg
      aria-hidden="true"
      className="sync-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.6"
      viewBox="0 0 24 24"
    >
      <path d="M4 12a8 8 0 0 1 13.66-5.66L20 8.5" />
      <path d="M20 4v4.5h-4.5" />
      <path d="M20 12a8 8 0 0 1-13.66 5.66L4 15.5" />
      <path d="M4 20v-4.5h4.5" />
    </svg>
  );
}
