import { Router } from 'express';
import { storage } from '../../storage';
import {
  insertCuttingMaterialSchema,
  insertCuttingProductionLineSchema,
  insertCuttingProductCategorySchema,
  insertCuttingComponentSchema,
  insertCuttingWeeklyDataSchema,
  insertCuttingCutProgressSchema,
  insertCuttingFabricInventorySchema,
} from '../../schema';

const router = Router();

// Materials endpoints
router.get('/materials', async (req, res) => {
  try {
    const materials = await storage.getAllCuttingMaterials();
    res.json(materials);
  } catch (error) {
    console.error('Error fetching cutting materials:', error);
    res.status(500).json({ error: 'Failed to fetch materials' });
  }
});

router.get('/materials/:id', async (req, res) => {
  try {
    const material = await storage.getCuttingMaterial(req.params.id);
    if (!material) {
      return res.status(404).json({ error: 'Material not found' });
    }
    res.json(material);
  } catch (error) {
    console.error('Error fetching cutting material:', error);
    res.status(500).json({ error: 'Failed to fetch material' });
  }
});

router.post('/materials', async (req, res) => {
  try {
    const validatedData = insertCuttingMaterialSchema.parse(req.body);
    const material = await storage.createCuttingMaterial(validatedData);
    res.json(material);
  } catch (error) {
    console.error('Error creating cutting material:', error);
    res.status(400).json({ error: 'Failed to create material' });
  }
});

router.put('/materials/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingMaterialSchema.partial().parse(req.body);
    const material = await storage.updateCuttingMaterial(req.params.id, validatedData);
    res.json(material);
  } catch (error) {
    console.error('Error updating cutting material:', error);
    res.status(400).json({ error: 'Failed to update material' });
  }
});

router.delete('/materials/:id', async (req, res) => {
  try {
    await storage.deleteCuttingMaterial(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cutting material:', error);
    res.status(500).json({ error: 'Failed to delete material' });
  }
});

// Production Lines endpoints
router.get('/production-lines', async (req, res) => {
  try {
    const lines = await storage.getAllCuttingProductionLines();
    res.json(lines);
  } catch (error) {
    console.error('Error fetching production lines:', error);
    res.status(500).json({ error: 'Failed to fetch production lines' });
  }
});

router.post('/production-lines', async (req, res) => {
  try {
    const validatedData = insertCuttingProductionLineSchema.parse(req.body);
    const line = await storage.createCuttingProductionLine(validatedData);
    res.json(line);
  } catch (error) {
    console.error('Error creating production line:', error);
    res.status(400).json({ error: 'Failed to create production line' });
  }
});

router.put('/production-lines/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingProductionLineSchema.partial().parse(req.body);
    const line = await storage.updateCuttingProductionLine(req.params.id, validatedData);
    res.json(line);
  } catch (error) {
    console.error('Error updating production line:', error);
    res.status(400).json({ error: 'Failed to update production line' });
  }
});

