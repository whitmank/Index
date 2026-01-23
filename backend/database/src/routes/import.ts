import { Router, Request, Response } from 'express';
import { registry } from '@index/source-handlers';
import { dbService } from '../db-service';
import type { ImportSourceRequest, ImportSourceResponse, IndexObject } from '@shared/types/models';

const router = Router();

/**
 * POST /api/objects/import
 * Import a source (file:// or https://) and create an object
 *
 * Request:
 * {
 *   source: "file:///path/to/file.pdf",
 *   tags: ["tag1", "tag2"],
 *   notes: "optional notes"
 * }
 *
 * Response:
 * {
 *   object: { ... },
 *   tags_assigned: ["tag1", "tag2"]
 * }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as ImportSourceRequest;

    // Validate required fields
    if (!data.source) {
      return res.status(400).json({
        error: 'Missing required field: source (URI)',
      });
    }

    // Step 1: Check if handler exists for this source
    if (!registry.canHandle(data.source)) {
      return res.status(400).json({
        error: `Unsupported source type: ${data.source.split('://')[0]}`,
        supported_schemes: registry.getSchemes(),
      });
    }

    // Step 2: Check for duplicate by source URI
    const existing = await dbService.getObjectBySource(data.source);
    if (existing) {
      return res.status(409).json({
        error: 'Object with this source already exists',
        existing_id: existing.id,
      });
    }

    // Step 3: Extract metadata via handler
    let metadata;
    try {
      metadata = await registry.extractMetadata(data.source);
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to extract metadata from source',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 4: Compute content hash
    let contentHash;
    try {
      contentHash = await registry.getContentHash(data.source);
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to compute content hash',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 5: Create object in database
    let object: IndexObject;
    try {
      object = await dbService.createObject({
        source: data.source,
        type: data.source.startsWith('file://') ? 'file' : 'url',
        name: metadata.name || 'Untitled',
        content_hash: contentHash,
        source_meta: metadata,
        user_meta: data.notes ? { notes: data.notes } : {},
      });
    } catch (error) {
      console.error('Error creating object:', error);
      return res.status(500).json({
        error: 'Failed to create object in database',
        details: error instanceof Error ? error.message : String(error),
      });
    }

    // Step 6: Assign tags if provided
    const tagsAssigned: string[] = [];
    if (data.tags && data.tags.length > 0) {
      try {
        // First, get or create tag definitions
        const existingTags = await dbService.getTagDefinitions();
        const existingTagNames = new Set(existingTags.map((t) => t.name));

        for (const tagName of data.tags) {
          let tagDef;

          // Find existing or create new
          const existing = existingTags.find((t) => t.name === tagName);
          if (existing) {
            tagDef = existing;
          } else {
            tagDef = await dbService.createTagDefinition({ name: tagName });
          }

          // Create assignment
          await dbService.assignTag(tagDef.id, object.id);
          tagsAssigned.push(tagName);
        }
      } catch (error) {
        console.warn('Error assigning tags:', error);
        // Don't fail the import if tags fail - object is already created
      }
    }

    // Step 7: Return success response
    const response: ImportSourceResponse = {
      object,
      tags_assigned: tagsAssigned,
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('[import] Unexpected error:', error);
    res.status(500).json({
      error: 'Failed to import source',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
