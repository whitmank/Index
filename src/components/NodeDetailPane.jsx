// Author: Claude Sonnet 4.6
// NodeDetailPane — shows node details, editable name, sources, and edges.

import { useEffect, useRef, useState } from 'react';
import { useIndexStore } from '../store/index';
import { ObjectIcon, SpaceIcon } from '../icons/index';
import './NodeDetailPane.css';

function SourceItem({ source }) {
  const uri = source.uri ?? '';
  const isFile = uri.startsWith('file://');
  const isUrl  = uri.startsWith('http://') || uri.startsWith('https://');
  const label  = isFile ? uri.replace('file://', '') : uri;

  function open() {
    window.electronAPI?.openSource?.(uri);
  }

  return (
    <div className="ndp-source-item" onClick={open} title={uri}>
      <span className="ndp-source-scheme">{isFile ? 'file' : isUrl ? 'url' : 'src'}</span>
      <span className="ndp-source-label">{label}</span>
    </div>
  );
}

function EdgeGroup({ label, edges, nodes, edgeTypes, onRemove }) {
  if (!edges.length) return null;
  return (
    <div className="ndp-edge-group">
      <div className="ndp-edge-group-label">{label}</div>
      {edges.map(edge => {
        const peerId = edge.in === edge._perspectiveId ? edge.out : edge.in;
        const peer = nodes.find(n => n.id === peerId);
        return (
          <div key={edge.id} className="ndp-edge-item">
            <span className="ndp-edge-peer-icon">
              {peer?.schema === 'group' ? <SpaceIcon size={10} /> : <ObjectIcon size={10} />}
            </span>
            <span className="ndp-edge-peer-name">{peer?.name ?? peerId}</span>
            <button className="ndp-edge-remove" onClick={() => onRemove(edge.id)} title="Remove edge">×</button>
          </div>
        );
      })}
    </div>
  );
}

