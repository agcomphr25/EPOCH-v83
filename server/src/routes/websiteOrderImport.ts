import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { allOrders, customers, customerAddresses, stockModels, features, payments } from '../../../shared/schema';
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
  actionLength?: string;
  port?: string;
  ejectionPort?: string;
  bottomMetal?: string;
  metal?: string;
  barrel?: string;
  color?: string;
  note?: string;
  features: string[];
  quantity: number;
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

interface FeatureOption {
  value: string;
  label: string;
  price?: number;
}

interface Feature {
  id: string;
  name: string;
  displayName: string;
  options?: FeatureOption[];
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
    } else if (trimmedLine.startsWith('Action Inlet:')) {
      details.action = trimmedLine.replace('Action Inlet:', '').trim();
    } else if (trimmedLine.startsWith('Action Length:')) {
      details.actionLength = trimmedLine.replace('Action Length:', '').trim();
    } else if (trimmedLine.startsWith('Action:')) {
      details.action = trimmedLine.replace('Action:', '').trim();
    } else if (trimmedLine.startsWith('Port:')) {
      details.port = trimmedLine.replace('Port:', '').trim();
    } else if (trimmedLine.startsWith('Ejection Port:') || trimmedLine.startsWith('Ejection:')) {
      details.ejectionPort = trimmedLine.replace(/^Ejection( Port)?:/, '').trim();
    } else if (trimmedLine.startsWith('AG Bottom Metal:') || trimmedLine.startsWith('Bottom Metal:')) {
      details.bottomMetal = trimmedLine.replace(/^(AG )?Bottom Metal:/, '').trim();
    } else if (trimmedLine.startsWith('Metal:')) {
      details.metal = trimmedLine.replace('Metal:', '').trim();
    } else if (trimmedLine.startsWith('Barrel Inlet:')) {
      details.barrel = trimmedLine.replace('Barrel Inlet:', '').trim();
    } else if (trimmedLine.startsWith('Barrel Channel:')) {
      details.barrel = trimmedLine.replace('Barrel Channel:', '').trim();
    } else if (trimmedLine.startsWith('Barrel:')) {
      details.barrel = trimmedLine.replace('Barrel:', '').trim();
    } else if (trimmedLine.startsWith('Color:') || trimmedLine.startsWith('Paint:') || trimmedLine.startsWith('Finish:') || trimmedLine.startsWith('Pattern:')) {
      details.color = trimmedLine.replace(/^(Color|Paint|Finish|Pattern):/, '').trim();
    } else if (trimmedLine.startsWith('Note:')) {
      details.note = trimmedLine.replace('Note:', '').trim();
    } else if (trimmedLine.startsWith('Quantity:')) {
      const qty = parseInt(trimmedLine.replace('Quantity:', '').trim());
      if (!isNaN(qty)) details.quantity = qty;
    } else if (trimmedLine.startsWith('Product:')) {
      details.stock = trimmedLine.replace('Product:', '').trim();
    } else if (trimmedLine.startsWith('Rail:') || trimmedLine.startsWith('Rail Accessory:') || trimmedLine.startsWith('Rails:')) {
      details.railAccessory = trimmedLine.replace(/^(Rail|Rails)( Accessory)?:/, '').trim();
    } else if (trimmedLine.startsWith('QD:') || trimmedLine.startsWith('QD Accessory:') || trimmedLine.startsWith('QDs:')) {
      details.qdAccessory = trimmedLine.replace(/^QD(s)?( Accessory)?:/, '').trim();
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

function matchStockModel(stockName: string, models: StockModel[]): StockModel | null {
  if (!stockName || models.length === 0) return null;
  
  const normalizedSearch = normalizeString(stockName);
  console.log(`[Stock Match] Searching for: "${stockName}" (normalized: "${normalizedSearch}")`);
  
  // Exact match on ID, name, or displayName
  for (const model of models) {
    if (!model.isActive) continue;
    const normalizedId = normalizeString(model.id);
    const normalizedName = normalizeString(model.name);
    const normalizedDisplay = normalizeString(model.displayName);
    
    if (normalizedId === normalizedSearch || 
        normalizedName === normalizedSearch || 
        normalizedDisplay === normalizedSearch) {
      console.log(`[Stock Match] Exact match found: ${model.id}`);
      return model;
    }
  }
  
  // Handle common prefixes like "CF" and "FG"
  const prefixMap: Record<string, string> = {
    'cf': 'cf_',
    'fg': 'fg_',
    'carbon': 'cf_',
    'carbon fiber': 'cf_',
    'carbonfiber': 'cf_',
    'fiberglass': 'fg_',
  };
  
  // Extract base name after removing CF/FG prefixes
  let baseSearch = normalizedSearch;
  let matchPrefix = '';
  
  for (const [prefix, replacement] of Object.entries(prefixMap)) {
    const normalizedPrefix = normalizeString(prefix);
    if (normalizedSearch.startsWith(normalizedPrefix)) {
      baseSearch = normalizedSearch.substring(normalizedPrefix.length);
      matchPrefix = replacement;
      break;
    }
  }
  
  // Try to find model by base name
  for (const model of models) {
    if (!model.isActive) continue;
    const normalizedId = normalizeString(model.id);
    
    // Check if model ID contains the base search
    if (normalizedId.includes(baseSearch) && baseSearch.length >= 4) {
      // If we have a prefix, prefer models that start with that prefix
      if (matchPrefix && normalizedId.startsWith(normalizeString(matchPrefix))) {
        console.log(`[Stock Match] Base match with prefix: ${model.id}`);
        return model;
      }
    }
  }
  
  // Fallback: try base search without prefix requirement
  for (const model of models) {
    if (!model.isActive) continue;
    const normalizedId = normalizeString(model.id);
    const normalizedDisplay = normalizeString(model.displayName);
    
    if ((normalizedId.includes(baseSearch) || normalizedDisplay.includes(baseSearch)) && baseSearch.length >= 4) {
      console.log(`[Stock Match] Base match found: ${model.id}`);
      return model;
    }
  }
  
  // Word-based partial matching
  const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 2);
  for (const model of models) {
    if (!model.isActive) continue;
    const displayNorm = normalizeString(model.displayName);
    const idNorm = normalizeString(model.id);
    
    // Check if any significant word matches
    for (const word of searchWords) {
      if (word.length >= 4 && (displayNorm.includes(word) || idNorm.includes(word))) {
        // Make sure it's not just a prefix match
        if (word !== 'cf' && word !== 'fg' && word !== 'carbon' && word !== 'fiber') {
          console.log(`[Stock Match] Word match (${word}): ${model.id}`);
          return model;
        }
      }
    }
  }
  
  console.log(`[Stock Match] No match found for: "${stockName}"`);
  return null;
}

