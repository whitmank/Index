// Authored by Karter Whitman using Claude Sonnet 5
// A Space's rule, built and edited as a nested AND/OR tree of conditions
// — the same interaction shape Gmail/Notion/Airtable filters use, not
// invented fresh. Every structural edit (add/remove a condition or
// group, flip a combinator, toggle NOT, change a field/operator) commits
// immediately; a value's text field commits on settle (blur/Enter), the
// same discipline as every other field in this app (SettleInput,
// DESIGN-CONCEPT §6).
//
// The whole tree is derived fresh from `item.set` on every render, the
// same way DataFields.tsx derives its rows from `item.data` — there is
// no shadow copy to fall out of sync with an undo or another window. The
// cost: a condition added but not yet filled in is a real (if
// harmlessly always-false) predicate in the stored query until it's
// completed, rather than living in some local-only draft state — visible
// feedback that a row still needs finishing, not a bug.
import { useEffect, useState } from "react";
import type { AttributeKind, Format, Item, Predicate, SetQuery } from "@index/database/types";
import { apply, changes } from "../../changes/index.js";
import { SettleInput } from "../../components/SettleInput.tsx";
import { FORMAT_GLYPH, captionOf } from "../../lib/derive.js";
import { loadDataAttributes, pool, searchItems, usePool } from "../../store/index.js";

// ── the UI's own tree shape, and its round-trip with SetQuery ─────────────

type DataOp = "eq" | "contains" | "gte" | "lte";

type PredicateDraft =
  | { field: "data"; attribute: string; kind: AttributeKind; op: DataOp; value: string }
  | { field: "date"; op: "gte" | "lte"; value: string }
  | { field: "format"; value: Format }
  | { field: "device"; value: string }
  | { field: "arrowTo"; value: string };

interface ConditionRow {
  type: "condition";
  not: boolean;
  predicate: PredicateDraft;
}

interface GroupRow {
  type: "group";
  not: boolean;
  combinator: "and" | "or";
  rows: Row[];
}

type Row = ConditionRow | GroupRow;

const FORMATS = Object.keys(FORMAT_GLYPH) as Format[];

function blankPredicate(): PredicateDraft {
  return { field: "data", attribute: "", kind: "string", op: "eq", value: "" };
}

function predicateToDraft(predicate: Predicate): PredicateDraft {
  if ("date" in predicate) {
    if (predicate.date.gte !== undefined) return { field: "date", op: "gte", value: predicate.date.gte };
    if (predicate.date.lte !== undefined) return { field: "date", op: "lte", value: predicate.date.lte };
    return { field: "date", op: "gte", value: "" };
  }
  if ("device" in predicate) return { field: "device", value: predicate.device };
  if ("format" in predicate) return { field: "format", value: predicate.format };
  if ("arrowTo" in predicate) return { field: "arrowTo", value: predicate.arrowTo };
  const d = predicate.data;
  const attribute = d.attribute ?? "";
  if (d.eq !== undefined) return { field: "data", attribute, kind: d.kind, op: "eq", value: d.eq };
  if (d.contains !== undefined) return { field: "data", attribute, kind: d.kind, op: "contains", value: d.contains };
  if (d.gte !== undefined) return { field: "data", attribute, kind: d.kind, op: "gte", value: d.gte };
  if (d.lte !== undefined) return { field: "data", attribute, kind: d.kind, op: "lte", value: d.lte };
  return { field: "data", attribute, kind: d.kind, op: "eq", value: "" };
}

function predicateFromDraft(draft: PredicateDraft): Predicate {
  if (draft.field === "date") return { date: { [draft.op]: draft.value } };
  if (draft.field === "device") return { device: draft.value };
  if (draft.field === "format") return { format: draft.value };
  if (draft.field === "arrowTo") return { arrowTo: draft.value };
  return { data: { attribute: draft.attribute || undefined, kind: draft.kind, [draft.op]: draft.value } };
}

function queryToRow(query: SetQuery): Row {
  if ("not" in query) {
    const inner = queryToRow(query.not);
    return { ...inner, not: !inner.not };
  }
  if ("and" in query) return { type: "group", not: false, combinator: "and", rows: query.and.map(queryToRow) };
  if ("or" in query) return { type: "group", not: false, combinator: "or", rows: query.or.map(queryToRow) };
  if ("all" in query) return { type: "group", not: false, combinator: "and", rows: [] };
  return { type: "condition", not: false, predicate: predicateToDraft(query) };
}