export default function NodeDetailPane({ nodeId, onClose, fullWidth = false }) {
  const nodes     = useIndexStore(s => s.nodes);
  const edgeTypes = useIndexStore(s => s.edgeTypes);
  const edges     = useIndexStore(s => s.edges);
  const updateNode = useIndexStore(s => s.updateNode);
  const createEdge = useIndexStore(s => s.createEdge);
  const deleteEdge = useIndexStore(s => s.deleteEdge);
  const enterNode  = useIndexStore(s => s.enterNode);

  const node = nodes.find(n => n.id === nodeId);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [addingEdge, setAddingEdge] = useState(false);
  const [edgeTypeInput, setEdgeTypeInput] = useState('');
  const [edgeTargetInput, setEdgeTargetInput] = useState('');
  const [edgeDirection, setEdgeDirection] = useState('out'); // 'out' | 'in'
  const nameRef = useRef(null);

  useEffect(() => {
    if (node) setNameValue(node.name ?? '');
    setEditingName(false);
    setAddingEdge(false);
  }, [nodeId]);

  useEffect(() => {
    if (editingName) setTimeout(() => nameRef.current?.focus(), 0);
  }, [editingName]);

  if (!node) return null;

  const nodeEdges = edges.filter(e => e.in === nodeId || e.out === nodeId);

  // Group edges by edge type
  const edgesByType = {};
  for (const edge of nodeEdges) {
    const typeId = edge.type ?? 'unknown';
    if (!edgesByType[typeId]) edgesByType[typeId] = [];
    edgesByType[typeId].push({ ...edge, _perspectiveId: nodeId });
  }

  async function saveName() {
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== node.name) {
      await updateNode(nodeId, { name: trimmed });
    }
    setEditingName(false);
  }

  async function handleAddEdge() {
    const typeInput = edgeTypeInput.trim();
    const targetInput = edgeTargetInput.trim();
    if (!typeInput || !targetInput) return;

    // Find or create edge type
    let edgeType = edgeTypes.find(et => et.name?.toLowerCase() === typeInput.toLowerCase());
    if (!edgeType) {
      edgeType = await window.electronAPI.db.createEdgeType({ name: typeInput });
      if (!edgeType.success) return;
      edgeType = edgeType.data;
    }

    // Find target node by name
    const target = nodes.find(n => n.name?.toLowerCase() === targetInput.toLowerCase() && n.id !== nodeId);
    if (!target) return;

    await createEdge({
      in:   edgeDirection === 'out' ? nodeId : target.id,
      out:  edgeDirection === 'out' ? target.id : nodeId,
      type: edgeType.id,
    });

    setEdgeTypeInput('');
    setEdgeTargetInput('');
    setAddingEdge(false);
  }

  const edgeTypeName = (typeId) => {
    const et = edgeTypes.find(e => e.id === typeId);
    return et?.name ?? typeId;
  };

  return (
    <div className={`ndp${fullWidth ? ' ndp--full' : ''}`}>
      <div className="ndp-header">
        {editingName ? (
          <input
            ref={nameRef}
            className="ndp-name-input"
            value={nameValue}
            onChange={e => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={e => {
              if (e.key === 'Enter') saveName();
              if (e.key === 'Escape') { setNameValue(node.name ?? ''); setEditingName(false); }
            }}
          />
        ) : (
          <h2 className="ndp-name" onDoubleClick={() => setEditingName(true)} title="Double-click to edit">
            {node.name || 'Untitled'}
          </h2>
        )}
        <div className="ndp-header-actions">
          <span className="ndp-schema-badge">{node.schema}</span>
          {node.schema === 'group' && (
            <button className="ndp-enter-btn" onClick={() => enterNode(nodeId)} title="Enter group">→</button>
          )}
          <button className="ndp-close-btn" onClick={onClose} title="Close">×</button>
        </div>
      </div>

      {/* Sources */}
      {node.schema === 'object' && (
        <div className="ndp-section">
          <div className="ndp-section-label">Sources</div>
          {(node.sources ?? []).length === 0 ? (
            <div className="ndp-empty-hint">No sources</div>
          ) : (
            (node.sources ?? []).map((s, i) => <SourceItem key={i} source={s} />)
          )}
        </div>
      )}

      {/* Edges */}
      <div className="ndp-section ndp-section--edges">
        <div className="ndp-section-label-row">
          <span className="ndp-section-label">Edges</span>
          <button className="ndp-add-edge-btn" onClick={() => setAddingEdge(v => !v)}>+</button>
        </div>

        {Object.entries(edgesByType).map(([typeId, typeEdges]) => (
          <EdgeGroup
            key={typeId}
            label={edgeTypeName(typeId)}
            edges={typeEdges}
            nodes={nodes}
            edgeTypes={edgeTypes}
            onRemove={deleteEdge}
          />
        ))}

        {Object.keys(edgesByType).length === 0 && !addingEdge && (
          <div className="ndp-empty-hint">No edges</div>
        )}

        {addingEdge && (
          <div className="ndp-add-edge-form">
            <div className="ndp-add-edge-direction">
              <button
                className={`ndp-dir-btn${edgeDirection === 'out' ? ' active' : ''}`}
                onClick={() => setEdgeDirection('out')}
              >→ out</button>
              <button
                className={`ndp-dir-btn${edgeDirection === 'in' ? ' active' : ''}`}
                onClick={() => setEdgeDirection('in')}
              >← in</button>
            </div>
            <input
              className="ndp-add-edge-input"
              placeholder="Edge type (e.g. author)"
              value={edgeTypeInput}
              onChange={e => setEdgeTypeInput(e.target.value)}
            />
            <input
              className="ndp-add-edge-input"
              placeholder="Target node name"
              value={edgeTargetInput}
              onChange={e => setEdgeTargetInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddEdge(); if (e.key === 'Escape') setAddingEdge(false); }}
            />
            <div className="ndp-add-edge-actions">
              <button className="ndp-add-edge-confirm" onClick={handleAddEdge}>Add</button>
              <button className="ndp-add-edge-cancel" onClick={() => setAddingEdge(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
