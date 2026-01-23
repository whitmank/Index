import { describe, it, expect } from 'vitest';
import Migration from '../migrations/v0.2-to-v0.3';

describe('v0.2 → v0.3 Migration', () => {
  const migration = new Migration();

  describe('Node to Object conversion', () => {
    it('converts v0.2 node to v0.3 object', async () => {
      const v02Data = {
        nodes: [
          {
            id: 'nodes:1',
            name: 'test.pdf',
            source_path: '/Users/test/Documents/test.pdf',
            type: 'application/pdf',
            size: 1024,
            content_hash: 'sha256:abc123',
            timestamp_created: '2024-01-01T00:00:00Z',
            timestamp_modified: '2024-01-01T00:00:00Z',
            metadata: { mime_type: 'application/pdf' },
          },
        ],
        tags: [],
        collections: [],
        links: [],
      };

      const result = await migration.run(v02Data);

      expect(result.objects).toHaveLength(1);
      const obj = result.objects[0];
      expect(obj.source).toBe('file:///Users/test/Documents/test.pdf');
      expect(obj.type).toBe('file');
      expect(obj.name).toBe('test.pdf');
      expect(obj.content_hash).toBe('sha256:abc123');
    });

    it('converts URI-format source_path', async () => {
      const v02Data = {
        nodes: [
          {
            id: 'nodes:1',
            name: 'doc.txt',
            source_path: 'file:///tmp/doc.txt',
            timestamp_created: '2024-01-01T00:00:00Z',
            timestamp_modified: '2024-01-01T00:00:00Z',
          },
        ],
        tags: [],
        collections: [],
        links: [],
      };

      const result = await migration.run(v02Data);
      expect(result.objects[0].source).toBe('file:///tmp/doc.txt');
    });
  });

  describe('Tag splitting (definitions + assignments)', () => {
    it('creates tag definitions from unique tag names', async () => {
      const v02Data = {
        nodes: [{ id: 'nodes:1', name: 'file.txt', source_path: '/tmp/file.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' }],
        tags: [
          { id: 'tags:1', tag_name: 'important', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:2', tag_name: 'draft', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:3', tag_name: 'important', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
        ],
        collections: [],
        links: [],
      };

      const result = await migration.run(v02Data);

      // Should create 2 unique tag definitions
      expect(result.tagDefinitions).toHaveLength(2);
      const tagNames = result.tagDefinitions.map(t => t.name);
      expect(tagNames).toContain('important');
      expect(tagNames).toContain('draft');
    });

    it('creates tag assignments for all tags', async () => {
      const v02Data = {
        nodes: [{ id: 'nodes:1', name: 'file.txt', source_path: '/tmp/file.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' }],
        tags: [
          { id: 'tags:1', tag_name: 'important', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:2', tag_name: 'draft', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
        ],
        collections: [],
        links: [],
      };

      const result = await migration.run(v02Data);

      // Should create assignments for all tags
      expect(result.tagAssignments).toHaveLength(2);
      result.tagAssignments.forEach(assignment => {
        expect(assignment.object_id).toBe('nodes:1');
        expect(assignment.tag_id).toBeDefined();
      });
    });

    it('prevents duplicate tag definitions', async () => {
      const v02Data = {
        nodes: [
          { id: 'nodes:1', name: 'file1.txt', source_path: '/tmp/file1.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
          { id: 'nodes:2', name: 'file2.txt', source_path: '/tmp/file2.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
        ],
        tags: [
          { id: 'tags:1', tag_name: 'important', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:2', tag_name: 'important', node_id: 'nodes:2', timestamp_created: '2024-01-01T00:00:00Z' },
        ],
        collections: [],
        links: [],
      };

      const result = await migration.run(v02Data);

      // Should create only 1 tag definition for 'important'
      expect(result.tagDefinitions).toHaveLength(1);
      expect(result.tagDefinitions[0].name).toBe('important');
      // But 2 assignments (one per node)
      expect(result.tagAssignments).toHaveLength(2);
    });
  });

  describe('Collection query conversion', () => {
    it('converts v0.2 collection tags to v0.3 query', async () => {
      const v02Data = {
        nodes: [],
        tags: [],
        collections: [
          {
            id: 'collections:1',
            name: 'Important Documents',
            tags: ['important', 'draft'],
            color: '#FF0000',
            timestamp_created: '2024-01-01T00:00:00Z',
          },
        ],
        links: [],
      };

      const result = await migration.run(v02Data);

      expect(result.collections).toHaveLength(1);
      const collection = result.collections[0];
      expect(collection.name).toBe('Important Documents');
      expect(collection.color).toBe('#FF0000');
      expect(collection.query.all).toEqual(['important', 'draft']);
      expect(collection.query.any).toBeUndefined();
      expect(collection.query.none).toBeUndefined();
    });
  });

  describe('Link conversion', () => {
    it('converts v0.2 links to v0.3 format', async () => {
      const v02Data = {
        nodes: [],
        tags: [],
        collections: [],
        links: [
          {
            id: 'links:1',
            source_node: 'nodes:1',
            target_node: 'nodes:2',
            type: 'related',
            timestamp_created: '2024-01-01T00:00:00Z',
            timestamp_modified: '2024-01-01T00:00:00Z',
          },
        ],
      };

      const result = await migration.run(v02Data);

      expect(result.links).toHaveLength(1);
      const link = result.links[0];
      expect(link.source_object).toBe('nodes:1');
      expect(link.target_object).toBe('nodes:2');
      expect(link.type).toBe('related');
      expect(link.bidirectional).toBe(false);
    });
  });

  describe('Data integrity', () => {
    it('preserves data counts during migration', async () => {
      const v02Data = {
        nodes: [
          { id: 'nodes:1', name: 'file1.txt', source_path: '/tmp/file1.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
          { id: 'nodes:2', name: 'file2.txt', source_path: '/tmp/file2.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
          { id: 'nodes:3', name: 'file3.txt', source_path: '/tmp/file3.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
        ],
        tags: [
          { id: 'tags:1', tag_name: 'tag1', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:2', tag_name: 'tag2', node_id: 'nodes:2', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:3', tag_name: 'tag1', node_id: 'nodes:3', timestamp_created: '2024-01-01T00:00:00Z' },
        ],
        collections: [
          { id: 'collections:1', name: 'col1', tags: ['tag1'], timestamp_created: '2024-01-01T00:00:00Z' },
        ],
        links: [
          { id: 'links:1', source_node: 'nodes:1', target_node: 'nodes:2', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
        ],
      };

      const result = await migration.run(v02Data);

      // All nodes should be converted
      expect(result.objects).toHaveLength(3);

      // Collections should be converted
      expect(result.collections).toHaveLength(1);

      // Links should be converted
      expect(result.links).toHaveLength(1);

      // All tags should be assigned (3 tag assignments, 2 unique definitions)
      expect(result.tagAssignments).toHaveLength(3);
      expect(result.tagDefinitions).toHaveLength(2);
    });

    it('provides accurate statistics', async () => {
      const v02Data = {
        nodes: [
          { id: 'nodes:1', name: 'file1.txt', source_path: '/tmp/file1.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
          { id: 'nodes:2', name: 'file2.txt', source_path: '/tmp/file2.txt', timestamp_created: '2024-01-01T00:00:00Z', timestamp_modified: '2024-01-01T00:00:00Z' },
        ],
        tags: [
          { id: 'tags:1', tag_name: 'tag1', node_id: 'nodes:1', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:2', tag_name: 'tag2', node_id: 'nodes:2', timestamp_created: '2024-01-01T00:00:00Z' },
          { id: 'tags:3', tag_name: 'tag1', node_id: 'nodes:2', timestamp_created: '2024-01-01T00:00:00Z' },
        ],
        collections: [],
        links: [],
      };

      const result = await migration.run(v02Data);

      expect(result.stats.nodesConverted).toBe(2);
      expect(result.stats.uniqueTagsCreated).toBe(2);
      expect(result.stats.tagsAssigned).toBe(3);
      expect(result.stats.collectionsConverted).toBe(0);
      expect(result.stats.linksConverted).toBe(0);
    });
  });
});
