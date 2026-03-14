// Author: Claude Code
// ObjectListView — renders a flat list of objects. Stateless; caller supplies the array.

import './ObjectListView.css';

function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ObjectRow({ object }) {
  const primarySource = object.sources?.[0];
  const uri           = primarySource?.uri ?? null;
  const fileType      = primarySource?.fileType ?? null;

  return (
    <div className="object-row">
      <span className="object-row-type">{fileType ?? '—'}</span>
      <div className="object-row-main">
        <span className="object-row-name">{object.name || 'Untitled'}</span>
        {uri && <span className="object-row-uri">{uri}</span>}
      </div>
      <span className="object-row-date">{formatDate(object.created_at)}</span>
    </div>
  );
}

export default function ObjectListView({ objects = [] }) {
  if (objects.length === 0) {
    return (
      <div className="object-list-view">
        <div className="object-list-empty">No objects.</div>
      </div>
    );
  }

  return (
    <div className="object-list-view">
      <div className="object-list">
        {objects.map(obj => (
          <ObjectRow key={obj.id} object={obj} />
        ))}
      </div>
    </div>
  );
}
