import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { costCenters, insertCostCenterSchema, employees } from '../../schema';
import { eq } from 'drizzle-orm';

const router = Router();

// GET /api/cost-centers - Get all cost centers with manager info
router.get('/api/cost-centers', async (req: Request, res: Response) => {
  try {
    const allCostCenters = await db
      .select({
        id: costCenters.id,
        code: costCenters.code,
        name: costCenters.name,
        type: costCenters.type,
        status: costCenters.status,
        annualBudget: costCenters.annualBudget,
        monthlyBudget: costCenters.monthlyBudget,
        managerId: costCenters.managerId,
        managerName: employees.firstName,
        managerLastName: employees.lastName,
        description: costCenters.description,
        createdAt: costCenters.createdAt,
        updatedAt: costCenters.updatedAt,
      })
      .from(costCenters)
      .leftJoin(employees, eq(costCenters.managerId, employees.id))
      .orderBy(costCenters.code);

    res.json(allCostCenters);
  } catch (error) {
    console.error('Get cost centers error:', error);
    res.status(500).json({ error: 'Failed to fetch cost centers' });
  }
});

// GET /api/cost-centers/:id - Get single cost center
router.get('/api/cost-centers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [costCenter] = await db
      .select()
      .from(costCenters)
      .where(eq(costCenters.id, id));

    if (!costCenter) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    res.json(costCenter);
  } catch (error) {
    console.error('Get cost center error:', error);
    res.status(500).json({ error: 'Failed to fetch cost center' });
  }
});

// POST /api/cost-centers - Create new cost center
router.post('/api/cost-centers', async (req: Request, res: Response) => {
  try {
    const validation = insertCostCenterSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid cost center data',
        details: validation.error.format(),
      });
    }

    const [newCostCenter] = await db
      .insert(costCenters)
      .values(validation.data)
      .returning();

    res.status(201).json(newCostCenter);
  } catch (error: any) {
    console.error('Create cost center error:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'cost_centers_code_unique') {
      return res.status(409).json({ error: 'Cost center code already exists' });
    }
    
    res.status(500).json({ error: 'Failed to create cost center' });
  }
});

// PUT /api/cost-centers/:id - Update cost center
router.put('/api/cost-centers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const validation = insertCostCenterSchema.safeParse(req.body);

    if (!validation.success) {
      console.error('Validation error:', validation.error.format());
      return res.status(400).json({
        error: 'Invalid cost center data',
        details: validation.error.format(),
      });
    }

    const [updatedCostCenter] = await db
      .update(costCenters)
      .set({
        ...validation.data,
        updatedAt: new Date(),
      })
      .where(eq(costCenters.id, id))
      .returning();

    if (!updatedCostCenter) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    res.json(updatedCostCenter);
  } catch (error: any) {
    console.error('Update cost center error:', error);
    
    // Handle unique constraint violation
    if (error.code === '23505' && error.constraint === 'cost_centers_code_unique') {
      return res.status(409).json({ error: 'Cost center code already exists' });
    }
    
    res.status(500).json({ error: 'Failed to update cost center' });
  }
});

// DELETE /api/cost-centers/:id - Delete cost center
router.delete('/api/cost-centers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const [deletedCostCenter] = await db
      .delete(costCenters)
      .where(eq(costCenters.id, id))
      .returning();

    if (!deletedCostCenter) {
      return res.status(404).json({ error: 'Cost center not found' });
    }

    res.json({ message: 'Cost center deleted successfully' });
  } catch (error) {
    console.error('Delete cost center error:', error);
    res.status(500).json({ error: 'Failed to delete cost center' });
  }
});

export default router;
