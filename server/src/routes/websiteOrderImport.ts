import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { allOrders, customers, customerAddresses, stockModels, features } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
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
  matchedModel?: string;
  matchedFeatures?: string[];
  isPaid?: boolean;
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
  paintOption?: string;
  railAccessory?: string;
  qdAccessory?: string;
  swivelStuds?: string;
  textureOptions?: string;
  lengthOfPull?: string;
}

interface StockModel {
  id: string;
  name: string;
  displayName: string;
  price: number;
  isActive: boolean;
}

interface Feature {
  id: string;
  name: string;
  displayName: string;
  options?: { value: string; label: string; price?: number }[];
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
    .replace(/&nbsp;/g, ' ')
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
    } else if (trimmedLine.startsWith('Action:') || trimmedLine.startsWith('Action Inlet:')) {
      details.action = trimmedLine.replace(/^Action( Inlet)?:/, '').trim();
    } else if (trimmedLine.startsWith('Port:')) {
      details.port = trimmedLine.replace('Port:', '').trim();
    } else if (trimmedLine.startsWith('Ejection Port:') || trimmedLine.startsWith('Ejection:')) {
      details.ejectionPort = trimmedLine.replace(/^Ejection( Port)?:/, '').trim();
    } else if (trimmedLine.startsWith('AG Bottom Metal:') || trimmedLine.startsWith('Bottom Metal:')) {
      details.bottomMetal = trimmedLine.replace(/^(AG )?Bottom Metal:/, '').trim();
    } else if (trimmedLine.startsWith('Metal:')) {
      details.metal = trimmedLine.replace('Metal:', '').trim();
    } else if (trimmedLine.startsWith('Barrel:') || trimmedLine.startsWith('Barrel Inlet:') || trimmedLine.startsWith('Barrel Channel:')) {
      details.barrel = trimmedLine.replace(/^Barrel( Inlet| Channel)?:/, '').trim();
    } else if (trimmedLine.startsWith('Color:') || trimmedLine.startsWith('Paint:') || trimmedLine.startsWith('Finish:')) {
      details.color = trimmedLine.replace(/^(Color|Paint|Finish):/, '').trim();
    } else if (trimmedLine.startsWith('Note:')) {
      details.note = trimmedLine.replace('Note:', '').trim();
    } else if (trimmedLine.startsWith('Quantity:')) {
      const qty = parseInt(trimmedLine.replace('Quantity:', '').trim());
      if (!isNaN(qty)) details.quantity = qty;
    } else if (trimmedLine.startsWith('Product:')) {
      details.stock = trimmedLine.replace('Product:', '').trim();
    } else if (trimmedLine.startsWith('Rail:') || trimmedLine.startsWith('Rail Accessory:')) {
      details.railAccessory = trimmedLine.replace(/^Rail( Accessory)?:/, '').trim();
    } else if (trimmedLine.startsWith('QD:') || trimmedLine.startsWith('QD Accessory:')) {
      details.qdAccessory = trimmedLine.replace(/^QD( Accessory)?:/, '').trim();
    } else if (trimmedLine.startsWith('Swivel:') || trimmedLine.startsWith('Swivel Studs:')) {
      details.swivelStuds = trimmedLine.replace(/^Swivel( Studs)?:/, '').trim();
    } else if (trimmedLine.startsWith('Texture:') || trimmedLine.startsWith('Texture Options:')) {
      details.textureOptions = trimmedLine.replace(/^Texture( Options)?:/, '').trim();
    } else if (trimmedLine.startsWith('LOP:') || trimmedLine.startsWith('Length of Pull:')) {
      details.lengthOfPull = trimmedLine.replace(/^(LOP|Length of Pull):/, '').trim();
    } else if (trimmedLine && !trimmedLine.includes(':')) {
      details.features.push(trimmedLine);
    }
  }

  return details;
}

