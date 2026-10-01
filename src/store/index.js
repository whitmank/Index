// Author: Claude Sonnet 4.6
// useIndexStore — 0.6 data store.
// Three tables: nodes, edge_types, edges.
// Group contents = edges with type=edge_types:contains.

import { create } from 'zustand';

export const HOME_NODE_ID = 'nodes:⟨~⟩';
export const ROOT_NODE_ID = 'nodes:⟨/⟩';

export const useIndexStore = create((set, get) => ({
  // ── Data ──────────────────────────────────────────────────────────────────
  nodes:      [],
  edgeTypes:  [],
  edges:      [],

  // ── Active view ───────────────────────────────────────────────────────────
  activeNodeId:    HOME_NODE_ID,
  activeView:      'list',   // 'list' | 'graph'

  // ── Navigation ────────────────────────────────────────────────────────────
  navHistory: [HOME_NODE_ID],
  navCursor:  0,

  loading: false,

  // ── Initial load ──────────────────────────────────────────────────────────

  loadAll: async () => {
    set({ loading: true });
    try {
      const [nodesRes, edgeTypesRes, edgesRes] = await Promise.all([
        window.electronAPI.db.getAllNodes(),
        window.electronAPI.db.getAllEdgeTypes(),
        window.electronAPI.db.getAllEdges(),
      ]);

      const nodes     = nodesRes.success     ? (nodesRes.data     || []) : [];
      const edgeTypes = edgeTypesRes.success ? (edgeTypesRes.data || []) : [];
      const edges     = edgesRes.success     ? (edgesRes.data     || []) : [];

      set({ nodes, edgeTypes, edges });
    } finally {
      set({ loading: false });
    }
  },

  // ── LIVE SELECT ───────────────────────────────────────────────────────────

  subscribeToLive: () => {
    window.electronAPI.onNodesLive(({ action, result }) => {
      const { nodes } = get();
      if (action === 'CREATE') set({ nodes: [...nodes, result] });
      else if (action === 'UPDATE') set({ nodes: nodes.map(n => n.id === result.id ? result : n) });
      else if (action === 'DELETE') {
        set({ nodes: nodes.filter(n => n.id !== result.id) });
        if (get().activeNodeId === result.id) get().enterNode(HOME_NODE_ID);
      }
    });

    window.electronAPI.onEdgeTypesLive(({ action, result }) => {
      const { edgeTypes } = get();
      if (action === 'CREATE') set({ edgeTypes: [...edgeTypes, result] });
      else if (action === 'UPDATE') set({ edgeTypes: edgeTypes.map(e => e.id === result.id ? result : e) });
      else if (action === 'DELETE') set({ edgeTypes: edgeTypes.filter(e => e.id !== result.id) });
    });

    window.electronAPI.onEdgesLive(({ action, result }) => {
      const { edges } = get();
      if (action === 'CREATE') set({ edges: [...edges, result] });
      else if (action === 'UPDATE') set({ edges: edges.map(e => e.id === result.id ? result : e) });
      else if (action === 'DELETE') set({ edges: edges.filter(e => e.id !== result.id) });
    });
  },

  // ── Navigation ────────────────────────────────────────────────────────────

  enterNode: (id) => {
    const { navHistory, navCursor } = get();
    const next = [...navHistory.slice(0, navCursor + 1), id];
    set({ activeNodeId: id, navHistory: next, navCursor: next.length - 1 });
    window.electronAPI?.app?.setActiveNode?.(id);
  },

  navBack: () => {
    const { navCursor, navHistory } = get();
    if (navCursor <= 0) return;
    const newCursor = navCursor - 1;
    const id = navHistory[newCursor];
    set({ navCursor: newCursor, activeNodeId: id });
    window.electronAPI?.app?.setActiveNode?.(id);
  },

  navForward: () => {
    const { navCursor, navHistory } = get();
    if (navCursor >= navHistory.length - 1) return;
    const newCursor = navCursor + 1;
    const id = navHistory[newCursor];
    set({ navCursor: newCursor, activeNodeId: id });
    window.electronAPI?.app?.setActiveNode?.(id);
  },

  canNavBack:    () => get().navCursor > 0,
  canNavForward: () => get().navCursor < get().navHistory.length - 1,

  setView: (v) => set({ activeView: v }),

  // ── Selectors ─────────────────────────────────────────────────────────────

  getActiveGroupNodes: () => {
    const { edges, nodes, activeNodeId } = get();
    const containsTypeId = 'edge_types:contains';
    const childIds = new Set(
      edges
        .filter(e => e.in === activeNodeId && e.type === containsTypeId)
        .map(e => e.out)
    );
    return nodes.filter(n => childIds.has(n.id));
  },

  getAllGroups: () => get().nodes.filter(n => n.schema === 'group'),

  getEdgesForNode: (id) => get().edges.filter(e => e.in === id || e.out === id),

  // ── Node actions ──────────────────────────────────────────────────────────

  createNode: async (data) => {
    const result = await window.electronAPI.db.createNode(data);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  updateNode: async (id, updates) => {
    const result = await window.electronAPI.db.updateNode(id, updates);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  deleteNode: async (id) => {
    const result = await window.electronAPI.db.deleteNode(id);
    if (!result.success) throw new Error(result.error);
  },

  // ── Edge type actions ──────────────────────────────────────────────────────

  createEdgeType: async (data) => {
    const result = await window.electronAPI.db.createEdgeType(data);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  deleteEdgeType: async (id) => {
    const result = await window.electronAPI.db.deleteEdgeType(id);
    if (!result.success) throw new Error(result.error);
  },

  // ── Edge actions ───────────────────────────────────────────────────────────

  createEdge: async (data) => {
    const result = await window.electronAPI.db.createEdge(data);
    if (!result.success) throw new Error(result.error);
    return result.data;
  },

  deleteEdge: async (id) => {
    const result = await window.electronAPI.db.deleteEdge(id);
    if (!result.success) throw new Error(result.error);
  },

  // ── Group membership helpers ───────────────────────────────────────────────

  addToGroup: async (groupId, nodeId) => {
    const result = await window.electronAPI.db.addToGroup(groupId, nodeId);
    if (!result.success) throw new Error(result.error);
  },

  removeFromGroup: async (groupId, nodeId) => {
    const result = await window.electronAPI.db.removeFromGroup(groupId, nodeId);
    if (!result.success) throw new Error(result.error);
  },
}));
