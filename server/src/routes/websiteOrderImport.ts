import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { allOrders, customers, customerAddresses } from '../../../shared/schema';
import { eq, or, and } from 'drizzle-orm';
import { storage } from '../../storage';
import { z } from 'zod';

const router = Router();

const websiteOrderSchema = z.object({
  OrderID: z.string(),
  date: z.string(),
  company: z.string(),
  firstname: z.string(),
  lastname: z.string(),
  address: z.string(),
  zip: z.string(),
  city: z.string(),
  state: z.string(),
  email: z.string(),
  phone: z.string(),
  shipping_address: z.string(),
  shipping_city: z.string(),
  shipping_zip: z.string(),
  shipping_state: z.string(),
  total: z.string(),
  status: z.string(),
  processing: z.string(),
  fail: z.string(),
  hash: z.string(),
  ordered: z.string(),
  note: z.string(),
  order_number: z.string(),
  order_status: z.string(),
  ship_date: z.string(),
  order_processed: z.string(),
});

const importRequestSchema = z.object({
  orders: z.array(websiteOrderSchema).min(1, 'At least one order is required'),
});

type WebsiteOrder = z.infer<typeof websiteOrderSchema>;

interface ImportResult {
  success: boolean;
  orderId?: string;
  error?: string;
  websiteOrderId: string;
  customerName: string;
}

interface ParsedOrderDetails {
  category?: string;
  stock?: string;
  hand?: string;
  longShort?: string;
  action?: string;
  port?: string;
  ejectionPort?: string;
  bottomMetal?: string;
  metal?: string;
  barrel?: string;
  color?: string;
  note?: string;
  features: string[];
  quantity: number;
}

function parseOrderDetails(orderedHtml: string): ParsedOrderDetails {
  const details: ParsedOrderDetails = {
    features: [],
    quantity: 1,
  };

  if (!orderedHtml) return details;

  const cleanText = orderedHtml
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

  const lines = cleanText.split('\n').filter(line => line.trim());

  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine.startsWith('Category:')) {
      details.category = trimmedLine.replace('Category:', '').trim();
    } else if (trimmedLine.startsWith('Stock:')) {
      details.stock = trimmedLine.replace('Stock:', '').trim();
    } else if (trimmedLine.startsWith('Hand:')) {
      details.hand = trimmedLine.replace('Hand:', '').trim();
    } else if (trimmedLine.startsWith('Long Short:')) {
      details.longShort = trimmedLine.replace('Long Short:', '').trim();
    } else if (trimmedLine.startsWith('Action:')) {
      details.action = trimmedLine.replace('Action:', '').trim();
    } else if (trimmedLine.startsWith('Port:')) {
      details.port = trimmedLine.replace('Port:', '').trim();
    } else if (trimmedLine.startsWith('Ejection Port:')) {
      details.ejectionPort = trimmedLine.replace('Ejection Port:', '').trim();
    } else if (trimmedLine.startsWith('AG Bottom Metal:')) {
      details.bottomMetal = trimmedLine.replace('AG Bottom Metal:', '').trim();
    } else if (trimmedLine.startsWith('Metal:')) {
      details.metal = trimmedLine.replace('Metal:', '').trim();
    } else if (trimmedLine.startsWith('Barrel:')) {
      details.barrel = trimmedLine.replace('Barrel:', '').trim();
    } else if (trimmedLine.startsWith('Color:')) {
      details.color = trimmedLine.replace('Color:', '').trim();
    } else if (trimmedLine.startsWith('Note:')) {
      details.note = trimmedLine.replace('Note:', '').trim();
    } else if (trimmedLine.startsWith('Quantity:')) {
      const qty = parseInt(trimmedLine.replace('Quantity:', '').trim());
      if (!isNaN(qty)) details.quantity = qty;
    } else if (trimmedLine.startsWith('Product:')) {
      details.stock = trimmedLine.replace('Product:', '').trim();
    } else if (trimmedLine && !trimmedLine.includes(':')) {
      details.features.push(trimmedLine);
    }
  }

  return details;
}

