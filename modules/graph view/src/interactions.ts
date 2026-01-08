import { drag, zoom, select, zoomIdentity, ZoomTransform } from 'd3'
import type { Container, Text } from 'pixi.js'
import type { NodeData, NodeRenderData, LinkRenderData } from './types'
import type { GraphSimulation } from './simulation'

/**
 * Manages hover state and neighbor highlighting
 */
export class HoverStateManager {
  private hoveredNodeId: string | null = null
  private hoveredNeighbours: Set<string> = new Set()

  /**
   * Update hover state and mark active neighbors
   */
  updateHoverInfo(
    newHoveredId: string | null,
    nodeRenderData: NodeRenderData[],
    linkRenderData: LinkRenderData[]
  ): void {
    this.hoveredNodeId = newHoveredId

    if (newHoveredId === null) {
      // Clear hover state
      this.hoveredNeighbours = new Set()
      for (const n of nodeRenderData) {
        n.active = false
      }
      for (const l of linkRenderData) {
        l.active = false
      }
    } else {
      // Find and highlight neighbors
      this.hoveredNeighbours = new Set()
      for (const l of linkRenderData) {
        const linkData = l.simulationData
        if (linkData.source.id === newHoveredId || linkData.target.id === newHoveredId) {
          this.hoveredNeighbours.add(linkData.source.id)
          this.hoveredNeighbours.add(linkData.target.id)
        }

        l.active = linkData.source.id === newHoveredId || linkData.target.id === newHoveredId
      }

      for (const n of nodeRenderData) {
        n.active = this.hoveredNeighbours.has(n.simulationData.id)
      }
    }
  }

  getHoveredNodeId(): string | null {
    return this.hoveredNodeId
  }

  isNeighbour(nodeId: string): boolean {
    return this.hoveredNeighbours.has(nodeId)
  }
}

/**
 * Handles drag interactions with click detection
 */
export class DragHandler {
  private dragStartTime: number = 0
  private dragging: boolean = false
  private currentTransform: ZoomTransform = zoomIdentity

  setCurrentTransform(transform: ZoomTransform): void {
    this.currentTransform = transform
  }

  isDragging(): boolean {
    return this.dragging
  }

  /**
   * Setup D3 drag behavior for node repositioning
   */
  setupDrag(
    canvas: HTMLCanvasElement,
    graphData: { nodes: NodeData[], links: any[] },
    simulation: GraphSimulation,
    getHoveredNodeId: () => string | null,
    onNodeClick: (nodeId: string) => void
  ): void {
    select<HTMLCanvasElement, NodeData | undefined>(canvas).call(
      drag<HTMLCanvasElement, NodeData | undefined>()
        .container(() => canvas)
        .subject(() => graphData.nodes.find((n) => n.id === getHoveredNodeId()))
        .on("start", (event) => {
          if (!event.active) simulation.restart()
          event.subject.fx = event.subject.x
          event.subject.fy = event.subject.y
          // @ts-ignore - Store initial drag position
          event.subject.__initialDragPos = {
            x: event.subject.x,
            y: event.subject.y,
            fx: event.subject.fx,
            fy: event.subject.fy,
          }
          this.dragStartTime = Date.now()
          this.dragging = true
        })
        .on("drag", (event) => {
          // @ts-ignore - Get initial position
          const initPos = event.subject.__initialDragPos
          event.subject.fx = initPos.x + (event.x - initPos.x) / this.currentTransform.k
          event.subject.fy = initPos.y + (event.y - initPos.y) / this.currentTransform.k
        })
        .on("end", (event) => {
          if (!event.active) simulation.getSimulation().alphaTarget(0)
          event.subject.fx = null
          event.subject.fy = null
          this.dragging = false

          // If drag duration < 500ms, treat as click
          if (Date.now() - this.dragStartTime < 500) {
            const node = graphData.nodes.find((n) => n.id === event.subject.id)
            if (node) {
              onNodeClick(node.id)
            }
          }
        })
    )
  }

  /**
   * Setup click handlers (when drag is disabled)
   */
  setupClickHandlers(
    nodeRenderData: NodeRenderData[],
    onNodeClick: (nodeId: string) => void
  ): void {
    for (const node of nodeRenderData) {
      node.gfx.on("click", () => {
        onNodeClick(node.simulationData.id)
      })
    }
  }
}

/**
 * Handles zoom and pan interactions
 */
export class ZoomHandler {
  private currentTransform: ZoomTransform = zoomIdentity

  getCurrentTransform(): ZoomTransform {
    return this.currentTransform
  }

  /**
   * Setup D3 zoom behavior
   * Updates stage transform and label opacity
   */
  setupZoom(
    canvas: HTMLCanvasElement,
    stage: Container,
    labelsContainer: Container<Text>,
    width: number,
    height: number,
    opacityScale: number,
    nodeRenderData: NodeRenderData[],
    onTransformChange: (transform: ZoomTransform) => void
  ): void {
    select<HTMLCanvasElement, NodeData>(canvas).call(
      zoom<HTMLCanvasElement, NodeData>()
        .extent([
          [0, 0],
          [width, height],
        ])
        .scaleExtent([0.25, 4])
        .on("zoom", ({ transform }) => {
          this.currentTransform = transform
          stage.scale.set(transform.k, transform.k)
          stage.position.set(transform.x, transform.y)

          // Adjust label opacity based on zoom level
          const scale = transform.k * opacityScale
          let scaleOpacity = Math.max((scale - 1) / 3.75, 0)
          const activeNodes = nodeRenderData.filter((n) => n.active).flatMap((n) => n.label)

          for (const label of labelsContainer.children) {
            if (!activeNodes.includes(label)) {
              label.alpha = scaleOpacity
            }
          }

          onTransformChange(transform)
        })
    )
  }
}

/**
 * Helper function to compute CSS variable styles for Pixi
 */
export function computeStyleMap(): Record<string, string> {
  const cssVars = [
    "--secondary",
    "--tertiary",
    "--gray",
    "--light",
    "--lightgray",
    "--dark",
    "--darkgray",
    "--bodyFont",
  ] as const

  return cssVars.reduce(
    (acc, key) => {
      acc[key] = getComputedStyle(document.documentElement).getPropertyValue(key)
      return acc
    },
    {} as Record<string, string>
  )
}

/**
 * Visited state management using localStorage
 */
const localStorageKey = "graph-visited"

export function getVisited(): Set<string> {
  return new Set(JSON.parse(localStorage.getItem(localStorageKey) ?? "[]"))
}

export function addToVisited(slug: string): void {
  const visited = getVisited()
  visited.add(slug)
  localStorage.setItem(localStorageKey, JSON.stringify([...visited]))
}
