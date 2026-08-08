// Authored by Karter Whitman using Claude Opus 4.8
// ⌘Z / ⇧⌘Z, suppressed while focus is in a text input — native editing
// owns undo there, and taking it away would make typing feel broken
// (PRODUCT-SPEC §3.2, §3.7).
import { useEffect } from "react";
import { redo, undo } from "../changes/index.js";

const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "email",
  "password",
  "tel",
  "number",
  "date",
]);

/** True when the keystroke belongs to whatever the user is typing in. */
export function isEditing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return TEXT_INPUT_TYPES.has(target.type);
  return false;
}

export function useUndoRedo(): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== "z") return;
      if (isEditing(event.target)) return;

      event.preventDefault();
      void (event.shiftKey ? redo() : undo());
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
