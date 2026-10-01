// Author: Claude Sonnet 4.6
// GraphView — D3 force-directed graph for nodes.
// Three independent effects: mount, data, resize.

import { useEffect, useRef, useState } from 'react';
import { createForceSimulation, updateSimulationNodes, updateSimulationDimensions, stopSimulation } from '../lib/forceSimulation';
import { useIndexStore } from '../store/index';
import { select } from 'd3-selection';
import { zoom } from 'd3-zoom';
import { drag } from 'd3-drag';
import './GraphView.css';

export default function GraphView({ nodes, onNodeSelect }) {
  const edges     = useIndexStore(s => s.edges);
  const edgeTypes = useIndexStore(s => s.edgeTypes);

  const svgRef            = useRef(null);
  const simulationRef     = useRef(null);
  const onNodeSelectRef   = useRef(onNodeSelect);
  const nodesRef          = useRef([]);
  const edgesRef          = useRef([]);
  const gRef              = useRef(null);
  const nodeGroupRef      = useRef(null);
  const edgeGroupRef      = useRef(null);
  const zoomBehaviorRef   = useRef(null);
  const dimensionsRef     = useRef({ width: 800, height: 600 });

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => { onNodeSelectRef.current = onNodeSelect; }, [onNodeSelect]);

  // ── Mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 20)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', 'rgba(0,0,0,0.25)');

    const g = svg.append('g').attr('class', 'graph-inner');
    edgeGroupRef.current = g.append('g').attr('class', 'graph-edges');
    gRef.current = g;

    zoomBehaviorRef.current = zoom().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoomBehaviorRef.current);
    svg.on('dblclick.zoom', null);
  }, []);

  // ── Data update ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    const { width, height } = dimensionsRef.current;
    const nodeIds = new Set(nodes.map(n => n.id));

    // Reconcile node positions
    const existingById = new Map(nodesRef.current.map(n => [n.id, n]));
    nodesRef.current = nodes.map(obj => {
      const ex = existingById.get(obj.id);
      return {
        id: obj.id,
        name: obj.name,
        schema: obj.schema,
        x:  ex?.x  ?? (width  / 2 + (Math.random() - 0.5) * 100),
        y:  ex?.y  ?? (height / 2 + (Math.random() - 0.5) * 100),
        vx: ex?.vx ?? 0,
        vy: ex?.vy ?? 0,
        fx: ex?.fx ?? null,
        fy: ex?.fy ?? null,
      };
    });

    // Filter edges to visible nodes
    edgesRef.current = edges
      .filter(e => nodeIds.has(e.in) && nodeIds.has(e.out))
      .map(e => ({
        id:     e.id,
        source: e.in,
        target: e.out,
        type:   e.type,
      }));

    if (nodesRef.current.length === 0) {
      if (simulationRef.current) { stopSimulation(simulationRef.current); simulationRef.current = null; }
      gRef.current.selectAll('.node-group').remove();
      edgeGroupRef.current.selectAll('line').remove();
      nodeGroupRef.current = null;
      return;
    }

    const renderTick = () => {
      // Update edge positions
      edgeGroupRef.current.selectAll('line')
        .attr('x1', d => { const n = nodesRef.current.find(x => x.id === d.source); return n?.x ?? 0; })
        .attr('y1', d => { const n = nodesRef.current.find(x => x.id === d.source); return n?.y ?? 0; })
        .attr('x2', d => { const n = nodesRef.current.find(x => x.id === d.target); return n?.x ?? 0; })
        .attr('y2', d => { const n = nodesRef.current.find(x => x.id === d.target); return n?.y ?? 0; });
      // Update node positions
      if (nodeGroupRef.current) {
        nodeGroupRef.current.attr('transform', d => `translate(${d.x},${d.y})`);
      }
    };

    if (!simulationRef.current) {
      simulationRef.current = createForceSimulation(
        () => nodesRef.current,
        { width, height },
        renderTick,
      );
    } else {
      updateSimulationNodes(simulationRef.current, nodesRef.current, { width, height });
    }

    // Edges
    const edgeJoined = edgeGroupRef.current.selectAll('line').data(edgesRef.current, d => d.id);
    edgeJoined.exit().remove();
    edgeJoined.enter().append('line')
      .attr('class', 'graph-edge')
      .attr('marker-end', 'url(#arrowhead)');

    // Nodes
    const joined = gRef.current.selectAll('.node-group').data(nodesRef.current, d => d.id);
    joined.exit().remove();

    const entered = joined.enter().append('g').attr('class', 'node-group');
    entered.append('circle').attr('class', 'node').attr('r', 12);
    entered.append('text').attr('class', 'node-label')
      .attr('text-anchor', 'start').attr('dx', '18px').attr('dy', '0.3em');

    entered.call(
      drag()
        .on('start', (event, d) => {
          if (!event.active) simulationRef.current.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on('end', (event, d) => {
          if (!event.active) simulationRef.current.alphaTarget(0);
          d.fx = null; d.fy = null;
        })
    );

    entered
      .on('mouseenter', function() { select(this).classed('hovered', true); })
      .on('mouseleave', function() { select(this).classed('hovered', false); })
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedId(d.id);
        onNodeSelectRef.current?.(d.id);
      });

    const merged = entered.merge(joined);
    merged.select('circle').classed('node--group', d => d.schema === 'group');
    merged.select('text').text(d => d.name?.length > 24 ? d.name.slice(0, 23) + '…' : (d.name ?? ''));

    nodeGroupRef.current = merged;

    gRef.current.selectAll('.node-group').classed('selected', d => d.id === selectedId);

  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Resize ───────────────────────────────────────────────────────────────
  useEffect(() => {
    dimensionsRef.current = dimensions;
    if (!simulationRef.current) return;
    updateSimulationDimensions(simulationRef.current, dimensions);
  }, [dimensions]);

  // ── Selected class ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    select(svgRef.current).selectAll('.node-group').classed('selected', d => d.id === selectedId);
  }, [selectedId]);

  // ── ResizeObserver ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDimensions({ width, height });
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, []);

  return <svg ref={svgRef} className="graph-view" />;
}
