// Author: Claude Sonnet 4.6
// ObjectCardModal — modal overlay presenting full object detail for a selected object.
// Triggered by Enter on a selected object. Escape or click-outside closes.

import ObjectDetailPane from './ObjectDetailPane';
import './ObjectCardModal.css';

export default function ObjectCardModal({ isOpen, objectId, editNameOnMount = false, onClose }) {
  if (!isOpen || !objectId) return null;

  return (
    <div className="object-card-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="object-card-modal">
        <ObjectDetailPane objectId={objectId} editNameOnMount={editNameOnMount} />
      </div>
    </div>
  );
}
