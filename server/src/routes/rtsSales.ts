import { Router } from 'express';
import { db } from '../../db';
import { 
  rtsSales, 
  rtsSaleItems, 
  rtsInventory, 
  rtsInventoryHistory,
  allOrders,
  payments,
  insertRtsSaleSchema,
  insertRtsSaleItemSchema 
} from '../../schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { createShipment } from '../utils/upsShipping';
import { storage } from '../../storage';
import { recordOrderCreatedEvent } from '../services/orderActivityService';

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
  department: z.string().default('QC & Shipping'), // Department to send order to
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
  payment: z.object({
    paymentType: z.enum(['cash', 'check', 'credit_card', 'ach', 'agr']),
    paymentAmount: z.number().positive(),
    notes: z.string().optional(),
  }).optional(),
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

    // Create an order in allOrders that goes directly to Shipping QC
    // Generate unique order ID using atomic sequence (shared with regular orders)
    const newOrderId = await storage.generateNextOrderId();

    // Get the first RTS item's stock model for the order (or a descriptive string)
    const firstItem = selectedItems[0];
    const modelDescription = `RTS - ${firstItem.stockModel}${data.items.length > 1 ? ` (+${data.items.length - 1} more)` : ''}`;

    // Create order in allOrders table and write ORDER_CREATED audit event atomically.
    // Both writes are in the same transaction — if either fails, both roll back.
    const order = await db.transaction(async (tx) => {
      const [insertedOrder] = await tx.insert(allOrders).values({
        orderId: newOrderId,
        orderDate: new Date(),
        dueDate: new Date(), // Due today since it's ready to ship
        customerId: data.customerId,
        modelId: firstItem.stockModel, // Use stock model as modelId
        status: 'IN_PROGRESS',
        currentDepartment: data.department, // Send to selected department
        notes: `RTS Sale: ${saleNumber}. ${modelDescription}`,
        isRtsOrder: true, // Mark as RTS order
        rtsSaleId: sale.id, // Link to RTS sale
        priceOverride: subtotal, // Store RTS sale subtotal as price override for display in OrderEntry
        shipping: data.shipping.cost,
        shippingCarrier: data.shipping.carrier,
        shippingMethod: data.shipping.method,
        // Copy shipping address to alt ship to fields
        hasAltShipTo: true,
        altShipToName: data.shipTo.name,
        altShipToCompany: data.shipTo.company || null,
        altShipToPhone: data.shipTo.phone || null,
        altShipToAddress: {
          street: data.shipTo.street,
          street2: data.shipTo.street2,
          city: data.shipTo.city,
          state: data.shipTo.state,
          zipCode: data.shipTo.zipCode,
          country: data.shipTo.country,
        },
      }).returning();

      // Record ORDER_CREATED event in the same transaction — atomically guaranteed
      await recordOrderCreatedEvent(
        tx,
        insertedOrder,
        { actorType: 'system', actorDisplayName: 'RTS Sales' },
        {
          source: 'rts_sales',
          sourceRoute: '/api/rts-sales',
          reasonCode: 'RTS_SALE',
          reasonText: `RTS Sale ${saleNumber} — initial department: ${data.department}`,
          relatedEntityType: 'rts_sale',
          relatedEntityId: String(sale.id),
          metadata: { saleNumber, rtsSaleId: sale.id },
        }
      );

      return insertedOrder;
    });

    // Update sale with order ID reference
    await db
      .update(rtsSales)
      .set({ orderId: newOrderId, updatedAt: new Date() })
      .where(eq(rtsSales.id, sale.id));

    // Create payment if provided
    let paymentRecord = null;
    if (data.payment) {
      const [payment] = await db.insert(payments).values({
        orderId: newOrderId,
        paymentType: data.payment.paymentType,
        paymentAmount: data.payment.paymentAmount,
        paymentDate: new Date(),
        notes: data.payment.notes || `RTS Sale: ${saleNumber}`,
      }).returning();
      paymentRecord = payment;
      console.log(`✅ Payment of $${data.payment.paymentAmount} recorded for order ${newOrderId}`);

      // Update balance due on RTS sale
      const newBalanceDue = Math.max(0, totalAmount - data.payment.paymentAmount);
      await db
        .update(rtsSales)
        .set({ balanceDue: newBalanceDue, updatedAt: new Date() })
        .where(eq(rtsSales.id, sale.id));
    }

    // Generate shipping label if requested
    if (data.generateLabel) {
      try {
        const labelResult = await createShipment({
          shipTo: {
            name: data.shipTo.name,
            attention: data.shipTo.name,
            phone: data.shipTo.phone,
            address1: data.shipTo.street,
            address2: data.shipTo.street2,
            city: data.shipTo.city,
            state: data.shipTo.state,
            postalCode: data.shipTo.zipCode,
            country: data.shipTo.country,
          },
          serviceCode: data.shipping.method,
          weightLbs: data.package.weight,
          referenceNumber: saleNumber,
        });

        // Store label as base64 in shippingLabelUrl (we'll convert to PDF URL later if needed)
        const labelData = labelResult.labelBase64 ? `data:image/gif;base64,${labelResult.labelBase64}` : null;

        // Update sale with tracking info
        await db
          .update(rtsSales)
          .set({
            trackingNumber: labelResult.trackingNumber,
            shippingLabelUrl: labelData,
            status: 'LABELED',
            updatedAt: new Date(),
          })
          .where(eq(rtsSales.id, sale.id));

        // Update order with tracking info
        await db
          .update(allOrders)
          .set({
            trackingNumber: labelResult.trackingNumber,
            shippingLabelGenerated: true,
            updatedAt: new Date(),
          })
          .where(eq(allOrders.orderId, newOrderId));

        res.json({
          sale: { ...sale, orderId: newOrderId, trackingNumber: labelResult.trackingNumber, shippingLabelUrl: labelData },
          order: { orderId: newOrderId },
          label: labelResult,
          payment: paymentRecord,
        });
      } catch (labelError: any) {
        console.error('Error generating shipping label:', labelError);
        // Sale was created successfully, but label generation failed
        res.json({
          sale: { ...sale, orderId: newOrderId },
          order: { orderId: newOrderId },
          labelError: labelError.message || 'Failed to generate shipping label',
          payment: paymentRecord,
        });
      }
    } else {
      res.json({ 
        sale: { ...sale, orderId: newOrderId },
        order: { orderId: newOrderId },
        payment: paymentRecord,
      });
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
      shipTo: {
        name: sale.shipToName || '',
        attention: sale.shipToName || '',
        phone: sale.shipToPhone || undefined,
        address1: sale.shipToStreet || '',
        address2: sale.shipToStreet2 || undefined,
        city: sale.shipToCity || '',
        state: sale.shipToState || '',
        postalCode: sale.shipToZipCode || '',
        country: sale.shipToCountry || 'US',
      },
      serviceCode: sale.shippingMethod || '03',
      weightLbs: packageInfo.weight,
      referenceNumber: sale.saleNumber,
    });

    // Store label as base64
    const labelData = labelResult.labelBase64 ? `data:image/gif;base64,${labelResult.labelBase64}` : null;

    // Update sale with tracking info
    await db
      .update(rtsSales)
      .set({
        trackingNumber: labelResult.trackingNumber,
        shippingLabelUrl: labelData,
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
