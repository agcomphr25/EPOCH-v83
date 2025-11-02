import { Router } from 'express';
import { db } from '../../db';
import { 
  rtsSales, 
  rtsSaleItems, 
  rtsInventory, 
  rtsInventoryHistory,
  insertRtsSaleSchema,
  insertRtsSaleItemSchema 
} from '../../schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { createShipment } from '../utils/upsShipping';

const router = Router();

// Get all RTS sales
router.get('/', async (req, res) => {
  try {
    const sales = await db
      .select()
      .from(rtsSales)
      .orderBy(desc(rtsSales.createdAt));

    res.json(sales);
  } catch (error) {
    console.error('Error fetching RTS sales:', error);
    res.status(500).json({ error: 'Failed to fetch RTS sales' });
  }
});

// Get single RTS sale with line items
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [sale] = await db
      .select()
      .from(rtsSales)
      .where(eq(rtsSales.id, id));

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    const items = await db
      .select()
      .from(rtsSaleItems)
      .where(eq(rtsSaleItems.rtsSaleId, id));

    res.json({ ...sale, items });
  } catch (error) {
    console.error('Error fetching RTS sale:', error);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

// Create RTS sale with shipping label
const createSaleSchema = z.object({
  customerId: z.string(),
  items: z.array(z.object({
    rtsInventoryId: z.string(),
    unitPrice: z.number(),
    quantity: z.number().default(1),
  })).min(1),
  shipTo: z.object({
    name: z.string(),
    company: z.string().optional(),
    street: z.string(),
    street2: z.string().optional(),
    city: z.string(),
    state: z.string(),
    zipCode: z.string(),
    country: z.string().default('US'),
    phone: z.string().optional(),
    isResidential: z.boolean().default(true),
  }),
  shipping: z.object({
    carrier: z.string().default('UPS'),
    method: z.string().default('03'), // UPS Ground
    cost: z.number().default(0),
  }),
  package: z.object({
    weight: z.number(),
    length: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
  }),
  notes: z.string().optional(),
  generateLabel: z.boolean().default(true),
});

router.post('/', async (req, res) => {
  try {
    const data = createSaleSchema.parse(req.body);
    const performedBy = req.user?.username || 'System';

    // Fetch RTS items to validate and get details
    const rtsItems = await db
      .select()
      .from(rtsInventory)
      .where(eq(rtsInventory.status, 'AVAILABLE'));

    const selectedItems = rtsItems.filter(item =>
      data.items.some(dataItem => dataItem.rtsInventoryId === item.id)
    );

    if (selectedItems.length !== data.items.length) {
      return res.status(400).json({ error: 'Some selected items are not available' });
    }

    // Calculate totals
    const subtotal = data.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const tax = 0; // Add tax calculation if needed
    const totalAmount = subtotal + data.shipping.cost + tax;

    // Generate sale number
    const saleCount = await db.select().from(rtsSales);
    const saleNumber = `RTS-${new Date().getFullYear()}-${String(saleCount.length + 1).padStart(4, '0')}`;

    // Create sale record
    const [sale] = await db.insert(rtsSales).values({
      saleNumber,
      customerId: data.customerId,
      shipToName: data.shipTo.name,
      shipToCompany: data.shipTo.company || null,
      shipToStreet: data.shipTo.street,
      shipToStreet2: data.shipTo.street2 || null,
      shipToCity: data.shipTo.city,
      shipToState: data.shipTo.state,
      shipToZipCode: data.shipTo.zipCode,
      shipToCountry: data.shipTo.country,
      shipToPhone: data.shipTo.phone || null,
      isResidential: data.shipTo.isResidential,
      shippingCarrier: data.shipping.carrier,
      shippingMethod: data.shipping.method,
      shippingCost: data.shipping.cost,
      subtotal,
      tax,
      totalAmount,
      balanceDue: totalAmount,
      notes: data.notes || null,
      createdBy: performedBy,
      status: data.generateLabel ? 'PENDING' : 'CREATED',
    }).returning();

    // Create sale line items and update inventory status
    for (const item of data.items) {
      const rtsItem = selectedItems.find(i => i.id === item.rtsInventoryId);
      if (!rtsItem) continue;

      // Insert line item
      await db.insert(rtsSaleItems).values({
        rtsSaleId: sale.id,
        rtsInventoryId: item.rtsInventoryId,
        stockModel: rtsItem.stockModel,
        actionLength: rtsItem.actionLength,
        action: rtsItem.action,
        barrel: rtsItem.barrel,
        bottomMetal: rtsItem.bottomMetal,
        color: rtsItem.color,
        extras: rtsItem.extras,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        lineTotal: item.unitPrice * item.quantity,
      });

      // Update inventory status to SOLD
      await db
        .update(rtsInventory)
        .set({ status: 'SOLD', updatedAt: new Date() })
        .where(eq(rtsInventory.id, item.rtsInventoryId));

      // Create history entry
      await db.insert(rtsInventoryHistory).values({
        rtsInventoryId: item.rtsInventoryId,
        action: 'SOLD',
        fromStatus: 'AVAILABLE',
        toStatus: 'SOLD',
        performedBy,
        notes: `Sold in ${saleNumber}`,
      });
    }

    // Generate shipping label if requested
    if (data.generateLabel) {
      try {
        const labelResult = await createShipment({
          shipFrom: {
            name: 'AG Composites',
            company: 'AG Composites',
            street: '230 Hamer Rd.',
            city: 'Owens Crossroads',
            state: 'AL',
            zipCode: '35763',
            country: 'US',
            phone: '256-723-8381',
          },
          shipTo: data.shipTo,
          package: {
            weight: data.package.weight,
            length: data.package.length || 12,
            width: data.package.width || 12,
            height: data.package.height || 6,
          },
          serviceCode: data.shipping.method,
          reference1: saleNumber,
          reference2: data.customerId,
        });

        // Update sale with tracking info
        await db
          .update(rtsSales)
          .set({
            trackingNumber: labelResult.trackingNumber,
            shippingLabelUrl: labelResult.labelUrl,
            status: 'LABELED',
            updatedAt: new Date(),
          })
          .where(eq(rtsSales.id, sale.id));

        res.json({
          sale: { ...sale, trackingNumber: labelResult.trackingNumber, shippingLabelUrl: labelResult.labelUrl },
          label: labelResult,
        });
      } catch (labelError: any) {
        console.error('Error generating shipping label:', labelError);
        // Sale was created successfully, but label generation failed
        res.json({
          sale,
          labelError: labelError.message || 'Failed to generate shipping label',
        });
      }
    } else {
      res.json({ sale });
    }
  } catch (error: any) {
    console.error('Error creating RTS sale:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid request data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create sale' });
  }
});

