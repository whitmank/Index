import { useEffect, useRef, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createSimulation,
  reheatSimulation,
  stopSimulation,
  addNode,
  removeNode,
  updateSimulationSize
} from '@index/force-sim'
import './GraphView.css'

function GraphView() {
  const { nodes, links } = useOutletContext()
  const containerRef = useRef(null)
  const svgRef = useRef(null)
  const simulationRef = useRef(null)

  const [graphNodes, setGraphNodes] = useState([])
  const [graphLinks, setGraphLinks] = useState([])
  const [dimensions, setDimensions] = useState(null) // null until measured
  const [draggedNode, setDraggedNode] = useState(null)
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 })

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height })
        if (simulationRef.current) {
          updateSimulationSize(simulationRef.current, width, height)
        }
      }
    }

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Initialize simulation when nodes/links change
  useEffect(() => {
    if (!nodes.length || !dimensions) return

    // Create copies of nodes and links for the simulation
    const simNodes = nodes.map(n => ({
      id: n.id,
      label: n.name,
      ...n
    }))

    const simLinks = links.map(l => ({
      id: l.id,
      source_id: l.source_node,
      target_id: l.target_node,
      ...l
    }))

    // Stop existing simulation
    if (simulationRef.current) {
      stopSimulation(simulationRef.current)
    }

    // Create new simulation
    const simulation = createSimulation(
      simNodes,
      simLinks,
      dimensions.width,
      dimensions.height
    )

    // Update state on each tick
    simulation.on('tick', () => {
      setGraphNodes([...simNodes])
      setGraphLinks([...simLinks])
    })

    simulationRef.current = simulation

    // Cleanup
    return () => {
      if (simulationRef.current) {
        stopSimulation(simulationRef.current)
      }
    }
  }, [nodes, links, dimensions])

  // Drag handlers
  const handleMouseDown = useCallback((e, node) => {
    e.preventDefault()
    setDraggedNode(node)

    // Fix node position during drag
    node.fx = node.x
    node.fy = node.y
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!draggedNode || !svgRef.current) return

    const svg = svgRef.current
    const rect = svg.getBoundingClientRect()

    // Convert screen coordinates to graph coordinates (accounting for zoom/pan)
    const x = (e.clientX - rect.left - transform.x) / transform.scale
    const y = (e.clientY - rect.top - transform.y) / transform.scale

    draggedNode.fx = x
    draggedNode.fy = y

    reheatSimulation(simulationRef.current)
  }, [draggedNode, transform])

  const handleMouseUp = useCallback(() => {
    if (draggedNode) {
      // Release the node
      draggedNode.fx = null
      draggedNode.fy = null
      setDraggedNode(null)
    }
  }, [draggedNode])

  // Zoom handler
  const handleWheel = useCallback((e) => {
    e.preventDefault()

    const scaleMultiplier = 0.1
    const delta = e.deltaY > 0 ? -scaleMultiplier : scaleMultiplier

    setTransform(prev => {
      const newScale = Math.min(Math.max(0.2, prev.scale + delta), 4) // Clamp between 0.2x and 4x

      // Zoom toward mouse position
      const rect = svgRef.current.getBoundingClientRect()
      const mouseX = e.clientX - rect.left
      const mouseY = e.clientY - rect.top

      // Adjust pan to zoom toward cursor
      const scaleRatio = newScale / prev.scale
      const newX = mouseX - (mouseX - prev.x) * scaleRatio
      const newY = mouseY - (mouseY - prev.y) * scaleRatio

      return { scale: newScale, x: newX, y: newY }
    })
  }, [])

  // Get node color based on type
  const getNodeColor = (node) => {
    const colors = {
      'file': '#5c6bc0',
      'directory': '#66bb6a',
      'image': '#ef5350',
      'document': '#42a5f5',
      'video': '#ab47bc',
      'audio': '#26a69a'
    }
    return colors[node.type] || '#5c6bc0'
  }

  return (
    <div className="content-area graph-view" ref={containerRef}>
      <svg
        ref={svgRef}
        className="graph-canvas"
        width={dimensions?.width || '100%'}
        height={dimensions?.height || '100%'}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Transform group for zoom/pan */}
        <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}>
          {/* Links */}
          <g className="links">
            {graphLinks.map(link => (
              <line
                key={link.id}
                className="graph-link"
                x1={link.source?.x || 0}
                y1={link.source?.y || 0}
                x2={link.target?.x || 0}
                y2={link.target?.y || 0}
              />
            ))}
          </g>

          {/* Nodes */}
          <g className="nodes">
            {graphNodes.map(node => (
              <g
                key={node.id}
                className={`graph-node ${draggedNode?.id === node.id ? 'dragging' : ''}`}
                transform={`translate(${node.x || 0}, ${node.y || 0})`}
                onMouseDown={(e) => handleMouseDown(e, node)}
              >
                <circle
                  r={6}
                  fill={getNodeColor(node)}
                />
                <text
                  className="node-label"
                  dy={16}
                  textAnchor="middle"
                >
                  {node.label?.length > 12 ? node.label.substring(0, 12) + '...' : node.label}
                </text>
              </g>
            ))}
          </g>
        </g>
      </svg>

      {/* Empty state */}
      {nodes.length === 0 && (
        <div className="graph-empty">
          <p>No nodes to display.</p>
          <p>Add some files to see them in the graph view.</p>
        </div>
      )}
    </div>
  )
}

export default GraphView
