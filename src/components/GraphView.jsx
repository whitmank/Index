import { useEffect, useRef, useState } from 'react';
import { createForceSimulation, updateSimulationNodes, updateSimulationDimensions, stopSimulation } from '../lib/forceSimulation';
import { select } from 'd3-selection';
import { zoom } from 'd3-zoom';
import { drag } from 'd3-drag';
import '../styles/GraphView.css';

/**
 * GraphView - Renders a D3 force-directed graph.
 *
 * Lifecycle is split into three independent effects:
 *   mount    — creates SVG skeleton and zoom behavior once; never rebuilds
 *   data     — reconciles nodes in-place via D3 general update; preserves positions
 *   resize   — nudges forceCenter on container size change
 *
 * Author: Claude Code (Anthropic)
 */
export default function GraphView({ objects, onObjectSelect }) {
  const svgRef          = useRef(null);
  const simulationRef   = useRef(null);
  const onObjectSelectRef = useRef(onObjectSelect);
  const nodesRef        = useRef([]);           // live node array owned by simulation
  const gRef            = useRef(null);          // <g class="graph-inner"> D3 selection
  const nodeGroupRef    = useRef(null);          // current merged .node-group selection
  const zoomBehaviorRef = useRef(null);          // zoom instance — persists across data updates
  const dimensionsRef   = useRef({ width: 800, height: 600 }); // readable in async tick

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [selectedId, setSelectedId] = useState(null);

  // Keep callback ref current without causing other effects to re-run
  useEffect(() => { onObjectSelectRef.current = onObjectSelect; }, [onObjectSelect]);

  // ── Mount effect ────────────────────────────────────────────────────────────
  // Creates permanent SVG skeleton and zoom behavior. Runs once.
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = select(svgRef.current);
    svg.selectAll('*').remove();

    gRef.current = svg.append('g').attr('class', 'graph-inner');

    zoomBehaviorRef.current = zoom().on('zoom', (event) => {
      gRef.current.attr('transform', event.transform);
    });
    svg.call(zoomBehaviorRef.current);
    svg.on('dblclick.zoom', null);
  }, []);

  // ── Data update effect ──────────────────────────────────────────────────────
  // Reconciles nodes in-place. Never touches SVG structure or zoom state.
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;

    // Empty case: clear and stop
    if (!objects || objects.length === 0) {
      if (simulationRef.current) {
        stopSimulation(simulationRef.current);
        simulationRef.current = null;
      }
      gRef.current.selectAll('.node-group').remove();
      nodesRef.current = [];
      nodeGroupRef.current = null;
      return;
    }

    const { width, height } = dimensionsRef.current;

    // Reconcile positions: survivors keep x/y/vx/vy/fx/fy; new nodes spawn at center ± jitter
    const existingById = new Map(nodesRef.current.map(n => [n.id, n]));
    nodesRef.current = objects.map(obj => {
      const fallback = obj.name.length > 24 ? obj.name.slice(0, 23) + '…' : obj.name;
      const ex = existingById.get(obj.id);
      return {
        id: obj.id,
        name: obj.name,
        isSpace: !!obj.space,
        displayLabel: obj.label || fallback,
        source: obj.sources?.[0]?.uri,
        x:  ex?.x  ?? (width  / 2 + (Math.random() - 0.5) * 100),
        y:  ex?.y  ?? (height / 2 + (Math.random() - 0.5) * 100),
        vx: ex?.vx ?? 0,
        vy: ex?.vy ?? 0,
        fx: ex?.fx ?? null,
        fy: ex?.fy ?? null,
      };
    });

    // Simulation: create on first data (or after empty), otherwise update in-place
    if (!simulationRef.current) {
      simulationRef.current = createForceSimulation(
        () => nodesRef.current,
        { width, height },
        () => {
          if (nodeGroupRef.current) {
            nodeGroupRef.current.attr('transform', d => `translate(${d.x},${d.y})`);
          }
        }
      );
    } else {
      updateSimulationNodes(simulationRef.current, nodesRef.current, { width, height });
    }

    // D3 general update ─────────────────────────────────────────────────────────
    const g = gRef.current;
    const joined = g.selectAll('.node-group').data(nodesRef.current, d => d.id);

    // EXIT — remove DOM nodes for deleted objects
    joined.exit().remove();

    // ENTER — create elements for new nodes
    const entered = joined.enter().append('g').attr('class', 'node-group');

    entered.append('circle').attr('class', 'node').attr('r', 12);
    entered.append('text').attr('class', 'node-label')
      .attr('text-anchor', 'start').attr('dx', '18px').attr('dy', '0.3em');

    // Bind drag/hover/click only to entering nodes — handlers persist on DOM nodes
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
        if (event.metaKey || event.ctrlKey) {
          window.electronAPI?.openSource?.(d.source);
        } else {
          setSelectedId(d.id);
          onObjectSelectRef.current?.(d.id);
        }
      });

    // MERGE — update mutable display properties on all live nodes (enter + update)
    const merged = entered.merge(joined);
    merged.select('circle').classed('node--space', d => d.isSpace);
    merged.select('text').text(d => d.displayLabel);

    nodeGroupRef.current = merged;

    // Restore selected class after reconciliation
    g.selectAll('.node-group').classed('selected', d => d.id === selectedId);

  }, [objects]); // eslint-disable-line react-hooks/exhaustive-deps
  // selectedId is read for the post-reconciliation class restore but must not trigger this effect

  // ── Resize effect ───────────────────────────────────────────────────────────
  useEffect(() => {
    dimensionsRef.current = dimensions;
    if (!simulationRef.current) return;
    updateSimulationDimensions(simulationRef.current, dimensions);
  }, [dimensions]);

  // ── Selected class effect ───────────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    select(svgRef.current).selectAll('.node-group')
      .classed('selected', d => d.id === selectedId);
  }, [selectedId]);

  // ── ResizeObserver ──────────────────────────────────────────────────────────
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
