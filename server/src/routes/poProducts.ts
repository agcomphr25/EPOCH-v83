import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { insertPOProductSchema } from '@shared/schema';

const router = Router();

// Get all PO Products
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await storage.getAllPOProducts();
    res.json(products);
  } catch (error) {
    console.error('Error retrieving PO products:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch PO products',
        details: (error as any).message,
      });
  }
});

// Get a specific PO Product by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await storage.getPOProduct(productId);
    if (!product) {
      return res.status(404).json({ error: 'PO Product not found' });
    }

    res.json(product);
  } catch (error) {
    console.error('Error retrieving PO product:', error);
    res
      .status(500)
      .json({
        error: 'Failed to fetch PO product',
        details: (error as any).message,
      });
  }
});

// Create a new PO Product
router.post('/', async (req: Request, res: Response) => {
  try {
    const validatedData = insertPOProductSchema.parse(req.body);
    const product = await storage.createPOProduct(validatedData);
    res.status(201).json(product);
  } catch (error) {
    console.error('Error creating PO product:', error);
    res
      .status(500)
      .json({
        error: 'Failed to create PO product',
        details: (error as any).message,
      });
  }
});

// Duplicate a PO Product — accepts optional body with user-edited spec fields;
// always strips barcode, PO workflow fields, and auto-generated fields.
// Writes a PO_PRODUCT_DUPLICATED audit log entry.
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const originalId = parseInt(req.params.id);
    if (isNaN(originalId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const original = await storage.getPOProduct(originalId);
    if (!original) {
      return res.status(404).json({ error: 'PO Product not found' });
    }

    // If the client sent an edited payload use it, otherwise derive from the original
    const body = req.body && Object.keys(req.body).length > 0 ? req.body : null;

    const rawData = {
      customerName: body?.customerName ?? original.customerName,
      productName: body?.productName ?? `Copy of ${original.productName}`,
      // These are unique-per-product: accept user-provided values; default to empty so user must supply them
      customerProductNumber: body?.customerProductNumber ?? '',
      barcode: body?.barcode ?? undefined,
      // Spec fields — prefer body, fall back to original
      productType: body?.productType ?? original.productType ?? undefined,
      material: body?.material ?? original.material ?? undefined,
      handedness: body?.handedness ?? original.handedness ?? undefined,
      stockModel: body?.stockModel ?? original.stockModel ?? undefined,
      actionLength: body?.actionLength ?? original.actionLength ?? undefined,
      actionInlet: body?.actionInlet ?? original.actionInlet ?? undefined,
      bottomMetal: body?.bottomMetal ?? original.bottomMetal ?? undefined,
      barrelInlet: body?.barrelInlet ?? original.barrelInlet ?? undefined,
      qds: body?.qds ?? original.qds ?? undefined,
      swivelStuds: body?.swivelStuds ?? original.swivelStuds ?? undefined,
      paintOptions: body?.paintOptions ?? original.paintOptions ?? undefined,
      texture: body?.texture ?? original.texture ?? undefined,
      flatTop: body?.flatTop ?? original.flatTop ?? false,
      price: body?.price != null ? parseFloat(String(body.price)) : (original.price ?? 0),
      notes: body?.notes ?? original.notes ?? undefined,
      otherOptions: body?.otherOptions ?? undefined,
      isActive: true,
      // PO workflow fields are never carried over (poNumber, dueDate, quantity, customerPoLine,
      // targetWeek, linkedOrderId, status, priorityNote)
    };

    const newProductData = insertPOProductSchema.parse(rawData);
    const newProduct = await storage.createPOProduct(newProductData);

    const userId = (req as any).user?.id?.toString() || (req as any).user?.username || 'system';
    const userRole = (req as any).user?.role || 'SYSTEM';

    await storage.createAdminAuditLog({
      orderId: `po-product-${newProduct.id}`,
      fieldName: 'PO_PRODUCT_DUPLICATED',
      fieldLabel: 'PO Product Duplicated',
      oldValue: { original_product_id: originalId },
      newValue: { new_product_id: newProduct.id, user_id: userId, timestamp: new Date().toISOString() },
      changedBy: userId,
      userRole: userRole,
      changeType: 'INLINE',
    });

    res.status(201).json(newProduct);
  } catch (error) {
    console.error('Error duplicating PO product:', error);
    res
      .status(500)
      .json({
        error: 'Failed to duplicate PO product',
        details: (error as any).message,
      });
  }
});

// Update a PO Product
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const validatedData = insertPOProductSchema.partial().parse(req.body);
    const product = await storage.updatePOProduct(productId, validatedData);
    res.json(product);
  } catch (error) {
    console.error('Error updating PO product:', error);
    res
      .status(500)
      .json({
        error: 'Failed to update PO product',
        details: (error as any).message,
      });
  }
});

// Delete a PO Product (soft delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const productId = parseInt(req.params.id);
    if (isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    await storage.deletePOProduct(productId);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting PO product:', error);
    res
      .status(500)
      .json({
        error: 'Failed to delete PO product',
        details: (error as any).message,
      });
  }
});

export default router;
