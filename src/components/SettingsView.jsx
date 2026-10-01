// Author: Claude Sonnet 4.6
// SettingsView — simplified settings for 0.6.

import { useEffect, useState } from 'react';
import { useAppearance } from '../hooks/useAppearance';
import { useIndexStore } from '../store/index.js';
import './SettingsView.css';

export const TABS = [
  { id: 'devices',    label: 'Devices' },
  { id: 'edge-types', label: 'Edge Types' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'keybinds',   label: 'Keybinds' },
];

const KEYBIND_GROUPS = [
  {
    label: 'Navigation',
    bindings: [
      { keys: ['⌘', ','],   description: 'Open settings' },
      { keys: ['⌘', 'L'],   description: 'Search nodes' },
      { keys: ['⌘', '`'],   description: 'Go to home (~)' },
      { keys: ['⌘', '/'],   description: 'Go to root (/)' },
      { keys: ['A', '←'],   description: 'Navigate back' },
      { keys: ['D', '→'],   description: 'Navigate forward' },
      { keys: ['Esc'],      description: 'Dismiss / clear selection' },
    ],
  },
  {
    label: 'List View',
    bindings: [
      { keys: ['V'],         description: 'Toggle list / graph view' },
      { keys: ['⌘', 'V'],   description: 'Paste URL or file path' },
      { keys: ['W', '↑'],   description: 'Move selection up' },
      { keys: ['S', '↓'],   description: 'Move selection down' },
      { keys: ['Enter'],    description: 'Open node detail' },
      { keys: ['⌫'],       description: 'Delete selected' },
      { keys: ['⌘', 'A'],  description: 'Select all' },
    ],
  },
];

function Keys({ keys }) {
  return (
    <span className="keybind-keys">
      {keys.map((k, i) => <kbd key={i}>{k}</kbd>)}
    </span>
  );
}

function AppearanceTab() {
  const { values, update } = useAppearance();
  return (
    <div className="settings-section">
      <div className="settings-row">
        <label>Background hue</label>
        <input type="range" min={0} max={360} value={values.bgH} onChange={e => update('bgH', Number(e.target.value))} />
        <span className="settings-val">{values.bgH}°</span>
      </div>
      <div className="settings-row">
        <label>Saturation</label>
        <input type="range" min={0} max={100} value={values.bgS} onChange={e => update('bgS', Number(e.target.value))} />
        <span className="settings-val">{values.bgS}%</span>
      </div>
      <div className="settings-row">
        <label>Lightness</label>
        <input type="range" min={0} max={100} value={values.bgL} onChange={e => update('bgL', Number(e.target.value))} />
        <span className="settings-val">{values.bgL}%</span>
      </div>
      <div className="settings-row">
        <label>Opacity</label>
        <input type="range" min={0.1} max={1} step={0.01} value={values.bgA} onChange={e => update('bgA', Number(e.target.value))} />
        <span className="settings-val">{(values.bgA * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function DevicesTab() {
  const nodes = useIndexStore(s => s.nodes.filter(n => n.schema === 'device'));
  return (
    <div className="settings-section">
      {nodes.length === 0 ? (
        <div className="settings-empty">No devices</div>
      ) : (
        nodes.map(n => (
          <div key={n.id} className="settings-device-row">
            <span className="settings-device-name">{n.name}</span>
            <span className="settings-device-id">{n.id}</span>
          </div>
        ))
      )}
    </div>
  );
}

function EdgeTypesTab() {
  const edgeTypes    = useIndexStore(s => s.edgeTypes);
  const createEdgeType = useIndexStore(s => s.createEdgeType);
  const deleteEdgeType = useIndexStore(s => s.deleteEdgeType);
  const [newName, setNewName] = useState('');

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    await createEdgeType({ name });
    setNewName('');
  }

  return (
    <div className="settings-section">
      <div className="settings-edge-type-list">
        {edgeTypes.length === 0 ? (
          <div className="settings-empty">No edge types yet</div>
        ) : (
          edgeTypes.map(et => (
            <div key={et.id} className="settings-edge-type-row">
              <span className="settings-edge-type-name">{et.name}</span>
              <button
                className="settings-edge-type-delete"
                onClick={() => deleteEdgeType(et.id)}
                title="Delete edge type"
              >×</button>
            </div>
          ))
        )}
      </div>
      <div className="settings-edge-type-new">
        <input
          className="settings-edge-type-input"
          placeholder="New edge type name…"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
        />
        <button className="settings-edge-type-add" onClick={handleCreate}>Add</button>
      </div>
    </div>
  );
}

function KeybindsTab() {
  return (
    <div className="settings-section">
      {KEYBIND_GROUPS.map(group => (
        <div key={group.label} className="keybind-group">
          <div className="keybind-group-label">{group.label}</div>
          <table className="keybind-table">
            <tbody>
              {group.bindings.map((b, i) => (
                <tr key={i}>
                  <td><Keys keys={b.keys} /></td>
                  <td className="keybind-desc">{b.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

export default function SettingsView({ activeTab, onTabChange }) {
  const [localTab, setLocalTab] = useState('devices');
  const currentTab = activeTab ?? localTab;
  const setTab = onTabChange ?? setLocalTab;

  useEffect(() => {
    function handleKeyDown(e) {
      if (!e.metaKey) return;
      const index = parseInt(e.key, 10) - 1;
      if (index >= 0 && index < TABS.length) {
        e.preventDefault();
        setTab(TABS[index].id);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="settings-view">
      <nav className="settings-view-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`settings-view-tab${currentTab === tab.id ? ' active' : ''}`}
            onClick={() => setTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="settings-view-body">
        {currentTab === 'devices'    && <DevicesTab />}
        {currentTab === 'edge-types' && <EdgeTypesTab />}
        {currentTab === 'appearance' && <AppearanceTab />}
        {currentTab === 'keybinds'   && <KeybindsTab />}
      </div>
    </div>
  );
}