/** The root is always rendered as one group, whatever shape the stored
 * query actually has — a bare condition or a negated group becomes a
 * one-row wrapper, so the UI never has to special-case "what if the top
 * level isn't a group." */
function queryToGroup(query: SetQuery): GroupRow {
  const row = queryToRow(query);
  return row.type === "group" && !row.not ? row : { type: "group", not: false, combinator: "and", rows: [row] };
}

function rowToQuery(row: Row): SetQuery {
  const inner: SetQuery = row.type === "group" ? groupToQuery(row) : predicateFromDraft(row.predicate);
  return row.not ? { not: inner } : inner;
}

function groupToQuery(group: GroupRow): SetQuery {
  if (group.rows.length === 0) return { all: true };
  return group.combinator === "and" ? { and: group.rows.map(rowToQuery) } : { or: group.rows.map(rowToQuery) };
}

// ── path-addressed immutable edits over the tree ───────────────────────────

type Path = number[];

function updateGroup(root: GroupRow, groupPath: Path, updater: (rows: Row[]) => Row[]): GroupRow {
  if (groupPath.length === 0) return { ...root, rows: updater(root.rows) };
  const [head, ...rest] = groupPath;
  return {
    ...root,
    rows: root.rows.map((row, index) => {
      if (index !== head || row.type !== "group") return row;
      return updateGroup(row, rest, updater);
    }),
  };
}

function updateRow(root: GroupRow, path: Path, updater: (row: Row) => Row): GroupRow {
  const groupPath = path.slice(0, -1);
  const at = path[path.length - 1] as number;
  return updateGroup(root, groupPath, (rows) => rows.map((row, index) => (index === at ? updater(row) : row)));
}

function removeRow(root: GroupRow, path: Path): GroupRow {
  const groupPath = path.slice(0, -1);
  const at = path[path.length - 1] as number;
  return updateGroup(root, groupPath, (rows) => rows.filter((_, index) => index !== at));
}

function addCondition(root: GroupRow, groupPath: Path): GroupRow {
  return updateGroup(root, groupPath, (rows) => [...rows, { type: "condition", not: false, predicate: blankPredicate() }]);
}

function addGroup(root: GroupRow, groupPath: Path): GroupRow {
  return updateGroup(root, groupPath, (rows) => [
    ...rows,
    { type: "group", not: false, combinator: "and", rows: [] },
  ]);
}

// ── the component ───────────────────────────────────────────────────────

export interface RuleBuilderProps {
  item: Item;
  /** Present only when opened as an "edit rule" overlay on a Space that
   * already has a real query, so it can be dismissed; absent for the
   * bootstrap empty-state rendering, which has nothing to dismiss to. */
  onDone?: () => void;
}

export function RuleBuilder({ item, onDone }: RuleBuilderProps) {
  const [attributes, setAttributes] = useState<string[]>([]);
  useEffect(() => {
    void loadDataAttributes().then(setAttributes);
  }, []);

  const root = queryToGroup(typeof item.set === "object" ? item.set : { all: true });

  const commit = (next: GroupRow): void => {
    void apply(changes.setQuery(item, groupToQuery(next)));
  };

  return (
    <div className="rule-builder">
      <div className="rule-builder-head">
        <label className="field field-name">
          <span className="sr-only">name</span>
          <SettleInput
            ariaLabel="Space name"
            onCommit={(name) => void apply(changes.rename(item, name))}
            placeholder="unnamed Space"
            value={item.data.name.value as string}
          />
        </label>
        {onDone && (
          <button aria-label="done editing the rule" className="rule-builder-done" onClick={onDone} type="button">
            done
          </button>
        )}
      </div>
      <p className="rule-builder-caption">Match items where:</p>
      <RuleGroup
        attributes={attributes}
        group={root}
        onChange={commit}
        path={[]}
        root={root}
      />
    </div>
  );
}

