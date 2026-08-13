// Authored by Karter Whitman using Claude Opus 5
// The mark the `parse` verb wears: nodes with edges drawn between them —
// the same picture the app makes of a thing once it has been read, which
// is what the verb produces. Outline strokes in currentColor like every
// other glyph here (DeviceIcon, FORMAT_GLYPH), so it takes hover and
// disabled ink the way text does.
//
// Filled circles rather than outlined ones: at this size an outlined dot
// closes up into a smudge, and the nodes have to stay countable against
// the lines crossing behind them.
//
// The geometry is tuned for 18px and nothing else. Drawn first with fat
// dots on a tight grid, it rendered as a blob at true size and only came
// apart under magnification — so the nodes are smaller than they want to
// be, the strokes thinner, and the columns pushed to the edges of the
// box to buy every pixel of air there is.
const NODES = [
  { cx: 3.2, cy: 3.6 },
  { cx: 3.2, cy: 12 },
  { cx: 3.2, cy: 20.4 },
  { cx: 12, cy: 7.8 },
  { cx: 12, cy: 16.2 },
  { cx: 20.8, cy: 3.6 },
  { cx: 20.8, cy: 12 },
  { cx: 20.8, cy: 20.4 },
] as const;

/** Left column to middle, middle to right — every edge one of the two
 * middle nodes takes part in, which is what makes it read as a graph
 * being built rather than a decorative constellation. */
const EDGES = [
  [0, 3],
  [1, 3],
  [1, 4],
  [2, 4],
  [3, 5],
  [3, 6],
  [4, 6],
  [4, 7],
] as const;

export function ParseIcon() {
  return (
    <svg
      aria-hidden="true"
      className="parse-icon"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeWidth="1.1"
      viewBox="0 0 24 24"
    >
      {EDGES.map(([from, to]) => (
        <line
          key={`${from}-${to}`}
          x1={NODES[from].cx}
          x2={NODES[to].cx}
          y1={NODES[from].cy}
          y2={NODES[to].cy}
        />
      ))}
      {NODES.map((node) => (
        <circle cx={node.cx} cy={node.cy} fill="currentColor" key={`${node.cx}-${node.cy}`} r="1.7" stroke="none" />
      ))}
    </svg>
  );
}
