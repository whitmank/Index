// Author: Claude Code
// AddressBar — persistent navigation strip, always visible.
// Shows the name of the current view; back chevron when inside a space.
// View switcher (list/calendar/graph) appears in right slot when inside a space.

import './AddressBar.css';

const VIEWS = [
  { type: 'list',     icon: '≡' },
  { type: 'calendar', icon: '▦' },
  { type: 'graph',    icon: '⬡' },
];

export default function AddressBar({ label, onBack, activeView, setView }) {
  return (
    <div className="address-bar">
      <div className="address-bar-back-slot">
        <button
          className={`address-bar-back${onBack ? '' : ' disabled'}`}
          onClick={onBack ?? undefined}
          disabled={!onBack}
          aria-label="Back"
        >
          ‹
        </button>
      </div>

      <div className="address-bar-pill">
        <span className="address-bar-label">{label}</span>
      </div>

      <div className="address-bar-right-slot">
        {activeView && (
          <div className="address-bar-views">
            {VIEWS.map(v => (
              <button
                key={v.type}
                className={`view-btn${activeView === v.type ? ' active' : ''}`}
                onClick={() => setView(v.type)}
                title={v.type}
              >
                {v.icon}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
