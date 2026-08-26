// Authored by Karter Whitman using Claude Sonnet 5
// The promise side of the item-creation card (components/ItemIntakeCard.tsx):
// turns a modal a user might dismiss into an awaitable answer, so
// lib/intake.ts's `captureFromPaths` and `createBlankItemInteractive` can
// `await prompt(mode)` without knowing anything about React state.
import { useCallback, useRef, useState } from "react";
import type { ItemCardAnswer, ItemCardMode, ItemCardPrompt } from "../lib/intake.js";

export interface ItemCard {
  /** The mode currently up for the card, or null when it should not be
   * shown. */
  pending: ItemCardMode | null;
  /** Handed to `captureFromPaths`/`createBlankItemInteractive` as their
   * `ItemCardPrompt`. */
  prompt: ItemCardPrompt;
  /** The card's own submit: an answer, possibly both fields empty. */
  submit: (answer: ItemCardAnswer) => void;
  /** The card's own cancel: aborts the creation entirely. */
  cancel: () => void;
}

export function useItemCard(): ItemCard {
  const [pending, setPending] = useState<ItemCardMode | null>(null);
  const resolveRef = useRef<((answer: ItemCardAnswer | null) => void) | null>(null);

  const prompt = useCallback<ItemCardPrompt>(
    (mode) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setPending(mode);
      }),
    [],
  );

  const settle = useCallback((answer: ItemCardAnswer | null) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setPending(null);
  }, []);

  return {
    pending,
    prompt,
    submit: (answer) => settle(answer),
    cancel: () => settle(null),
  };
}