function normalizeString(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findBestMatch(searchValue: string, options: { value: string; label: string }[]): string | null {
  if (!searchValue || !options || options.length === 0) return null;
  
  const normalizedSearch = normalizeString(searchValue);
  
  for (const opt of options) {
    if (normalizeString(opt.value) === normalizedSearch || normalizeString(opt.label) === normalizedSearch) {
      return opt.value;
    }
  }
  
  for (const opt of options) {
    if (normalizeString(opt.label).includes(normalizedSearch) || normalizedSearch.includes(normalizeString(opt.label))) {
      return opt.value;
    }
  }
  
  for (const opt of options) {
    const searchWords = normalizedSearch.split(/\s+/);
    const labelNormalized = normalizeString(opt.label);
    if (searchWords.some(word => word.length > 3 && labelNormalized.includes(word))) {
      return opt.value;
    }
  }
  
  return null;
}

function matchStockModel(stockName: string, models: StockModel[]): StockModel | null {
  if (!stockName || models.length === 0) return null;
  
  const normalizedSearch = normalizeString(stockName);
  
  for (const model of models) {
    if (!model.isActive) continue;
    if (normalizeString(model.id) === normalizedSearch || 
        normalizeString(model.name) === normalizedSearch || 
        normalizeString(model.displayName) === normalizedSearch) {
      return model;
    }
  }
  
  for (const model of models) {
    if (!model.isActive) continue;
    const normalizedDisplay = normalizeString(model.displayName);
    const normalizedName = normalizeString(model.name);
    if (normalizedDisplay.includes(normalizedSearch) || normalizedSearch.includes(normalizedDisplay) ||
        normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)) {
      return model;
    }
  }
  
  const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 2);
  for (const model of models) {
    if (!model.isActive) continue;
    const displayNorm = normalizeString(model.displayName);
    if (searchWords.some(word => displayNorm.includes(word))) {
      return model;
    }
  }
  
  return null;
}