function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const parseResult = importRequestSchema.safeParse(req.body);
    
    if (!parseResult.success) {
      return res.status(400).json({ 
        error: 'Invalid request data', 
        details: parseResult.error.flatten() 
      });
    }

    const { orders } = parseResult.data;
    const results: ImportResult[] = [];

    for (const websiteOrder of orders) {
      try {
        const customerName = `${websiteOrder.firstname} ${websiteOrder.lastname}`.trim();
        
        let existingOrder = null;
        try {
          const existingOrders = await db
            .select()
            .from(allOrders)
            .where(eq(allOrders.fbOrderNumber, websiteOrder.OrderID));
          existingOrder = existingOrders[0];
        } catch (e) {
        }

        if (existingOrder) {
          results.push({
            success: false,
            error: 'Order already imported',
            websiteOrderId: websiteOrder.OrderID,
            customerName,
          });
          continue;
        }

        let customerId: string | null = null;
        
        if (websiteOrder.email) {
          const existingCustomers = await db
            .select()
            .from(customers)
            .where(eq(customers.email, websiteOrder.email.toLowerCase()));
          
          if (existingCustomers.length > 0) {
            customerId = String(existingCustomers[0].id);
          }
        }

        if (!customerId) {
          const newCustomer = await storage.createCustomer({
            name: customerName,
            company: websiteOrder.company || undefined,
            email: websiteOrder.email?.toLowerCase() || undefined,
            phone: formatPhoneNumber(websiteOrder.phone),
            customerType: 'standard',
            isActive: true,
          });
          customerId = String(newCustomer.id);

          if (websiteOrder.address) {
            try {
              await storage.createCustomerAddress({
                customerId: customerId,
                type: 'billing',
                street: websiteOrder.address,
                city: websiteOrder.city || '',
                state: websiteOrder.state || '',
                zipCode: websiteOrder.zip || '',
                country: 'USA',
                isDefault: true,
              });
            } catch (e) {
            }
          }

          if (websiteOrder.shipping_address && websiteOrder.shipping_address !== websiteOrder.address) {
            try {
              await storage.createCustomerAddress({
                customerId: customerId,
                type: 'shipping',
                street: websiteOrder.shipping_address,
                city: websiteOrder.shipping_city || '',
                state: websiteOrder.shipping_state || '',
                zipCode: websiteOrder.shipping_zip || '',
                country: 'USA',
                isDefault: false,
              });
            } catch (e) {
            }
          }
        }

        const orderDetails = parseOrderDetails(websiteOrder.ordered);
        
        const features: Record<string, any> = {};
        if (orderDetails.hand) features.handedness = orderDetails.hand;
        if (orderDetails.action) features.action = orderDetails.action;
        if (orderDetails.barrel) features.barrel = orderDetails.barrel;
        if (orderDetails.color) features.color = orderDetails.color;
        if (orderDetails.bottomMetal) features.bottom_metal = orderDetails.bottomMetal;
        if (orderDetails.longShort) features.long_short = orderDetails.longShort;
        if (orderDetails.port) features.port = orderDetails.port;
        if (orderDetails.ejectionPort) features.ejection_port = orderDetails.ejectionPort;
        if (orderDetails.metal) features.metal = orderDetails.metal;
        if (orderDetails.features.length > 0) features.additional_features = orderDetails.features;

        const orderId = await storage.generateNextOrderId();
        const orderDate = websiteOrder.date ? new Date(websiteOrder.date) : new Date();
        const dueDate = new Date(orderDate);
        dueDate.setDate(dueDate.getDate() + 42);

        const rawNotes = [
          orderDetails.note,
          websiteOrder.note,
          `Website Order ID: ${websiteOrder.OrderID}`,
          orderDetails.category ? `Category: ${orderDetails.category}` : null,
          orderDetails.stock ? `Product: ${orderDetails.stock}` : null,
        ].filter(Boolean).join('\n');

        const newOrder = await storage.createFinalizedOrder({
          orderId,
          orderDate,
          dueDate,
          customerId,
          customerPO: websiteOrder.order_number || undefined,
          fbOrderNumber: websiteOrder.OrderID || undefined,
          agrOrderDetails: websiteOrder.ordered,
          modelId: null,
          handedness: orderDetails.hand || null,
          features,
          notes: rawNotes,
          shipping: 0,
          status: 'FINALIZED',
          currentDepartment: 'P1 Production Queue',
          isPaid: false,
          isVerified: false,
        });

        results.push({
          success: true,
          orderId: newOrder.orderId,
          websiteOrderId: websiteOrder.OrderID,
          customerName,
        });

      } catch (error: any) {
        console.error(`Error importing order ${websiteOrder.OrderID}:`, error);
        results.push({
          success: false,
          error: error.message || 'Unknown error',
          websiteOrderId: websiteOrder.OrderID,
          customerName: `${websiteOrder.firstname} ${websiteOrder.lastname}`.trim(),
        });
      }
    }

    res.json(results);
  } catch (error: any) {
    console.error('Website order import error:', error);
    res.status(500).json({ error: 'Failed to import orders', details: error.message });
  }
});

export default router;
