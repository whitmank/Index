// Authored by Karter Whitman using Claude Opus 4.8
// Where a failed write goes. The store reverts the records; the message
// still has to reach a person, and the active view is who shows it
// (PRODUCT-SPEC §3.2).
type Listener = () => void;

export interface Trouble {
  id: number;
  message: string;
  at: number;
}

const listeners = new Set<Listener>();
let troubles: Trouble[] = [];
let nextId = 1;
let version = 0;

function announce(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getVersion(): number {
  return version;
}

export function surface(message: string): void {
  troubles = [...troubles, { id: nextId++, message, at: Date.now() }];
  announce();
}

export function dismiss(id: number): void {
  troubles = troubles.filter((trouble) => trouble.id !== id);
  announce();
}

export function current(): Trouble[] {
  return troubles;
}

export function clear(): void {
  troubles = [];
  announce();
}
