import { useEffect, useRef, useState } from 'react';
import { createForceSimulation, stopSimulation } from '../lib/forceSimulation';
import { select } from 'd3-selection';
import { zoom } from 'd3-zoom';
import { drag } from 'd3-drag';
import '../styles/GraphView.css';

/**
 * GraphView - Renders a D3 force-directed graph
 *
 * Author: Claude Code (Anthropic)
 */
export default function GraphView({ objects }) {
  const svgRef = useRef(null);
  const simulationRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Initialize force simulation and render loop
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = select(svgRef.current);

    if (!objects || objects.length === 0) {
      svg.selectAll('*').remove();
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const width = rect.width || 800;
    const height = rect.height || 600;

    setDimensions({ width, height });

    // Create node data with initial positions
    const nodes = objects.map((obj, i) => {
      const fallback = obj.name.length > 24 ? obj.name.slice(0, 23) + '…' : obj.name;
      return {
        id: obj.id,
        name: obj.name,
        displayLabel: obj.label || fallback,
        source: obj.sources?.[0]?.uri,
        x: width / 2 + (Math.random() - 0.5) * 100,
        y: height / 2 + (Math.random() - 0.5) * 100,
      };
    });

    // Create force simulation
    const simulation = createForceSimulation(nodes, { width, height }, () => {
      updateNodePositions();
    });

    simulationRef.current = simulation;

    // Create SVG groups
    svg.selectAll('*').remove();

    const g = svg.append('g').attr('class', 'graph-inner');

    // Add zoom behavior
    const zoomBehavior = zoom().on('zoom', (event) => {
      g.attr('transform', event.transform);
    });
    svg.call(zoomBehavior);

    // Disable double-click zoom
    svg.on('dblclick.zoom', null);

    // Create node group
    const nodeGroup = g.selectAll('.node').data(nodes, (d) => d.id).enter().append('g').attr('class', 'node-group');

    nodeGroup.append('circle').attr('class', 'node').attr('r', 12);

    nodeGroup.append('text').attr('class', 'node-label').attr('text-anchor', 'start').attr('dx', '18px').attr('dy', '0.3em').text((d) => d.displayLabel);

    // Add drag behavior
    nodeGroup.call(
      drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
    );

    // Add hover event handlers
    nodeGroup.on('mouseenter', function () {
      select(this).classed('hovered', true);
    }).on('mouseleave', function () {
      select(this).classed('hovered', false);
    });

    // Cmd/Ctrl+Click: open source
    nodeGroup.on('click', (event, d) => {
      event.stopPropagation();
      if (event.metaKey || event.ctrlKey) window.electronAPI?.openSource?.(d.source);
    });

    // Update positions on each simulation tick
    function updateNodePositions() {
      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
    }

    // Initial layout
    updateNodePositions();

    return () => {
      stopSimulation(simulation);
    };
  }, [objects, dimensions.width, dimensions.height]);

  // Observe SVG element size — more reliable than window resize in Electron
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
