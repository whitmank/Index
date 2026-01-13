import type { ContentDetails, NodeData, LinkData, SimpleLinkData } from './types'

export class GraphDataProcessor {
  private data: Map<string, ContentDetails>
  private validLinks: Set<string>

  constructor(contentIndex: Record<string, ContentDetails>) {
    this.data = new Map(Object.entries(contentIndex))
    this.validLinks = new Set(this.data.keys())
  }

  /**
   * Build links from content details
   * Creates links between nodes based on outgoing links in content
   * Optionally creates links to tag nodes
   */
  buildLinks(showTags: boolean, removeTags: string[]): { links: SimpleLinkData[], tags: string[] } {
    const links: SimpleLinkData[] = []
    const tags: string[] = []

    for (const [source, details] of this.data.entries()) {
      const outgoing = details.links ?? []

      // Add outgoing links if target exists
      for (const dest of outgoing) {
        if (this.validLinks.has(dest)) {
          links.push({ source: source, target: dest })
        }
      }

      // Add tag nodes if enabled
      if (showTags) {
        const localTags = details.tags
          .filter((tag) => !removeTags.includes(tag))
          .map((tag) => `tags/${tag}`)

        // Add unique tags to tags array
        tags.push(...localTags.filter((tag) => !tags.includes(tag)))

        // Create links from node to its tags
        for (const tag of localTags) {
          links.push({ source: source, target: tag })
        }
      }
    }

    return { links, tags }
  }

  /**
   * Compute neighborhood using BFS (Breadth-First Search)
   * Uses sentinel value "__SENTINEL" to track depth levels
   *
   * @param startSlug - Starting node
   * @param depth - How many hops to include (1 = immediate neighbors, -1 = all nodes)
   * @param links - All links in the graph
   * @param showTags - Whether to include tag nodes
   * @param tags - Array of tag node IDs
   */
  computeNeighborhood(
    startSlug: string,
    depth: number,
    links: SimpleLinkData[],
    showTags: boolean,
    tags: string[]
  ): Set<string> {
    const neighbourhood = new Set<string>()

    // If depth is negative, include all nodes
    if (depth < 0) {
      this.validLinks.forEach((id) => neighbourhood.add(id))
      if (showTags) {
        tags.forEach((tag) => neighbourhood.add(tag))
      }
      return neighbourhood
    }

    // BFS with sentinel to track depth
    const wl: (string | "__SENTINEL")[] = [startSlug, "__SENTINEL"]
    let currentDepth = depth

    while (currentDepth >= 0 && wl.length > 0) {
      const cur = wl.shift()!

      if (cur === "__SENTINEL") {
        currentDepth--
        // Add sentinel back if we haven't finished
        if (wl.length > 0) {
          wl.push("__SENTINEL")
        }
      } else {
        neighbourhood.add(cur)

        // Find all neighbors (both outgoing and incoming links)
        const outgoing = links.filter((l) => l.source === cur)
        const incoming = links.filter((l) => l.target === cur)

        // Add neighbors to work list
        wl.push(
          ...outgoing.map((l) => l.target),
          ...incoming.map((l) => l.source)
        )
      }
    }

    return neighbourhood
  }

  /**
   * Build final graph data structure
   * Creates NodeData and LinkData objects from the neighborhood
   */
  buildGraphData(neighbourhood: Set<string>, links: SimpleLinkData[]): { nodes: NodeData[], links: LinkData[] } {
    // Create nodes from neighborhood
    const nodes: NodeData[] = [...neighbourhood].map((id) => {
      // Tag nodes start with "tags/" prefix
      const text = id.startsWith("tags/")
        ? "#" + id.substring(5)
        : (this.data.get(id)?.title ?? id)

      return {
        id: id,
        text: text,
        tags: this.data.get(id)?.tags ?? [],
      }
    })

    // Filter links to only include those in the neighborhood
    // Convert simple links to D3 link format
    const graphLinks: LinkData[] = links
      .filter((l) => neighbourhood.has(l.source) && neighbourhood.has(l.target))
      .map((l) => ({
        source: nodes.find((n) => n.id === l.source)!,
        target: nodes.find((n) => n.id === l.target)!,
      }))

    return {
      nodes,
      links: graphLinks
    }
  }

  /**
   * Get content details for a specific slug
   */
  getContent(slug: string): ContentDetails | undefined {
    return this.data.get(slug)
  }
}
