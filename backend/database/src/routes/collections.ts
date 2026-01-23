import { Router, Request, Response } from 'express';
import { dbService } from '../db-service';
import type { Collection, CreateCollectionRequest, UpdateCollectionRequest } from '@shared/types/models';

const router = Router();

/**
 * GET /api/collections
 * Get all collections
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const collections = await dbService.getCollections();
    res.json({ collections });
  } catch (error) {
    console.error('Error fetching collections:', error);
    res.status(500).json({ error: 'Failed to fetch collections' });
  }
});

/**
 * GET /api/collections/:id
 * Get a specific collection
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const collection = await dbService.getCollection(id);

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json(collection);
  } catch (error) {
    console.error('Error fetching collection:', error);
    res.status(500).json({ error: 'Failed to fetch collection' });
  }
});

/**
 * GET /api/collections/:id/objects
 * Get objects that match the collection query
 */
router.get('/:id/objects', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const collection = await dbService.getCollection(id);

    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    // Evaluate the collection query
    const objects = await dbService.evaluateCollectionQuery(collection.query);
    res.json({ objects, query: collection.query });
  } catch (error) {
    console.error('Error fetching collection objects:', error);
    res.status(500).json({ error: 'Failed to fetch collection objects' });
  }
});

/**
 * POST /api/collections
 * Create a new collection
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = req.body as CreateCollectionRequest;

    // Validate required fields
    if (!data.name || !data.query) {
      return res.status(400).json({
        error: 'Missing required fields: name, query',
      });
    }

    const collection = await dbService.createCollection({
      name: data.name,
      description: data.description,
      query: data.query,
      color: data.color,
      pinned: data.pinned,
    });

    res.status(201).json(collection);
  } catch (error) {
    console.error('Error creating collection:', error);
    res.status(500).json({ error: 'Failed to create collection' });
  }
});

/**
 * PUT /api/collections/:id
 * Update a collection
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const updates = req.body as UpdateCollectionRequest;

    const collection = await dbService.updateCollection(id, updates);
    res.json(collection);
  } catch (error) {
    console.error('Error updating collection:', error);
    res.status(500).json({ error: 'Failed to update collection' });
  }
});

/**
 * DELETE /api/collections/:id
 * Delete a collection
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const success = await dbService.deleteCollection(id);

    if (!success) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    res.json({ message: 'Collection deleted successfully', id });
  } catch (error) {
    console.error('Error deleting collection:', error);
    res.status(500).json({ error: 'Failed to delete collection' });
  }
});

export default router;
