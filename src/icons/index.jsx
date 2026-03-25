// authored by Claude Sonnet 4.6
// Shared index icons — object, space, monad (object+space combined).
// All three share the same viewBox geometry so they are visually consistent
// wherever they appear. Import from here; no component owns these.

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