function findBestMatch(searchValue: string, options: FeatureOption[]): string | null {
  if (!searchValue || !options || options.length === 0) return null;
  
  const normalizedSearch = normalizeString(searchValue);
  
  // Exact match
  for (const opt of options) {
    if (normalizeString(opt.value) === normalizedSearch || normalizeString(opt.label) === normalizedSearch) {
      return opt.value;
    }
  }
  
  // Partial match - label contains search or search contains label
  for (const opt of options) {
    const labelNorm = normalizeString(opt.label);
    if (labelNorm.includes(normalizedSearch) || normalizedSearch.includes(labelNorm)) {
      return opt.value;
    }
  }
  
  // Word-based matching
  const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 2);
  for (const opt of options) {
    const labelNormalized = normalizeString(opt.label);
    if (searchWords.some(word => word.length > 3 && labelNormalized.includes(word))) {
      return opt.value;
    }
  }
  
  return null;
}

function findPaintMatch(colorValue: string, allFeatures: Feature[]): string | null {
  if (!colorValue) return null;
  
  // Paint options can come from multiple feature categories
  const paintFeatureIds = ['base_colors', 'premium_patterns', 'camo_patterns', 'custom_graphics', 'special_effects'];
  
  for (const featureId of paintFeatureIds) {
    const feature = allFeatures.find(f => f.id === featureId);
    if (feature?.options) {
      const match = findBestMatch(colorValue, feature.options as FeatureOption[]);
      if (match) {
        console.log(`[Paint Match] Found "${match}" in ${featureId}`);
        return match;
      }
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
    
    // Map features by their ID for easy lookup
    const featureMap: Record<string, Feature> = {};
    for (const f of allFeatures) {
      featureMap[f.id] = f as Feature;
    }

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
        console.log(`[Order ${websiteOrder.OrderID}] Parsed details:`, JSON.stringify(orderDetails, null, 2));
        
        const matchedModel = matchStockModel(orderDetails.stock || orderDetails.category || '', allStockModels as StockModel[]);
        const modelId = matchedModel?.id || null;
        
        const matchedFeaturesList: string[] = [];
        
        // Build features object matching the expected structure from order entry
        const orderFeatures: Record<string, any> = {
          miscItems: [],
          other_options: [],
        };
        
        // Handedness is stored at top level, not in features
        let handednessValue: 'left' | 'right' | null = null;
        if (orderDetails.hand) {
          const handValue = orderDetails.hand.toLowerCase();
          handednessValue = handValue.includes('left') ? 'left' : 'right';
          matchedFeaturesList.push(`Handedness: ${handednessValue}`);
        }
        
        // Action Inlet
        if (orderDetails.action && featureMap['action']?.options) {
          const matched = findBestMatch(orderDetails.action, featureMap['action'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.action_inlet = matched;
            matchedFeaturesList.push(`Action Inlet: ${matched}`);
          }
        }
        
        // Action Length
        if (orderDetails.actionLength && featureMap['action_length']?.options) {
          const matched = findBestMatch(orderDetails.actionLength, featureMap['action_length'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.action_length = matched;
            matchedFeaturesList.push(`Action Length: ${matched}`);
          }
        }
        
        // Barrel Inlet
        if (orderDetails.barrel && featureMap['barrel_inlet']?.options) {
          const matched = findBestMatch(orderDetails.barrel, featureMap['barrel_inlet'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.barrel_inlet = matched;
            matchedFeaturesList.push(`Barrel Inlet: ${matched}`);
          }
        }
        
        // Bottom Metal
        if (orderDetails.bottomMetal && featureMap['bottom_metal']?.options) {
          const matched = findBestMatch(orderDetails.bottomMetal, featureMap['bottom_metal'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.bottom_metal = matched;
            matchedFeaturesList.push(`Bottom Metal: ${matched}`);
          }
        }
        
        // Paint Options (search across all paint feature categories)
        if (orderDetails.color) {
          const matchedPaint = findPaintMatch(orderDetails.color, allFeatures as Feature[]);
          if (matchedPaint) {
            orderFeatures.paint_options = matchedPaint;
            matchedFeaturesList.push(`Paint: ${matchedPaint}`);
          }
        }
        
        // QD Accessory
        if (orderDetails.qdAccessory && featureMap['qd_accessory']?.options) {
          const matched = findBestMatch(orderDetails.qdAccessory, featureMap['qd_accessory'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.qd_accessory = matched;
            matchedFeaturesList.push(`QD: ${matched}`);
          }
        }
        
        // Swivel Studs
        if (orderDetails.swivelStuds && featureMap['swivel_studs']?.options) {
          const matched = findBestMatch(orderDetails.swivelStuds, featureMap['swivel_studs'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.swivel_studs = matched;
            matchedFeaturesList.push(`Swivel Studs: ${matched}`);
          }
        }
        
        // Texture Options
        if (orderDetails.textureOptions && featureMap['texture_options']?.options) {
          const matched = findBestMatch(orderDetails.textureOptions, featureMap['texture_options'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.texture_options = matched;
            matchedFeaturesList.push(`Texture: ${matched}`);
          }
        }
        
        // Length of Pull
        if (orderDetails.lengthOfPull && featureMap['length_of_pull']?.options) {
          const matched = findBestMatch(orderDetails.lengthOfPull, featureMap['length_of_pull'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.length_of_pull = matched;
            matchedFeaturesList.push(`LOP: ${matched}`);
          }
        }
        
        // Rail Accessory (stored as array)
        if (orderDetails.railAccessory && featureMap['rail_accessory']?.options) {
          const matched = findBestMatch(orderDetails.railAccessory, featureMap['rail_accessory'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.rail_accessory = [matched];
            matchedFeaturesList.push(`Rail: ${matched}`);
          }
        }
        
        // Store any unmatched features in notes
        if (orderDetails.features.length > 0) {
          orderFeatures.additional_features = orderDetails.features;
        }

        const orderId = await storage.generateNextOrderId();
        const orderDate = websiteOrder.date ? new Date(websiteOrder.date) : new Date();
        
        // Calculate due date: 6 weeks (42 days) from order date
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
          handedness: handednessValue,
          features: orderFeatures,
          notes: rawNotes,
          shipping: 36.95,
          status: 'FINALIZED',
          currentDepartment: 'P1 Production Queue',
          isPaid: false, // We'll set this after creating payment record
          isVerified: false,
        });

        // If order is paid, create a payment record
        if (isPaid && totalAmount > 0) {
          try {
            await storage.createPayment({
              orderId: newOrder.orderId,
              paymentType: 'credit_card',
              paymentAmount: totalAmount,
              paymentDate: orderDate,
              notes: `Imported from website order ${websiteOrder.OrderID}`,
            });
            console.log(`[Order ${orderId}] Created payment record for $${totalAmount}`);
            
            // Update order isPaid status
            await storage.updateFinalizedOrder(orderId, { isPaid: true });
          } catch (paymentError) {
            console.error(`Failed to create payment for order ${orderId}:`, paymentError);
          }
        }

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
