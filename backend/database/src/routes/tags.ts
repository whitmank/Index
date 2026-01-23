import { Router, Request, Response } from 'express';
import { dbService } from '../db-service';
import type { TagDefinition, TagAssignment } from '@shared/types/models';

const router = Router();

/**
 * ============================================
 * TAG DEFINITIONS
 * ============================================
 */

/**
 * GET /api/tags
 * Get all tag definitions
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tags = await dbService.getTagDefinitions();
    res.json({ tags });
  } catch (error) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

/**
 * GET /api/tags/:id
 * Get a specific tag definition
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tag = await dbService.getTagDefinition(id);

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json(tag);
  } catch (error) {
    console.error('Error fetching tag:', error);
    res.status(500).json({ error: 'Failed to fetch tag' });
  }
});

/**
 * POST /api/tags
 * Create a new tag definition
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<TagDefinition, 'id' | 'created_at'>;

    if (!data.name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const tag = await dbService.createTagDefinition(data);
    res.status(201).json(tag);
  } catch (error) {
    console.error('Error creating tag:', error);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

/**
 * PUT /api/tags/:id
 * Update a tag definition (including renaming)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const updates = req.body as Partial<Omit<TagDefinition, 'id' | 'created_at'>>;

    const tag = await dbService.updateTagDefinition(id, updates);
    res.json(tag);
  } catch (error) {
    console.error('Error updating tag:', error);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

/**
 * DELETE /api/tags/:id
 * Delete a tag definition (cascade to assignments)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await dbService.deleteTagDefinition(id);

    if (!success) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    res.json({ message: 'Tag deleted successfully', id });
  } catch (error) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

/**
 * ============================================
 * TAG ASSIGNMENTS
 * ============================================
 */

/**
 * POST /api/tags/assign
 * Assign a tag to an object
 */
router.post('/assign', async (req: Request, res: Response) => {
  try {
    const { tag_id, object_id } = req.body as { tag_id: string; object_id: string };

    if (!tag_id || !object_id) {
      return res.status(400).json({
        error: 'Missing required fields: tag_id, object_id',
      });
    }

    const assignment = await dbService.assignTag(tag_id, object_id);
    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error assigning tag:', error);
    res.status(500).json({ error: 'Failed to assign tag' });
  }
});

/**
 * DELETE /api/tags/assign/:id
 * Remove a tag assignment
 */
router.delete('/assign/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await dbService.unassignTag(id);

    if (!success) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    res.json({ message: 'Tag unassigned successfully', id });
  } catch (error) {
    console.error('Error unassigning tag:', error);
    res.status(500).json({ error: 'Failed to unassign tag' });
  }
});

/**
 * GET /api/objects/:id/tags
 * Get all tags for an object
 */
router.get('/object/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const tags = await dbService.getTagsForObject(id);
    res.json({ tags });
  } catch (error) {
    console.error('Error fetching tags for object:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

export default router;
