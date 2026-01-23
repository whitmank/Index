/**
 * Migration Script: v0.2 → v0.3
 *
 * This migration script transforms the v0.2 database schema to v0.3:
 * - nodes → objects (with URI-based source)
 * - tags split into tag_definitions + tag_assignments
 * - collections converted to new query format
 * - links updated with new schema
 *
 * Phase 1: Placeholder
 * Full implementation will connect to both v0.2 and v0.3 databases
 */

interface V02Node {
  id: string;
  name: string;
  source_path: string;
  type?: string;
  size?: number;
  content_hash?: string;
  timestamp_created: string;
  timestamp_modified: string;
  metadata?: Record<string, unknown>;
}

interface V02Tag {
  id: string;
  tag_name: string;
  node_id: string;
  timestamp_created: string;
}

interface V02Collection {
  id: string;
  name: string;
  tags: string[];
  color?: string;
  timestamp_created: string;
}

interface V02Link {
  id: string;
  source_node: string;
  target_node: string;
  type?: string;
  strength?: number;
  timestamp_created: string;
  timestamp_modified: string;
  metadata?: Record<string, unknown>;
}

interface V03Object {
  id: string;
  source: string; // file:// URI
  type: 'file' | 'url';
  name: string;
  content_hash?: string;
  source_meta?: Record<string, unknown>;
  user_meta?: Record<string, unknown>;
  created_at: string;
  modified_at: string;
  source_modified_at?: string;
}

interface V03TagDefinition {
  id: string;
  name: string;
  color?: string;
  description?: string;
  created_at: string;
}

interface V03TagAssignment {
  id: string;
  tag_id: string;
  object_id: string;
  created_at: string;
}

interface V03Collection {
  id: string;
  name: string;
  description?: string;
  query: {
    all?: string[];
    any?: string[];
    none?: string[];
  };
  color?: string;
  pinned?: boolean;
  created_at: string;
  modified_at: string;
}

interface V03Link {
  id: string;
  source_object: string;
  target_object: string;
  type: 'related' | 'derivative' | 'reference';
  label?: string;
  bidirectional: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
  modified_at: string;
}

export class Migration {
  /**
   * Convert v0.2 node to v0.3 object
   */
  private convertNode(node: V02Node): V03Object {
    // Convert source_path to file:// URI
    const source = node.source_path.startsWith('file://')
      ? node.source_path
      : `file://${node.source_path}`;

    return {
      id: node.id,
      source,
      type: 'file',
      name: node.name,
      content_hash: node.content_hash,
      source_meta: node.metadata || {},
      user_meta: {},
      created_at: node.timestamp_created,
      modified_at: node.timestamp_modified,
      source_modified_at: node.timestamp_modified,
    };
  }

  /**
   * Create tag definitions from unique tag names
   * Returns Map of tagName -> TagDefinition for lookup during assignment creation
   */
  private createTagDefinitions(v02Tags: V02Tag[]): Map<string, V03TagDefinition> {
    const uniqueTagNames = new Set<string>();
    const tagDefs = new Map<string, V03TagDefinition>();

    // Collect unique tag names
    v02Tags.forEach(tag => {
      uniqueTagNames.add(tag.tag_name);
    });

    // Create tag definitions
    uniqueTagNames.forEach(name => {
      const id = `tag_definitions:${this.generateId()}`;
      tagDefs.set(name, {
        id,
        name,
        color: undefined,
        description: undefined,
        created_at: new Date().toISOString(),
      });
    });

    return tagDefs;
  }

  /**
   * Create tag assignments from v0.2 tags
   */
  private createTagAssignments(
    v02Tags: V02Tag[],
    tagDefs: Map<string, V03TagDefinition>
  ): V03TagAssignment[] {
    const assignments: V03TagAssignment[] = [];

    v02Tags.forEach(v02Tag => {
      const tagDef = tagDefs.get(v02Tag.tag_name);
      if (!tagDef) {
        console.warn(`Tag definition not found for: ${v02Tag.tag_name}`);
        return;
      }

      assignments.push({
        id: `tag_assignments:${this.generateId()}`,
        tag_id: tagDef.id,
        object_id: v02Tag.node_id,
        created_at: v02Tag.timestamp_created,
      });
    });

    return assignments;
  }

  /**
   * Convert v0.2 collection to v0.3 collection
   */
  private convertCollection(v02Collection: V02Collection): V03Collection {
    return {
      id: v02Collection.id,
      name: v02Collection.name,
      description: undefined,
      query: {
        all: v02Collection.tags || [],
        any: undefined,
        none: undefined,
      },
      color: v02Collection.color,
      pinned: false,
      created_at: v02Collection.timestamp_created,
      modified_at: v02Collection.timestamp_created,
    };
  }

  /**
   * Convert v0.2 link to v0.3 link
   */
  private convertLink(v02Link: V02Link): V03Link {
    return {
      id: v02Link.id,
      source_object: v02Link.source_node,
      target_object: v02Link.target_node,
      type: (v02Link.type as 'related' | 'derivative' | 'reference') || 'related',
      label: undefined,
      bidirectional: false,
      metadata: v02Link.metadata,
      created_at: v02Link.timestamp_created,
      modified_at: v02Link.timestamp_modified,
    };
  }

  /**
   * Generate a simple ID for new records
   */
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Run the complete migration
   * Returns migration results with counts
   */
  async run(v02Data: {
    nodes: V02Node[];
    tags: V02Tag[];
    collections: V02Collection[];
    links: V02Link[];
  }): Promise<{
    objects: V03Object[];
    tagDefinitions: V03TagDefinition[];
    tagAssignments: V03TagAssignment[];
    collections: V03Collection[];
    links: V03Link[];
    stats: {
      nodesConverted: number;
      uniqueTagsCreated: number;
      tagsAssigned: number;
      collectionsConverted: number;
      linksConverted: number;
    };
  }> {
    console.log('🔄 Starting v0.2 → v0.3 migration...');

    // Step 1: Convert nodes to objects
    const objects = v02Data.nodes.map(node => this.convertNode(node));
    console.log(`✅ Converted ${objects.length} nodes → objects`);

    // Step 2: Create tag definitions and assignments
    const tagDefinitions = Array.from(this.createTagDefinitions(v02Data.tags).values());
    const tagAssignments = this.createTagAssignments(
      v02Data.tags,
      this.createTagDefinitions(v02Data.tags)
    );
    console.log(`✅ Created ${tagDefinitions.length} tag definitions`);
    console.log(`✅ Created ${tagAssignments.length} tag assignments`);

    // Step 3: Convert collections
    const collections = v02Data.collections.map(col => this.convertCollection(col));
    console.log(`✅ Converted ${collections.length} collections`);

    // Step 4: Convert links
    const links = v02Data.links.map(link => this.convertLink(link));
    console.log(`✅ Converted ${links.length} links`);

    const stats = {
      nodesConverted: objects.length,
      uniqueTagsCreated: tagDefinitions.length,
      tagsAssigned: tagAssignments.length,
      collectionsConverted: collections.length,
      linksConverted: links.length,
    };

    console.log('✅ Migration complete!');
    console.log('Statistics:', stats);

    return {
      objects,
      tagDefinitions,
      tagAssignments,
      collections,
      links,
      stats,
    };
  }
}

// Export for use in migration scripts
export default Migration;
