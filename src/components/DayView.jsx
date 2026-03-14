// Author: Claude Code
// DayView — scrollable list of objects created on the active calendar date.

import { useIndexStore } from '../store/index';
import './DayView.css';

function ObjectRow({ object }) {
  const name    = object.name || object.sources?.[0]?.uri || object.id;
  const srcCount = object.sources?.length ?? 0;

  return (
    <div className="day-view-row">
      <span className="day-view-row-name">{name}</span>
      {srcCount > 0 && (
        <span className="day-view-row-badge">{srcCount}</span>
      )}
    </div>
  );
}

export default function DayView() {
  const spaceObjects = useIndexStore(s => s.spaceObjects);
  const objects      = spaceObjects ?? [];

  return (
    <div className="day-view">
      {objects.length === 0 ? (
        <p className="day-view-empty">No objects on this day.</p>
      ) : (
        <div className="day-view-list">
          {objects.map(o => <ObjectRow key={o.id} object={o} />)}
        </div>
      )}
    </div>
  );
}
