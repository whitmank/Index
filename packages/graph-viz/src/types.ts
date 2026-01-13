import { SimulationNodeDatum, SimulationLinkDatum } from "d3"
import { Graphics, Text } from "pixi.js"

// Graph configuration interface
export interface D3Config {
  drag: boolean
  zoom: boolean
  depth: number
  scale: number
  repelForce: number
  centerForce: number
  linkDistance: number
  fontSize: number
  opacityScale: number
  removeTags: string[]
  showTags: boolean
  focusOnHover?: boolean
  enableRadial?: boolean
}

// Content data structure from JSON
export interface ContentDetails {
  slug: string
  filePath: string
  title: string
  links: string[]
  tags: string[]
  content: string
}

// Node data for D3 simulation
export type NodeData = {
  id: string
  text: string
  tags: string[]
} & SimulationNodeDatum

// Simple link structure (before D3 processing)
export type SimpleLinkData = {
  source: string
  target: string
}

// Link data for D3 simulation
export type LinkData = {
  source: NodeData
  target: NodeData
} & SimulationLinkDatum<NodeData>

// Graphics rendering info
export type GraphicsInfo = {
  color: string
  gfx: Graphics
  alpha: number
  active: boolean
}

// Link rendering data
export type LinkRenderData = GraphicsInfo & {
  simulationData: LinkData
}

// Node rendering data
export type NodeRenderData = GraphicsInfo & {
  simulationData: NodeData
  label: Text
}

// Style map for CSS variables
export type StyleMap = {
  [key: string]: string
}

// Tween animation node
export type TweenNode = {
  update: (time: number) => void
  stop: () => void
}