router.delete('/production-lines/:id', async (req, res) => {
  try {
    await storage.deleteCuttingProductionLine(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting production line:', error);
    res.status(500).json({ error: 'Failed to delete production line' });
  }
});

// Product Categories endpoints
router.get('/product-categories', async (req, res) => {
  try {
    const categories = await storage.getAllCuttingProductCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching product categories:', error);
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

router.get('/product-categories/by-line/:lineId', async (req, res) => {
  try {
    const categories = await storage.getCuttingProductCategoriesByLine(req.params.lineId);
    res.json(categories);
  } catch (error) {
    console.error('Error fetching product categories by line:', error);
    res.status(500).json({ error: 'Failed to fetch product categories' });
  }
});

router.post('/product-categories', async (req, res) => {
  try {
    const validatedData = insertCuttingProductCategorySchema.parse(req.body);
    const category = await storage.createCuttingProductCategory(validatedData);
    res.json(category);
  } catch (error) {
    console.error('Error creating product category:', error);
    res.status(400).json({ error: 'Failed to create product category' });
  }
});

router.put('/product-categories/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingProductCategorySchema.partial().parse(req.body);
    const category = await storage.updateCuttingProductCategory(req.params.id, validatedData);
    res.json(category);
  } catch (error) {
    console.error('Error updating product category:', error);
    res.status(400).json({ error: 'Failed to update product category' });
  }
});

router.delete('/product-categories/:id', async (req, res) => {
  try {
    await storage.deleteCuttingProductCategory(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting product category:', error);
    res.status(500).json({ error: 'Failed to delete product category' });
  }
});

// Components endpoints
router.get('/components', async (req, res) => {
  try {
    const components = await storage.getAllCuttingComponents();
    res.json(components);
  } catch (error) {
    console.error('Error fetching components:', error);
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

router.get('/components/by-category/:categoryId', async (req, res) => {
  try {
    const components = await storage.getCuttingComponentsByCategory(req.params.categoryId);
    res.json(components);
  } catch (error) {
    console.error('Error fetching components by category:', error);
    res.status(500).json({ error: 'Failed to fetch components' });
  }
});

router.post('/components', async (req, res) => {
  try {
    const validatedData = insertCuttingComponentSchema.parse(req.body);
    const component = await storage.createCuttingComponent(validatedData);
    res.json(component);
  } catch (error) {
    console.error('Error creating component:', error);
    res.status(400).json({ error: 'Failed to create component' });
  }
});

router.put('/components/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingComponentSchema.partial().parse(req.body);
    const component = await storage.updateCuttingComponent(req.params.id, validatedData);
    res.json(component);
  } catch (error) {
    console.error('Error updating component:', error);
    res.status(400).json({ error: 'Failed to update component' });
  }
});

router.delete('/components/:id', async (req, res) => {
  try {
    await storage.deleteCuttingComponent(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting component:', error);
    res.status(500).json({ error: 'Failed to delete component' });
  }
});

// Weekly Data endpoints
router.get('/weekly-data', async (req, res) => {
  try {
    const data = await storage.getAllCuttingWeeklyData();
    res.json(data);
  } catch (error) {
    console.error('Error fetching weekly data:', error);
    res.status(500).json({ error: 'Failed to fetch weekly data' });
  }
});

router.get('/weekly-data/by-week/:weekDate', async (req, res) => {
  try {
    const data = await storage.getCuttingWeeklyDataByWeek(req.params.weekDate);
    res.json(data);
  } catch (error) {
    console.error('Error fetching weekly data by week:', error);
    res.status(500).json({ error: 'Failed to fetch weekly data' });
  }
});

router.post('/weekly-data', async (req, res) => {
  try {
    const validatedData = insertCuttingWeeklyDataSchema.parse(req.body);
    const weekData = await storage.createCuttingWeeklyData(validatedData);
    res.json(weekData);
  } catch (error) {
    console.error('Error creating weekly data:', error);
    res.status(400).json({ error: 'Failed to create weekly data' });
  }
});

router.put('/weekly-data/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingWeeklyDataSchema.partial().parse(req.body);
    const weekData = await storage.updateCuttingWeeklyData(req.params.id, validatedData);
    res.json(weekData);
  } catch (error) {
    console.error('Error updating weekly data:', error);
    res.status(400).json({ error: 'Failed to update weekly data' });
  }
});

router.delete('/weekly-data/:id', async (req, res) => {
  try {
    await storage.deleteCuttingWeeklyData(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting weekly data:', error);
    res.status(500).json({ error: 'Failed to delete weekly data' });
  }
});

// Cut Progress endpoints
router.get('/cut-progress', async (req, res) => {
  try {
    const progress = await storage.getAllCuttingCutProgress();
    res.json(progress);
  } catch (error) {
    console.error('Error fetching cut progress:', error);
    res.status(500).json({ error: 'Failed to fetch cut progress' });
  }
});

router.get('/cut-progress/by-week/:weekDate', async (req, res) => {
  try {
    const progress = await storage.getCuttingCutProgressByWeek(req.params.weekDate);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching cut progress by week:', error);
    res.status(500).json({ error: 'Failed to fetch cut progress' });
  }
});

router.get('/cut-progress/by-day/:workDate', async (req, res) => {
  try {
    const progress = await storage.getCuttingCutProgressByDay(req.params.workDate);
    res.json(progress);
  } catch (error) {
    console.error('Error fetching cut progress by day:', error);
    res.status(500).json({ error: 'Failed to fetch cut progress' });
  }
});

router.post('/cut-progress', async (req, res) => {
  try {
    const validatedData = insertCuttingCutProgressSchema.parse(req.body);
    const progress = await storage.createCuttingCutProgress(validatedData);
    res.json(progress);
  } catch (error) {
    console.error('Error creating cut progress:', error);
    res.status(400).json({ error: 'Failed to create cut progress' });
  }
});

router.put('/cut-progress/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingCutProgressSchema.partial().parse(req.body);
    const progress = await storage.updateCuttingCutProgress(req.params.id, validatedData);
    res.json(progress);
  } catch (error) {
    console.error('Error updating cut progress:', error);
    res.status(400).json({ error: 'Failed to update cut progress' });
  }
});

router.delete('/cut-progress/:id', async (req, res) => {
  try {
    await storage.deleteCuttingCutProgress(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting cut progress:', error);
    res.status(500).json({ error: 'Failed to delete cut progress' });
  }
});

// Fabric Inventory endpoints
router.get('/fabric-inventory', async (req, res) => {
  try {
    const inventory = await storage.getAllCuttingFabricInventory();
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching fabric inventory:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory' });
  }
});

router.get('/fabric-inventory/by-material/:materialId', async (req, res) => {
  try {
    const inventory = await storage.getCuttingFabricInventoryByMaterial(req.params.materialId);
    res.json(inventory);
  } catch (error) {
    console.error('Error fetching fabric inventory by material:', error);
    res.status(500).json({ error: 'Failed to fetch fabric inventory' });
  }
});

router.post('/fabric-inventory', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.parse(req.body);
    const inventory = await storage.createCuttingFabricInventory(validatedData);
    res.json(inventory);
  } catch (error) {
    console.error('Error creating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to create fabric inventory' });
  }
});

