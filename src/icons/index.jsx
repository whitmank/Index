// authored by Claude Sonnet 4.6
// Shared index icons — object, space, monad (object+space combined), and typed icons.
// All share the same viewBox geometry so they are visually consistent wherever they appear.
// Import from here; no component owns these.

export function ObjectIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="2" r="1" fill="currentColor" />
    </svg>
  );
}

export function SpaceIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="2" r="1.618" stroke="currentColor" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Monad — outer ring (space) + inner dot (object): represents both simultaneously.
export function MonadIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="2" cy="2" r="1.618" stroke="currentColor" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
      <circle cx="2" cy="2" r="1" fill="currentColor" />
    </svg>
  );
}

// ── Type icons ────────────────────────────────────────────────────────────────
// Curated geometric shapes for type classification. Stored by key on tag_definitions.icon.

const TYPE_ICON_SHAPES = {
  dot: (
    <circle cx="2" cy="2" r="1" fill="currentColor" />
  ),
  ring: (
    <circle cx="2" cy="2" r="1.618" stroke="currentColor" strokeWidth="1" fill="none" vectorEffect="non-scaling-stroke" />
  ),
  square: (
    <rect x="1.2" y="1.2" width="1.6" height="1.6" fill="currentColor" />
  ),
  bar: (
    <rect x="0.7" y="1.65" width="2.6" height="0.7" fill="currentColor" />
  ),
  diamond: (
    <polygon points="2,0.8 3.2,2 2,3.2 0.8,2" fill="currentColor" />
  ),
  triangle: (
    <polygon points="2,0.8 3.2,3.3 0.8,3.3" fill="currentColor" />
  ),
  cross: (
    <>
      <rect x="0.7" y="1.7" width="2.6" height="0.6" fill="currentColor" />
      <rect x="1.7" y="0.7" width="0.6" height="2.6" fill="currentColor" />
    </>
  ),
  wave: (
    <path d="M 0.4,2 C 0.9,0.8 1.4,0.8 2,2 C 2.6,3.2 3.1,3.2 3.6,2" stroke="currentColor" strokeWidth="0.7" fill="none" vectorEffect="non-scaling-stroke" />
  ),
};

// Ordered list of valid icon keys — used by the picker.
export const TYPE_ICON_KEYS = ['dot', 'ring', 'square', 'bar', 'diamond', 'triangle', 'cross', 'wave'];

export function TypeIcon({ name, size = 12 }) {
  const shape = TYPE_ICON_SHAPES[name] ?? TYPE_ICON_SHAPES.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 4 4" fill="none" xmlns="http://www.w3.org/2000/svg">
      {shape}
    </svg>
  );
}
