import { useEffect, useRef } from 'preact/hooks'
import { GraphController } from './graph'
import type { D3Config } from './types'

interface GraphProps {
  config: D3Config
  currentSlug: string
}

export default function Graph({ config, currentSlug }: GraphProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const graphInstanceRef = useRef<GraphController | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    // Initialize graph
    const graph = new GraphController(containerRef.current, currentSlug, config)
    graphInstanceRef.current = graph
    graph.init()

    // Cleanup on unmount
    return () => {
      if (graphInstanceRef.current) {
        graphInstanceRef.current.destroy()
        graphInstanceRef.current = null
      }
    }
  }, [currentSlug, config])

  return (
    <div className="graph">
      <h3>Knowledge Graph</h3>
      <div className="graph-outer">
        <div ref={containerRef} className="graph-container" />
      </div>
    </div>
  )
}