function RuleGroup({
  root,
  group,
  path,
  attributes,
  onChange,
}: {
  root: GroupRow;
  group: GroupRow;
  path: Path;
  attributes: string[];
  onChange: (next: GroupRow) => void;
}) {
  // The root group's own combinator lives directly on `root`; a nested
  // group's lives behind `updateRow`, which addresses a row *inside* its
  // parent — path.length === 0 is what tells the two cases apart.
  // `group.rows` is already the resolved node for whichever case this
  // is, so it's read directly rather than re-walked from `root`+`path`.
  const setCombinator = (combinator: "and" | "or"): void => {
    if (path.length === 0) onChange({ ...root, combinator });
    else onChange(updateRow(root, path, (row) => (row.type === "group" ? { ...row, combinator } : row)));
  };

  return (
    <div className="rule-group">
      {group.rows.length > 1 && (
        <div className="rule-combinator" role="group">
          <button
            aria-pressed={group.combinator === "and"}
            className={group.combinator === "and" ? "rule-combinator-option is-active" : "rule-combinator-option"}
            onClick={() => setCombinator("and")}
            type="button"
          >
            all
          </button>
          <button
            aria-pressed={group.combinator === "or"}
            className={group.combinator === "or" ? "rule-combinator-option is-active" : "rule-combinator-option"}
            onClick={() => setCombinator("or")}
            type="button"
          >
            any
          </button>
        </div>
      )}

      {group.rows.map((row, index) => {
        const rowPath = [...path, index];
        const toggleNot = (): void => {
          onChange(updateRow(root, rowPath, (r) => ({ ...r, not: !r.not })));
        };
        const remove = (): void => {
          onChange(removeRow(root, rowPath));
        };

        return (
          <div className={row.not ? "rule-row is-negated" : "rule-row"} key={index}>
            <button
              aria-pressed={row.not}
              className="rule-not-toggle"
              onClick={toggleNot}
              title={row.not ? "excluding — click to include instead" : "including — click to exclude instead"}
              type="button"
            >
              not
            </button>

            {row.type === "condition" ? (
              <ConditionEditor
                attributes={attributes}
                onChange={(predicate) => onChange(updateRow(root, rowPath, (r) => ({ ...r, predicate })))}
                predicate={row.predicate}
              />
            ) : (
              <RuleGroup attributes={attributes} group={row} onChange={onChange} path={rowPath} root={root} />
            )}

            <button aria-label="remove this condition" className="rule-row-remove" onClick={remove} type="button">
              ✕
            </button>
          </div>
        );
      })}

      <div className="rule-group-add">
        <button onClick={() => onChange(addCondition(root, path))} type="button">
          + condition
        </button>
        <button onClick={() => onChange(addGroup(root, path))} type="button">
          + group
        </button>
      </div>
    </div>
  );
}

const FIELD_LABELS: Record<PredicateDraft["field"], string> = {
  data: "attribute",
  date: "added",
  format: "format",
  device: "device",
  arrowTo: "linked to",
};

function ConditionEditor({
  predicate,
  attributes,
  onChange,
}: {
  predicate: PredicateDraft;
  attributes: string[];
  onChange: (next: PredicateDraft) => void;
}) {
  const field = predicate.field;

  return (
    <span className="rule-condition">
      <select
        aria-label="field"
        className="rule-field"
        onChange={(event) => {
          const next = event.target.value as PredicateDraft["field"];
          if (next === "data") onChange(blankPredicate());
          else if (next === "date") onChange({ field: "date", op: "gte", value: "" });
          else if (next === "format") onChange({ field: "format", value: "bare" });
          else if (next === "device") onChange({ field: "device", value: "" });
          else onChange({ field: "arrowTo", value: "" });
        }}
        value={field}
      >
        {(Object.keys(FIELD_LABELS) as PredicateDraft["field"][]).map((key) => (
          <option key={key} value={key}>
            {FIELD_LABELS[key]}
          </option>
        ))}
      </select>

      {predicate.field === "data" && (
        <DataConditionFields attributes={attributes} onChange={onChange} predicate={predicate} />
      )}
      {predicate.field === "date" && (
        <>
          <select
            aria-label="operator"
            className="rule-op"
            onChange={(event) => onChange({ ...predicate, op: event.target.value as "gte" | "lte" })}
            value={predicate.op}
          >
            <option value="gte">on or after</option>
            <option value="lte">on or before</option>
          </select>
          <SettleInput
            ariaLabel="date"
            onCommit={(value) => onChange({ ...predicate, value })}
            placeholder="YYYY-MM-DD"
            value={predicate.value}
          />
        </>
      )}
      {predicate.field === "format" && (
        <select
          aria-label="format"
          className="rule-op"
          onChange={(event) => onChange({ field: "format", value: event.target.value as Format })}
          value={predicate.value}
        >
          {FORMATS.map((format) => (
            <option key={format} value={format}>
              {format}
            </option>
          ))}
        </select>
      )}
      {predicate.field === "device" && (
        <SettleInput
          ariaLabel="device"
          onCommit={(value) => onChange({ field: "device", value })}
          placeholder="mbp, web, …"
          value={predicate.value}
        />
      )}
      {predicate.field === "arrowTo" && (
        <ArrowToPicker onChange={(value) => onChange({ field: "arrowTo", value })} value={predicate.value} />
      )}
    </span>
  );
}

