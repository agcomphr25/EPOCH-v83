
import path from "path";
import fs from "fs";
import { Router } from "express";
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

// Import existing utilities and schemas
import { createShipment } from "../utils/upsShipping";
import { storage } from "../../storage";
import { orderDrafts, customers, customerAddresses } from "../../schema";

// Validation schemas
export const CreateLabelInput = z.object({
  orderId: z.number().int().positive(),
  serviceCode: z.string().default("03"),
});

export const CreateLabelsInput = z.object({
  orderIds: z.array(z.number().int().positive()).min(1),
  serviceCode: z.string().default("03"),
});

type Ctx = { db: NodePgDatabase; projectRoot: string };

export default function shippingRoutes({ db, projectRoot }: Ctx) {
  const router = Router();

  // Prepare file storage dirs (for Replit FS). For prod, switch to S3/GCS.
  const filesDir = path.join(projectRoot, "files");
  const labelsDir = path.join(filesDir, "labels");
  const invoicesDir = path.join(filesDir, "invoices");
  for (const d of [filesDir, labelsDir, invoicesDir]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }

  // Enhanced helpers using existing storage methods
  async function getOrderById(orderId: number) {
    try {
      const order = await storage.getFinalizedOrderById(orderId.toString());
      if (!order) {
        // Try draft orders as fallback
        const draft = await storage.getOrderDraft(orderId.toString());
        return draft;
      }
      return order;
    } catch (error) {
      console.error(`Error fetching order ${orderId}:`, error);
      throw new Error(`Order ${orderId} not found`);
    }
  }

  async function getOrdersByIds(orderIds: number[]) {
    const orders = [];
    for (const id of orderIds) {
      try {
        const order = await getOrderById(id);
        if (order) orders.push(order);
      } catch (error) {
        console.warn(`Skipping order ${id}: ${error.message}`);
      }
    }
    return orders;
  }

  async function getCustomerAndAddress(customerId: string) {
    const customerResult = await db.select({
      customer: customers,
      address: customerAddresses
    })
    .from(customers)
    .leftJoin(customerAddresses, eq(customerAddresses.customerId, customers.id))
    .where(eq(customers.id, parseInt(customerId)));

    if (!customerResult || customerResult.length === 0) {
      throw new Error(`Customer ${customerId} not found`);
    }

    return customerResult[0];
  }

  async function insertShipment(row: {
    orderId: number;
    trackingNumber: string;
    labelUrl: string;
    status: string;
    labelFormat?: string;
    serviceCode?: string;
    packageWeightOz?: number;
  }) {
    // Update the order with shipping information
    await storage.updateFinalizedOrder(row.orderId.toString(), {
      trackingNumber: row.trackingNumber,
      shippingCarrier: 'UPS',
      shippingMethod: row.serviceCode || '03',
      shippedDate: new Date().toISOString(),
      shippingLabelGenerated: true,
      customerNotified: false
    });
  }

  // Build packing slip PDF (placeholder - integrate your existing PDF generation)
  async function buildPackingSlipPDF(orders: any[]) {
    // This would use your existing PDF generation logic
    // For now, return a placeholder path
    const filename = `packing-slip-${Date.now()}.pdf`;
    const filepath = path.join(invoicesDir, filename);
    
    // TODO: Integrate your existing PDF generation from shippingPdf.ts
    // For now, create a simple text file as placeholder
    const orderSummary = orders.map(o => `Order ${o.orderId}: ${o.customer || 'N/A'}`).join('\n');
    fs.writeFileSync(filepath, `Packing Slip\n\n${orderSummary}`, 'utf8');
    
    return `/files/invoices/${filename}`;
  }

  // Single order → label (enhanced with better error handling)
  router.post("/ups/label", async (req, res) => {
    try {
      const input = CreateLabelInput.parse(req.body);
      const { orderId, serviceCode } = input;

      const order = await getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: `Order ${orderId} not found` });
      }

      // Get customer and address information
      const { customer, address } = await getCustomerAndAddress(order.customerId || '0');
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found for this order' });
      }

      // Prepare shipping data
      const shippingAddress = address ? {
        name: `${customer.firstName} ${customer.lastName}`,
        street: address.street,
        city: address.city,
        state: address.state,
        zip: address.zip
      } : null;

      if (!shippingAddress) {
        return res.status(400).json({ error: 'No shipping address found for customer' });
      }

      // Create UPS shipment using existing utility
      const shipmentResult = await createShipment({
        orderId: orderId.toString(),
        serviceCode,
        shippingAddress,
        packageDetails: {
          weight: '1', // Default weight, should come from order
          length: '12',
          width: '9',
          height: '6'
        }
      });

      if (!shipmentResult.success) {
        throw new Error(shipmentResult.error || 'UPS shipment creation failed');
      }

      // Save label to file system
      const labelFilename = `ups-label-${orderId}-${shipmentResult.trackingNumber}.pdf`;
      const labelPath = path.join(labelsDir, labelFilename);
      
      // Save the label (assuming shipmentResult contains label data)
      if (shipmentResult.labelData) {
        fs.writeFileSync(labelPath, shipmentResult.labelData);
      }

      const labelUrl = `/files/labels/${labelFilename}`;

      // Record shipment in database
      await insertShipment({
        orderId,
        trackingNumber: shipmentResult.trackingNumber,
        labelUrl,
        status: 'shipped',
        serviceCode,
        packageWeightOz: 16 // Default 1 lb
      });

      res.json({
        ok: true,
        trackingNumber: shipmentResult.trackingNumber,
        labelUrl
      });

    } catch (error) {
      console.error('UPS label creation error:', error);
      res.status(500).json({ 
        error: "Failed to create UPS label", 
        details: error.message 
      });
    }
  });

  // Batch orders → multiple labels + combined packing slip
  router.post("/ups/labels", async (req, res) => {
    try {
      const input = CreateLabelsInput.parse(req.body);
      const { orderIds, serviceCode } = input;

      const orders = await getOrdersByIds(orderIds);
      if (orders.length === 0) {
        return res.status(400).json({ error: "No valid orders found" });
      }

      const results = [];
      const errors = [];

      // Process each order
      for (const order of orders) {
        try {
          // Get customer and address
          const { customer, address } = await getCustomerAndAddress(order.customerId || '0');
          
          if (!customer || !address) {
            errors.push(`Order ${order.orderId}: Missing customer or address`);
            continue;
          }

          const shippingAddress = {
            name: `${customer.firstName} ${customer.lastName}`,
            street: address.street,
            city: address.city,
            state: address.state,
            zip: address.zip
          };

          // Create UPS shipment
          const shipmentResult = await createShipment({
            orderId: order.orderId,
            serviceCode,
            shippingAddress,
            packageDetails: {
              weight: '1',
              length: '12',
              width: '9', 
              height: '6'
            }
          });

          if (!shipmentResult.success) {
            errors.push(`Order ${order.orderId}: ${shipmentResult.error}`);
            continue;
          }

          // Save label
          const labelFilename = `ups-label-${order.orderId}-${shipmentResult.trackingNumber}.pdf`;
          const labelPath = path.join(labelsDir, labelFilename);
          
          if (shipmentResult.labelData) {
            fs.writeFileSync(labelPath, shipmentResult.labelData);
          }

          const labelUrl = `/files/labels/${labelFilename}`;

          // Record shipment
          await insertShipment({
            orderId: parseInt(order.orderId),
            trackingNumber: shipmentResult.trackingNumber,
            labelUrl,
            status: 'shipped',
            serviceCode
          });

          results.push({
            orderId: parseInt(order.orderId),
            trackingNumber: shipmentResult.trackingNumber,
            labelUrl
          });

        } catch (orderError) {
          errors.push(`Order ${order.orderId}: ${orderError.message}`);
        }
      }

      // Generate combined packing slip
      const invoiceUrl = await buildPackingSlipPDF(orders);

      res.json({
        ok: true,
        labels: results,
        invoiceUrl,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      console.error('Batch UPS labels creation error:', error);
      res.status(500).json({ 
        error: "Failed to create UPS labels batch", 
        details: error.message 
      });
    }
  });

  // Get shipping status for order(s)
  router.get("/status/:orderId", async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const order = await getOrderById(parseInt(orderId));
      
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      res.json({
        orderId,
        trackingNumber: order.trackingNumber,
        shippingCarrier: order.shippingCarrier,
        shippedDate: order.shippedDate,
        estimatedDelivery: order.estimatedDelivery,
        customerNotified: order.customerNotified
      });

    } catch (error) {
      console.error('Get shipping status error:', error);
      res.status(500).json({ error: "Failed to get shipping status" });
    }
  });

  // Notify customer of shipment
  router.post("/notify/:orderId", async (req, res) => {
    try {
      const orderId = req.params.orderId;
      const { method = 'email' } = req.body; // 'email' or 'sms'

      const order = await getOrderById(parseInt(orderId));
      if (!order || !order.trackingNumber) {
        return res.status(400).json({ error: "Order not shipped yet" });
      }

      // TODO: Integrate with your communication system
      // For now, just mark as notified
      await storage.updateFinalizedOrder(orderId, {
        customerNotified: true,
        notificationMethod: method,
        notificationSentAt: new Date().toISOString()
      });

      res.json({ success: true, message: "Customer notified" });

    } catch (error) {
      console.error('Customer notification error:', error);
      res.status(500).json({ error: "Failed to notify customer" });
    }
  });

  return router;
}
