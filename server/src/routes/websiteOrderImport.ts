import { Router, Request, Response } from 'express';
import { db } from '../../db';
import { allOrders, customers, customerAddresses, stockModels, features, payments } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import { storage } from '../../storage';
import { z } from 'zod';
import { normalizeToTuesday } from '@shared/utils/dateNormalization';

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
  isActive: boolean | null;
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

function parseCSVDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  const formats = [
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM))?$/i,
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/,
    /^(\d{4})-(\d{2})-(\d{2})$/,
  ];
  
  const match1 = dateStr.match(formats[0]);
  if (match1) {
    const [, month, day, year, hours, minutes, seconds, ampm] = match1;
    let hour = parseInt(hours);
    if (ampm?.toUpperCase() === 'PM' && hour < 12) hour += 12;
    if (ampm?.toUpperCase() === 'AM' && hour === 12) hour = 0;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day), hour, parseInt(minutes), parseInt(seconds || '0'));
  }
  
  const match2 = dateStr.match(formats[1]);
  if (match2) {
    const [, month, day, year] = match2;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  const match3 = dateStr.match(formats[2]);
  if (match3) {
    return new Date(dateStr);
  }
  
  const match4 = dateStr.match(formats[3]);
  if (match4) {
    const [, year, month, day] = match4;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
  }
  
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  console.log(`[Date Parse] Could not parse date: "${dateStr}", using current date`);
  return new Date();
}

function matchStockModel(stockName: string, category: string, models: StockModel[]): StockModel | null {
  if (!stockName || models.length === 0) return null;
  
  const isCarbonFiber = category?.toLowerCase().includes('carbon');
  const isFiberglass = category?.toLowerCase().includes('fiberglass') || category?.toLowerCase().includes('fiber glass');
  const prefix = isCarbonFiber ? 'cf_' : isFiberglass ? 'fg_' : '';
  
  let cleanedStock = stockName
    .replace(/^AG\s+/i, '')
    .replace(/\(.*?\)/g, '')
    .trim();
  
  const isAdjustable = /\b(adjustable|adj)\b/i.test(cleanedStock);
  cleanedStock = cleanedStock.replace(/\b(adjustable|adj)\b/i, '').trim();
  
  const stockLower = cleanedStock.toLowerCase().replace(/\s+/g, '_');
  const normalizedStock = normalizeString(cleanedStock);
  
  console.log(`[Stock Match] Input: "${stockName}", Category: "${category}", Prefix: "${prefix}", Adjustable: ${isAdjustable}, Cleaned: "${cleanedStock}"`);
  
  const activeModels = models.filter(m => m.isActive !== false);
  
  const modelNameMappings: Record<string, string[]> = {
    'alpine_hunter': ['alpinehunter', 'alpine_hunter', 'alp_hunter'],
    'chalk_branch': ['chalkbranch', 'chalk_branch'],
    'visigoth': ['visigoth'],
    'armor': ['armor'],
    'ferrata': ['ferrata'],
    'k2': ['k2'],
    'privateer': ['privateer'],
    'm1a': ['m1a'],
    'sportsman': ['sportsman'],
    'mesa_universal': ['mesauniversal', 'mesa_universal'],
  };
  
  const candidateIds: string[] = [];
  
  for (const [baseName, variants] of Object.entries(modelNameMappings)) {
    if (variants.some(v => normalizedStock.includes(v) || v.includes(normalizedStock))) {
      if (prefix) {
        if (isAdjustable) {
          candidateIds.push(`${prefix}adj_${baseName}`);
          candidateIds.push(`${prefix}adj_${baseName.replace('alpine_hunter', 'alp_hunter')}`);
        }
        candidateIds.push(`${prefix}${baseName}`);
      } else {
        if (isAdjustable) {
          candidateIds.push(`cf_adj_${baseName}`);
          candidateIds.push(`fg_adj_${baseName}`);
          candidateIds.push(`cf_adj_${baseName.replace('alpine_hunter', 'alp_hunter')}`);
          candidateIds.push(`fg_adj_${baseName.replace('alpine_hunter', 'alp_hunter')}`);
        }
        candidateIds.push(`cf_${baseName}`);
        candidateIds.push(`fg_${baseName}`);
      }
    }
  }
  
  for (const candidateId of candidateIds) {
    const model = activeModels.find(m => m.id === candidateId);
    if (model) {
      console.log(`[Stock Match] Found by candidate ID: ${model.id}`);
      return model;
    }
  }
  
  for (const model of activeModels) {
    const modelIdNorm = normalizeString(model.id);
    const displayNorm = normalizeString(model.displayName || '');
    
    if (modelIdNorm === normalizedStock || displayNorm === normalizedStock) {
      console.log(`[Stock Match] Exact match: ${model.id}`);
      return model;
    }
  }
  
  for (const model of activeModels) {
    const modelIdNorm = normalizeString(model.id);
    const displayNorm = normalizeString(model.displayName || '');
    
    const hasCorrectPrefix = !prefix || model.id.startsWith(prefix);
    const hasCorrectAdj = isAdjustable ? model.id.includes('adj') : !model.id.includes('adj');
    
    if (hasCorrectPrefix && hasCorrectAdj) {
      if (modelIdNorm.includes(normalizedStock) || normalizedStock.includes(modelIdNorm.replace(/^(cf|fg)_?(adj)?_?/, ''))) {
        console.log(`[Stock Match] Partial match with prefix: ${model.id}`);
        return model;
      }
      if (displayNorm.includes(normalizedStock) || normalizedStock.includes(displayNorm.replace(/^(cf|fg)\s*(adj)?/i, ''))) {
        console.log(`[Stock Match] Display name match: ${model.id}`);
        return model;
      }
    }
  }
  
  for (const model of activeModels) {
    const modelIdClean = model.id.replace(/^(cf|fg)_?(adj)?_?/, '');
    const modelIdNorm = normalizeString(modelIdClean);
    
    if (modelIdNorm === normalizedStock || normalizedStock.includes(modelIdNorm) || modelIdNorm.includes(normalizedStock)) {
      console.log(`[Stock Match] Base name match (ignoring prefix): ${model.id}`);
      return model;
    }
  }
  
  console.log(`[Stock Match] No match found for: "${stockName}"`);
  return null;
}

