// Authored by Karter Whitman using Claude Opus 4.8
// A right-click menu, positioned at the pointer and dismissed by Escape,
// an outside click, or choosing something. Canvas and list share it, so
// the same gestures mean the same things in both (PRODUCT-SPEC §3.4).
import { useEffect, useRef, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  onChoose: () => void;
  /** Draws the entry as the destructive one. */
  danger?: boolean;
  disabled?: boolean;
}

export interface MenuAnchor {
  x: number;
  y: number;
}

export function ContextMenu({
  anchor,
  items,
  onDismiss,
}: {
  anchor: MenuAnchor;
  items: MenuItem[];
  onDismiss: () => void;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") onDismiss();
    }
    function onPointerDown(event: PointerEvent): void {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [onDismiss]);

  // Nudged back on screen if the pointer was near an edge.
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const box = menu.getBoundingClientRect();
    if (box.right > window.innerWidth) menu.style.left = `${window.innerWidth - box.width - 8}px`;
    if (box.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - box.height - 8}px`;
  }, [anchor]);

  return (
    <div className="menu" ref={ref} style={{ left: anchor.x, top: anchor.y }} role="menu">
      {items.map((item) => (
        <button
          className={item.danger ? "menu-item danger" : "menu-item"}
          disabled={item.disabled}
          key={item.label}
          onClick={() => {
            item.onChoose();
            onDismiss();
          }}
          role="menuitem"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