function formatPhoneNumber(phone: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function isPaidFromCSV(websiteOrder: WebsiteOrder): boolean {
  const totalAmount = parseFloat(websiteOrder.total) || 0;
  if (totalAmount <= 0) return false;
  
  const status = (websiteOrder.status || '').toLowerCase();
  const orderStatus = (websiteOrder.order_status || '').toLowerCase();
  const processed = websiteOrder.order_processed === '1' || websiteOrder.processing === '1';
  
  if (status.includes('paid') || status.includes('complete') || status.includes('success')) {
    return true;
  }
  if (orderStatus.includes('paid') || orderStatus.includes('complete') || orderStatus.includes('success')) {
    return true;
  }
  if (processed && !websiteOrder.fail) {
    return true;
  }
  
  return false;
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

    const allStockModels = await db.select().from(stockModels);
    const allFeatures = await db.select().from(features);
    
    const actionFeature = allFeatures.find(f => f.id === 'action' || f.name === 'action_inlet');
    const barrelFeature = allFeatures.find(f => f.id === 'barrel_inlet' || f.name === 'barrel_inlet');
    const bottomMetalFeature = allFeatures.find(f => f.id === 'bottom_metal' || f.name === 'bottom_metal');
    const paintFeature = allFeatures.find(f => f.id === 'paint_options' || f.name === 'paint_options' || f.displayName?.includes('Paint'));
    const qdFeature = allFeatures.find(f => f.id === 'qd_accessory' || f.name === 'qd_accessory');
    const swivelFeature = allFeatures.find(f => f.id === 'swivel_studs' || f.name === 'swivel_studs');
    const textureFeature = allFeatures.find(f => f.id === 'texture_options' || f.name === 'texture_options');
    const lopFeature = allFeatures.find(f => f.id === 'length_of_pull' || f.name === 'length_of_pull');
    const railFeature = allFeatures.find(f => f.id === 'rail_accessory' || f.name === 'rail_accessory');

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
        
        const matchedModel = matchStockModel(orderDetails.stock || orderDetails.category || '', allStockModels as StockModel[]);
        const modelId = matchedModel?.id || null;
        
        const matchedFeaturesList: string[] = [];
        const orderFeatures: Record<string, any> = {};
        
        if (orderDetails.hand) {
          const handValue = orderDetails.hand.toLowerCase();
          orderFeatures.handedness = handValue.includes('left') ? 'left' : 'right';
          matchedFeaturesList.push(`Handedness: ${orderFeatures.handedness}`);
        }
        
        if (orderDetails.action && actionFeature?.options) {
          const matchedAction = findBestMatch(orderDetails.action, actionFeature.options as { value: string; label: string }[]);
          if (matchedAction) {
            orderFeatures.action_inlet = matchedAction;
            matchedFeaturesList.push(`Action: ${matchedAction}`);
          }
        }
        
        if (orderDetails.barrel && barrelFeature?.options) {
          const matchedBarrel = findBestMatch(orderDetails.barrel, barrelFeature.options as { value: string; label: string }[]);
          if (matchedBarrel) {
            orderFeatures.barrel_inlet = matchedBarrel;
            matchedFeaturesList.push(`Barrel: ${matchedBarrel}`);
          }
        }
        
        if (orderDetails.bottomMetal && bottomMetalFeature?.options) {
          const matchedBM = findBestMatch(orderDetails.bottomMetal, bottomMetalFeature.options as { value: string; label: string }[]);
          if (matchedBM) {
            orderFeatures.bottom_metal = matchedBM;
            matchedFeaturesList.push(`Bottom Metal: ${matchedBM}`);
          }
        }
        
        if (orderDetails.color && paintFeature?.options) {
          const matchedPaint = findBestMatch(orderDetails.color, paintFeature.options as { value: string; label: string }[]);
          if (matchedPaint) {
            orderFeatures.paint_options = matchedPaint;
            matchedFeaturesList.push(`Paint: ${matchedPaint}`);
          }
        }
        
        if (orderDetails.qdAccessory && qdFeature?.options) {
          const matched = findBestMatch(orderDetails.qdAccessory, qdFeature.options as { value: string; label: string }[]);
          if (matched) {
            orderFeatures.qd_accessory = matched;
            matchedFeaturesList.push(`QD: ${matched}`);
          }
        }
        
        if (orderDetails.swivelStuds && swivelFeature?.options) {
          const matched = findBestMatch(orderDetails.swivelStuds, swivelFeature.options as { value: string; label: string }[]);
          if (matched) {
            orderFeatures.swivel_studs = matched;
            matchedFeaturesList.push(`Swivel: ${matched}`);
          }
        }
        
        if (orderDetails.textureOptions && textureFeature?.options) {
          const matched = findBestMatch(orderDetails.textureOptions, textureFeature.options as { value: string; label: string }[]);
          if (matched) {
            orderFeatures.texture_options = matched;
            matchedFeaturesList.push(`Texture: ${matched}`);
          }
        }
        
        if (orderDetails.lengthOfPull && lopFeature?.options) {
          const matched = findBestMatch(orderDetails.lengthOfPull, lopFeature.options as { value: string; label: string }[]);
          if (matched) {
            orderFeatures.length_of_pull = matched;
            matchedFeaturesList.push(`LOP: ${matched}`);
          }
        }
        
        if (orderDetails.railAccessory && railFeature?.options) {
          const matched = findBestMatch(orderDetails.railAccessory, railFeature.options as { value: string; label: string }[]);
          if (matched) {
            orderFeatures.rail_accessory = [matched];
            matchedFeaturesList.push(`Rail: ${matched}`);
          }
        }
        
        if (orderDetails.features.length > 0) {
          orderFeatures.additional_features = orderDetails.features;
        }

        const orderId = await storage.generateNextOrderId();
        const orderDate = websiteOrder.date ? new Date(websiteOrder.date) : new Date();
        const dueDate = new Date(orderDate);
        dueDate.setDate(dueDate.getDate() + 42);

        const isPaid = isPaidFromCSV(websiteOrder);
        const totalAmount = parseFloat(websiteOrder.total) || 0;

        const rawNotes = [
          orderDetails.note,
          websiteOrder.note,
          `Website Order ID: ${websiteOrder.OrderID}`,
        ].filter(Boolean).join('\n');

        const newOrder = await storage.createFinalizedOrder({
          orderId,
          orderDate,
          dueDate,
          customerId,
          customerPO: websiteOrder.order_number || undefined,
          fbOrderNumber: websiteOrder.OrderID || undefined,
          agrOrderDetails: websiteOrder.ordered,
          modelId,
          handedness: orderDetails.hand?.toLowerCase().includes('left') ? 'left' : (orderDetails.hand ? 'right' : null),
          features: orderFeatures,
          notes: rawNotes,
          shipping: 36.95,
          status: 'FINALIZED',
          currentDepartment: 'P1 Production Queue',
          isPaid,
          isVerified: false,
        });

        results.push({
          success: true,
          orderId: newOrder.orderId,
          websiteOrderId: websiteOrder.OrderID,
          customerName,
          matchedModel: matchedModel?.displayName || 'Not matched',
          matchedFeatures: matchedFeaturesList,
          isPaid,
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
