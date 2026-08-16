// Authored by Karter Whitman using Claude Sonnet 5
// The promise side of the "What is this?" prompt
// (components/DescribeCapture.tsx): turns a modal a user might dismiss
// into an awaitable answer, so lib/intake.ts's `captureFromPaths` can
// `await describe(resource)` without knowing anything about React state.
import { useCallback, useRef, useState } from "react";
import type { Resource } from "@index/database/types";
import type { DescribePrompt } from "../lib/intake.js";

export interface CapturePrompt {
  /** The resource currently up for description, or null when the modal
   * should not be shown. */
  pending: Resource | null;
  /** Handed to `captureFromPaths` as its `DescribePrompt`. */
  describe: DescribePrompt;
  /** The modal's own submit: a description, possibly empty. */
  submit: (description: string) => void;
  /** The modal's own cancel: aborts the capture entirely. */
  cancel: () => void;
}

export function useCapturePrompt(): CapturePrompt {
  const [pending, setPending] = useState<Resource | null>(null);
  const resolveRef = useRef<((answer: string | null) => void) | null>(null);

  const describe = useCallback<DescribePrompt>(
    (resource) =>
      new Promise((resolve) => {
        resolveRef.current = resolve;
        setPending(resource);
      }),
    [],
  );

  const settle = useCallback((answer: string | null) => {
    resolveRef.current?.(answer);
    resolveRef.current = null;
    setPending(null);
  }, []);

  return {
    pending,
    describe,
    submit: (description) => settle(description),
    cancel: () => settle(null),
  };
}