const DATA_OPS: Record<DataOp, string> = { eq: "is", contains: "contains", gte: "at least", lte: "at most" };

function DataConditionFields({
  predicate,
  attributes,
  onChange,
}: {
  predicate: Extract<PredicateDraft, { field: "data" }>;
  attributes: string[];
  onChange: (next: PredicateDraft) => void;
}) {
  return (
    <>
      <input
        aria-label="attribute name"
        className="rule-attribute"
        list="rule-attribute-suggestions"
        onChange={(event) => onChange({ ...predicate, attribute: event.target.value })}
        placeholder="attribute…"
        value={predicate.attribute}
      />
      <datalist id="rule-attribute-suggestions">
        {attributes.map((attribute) => (
          <option key={attribute} value={attribute} />
        ))}
      </datalist>
      <select
        aria-label="kind"
        className="rule-kind"
        onChange={(event) => onChange({ ...predicate, kind: event.target.value as AttributeKind })}
        value={predicate.kind}
      >
        <option value="string">text</option>
        <option value="number">number</option>
        <option value="date">date</option>
        <option value="duration">duration</option>
        <option value="list">list</option>
      </select>
      <select
        aria-label="operator"
        className="rule-op"
        onChange={(event) => onChange({ ...predicate, op: event.target.value as DataOp })}
        value={predicate.op}
      >
        {(Object.keys(DATA_OPS) as DataOp[]).map((op) => (
          <option key={op} value={op}>
            {DATA_OPS[op]}
          </option>
        ))}
      </select>
      <SettleInput
        ariaLabel="value"
        onCommit={(value) => onChange({ ...predicate, value })}
        placeholder="value…"
        value={predicate.value}
      />
    </>
  );
}

/** A minimal search-and-pick for an `arrowTo` predicate's target — typed
 * name in, matching items back, click one to pick it. Mirrors the
 * command bar's own search-as-you-type pattern at a much smaller scale. */
function ArrowToPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [term, setTerm] = useState("");
  const [hitIds, setHitIds] = useState<string[]>([]);
  const picked = usePool(() => (value ? pool.getItem(value) : null));

  useEffect(() => {
    const trimmed = term.trim();
    if (!trimmed) {
      setHitIds([]);
      return;
    }
    let cancelled = false;
    void searchItems(trimmed, 8).then((items) => {
      if (!cancelled) setHitIds(items.map((item) => item.id));
    });
    return () => {
      cancelled = true;
    };
  }, [term]);

  if (picked) {
    return (
      <span className="rule-arrow-picked">
        {captionOf(picked) || "untitled"}
        <button aria-label="change linked item" onClick={() => onChange("")} type="button">
          ✕
        </button>
      </span>
    );
  }

  return (
    <span className="rule-arrow-picker">
      <input
        aria-label="search for an item to link to"
        onChange={(event) => setTerm(event.target.value)}
        placeholder="search…"
        value={term}
      />
      {hitIds.length > 0 && (
        <ul className="rule-arrow-hits">
          {hitIds.map((id) => {
            const hit = pool.getItem(id);
            if (!hit) return null;
            return (
              <li key={id}>
                <button onClick={() => onChange(id)} type="button">
                  {captionOf(hit) || "untitled"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </span>
  );
}
