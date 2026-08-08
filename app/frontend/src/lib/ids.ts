// Authored by Karter Whitman using Claude Opus 4.8
// ULID minting, mirrored client-side. The renderer needs an id *before*
// the write lands — the store applies optimistically — so it cannot wait
// for the database to mint one. Deliberately a mirror rather than an
// import: the frontend takes only types from @index/database (see
// ARCHITECTURE), so nothing of that package reaches this bundle.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_CHARS = 16;

export function ulid(now = Date.now()): string {
  let time = "";
  let remaining = now;
  for (let index = 0; index < TIME_CHARS; index += 1) {
    time = CROCKFORD[remaining % 32] + time;
    remaining = Math.floor(remaining / 32);
  }

  const bytes = new Uint8Array(RANDOM_CHARS);
  crypto.getRandomValues(bytes);
  let random = "";
  for (const byte of bytes) random += CROCKFORD[byte % 32];

  return time + random;
}

export function itemId(): string {
  return `items:${ulid()}`;
}

export function connectionId(): string {
  return `connections:${ulid()}`;
}