// Generate label for existing sale
router.post('/:id/label', async (req, res) => {
  try {
    const { id } = req.params;
    const { package: packageInfo } = req.body;

    const [sale] = await db
      .select()
      .from(rtsSales)
      .where(eq(rtsSales.id, id));

    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }

    if (sale.trackingNumber) {
      return res.status(400).json({ error: 'Shipping label already generated for this sale' });
    }

    const labelResult = await createShipment({
      shipFrom: {
        name: 'AG Composites',
        company: 'AG Composites',
        street: '230 Hamer Rd.',
        city: 'Owens Crossroads',
        state: 'AL',
        zipCode: '35763',
        country: 'US',
        phone: '256-723-8381',
      },
      shipTo: {
        name: sale.shipToName || '',
        company: sale.shipToCompany || undefined,
        street: sale.shipToStreet || '',
        street2: sale.shipToStreet2 || undefined,
        city: sale.shipToCity || '',
        state: sale.shipToState || '',
        zipCode: sale.shipToZipCode || '',
        country: sale.shipToCountry || 'US',
        phone: sale.shipToPhone || undefined,
        isResidential: sale.isResidential || true,
      },
      package: packageInfo,
      serviceCode: sale.shippingMethod || '03',
      reference1: sale.saleNumber,
      reference2: sale.customerId,
    });

    // Update sale with tracking info
    await db
      .update(rtsSales)
      .set({
        trackingNumber: labelResult.trackingNumber,
        shippingLabelUrl: labelResult.labelUrl,
        status: 'LABELED',
        updatedAt: new Date(),
      })
      .where(eq(rtsSales.id, id));

    res.json(labelResult);
  } catch (error) {
    console.error('Error generating shipping label:', error);
    res.status(500).json({ error: 'Failed to generate shipping label' });
  }
});

export default router;
