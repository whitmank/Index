// Author: Claude Code
// SpacesView — card grid shown on first boot; each card is a navigable space.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';
import CreateSpaceModal from './CreateSpaceModal';
import './SpacesView.css';

function SpaceCard({ space, tags, onEnter, onEdit, onDelete }) {
  const isSystem = space.system === true;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const initial = space.name?.[0]?.toUpperCase() ?? '?';

  // Resolve tag names from query for the pill cluster
  const tagIndex = Object.fromEntries(tags.map(t => [t.id, t]));
  const allTags  = (space.query?.all  || []).map(id => ({ id, name: tagIndex[id]?.name ?? id, kind: 'all' }));
  const anyTags  = (space.query?.any  || []).map(id => ({ id, name: tagIndex[id]?.name ?? id, kind: 'any' }));
  const noneTags = (space.query?.none || []).map(id => ({ id, name: tagIndex[id]?.name ?? id, kind: 'none' }));
  const pills = [...allTags, ...anyTags, ...noneTags].slice(0, 5);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <div className="space-card-wrap">
      <div
        className={`space-card${isSystem ? ' system' : ''}`}
        onClick={() => onEnter(space.id)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && onEnter(space.id)}
      >
        <span className="space-card-initial-bg">{initial}</span>
        <p className="space-card-name">{space.name}</p>
        {pills.length > 0 ? (
          <div className="space-card-tag-cluster">
            {pills.map(p => (
              <span key={p.id} className={`space-card-tag-pill${p.kind === 'none' ? ' none' : ''}`}>
                {p.kind === 'none' ? '–' : ''}{p.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="space-card-no-rules" />
        )}
      </div>

      {!isSystem && (
        <div className="space-card-menu" ref={menuRef}>
          <button
            className="space-card-menu-btn"
            onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
            aria-label="Space options"
          >
            ···
          </button>
          {menuOpen && (
            <div className="space-card-menu-dropdown">
              <button
                className="space-card-menu-item"
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onEdit(space); }}
              >
                Edit
              </button>
              <button
                className="space-card-menu-item delete"
                onClick={e => { e.stopPropagation(); setMenuOpen(false); onDelete(space); }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpacesView({ onNewSpace }) {
  const spaces      = useIndexStore(s => s.spaces);
  const enterSpace  = useIndexStore(s => s.enterSpace);
  const deleteSpace = useIndexStore(s => s.deleteSpace);
  const tags        = useIndexStore(s => s.tags);

  const [editingSpace, setEditingSpace] = useState(null);

  const userSpaces = [...spaces].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  function handleDelete(space) {
    if (window.confirm(`Delete "${space.name}"?`)) {
      deleteSpace(space.id).catch(err => console.error('[SpacesView] Delete failed:', err));
    }
  }

  return (
    <div className="spaces-view">
      <div className="spaces-section">
        <div className="spaces-grid">
          {userSpaces.map(space => (
            <SpaceCard key={space.id} space={space} tags={tags} onEnter={enterSpace} onEdit={setEditingSpace} onDelete={handleDelete} />
          ))}
          {onNewSpace && (
            <div
              className="space-card-new"
              onClick={onNewSpace}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && onNewSpace()}
            >
              <span className="space-card-new-icon">+</span>
              <span className="space-card-new-label">New space</span>
            </div>
          )}
        </div>
      </div>

      <CreateSpaceModal
        isOpen={!!editingSpace}
        onClose={() => setEditingSpace(null)}
        space={editingSpace}
      />
    </div>
  );
}
