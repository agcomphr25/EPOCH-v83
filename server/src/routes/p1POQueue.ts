import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertPOProductSelectionSchema } from '@shared/schema';
import { nanoid } from 'nanoid';

const router = Router();

// Get all P1 PO queue items grouped by customer and PO number
router.get('/', async (req: Request, res: Response) => {
  try {
    const groupedItems = await storage.getP1POQueueGrouped();
    res.json(groupedItems);
  } catch (error) {
    console.error('Error retrieving P1 PO queue:', error);
    res.status(500).json({
      error: 'Failed to fetch P1 PO queue',
      details: (error as any).message,
    });
  }
});

// Get mold availability
router.get('/mold-availability', async (req: Request, res: Response) => {
  try {
    const availability = await storage.getMoldAvailability();
    res.json(availability);
  } catch (error) {
    console.error('Error retrieving mold availability:', error);
    res.status(500).json({
      error: 'Failed to fetch mold availability',
      details: (error as any).message,
    });
  }
});

// Create selection batch (select PO items for scheduling)
router.post('/select', async (req: Request, res: Response) => {
  try {
    const { selections } = req.body;
    
    if (!Array.isArray(selections) || selections.length === 0) {
      return res.status(400).json({ error: 'No selections provided' });
    }

    // Generate a unique batch ID
    const batchId = `batch_${nanoid()}`;

    // Create selection records for each selected item
    const createdSelections = await Promise.all(
      selections.map((selection: any) => {
        const validatedData = insertPOProductSelectionSchema.parse({
          ...selection,
          selectionBatchId: batchId,
        });
        return storage.createPOProductSelection(validatedData);
      })
    );

    res.status(201).json({
      batchId,
      selections: createdSelections,
      count: createdSelections.length,
    });
  } catch (error) {
    console.error('Error creating selection batch:', error);
    res.status(500).json({
      error: 'Failed to create selection batch',
      details: (error as any).message,
    });
  }
});

// Get selections for a specific batch
router.get('/selections/:batchId', async (req: Request, res: Response) => {
  try {
    const { batchId } = req.params;
    const selections = await storage.getPOProductSelections(batchId);
    res.json(selections);
  } catch (error) {
    console.error('Error retrieving selections:', error);
    res.status(500).json({
      error: 'Failed to fetch selections',
      details: (error as any).message,
    });
  }
});

// Generate weekly layup schedule from selections
router.post('/schedule', async (req: Request, res: Response) => {
  try {
    const { batchId, targetWeek } = req.body;

    if (!batchId) {
      return res.status(400).json({ error: 'Batch ID is required' });
    }

    // Get selections for this batch
    const selections = await storage.getPOProductSelections(batchId);

    if (selections.length === 0) {
      return res.status(404).json({ error: 'No selections found for this batch' });
    }

    // TODO: Implement layup schedule generation using existing LayupScheduler service
    // This will integrate with the shared/services/LayupSchedulerService.ts
    // For now, return a placeholder response
    res.json({
      batchId,
      targetWeek: targetWeek || 'Current Week',
      selectionCount: selections.length,
      message: 'Schedule generation will be implemented in next phase',
      selections,
    });
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({
      error: 'Failed to generate schedule',
      details: (error as any).message,
    });
  }
});

// Progress selected items to Barcode department
router.post('/progress', async (req: Request, res: Response) => {
  try {
    const { batchId, selections } = req.body;

    if (!batchId && (!selections || selections.length === 0)) {
      return res.status(400).json({ 
        error: 'Either batchId or selections array is required' 
      });
    }

    let selectionsToProgress;
    
    if (batchId) {
      // Get selections from batch
      selectionsToProgress = await storage.getPOProductSelections(batchId);
    } else {
      selectionsToProgress = selections;
    }

    if (selectionsToProgress.length === 0) {
      return res.status(404).json({ error: 'No selections to progress' });
    }

    // TODO: Implement order creation and progression to Barcode
    // This will:
    // 1. Create production orders for each selected PO item (or link to existing orders)
    // 2. Set currentDepartment to 'Barcode'
    // 3. Update PO product status to 'scheduled' or 'released'
    // For now, return a placeholder response
    res.json({
      message: 'Order progression will be implemented in next phase',
      itemsProgressed: selectionsToProgress.length,
      targetDepartment: 'Barcode',
    });
  } catch (error) {
    console.error('Error progressing orders:', error);
    res.status(500).json({
      error: 'Failed to progress orders',
      details: (error as any).message,
    });
  }
});

export default router;