function findBestMatch(searchValue: string, options: FeatureOption[]): string | null {
  if (!searchValue || !options || options.length === 0) return null;
  
  const normalizedSearch = normalizeString(searchValue);
  
  for (const opt of options) {
    if (normalizeString(opt.value) === normalizedSearch || normalizeString(opt.label) === normalizedSearch) {
      return opt.value;
    }
  }
  
  for (const opt of options) {
    const labelNorm = normalizeString(opt.label);
    if (labelNorm.includes(normalizedSearch) || normalizedSearch.includes(labelNorm)) {
      return opt.value;
    }
  }
  
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

function isTruthyValue(value: string | undefined | null): boolean {
  if (!value) return false;
  const lower = value.toLowerCase().trim();
  return ['1', 'true', 'yes', 'y', 'on'].includes(lower);
}

function isFalsyValue(value: string | undefined | null): boolean {
  if (value === undefined || value === null || value === '') return true;
  const lower = value.toLowerCase().trim();
  return ['0', 'false', 'no', 'n', 'off', ''].includes(lower);
}

function isPaidFromCSV(websiteOrder: WebsiteOrder): boolean {
  const totalAmount = parseFloat(websiteOrder.total) || 0;
  if (totalAmount <= 0) return false;
  
  const status = (websiteOrder.status || '').toLowerCase();
  const orderStatus = (websiteOrder.order_status || '').toLowerCase();
  
  if (status.includes('paid') || status.includes('complete') || status.includes('success')) {
    console.log(`[Payment Check] Paid based on status: "${websiteOrder.status}"`);
    return true;
  }
  if (orderStatus.includes('paid') || orderStatus.includes('complete') || orderStatus.includes('success')) {
    console.log(`[Payment Check] Paid based on order_status: "${websiteOrder.order_status}"`);
    return true;
  }
  
  const processed = isTruthyValue(websiteOrder.order_processed) || isTruthyValue(websiteOrder.processing);
  const failed = isTruthyValue(websiteOrder.fail);
  
  if (processed && !failed) {
    console.log(`[Payment Check] Paid based on processed=${websiteOrder.order_processed || websiteOrder.processing}, fail=${websiteOrder.fail}`);
    return true;
  }
  
  console.log(`[Payment Check] NOT paid: status="${websiteOrder.status}", order_status="${websiteOrder.order_status}", processed="${websiteOrder.order_processed}", fail="${websiteOrder.fail}"`);
  return false;
}

router.post('/', async (req: Request, res: Response) => {
  if (process.env.FEATURE_WEBSITE_IMPORT !== 'true') {
    return res.status(403).json({ 
      error: 'Website Order Import feature is currently disabled',
      message: 'This feature is under development and not available in this environment.'
    });
  }

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
    
    const featureMap: Record<string, Feature> = {};
    for (const f of allFeatures) {
      featureMap[f.id] = f as Feature;
    }

    console.log(`[Import] Loaded ${allStockModels.length} stock models, ${allFeatures.length} features`);
    console.log(`[Import] Feature IDs available: ${Object.keys(featureMap).join(', ')}`);

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
        
        const matchedModel = matchStockModel(orderDetails.stock || '', orderDetails.category || '', allStockModels as StockModel[]);
        const modelId = matchedModel?.id || null;
        
        const matchedFeaturesList: string[] = [];
        
        const orderFeatures: Record<string, any> = {
          miscItems: [],
          other_options: [],
        };
        
        let handednessValue: 'left' | 'right' | null = null;
        if (orderDetails.hand) {
          const handValue = orderDetails.hand.toLowerCase();
          handednessValue = handValue.includes('left') ? 'left' : 'right';
          matchedFeaturesList.push(`Handedness: ${handednessValue}`);
        }
        
        if (orderDetails.action && featureMap['action']?.options) {
          const matched = findBestMatch(orderDetails.action, featureMap['action'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.action_inlet = matched;
            matchedFeaturesList.push(`Action Inlet: ${matched}`);
          } else {
            orderFeatures.other_options.push(`Action: ${orderDetails.action}`);
          }
        }
        
        if (orderDetails.actionLength && featureMap['action_length']?.options) {
          const matched = findBestMatch(orderDetails.actionLength, featureMap['action_length'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.action_length = matched;
            matchedFeaturesList.push(`Action Length: ${matched}`);
          }
        }
        
        if (orderDetails.barrel && featureMap['barrel_inlet']?.options) {
          const matched = findBestMatch(orderDetails.barrel, featureMap['barrel_inlet'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.barrel_inlet = matched;
            matchedFeaturesList.push(`Barrel Inlet: ${matched}`);
          } else {
            orderFeatures.other_options.push(`Barrel: ${orderDetails.barrel}`);
          }
        }
        
        if (orderDetails.bottomMetal && featureMap['bottom_metal']?.options) {
          const matched = findBestMatch(orderDetails.bottomMetal, featureMap['bottom_metal'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.bottom_metal = matched;
            matchedFeaturesList.push(`Bottom Metal: ${matched}`);
          } else {
            orderFeatures.other_options.push(`Bottom Metal: ${orderDetails.bottomMetal}`);
          }
        }
        
        if (orderDetails.metal) {
          orderFeatures.other_options.push(`Metal: ${orderDetails.metal}`);
        }
        
        if (orderDetails.color) {
          const matchedPaint = findPaintMatch(orderDetails.color, allFeatures as Feature[]);
          if (matchedPaint) {
            orderFeatures.paint_options = matchedPaint;
            matchedFeaturesList.push(`Paint: ${matchedPaint}`);
          } else {
            orderFeatures.other_options.push(`Color: ${orderDetails.color}`);
          }
        }
        
        if (orderDetails.qdAccessory && featureMap['qd_accessory']?.options) {
          const matched = findBestMatch(orderDetails.qdAccessory, featureMap['qd_accessory'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.qd_accessory = matched;
            matchedFeaturesList.push(`QD: ${matched}`);
          }
        }
        
        if (orderDetails.swivelStuds && featureMap['swivel_studs']?.options) {
          const matched = findBestMatch(orderDetails.swivelStuds, featureMap['swivel_studs'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.swivel_studs = matched;
            matchedFeaturesList.push(`Swivel Studs: ${matched}`);
          }
        }
        
        if (orderDetails.textureOptions && featureMap['texture_options']?.options) {
          const matched = findBestMatch(orderDetails.textureOptions, featureMap['texture_options'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.texture_options = matched;
            matchedFeaturesList.push(`Texture: ${matched}`);
          }
        }
        
        if (orderDetails.lengthOfPull && featureMap['length_of_pull']?.options) {
          const matched = findBestMatch(orderDetails.lengthOfPull, featureMap['length_of_pull'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.length_of_pull = matched;
            matchedFeaturesList.push(`LOP: ${matched}`);
          }
        }
        
        if (orderDetails.railAccessory && featureMap['rail_accessory']?.options) {
          const matched = findBestMatch(orderDetails.railAccessory, featureMap['rail_accessory'].options as FeatureOption[]);
          if (matched) {
            orderFeatures.rail_accessory = [matched];
            matchedFeaturesList.push(`Rail: ${matched}`);
          }
        }
        
        if (orderDetails.features.length > 0) {
          for (const feat of orderDetails.features) {
            orderFeatures.miscItems.push(feat);
          }
        }

        const orderId = await storage.generateNextOrderId();
        const orderDate = parseCSVDate(websiteOrder.date);
        
        const dueDate = new Date(orderDate);
        dueDate.setDate(dueDate.getDate() + 42);
        const normalizedDueDate = normalizeToTuesday(dueDate);

        const isPaid = isPaidFromCSV(websiteOrder);
        const totalAmount = parseFloat(websiteOrder.total) || 0;

        console.log(`[Order ${websiteOrder.OrderID}] Order date: ${orderDate.toISOString()}, Due date (pre-normalize): ${dueDate.toISOString()}, Due date (normalized): ${normalizedDueDate.toISOString()}`);
        console.log(`[Order ${websiteOrder.OrderID}] Matched model: ${modelId}, Features: ${JSON.stringify(orderFeatures)}`);
        console.log(`[Order ${websiteOrder.OrderID}] Is paid: ${isPaid}, Total: ${totalAmount}`);

        const rawNotes = [
          orderDetails.note,
          websiteOrder.note,
          `Website Order ID: ${websiteOrder.OrderID}`,
        ].filter(Boolean).join('\n');

        const newOrder = await storage.createFinalizedOrder({
          orderId,
          orderDate,
          dueDate: normalizedDueDate,
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
          isPaid: false,
          isVerified: false,
        });

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
            
            await storage.updateFinalizedOrder(newOrder.orderId, { isPaid: true });
            console.log(`[Order ${orderId}] Updated isPaid status to true`);
          } catch (paymentError) {
            console.error(`[Order ${orderId}] Failed to create payment:`, paymentError);
          }
        }

        results.push({
          success: true,
          orderId: newOrder.orderId,
          websiteOrderId: websiteOrder.OrderID,
          customerName,
          matchedModel: matchedModel?.displayName || undefined,
          matchedFeatures: matchedFeaturesList.length > 0 ? matchedFeaturesList : undefined,
          isPaid,
        });
      } catch (orderError: any) {
        console.error(`[Order ${websiteOrder.OrderID}] Import error:`, orderError);
        results.push({
          success: false,
          error: orderError.message || 'Unknown error',
          websiteOrderId: websiteOrder.OrderID,
          customerName: `${websiteOrder.firstname} ${websiteOrder.lastname}`.trim(),
        });
      }
    }

    return res.json(results);
  } catch (error: any) {
    console.error('[Import] Error:', error);
    return res.status(500).json({ 
      error: 'Failed to import orders', 
      details: error.message 
    });
  }
});

export default router;
