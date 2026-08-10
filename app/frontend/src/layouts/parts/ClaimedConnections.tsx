// Authored by Karter Whitman using Claude Opus 4.8
// Labelled connections a layout asked for — read-only display; retargeting
// happens through the connection composer in the editing surface.
import type { ClaimedConnection } from "../registry.tsx";

export function ClaimedConnections({ connections }: { connections: ClaimedConnection[] }) {
  if (connections.length === 0) return null;
  return (
    <dl className="claimed">
      {connections.map((connection) => (
        <div key={`${connection.label}${connection.targetId}`}>
          <dt>{connection.label}</dt>
          <dd>{connection.targetName}</dd>
        </div>
      ))}
    </dl>
  );
}