router.put('/fabric-inventory/:id', async (req, res) => {
  try {
    const validatedData = insertCuttingFabricInventorySchema.partial().parse(req.body);
    const inventory = await storage.updateCuttingFabricInventory(req.params.id, validatedData);
    res.json(inventory);
  } catch (error) {
    console.error('Error updating fabric inventory:', error);
    res.status(400).json({ error: 'Failed to update fabric inventory' });
  }
});

router.delete('/fabric-inventory/:id', async (req, res) => {
  try {
    await storage.deleteCuttingFabricInventory(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting fabric inventory:', error);
    res.status(500).json({ error: 'Failed to delete fabric inventory' });
  }
});

// Initialize seed data for production lines and categories
router.post('/initialize', async (req, res) => {
  try {
    // Create P1 production line
    const p1Line = await storage.createCuttingProductionLine({
      lineName: 'P1',
      lineNumber: 1,
      description: 'Production Line 1',
      isActive: true,
    });

    // Create P2 production line
    const p2Line = await storage.createCuttingProductionLine({
      lineName: 'P2',
      lineNumber: 2,
      description: 'Production Line 2',
      isActive: true,
    });

    // Create P1 categories
    const p1Categories = [
      { categoryName: 'Fiberglass Packets', displayOrder: 1 },
      { categoryName: 'Carbon Fiber Packets', displayOrder: 2 },
      { categoryName: 'Pillar Seams', displayOrder: 3 },
      { categoryName: 'Texture Stencils - Mesa Wrists', displayOrder: 4 },
      { categoryName: 'Texture Stencils - APR Wrist', displayOrder: 5 },
      { categoryName: 'Texture Stencils - AG Wrist', displayOrder: 6 },
      { categoryName: 'Texture Stencils - Small Forends', displayOrder: 7 },
      { categoryName: 'Texture Stencils - Long Forends', displayOrder: 8 },
    ];

    const createdP1Categories = [];
    for (const category of p1Categories) {
      const created = await storage.createCuttingProductCategory({
        productionLineId: p1Line.id,
        ...category,
      });
      createdP1Categories.push(created);
    }

    // Create P2 categories
    const p2Categories = [
      { categoryName: '12" Tube', displayOrder: 1 },
      { categoryName: '10" Tube', displayOrder: 2 },
      { categoryName: 'Antenna Cover', displayOrder: 3 },
      { categoryName: 'Vertical', displayOrder: 4 },
      { categoryName: 'Horizontal', displayOrder: 5 },
      { categoryName: 'Aileron', displayOrder: 6 },
      { categoryName: 'Rudder', displayOrder: 7 },
      { categoryName: 'Elevator', displayOrder: 8 },
    ];

    const createdP2Categories = [];
    for (const category of p2Categories) {
      const created = await storage.createCuttingProductCategory({
        productionLineId: p2Line.id,
        ...category,
      });
      createdP2Categories.push(created);
    }

    res.json({
      success: true,
      message: 'Cutting table initialized successfully',
      data: {
        productionLines: [p1Line, p2Line],
        p1Categories: createdP1Categories,
        p2Categories: createdP2Categories,
      },
    });
  } catch (error) {
    console.error('Error initializing cutting table:', error);
    res.status(500).json({ error: 'Failed to initialize cutting table' });
  }
});

export default router;
