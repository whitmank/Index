import { Router, Request, Response } from 'express';
import { dbService } from '../db-service';
import type { Link } from '@shared/types/models';

const router = Router();

/**
 * GET /api/links
 * Get all links
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const links = await dbService.getLinks();
    res.json({ links });
  } catch (error) {
    console.error('Error fetching links:', error);
    res.status(500).json({ error: 'Failed to fetch links' });
  }
});

/**
 * POST /api/links
 * Create a new link
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<Link, 'id' | 'created_at' | 'modified_at'>;

    // Validate required fields
    if (!data.source_object || !data.target_object || !data.type) {
      return res.status(400).json({
        error: 'Missing required fields: source_object, target_object, type',
      });
    }

    const link = await dbService.createLink(data);
    res.status(201).json(link);
  } catch (error) {
    console.error('Error creating link:', error);
    res.status(500).json({ error: 'Failed to create link' });
  }
});

/**
 * PUT /api/links/:id
 * Update a link
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const updates = req.body as Partial<Link>;

    const link = await dbService.updateLink(id, updates);
    res.json(link);
  } catch (error) {
    console.error('Error updating link:', error);
    res.status(500).json({ error: 'Failed to update link' });
  }
});

/**
 * DELETE /api/links/:id
 * Delete a link
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await dbService.deleteLink(id);

    if (!success) {
      return res.status(404).json({ error: 'Link not found' });
    }

    res.json({ message: 'Link deleted successfully', id });
  } catch (error) {
    console.error('Error deleting link:', error);
    res.status(500).json({ error: 'Failed to delete link' });
  }
});

export default router;
