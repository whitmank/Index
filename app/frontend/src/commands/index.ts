// Authored by Karter Whitman using Claude Opus 5
// The commands the bar can perform, as data.
//
// A command is a verb, what it needs to be said (an argument, or
// nothing), and whether it can be said right now. Keeping that as a
// record rather than a button means one field can offer every verb the
// application knows, and adding a verb is adding an entry here rather
// than finding somewhere on screen to put it.
//
// Commands do not act. They close over handlers the shell owns, because
// only the shell knows what is picked out and which set you are looking
// at — the same reason the context menu takes its actions as arguments.
import type { Item } from "@index/database/types";
import { captionOf } from "../lib/derive.js";

/** What a command is given when it needs something named. */
export type CommandTarget = { set: Item } | { newSetNamed: string };

export interface CommandArgument {
  /** What the field asks for once the verb has been taken. */
  prompt: string;
  /** Where the completions come from. Sets are the only kind so far. */
  kind: "set";
  /** Offer to make one by the typed name when nothing matches it. */
  allowCreate?: boolean;
}

export interface Command {
  id: string;
  /** What it reads as in the bar — the verb, as you would say it. */
  title: string;
  /** Other words that should find it. */
  keywords: string[];
  /** Present when it cannot run right now, and says why. */
  unavailable?: string;
  argument?: CommandArgument;
  run: (target?: CommandTarget) => void;
}

export interface CommandHandlers {
  addPickedTo: (target: Item, targetIsNew?: boolean) => void;
  addPickedToNew: (name: string) => void;
  parsePicked: () => void;
}

export interface CommandContext {
  /** What is picked out — what most commands are about. */
  picked: Item[];
  /** The set on the stage, when there is one. */
  currentSet: Item | null;
  handlers: CommandHandlers;
}

export function commandsFor({ picked, handlers }: CommandContext): Command[] {
  const nothingPicked = picked.length === 0 ? "nothing is picked out" : undefined;

  return [
    {
      id: "add-to",
      title: "add to…",
      keywords: ["set", "space", "put", "into", "member", "tag", "file"],
      unavailable: nothingPicked,
      argument: {
        prompt: `add ${describe(picked)} to…`,
        kind: "set",
        allowCreate: true,
      },
      run: (target) => {
        if (!target) return;
        if ("set" in target) handlers.addPickedTo(target.set);
        else handlers.addPickedToNew(target.newSetNamed);
      },
    },
    {
      id: "parse",
      title: "parse",
      keywords: ["read", "extract", "fill", "metadata", "fields", "scan", "index"],
      // A type is the question parsing answers against, so having none
      // is not a failure to report afterwards — it is a reason the verb
      // cannot be said yet, and the bar is where that belongs.
      unavailable: nothingPicked ?? nothingTyped(picked),
      run: () => handlers.parsePicked(),
    },
  ];
}

/** Why parsing can't run over this selection, when it can't. */
function nothingTyped(picked: Item[]): string | undefined {
  if (picked.some((item) => item.data.type)) return undefined;
  return picked.length === 1 ? "give it a type first" : "none of these have a type";
}

/** How the bar refers to what is picked, in a verb's own prompt. */
function describe(picked: Item[]): string {
  if (picked.length === 1) {
    const only = picked[0] as Item;
    const name = captionOf(only);
    return name ? `“${name}”` : "this item";
  }
  return `${picked.length} items`;
}

/**
 * Whether a typed term finds this command. Every word has to appear
 * somewhere in the verb or its keywords, so "add to" finds `add to…`
 * and "to add" does too — you are remembering a verb, not spelling one.
 */
export function matches(command: Command, term: string): boolean {
  const haystack = `${command.title} ${command.keywords.join(" ")}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}
