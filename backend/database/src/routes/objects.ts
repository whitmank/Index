import { Router, Request, Response } from 'express';
import { dbService } from '../db-service';
import type { IndexObject } from '@shared/types/models';

const router = Router();

/**
 * GET /api/objects
 * Get all objects with optional filtering
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const objects = await dbService.getObjects();
    res.json({ objects });
  } catch (error) {
    console.error('Error fetching objects:', error);
    res.status(500).json({ error: 'Failed to fetch objects' });
  }
});

/**
 * GET /api/objects/:id
 * Get a specific object by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const object = await dbService.getObject(id);

    if (!object) {
      return res.status(404).json({ error: 'Object not found' });
    }

    res.json(object);
  } catch (error) {
    console.error('Error fetching object:', error);
    res.status(500).json({ error: 'Failed to fetch object' });
  }
});

/**
 * POST /api/objects
 * Create a new object
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as Omit<IndexObject, 'id' | 'created_at' | 'modified_at'>;

    // Validate required fields
    if (!data.source || !data.name || !data.type) {
      return res.status(400).json({
        error: 'Missing required fields: source, name, type',
      });
    }

    // Check for duplicate by source
    const existing = await dbService.getObjectBySource(data.source);
    if (existing) {
      return res.status(409).json({
        error: 'Object with this source already exists',
        existing_id: existing.id,
      });
    }

    const object = await dbService.createObject(data);
    res.status(201).json(object);
  } catch (error) {
    console.error('Error creating object:', error);
    res.status(500).json({ error: 'Failed to create object' });
  }
});

/**
 * PUT /api/objects/:id
 * Update an object
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const updates = req.body as Partial<IndexObject>;

    const object = await dbService.updateObject(id, updates);
    res.json(object);
  } catch (error) {
    console.error('Error updating object:', error);
    res.status(500).json({ error: 'Failed to update object' });
  }
});

/**
 * DELETE /api/objects/:id
 * Delete an object and its associations
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await dbService.deleteObject(id);

    if (!success) {
      return res.status(404).json({ error: 'Object not found' });
    }

    res.json({ message: 'Object deleted successfully', id });
  } catch (error) {
    console.error('Error deleting object:', error);
    res.status(500).json({ error: 'Failed to delete object' });
  }
});

export default router;
