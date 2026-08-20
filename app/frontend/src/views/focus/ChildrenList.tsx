// Authored by Karter Whitman using Claude Sonnet 5
// An ordered list of an item's children, drawn as index/name/trailing-bit
// rows — an album's tracklist today (number, title, duration), a book's
// chapter list should it ever want one (number, title, page range). A
// concrete row shape rather than a column-configuration API: there's one
// real consumer and one hypothetical one, and both fit this — not worth
// a generic columns DSL before a third shape actually needs one.
export interface ChildRow {
  id: string;
  index: number;
  primary: string;
  trailing?: string;
  onGoTo: () => void;
}

export function ChildrenList({ rows }: { rows: ChildRow[] }) {
  if (rows.length === 0) return null;
  return (
    <ol className="children-list">
      {rows.map((row) => (
        <li key={row.id}>
          <button className="child-row" onClick={row.onGoTo} type="button">
            <span className="child-index">{row.index}</span>
            <span className="child-primary">{row.primary}</span>
            {row.trailing && <span className="child-trailing">{row.trailing}</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}
