// Authored by Karter Whitman using Claude Sonnet 5
// Settings: ⌘, opens it, Esc (or the ✕) closes it. General says what the
// application is, Types is the schema editor re-shown here rather than
// reimplemented, Keybindings says how to drive it — following the
// tabbed layout the 0.1.5 alpha settled on, ported onto this shell's own
// primitives rather than that build's (there is no separate root/home
// here: `~` already is the set of everything, so the alpha's "go to
// root" and "go to home" collapse into the one ⌘/ binding below).
import { useEffect } from "react";
import { SchemaEditor } from "../schemas/SchemaManager.tsx";

export const SETTINGS_TABS = [
  { id: "general", label: "General" },
  { id: "types", label: "Types" },
  { id: "keybindings", label: "Keybindings" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

export interface SettingsProps {
  tab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
}

interface Binding {
  keys: string[];
  description: string;
  alt?: string[];
}

interface BindingGroup {
  label: string;
  bindings: Binding[];
}

// What the shell actually answers to today (App.tsx, useArrowNav.ts,
// useSelectionKeys.ts, useUndoRedo.ts, List.tsx, CommandBar.tsx) — this
// tab is a description of the running bindings, not a separate config
// of its own, so it cannot drift into claiming a key that does nothing.
const KEYBIND_GROUPS: BindingGroup[] = [
  {
    label: "Navigation",
    bindings: [
      { keys: ["⌘", ","], description: "Open settings" },
      { keys: ["⌘", "K"], description: "Open the command bar", alt: ["⌘", "F"] },
      { keys: ["⌘", "/"], description: "Go to All" },
      { keys: ["←"], description: "Back one step" },
      { keys: ["→"], description: "Into what is picked out" },
      { keys: ["V"], description: "Switch between canvas and list" },
      { keys: ["⌘", "`"], description: "Show or hide Index (system-wide)" },
      { keys: ["Esc"], description: "Close the frontmost overlay, or clear the selection" },
    ],
  },
  {
    label: "Selection",
    bindings: [
      { keys: ["⌘", "A"], description: "Select everything on screen" },
      { keys: ["⌫"], description: "Take the selection out of this set" },
      { keys: ["⌘", "⌫"], description: "Delete the selection outright" },
      { keys: ["Esc"], description: "Clear the selection" },
    ],
  },
  {
    label: "List view",
    bindings: [
      { keys: ["Click"], description: "Choose a row" },
      { keys: ["⇧", "Click"], description: "Choose the range" },
      { keys: ["⌘", "Click"], description: "Toggle one row" },
      { keys: ["⏎"], description: "Open a row", alt: ["Double-click"] },
      { keys: ["Space"], description: "Choose the focused row" },
    ],
  },
  {
    label: "Editing",
    bindings: [
      { keys: ["⌘", "Z"], description: "Undo" },
      { keys: ["⌘", "⇧", "Z"], description: "Redo" },
      { keys: ["⌘", "V"], description: "Paste as a new object" },
    ],
  },
  {
    label: "Command bar",
    bindings: [
      { keys: ["↑", "↓"], description: "Move the cursor", alt: ["⌃P", "⌃N"] },
      { keys: ["⇥"], description: "Take the highlighted row", alt: ["⏎"] },
      { keys: ["Esc"], description: "Close" },
    ],
  },
  {
    label: "Settings",
    bindings: [
      { keys: ["⌘", `1–${SETTINGS_TABS.length}`], description: "Switch to a settings tab by number" },
    ],
  },
];

export function Settings({ tab, onTabChange, onClose }: SettingsProps) {
  // Caught here, not left to bubble: whatever is open behind Settings —
  // Focus, the command bar — must not also close. ⌘1, ⌘2, ⌘3… jump
  // straight to a tab by its position, the same shortcut the 0.1.5
  // alpha's settings page answered to.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;
      const index = Number(event.key) - 1;
      const next = Number.isInteger(index) ? SETTINGS_TABS[index] : undefined;
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();
      onTabChange(next.id);
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [onClose, onTabChange]);

  return (
    <div className="confirm-backdrop" onMouseDown={onClose}>
      <div
        aria-label="Settings"
        className="settings"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="settings-bar">
          <nav aria-label="settings tabs" className="settings-tabs">
            {SETTINGS_TABS.map((candidate) => (
              <button
                aria-pressed={candidate.id === tab}
                className={candidate.id === tab ? "settings-tab is-current" : "settings-tab"}
                key={candidate.id}
                onClick={() => onTabChange(candidate.id)}
                type="button"
              >
                {candidate.label}
              </button>
            ))}
          </nav>
          <button aria-label="close" className="settings-close" onClick={onClose} type="button">
            ✕
          </button>
        </header>

        <div className="settings-body">
          {tab === "general" && <General />}
          {tab === "types" && <SchemaEditor />}
          {tab === "keybindings" && <Keybindings />}
        </div>
      </div>
    </div>
  );
}

function General() {
  return (
    <section className="settings-section">
      <h3 className="settings-section-title">About</h3>
      <div className="settings-row">
        <span className="settings-row-label">Application</span>
        <span className="settings-row-value">Index</span>
      </div>
      <div className="settings-row">
        <span className="settings-row-label">Description</span>
        <span className="settings-row-value">A personal semantic layer over files and URLs</span>
      </div>
      <div className="settings-row">
        <span className="settings-row-label">Author</span>
        <span className="settings-row-value">Karter Whitman</span>
      </div>

      <h3 className="settings-section-title">Window</h3>
      <div className="settings-row">
        <span className="settings-row-label">Summon</span>
        <span className="settings-row-value">
          <kbd>⌘</kbd>
          <kbd>`</kbd> shows or hides Index from anywhere on the system.
        </span>
      </div>
    </section>
  );
}

function Keybindings() {
  return (
    <>
      {KEYBIND_GROUPS.map((group) => (
        <section className="settings-section" key={group.label}>
          <h3 className="settings-section-title">{group.label}</h3>
          <div className="keybind-list">
            {group.bindings.map((binding, index) => (
              <div className="keybind-row" key={index}>
                <span className="keybind-description">{binding.description}</span>
                <span className="keybind-combos">
                  <Keys keys={binding.keys} />
                  {binding.alt && (
                    <>
                      <span className="keybind-or">or</span>
                      <Keys keys={binding.alt} />
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="keybind-keys">
      {keys.map((key, index) => (
        <kbd key={index}>{key}</kbd>
      ))}
    </span>
  );
}
