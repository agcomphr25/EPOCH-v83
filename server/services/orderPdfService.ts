/**
 * Unified Order PDF Service
 * 
 * This is the SINGLE source of truth for all sales order PDF generation.
 * All PDF generation MUST go through generateOrderPdf().
 * 
 * Controllers must NOT:
 * - Query PDF data
 * - Choose notes fields
 * - Recalculate discounts
 * - Decide payment status
 * - Embed signatures
 * 
 * Controllers may ONLY:
 * - Choose orderId
 * - Choose intent
 */

import * as fs from 'fs';
import * as path from 'path';
import { storage } from '../storage';
import { generateSalesOrderPDF, embedSignatureInPDF } from '../utils/pdf/salesOrderPdf';
import { db } from '../db';
import { followupOrders, persistentDiscounts, creditCardTransactions } from '../schema';
import { eq, and } from 'drizzle-orm';

export enum PdfIntent {
  SIGNATURE_EMAIL = 'signature_email',     // Frozen snapshot, pending payment, signature box
  RESEND_EMAIL = 'resend_email',           // SAME snapshot as original, signature box
  CUSTOMER_VIEW = 'customer_view',         // Live data, customer notes, no signature box
  SHIPPING_PRINT = 'shipping_print',       // Live data, internal notes, no signature box
  SIGNED_ARCHIVE = 'signed_archive',       // Frozen snapshot + embedded signature
}

export interface PdfGenerationResult {
  buffer: Buffer;
  filePath?: string;
  generatedAt: Date;
  snapshot?: OrderSnapshot; // Included for SIGNATURE_EMAIL intent to store with followup order
}

interface OrderSnapshot {
  orderId: string;
  orderDate: string;
  dueDate: string;
  customerId: string;
  customerPO?: string;
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerCompany?: string;
  customerAddress?: {
    street: string;
    street2?: string;
    city: string;
    state: string;
    zipCode: string;
    country?: string;
  };
  modelId?: string;
  modelName?: string;
  modelDisplayName?: string;
  modelPrice?: number;
  handedness?: string;
  features?: Record<string, any>;
  featurePrices?: Record<string, number>;
  featureDisplayNames?: Record<string, string>;
  featureSelectionDisplayNames?: Record<string, string>;
  featureSelectionPrices?: Record<string, number>;
  featureQuantities?: Record<string, number>;
  miscItems?: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  notes?: string;
  shipping?: number;
  discountCode?: string;
  discountDisplayName?: string;
  discountAppliesTo?: 'stock_model' | 'total_order';
  customDiscountType?: string;
  customDiscountValue?: number;
  showCustomDiscount?: boolean;
}

interface IntentConfig {
  dataSource: 'snapshot' | 'live';
  notesField: 'customer_notes' | 'internal_notes';
  paymentStatus: 'pending' | 'live' | 'as_signed';
  includeSignatureBox: boolean;
  storePdf: boolean;
  embedSignature: boolean;
}

const INTENT_CONFIGS: Record<PdfIntent, IntentConfig> = {
  [PdfIntent.SIGNATURE_EMAIL]: {
    dataSource: 'snapshot',
    notesField: 'customer_notes',
    paymentStatus: 'pending',
    includeSignatureBox: true,
    storePdf: true,
    embedSignature: false,
  },
  [PdfIntent.RESEND_EMAIL]: {
    dataSource: 'snapshot',
    notesField: 'customer_notes',
    paymentStatus: 'pending',
    includeSignatureBox: true,
    storePdf: true,
    embedSignature: false,
  },
  [PdfIntent.CUSTOMER_VIEW]: {
    dataSource: 'live',
    notesField: 'customer_notes',
    paymentStatus: 'live',
    includeSignatureBox: false,
    storePdf: false,
    embedSignature: false,
  },
  [PdfIntent.SHIPPING_PRINT]: {
    dataSource: 'live',
    notesField: 'internal_notes',
    paymentStatus: 'live',
    includeSignatureBox: false,
    storePdf: false,
    embedSignature: false,
  },
  [PdfIntent.SIGNED_ARCHIVE]: {
    dataSource: 'snapshot',
    notesField: 'customer_notes',
    paymentStatus: 'as_signed',
    includeSignatureBox: true,
    storePdf: true,
    embedSignature: true,
  },
};

const UPLOADS_DIR = 'uploads/followup-orders';

function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/**
 * Create a frozen snapshot of order data at the moment of signature request.
 * This snapshot is NEVER updated after creation.
 */
export async function createOrderSnapshot(orderId: string): Promise<OrderSnapshot> {
  console.log(`📸 [PDF-SERVICE] Creating order snapshot for ${orderId}`);
  
  const order = await storage.getOrderById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const customer = await storage.getCustomerById(order.customerId || '');
  if (!customer) {
    throw new Error(`Customer not found for order ${orderId}`);
  }

  const addresses = await storage.getCustomerAddresses(order.customerId || '');
  const defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];

  const allFeatures = await storage.getAllFeatures();
  const allStockModels = await storage.getAllStockModels();
  const stockModel = allStockModels.find(m => m.id === order.modelId);

  const featurePrices: Record<string, number> = {};
  const featureDisplayNames: Record<string, string> = {};
  const featureSelectionDisplayNames: Record<string, string> = {};
  const featureSelectionPrices: Record<string, number> = {};

  const createFallbackDisplayName = (value: string): string => {
    return value
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  if (order.features && typeof order.features === 'object') {
    for (const [featureKey, featureValue] of Object.entries(order.features)) {
      if (featureValue && featureValue !== false && featureValue !== '') {
        if (featureKey === 'paint_options_combined' && typeof featureValue === 'string') {
          const [paintCategory, paintValue] = featureValue.split(':');
          const paintFeature = allFeatures.find((f: any) => f.id === paintCategory);
          
          if (paintFeature) {
            featureDisplayNames[featureKey] = paintFeature.displayName || paintFeature.name || 'Paint Options';
            const paintOptions = (paintFeature as any).options || [];
            const paintOption = paintOptions.find((opt: any) => opt.value === paintValue);
            
            if (paintOption) {
              featureSelectionDisplayNames[featureValue] = paintOption.displayName || paintOption.label || paintValue;
              const paintPrice = paintOption.price || 0;
              featureSelectionPrices[featureValue] = paintPrice;
              featurePrices[featureKey] = paintPrice;
            } else {
              featureSelectionDisplayNames[featureValue] = createFallbackDisplayName(paintValue);
              featurePrices[featureKey] = 0;
            }
          }
          continue;
        }
        
        if (featureKey === 'paint_options' && typeof featureValue === 'string') {
          let paintPrice = 0;
          let paintDisplayName = createFallbackDisplayName(featureValue);
          let categoryDisplayName = 'Paint Options';
          
          for (const paintFeatureId of ['base_colors', 'camo_patterns', 'custom_graphics', 'special_effects', 'premium_patterns']) {
            const paintFeature = allFeatures.find((f: any) => f.id === paintFeatureId);
            if (paintFeature) {
              const paintOptions = (paintFeature as any).options || [];
              const paintOption = paintOptions.find((opt: any) => opt.value === featureValue);
              if (paintOption) {
                paintDisplayName = paintOption.displayName || paintOption.label || featureValue;
                paintPrice = paintOption.price || 0;
                categoryDisplayName = paintFeature.displayName || paintFeature.name || 'Paint Options';
                break;
              }
            }
          }
          
          featureDisplayNames[featureKey] = categoryDisplayName;
          featureSelectionDisplayNames[featureValue] = paintDisplayName;
          featureSelectionPrices[featureValue] = paintPrice;
          featurePrices[featureKey] = paintPrice;
          continue;
        }

        const featureDetail = allFeatures.find((f: any) => f.id === featureKey);
        if (featureDetail) {
          featureDisplayNames[featureKey] = featureDetail.displayName || featureDetail.name || featureKey;
          const featureOptions = (featureDetail as any).options || [];
          
          if (Array.isArray(featureValue)) {
            let totalPrice = 0;
            for (const selectionValue of featureValue) {
              const option = featureOptions.find((opt: any) => opt.value === selectionValue);
              if (option) {
                featureSelectionDisplayNames[selectionValue] = option.displayName || option.label || selectionValue;
                const selectionPrice = option.price || 0;
                featureSelectionPrices[selectionValue] = selectionPrice;
                totalPrice += selectionPrice;
              } else {
                featureSelectionDisplayNames[selectionValue] = createFallbackDisplayName(selectionValue);
              }
            }
            featurePrices[featureKey] = totalPrice;
          } else {
            const option = featureOptions.find((opt: any) => opt.value === featureValue);
            if (option) {
              featureSelectionDisplayNames[featureValue] = option.displayName || option.label || featureValue;
              const selectionPrice = option.price || 0;
              featureSelectionPrices[featureValue] = selectionPrice;
              featurePrices[featureKey] = selectionPrice;
            } else {
              featureSelectionDisplayNames[featureValue] = createFallbackDisplayName(String(featureValue));
              featurePrices[featureKey] = 0;
            }
          }
        }
      }
    }
  }

  const miscItems = (order.features as any)?.miscItems || [];

  let discountDisplayName: string | undefined;
  let discountAppliesTo: 'stock_model' | 'total_order' | undefined;

  if (order.discountCode) {
    if (order.discountCode.startsWith('persistent_')) {
      const discountId = parseInt(order.discountCode.replace('persistent_', ''));
      const discountResults = await db
        .select()
        .from(persistentDiscounts)
        .where(eq(persistentDiscounts.id, discountId))
        .limit(1);
      if (discountResults.length > 0) {
        const discount = discountResults[0];
        discountDisplayName = discount.description || discount.name;
        discountAppliesTo = discount.appliesTo as 'stock_model' | 'total_order' || 'stock_model';
      }
    } else {
      const discountResults = await db
        .select()
        .from(persistentDiscounts)
        .where(eq(persistentDiscounts.name, order.discountCode))
        .limit(1);
      if (discountResults.length > 0) {
        const discount = discountResults[0];
        discountDisplayName = discount.description || discount.name;
        discountAppliesTo = discount.appliesTo as 'stock_model' | 'total_order' || 'stock_model';
      }
    }
  }

  const snapshot: OrderSnapshot = {
    orderId: order.orderId,
    orderDate: new Date(order.orderDate).toISOString(),
    dueDate: new Date(order.dueDate).toISOString(),
    customerId: order.customerId || '',
    customerPO: order.customerPO || undefined,
    customerName: customer.name,
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone || undefined,
    customerCompany: customer.company || undefined,
    customerAddress: defaultAddress ? {
      street: defaultAddress.street,
      street2: defaultAddress.street2 || undefined,
      city: defaultAddress.city,
      state: defaultAddress.state,
      zipCode: defaultAddress.zipCode,
      country: defaultAddress.country || undefined,
    } : undefined,
    modelId: order.modelId || undefined,
    modelName: stockModel?.name || undefined,
    modelDisplayName: stockModel?.displayName || undefined,
    modelPrice: stockModel?.price || 0,
    handedness: order.handedness || undefined,
    features: order.features as Record<string, any> || undefined,
    featurePrices,
    featureDisplayNames,
    featureSelectionDisplayNames,
    featureSelectionPrices,
    featureQuantities: order.featureQuantities as Record<string, number> || undefined,
    miscItems: miscItems.length > 0 ? miscItems : undefined,
    notes: order.notes || undefined,
    shipping: order.shipping || 0,
    discountCode: order.discountCode || undefined,
    discountDisplayName,
    discountAppliesTo,
    customDiscountType: order.customDiscountType || undefined,
    customDiscountValue: order.customDiscountValue || undefined,
    showCustomDiscount: order.showCustomDiscount || undefined,
  };

  console.log(`📸 [PDF-SERVICE] Snapshot created for ${orderId}:`, {
    customerName: snapshot.customerName,
    modelId: snapshot.modelId,
    featureCount: Object.keys(snapshot.features || {}).length,
    hasDiscount: !!snapshot.discountCode || !!snapshot.showCustomDiscount,
  });

  return snapshot;
}

/**
 * Fetch live order data (for CUSTOMER_VIEW and SHIPPING_PRINT intents).
 * This always queries the current state of the order.
 */
async function fetchLiveOrderData(orderId: string, notesField: 'customer_notes' | 'internal_notes'): Promise<OrderSnapshot & { paymentStatus: 'PAID' | 'PENDING' }> {
  console.log(`📊 [PDF-SERVICE] Fetching live data for ${orderId}`);
  
  const snapshot = await createOrderSnapshot(orderId);
  
  const order = await storage.getOrderById(orderId);
  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  const paymentRecords = await db
    .select()
    .from(creditCardTransactions)
    .where(and(
      eq(creditCardTransactions.orderId, orderId),
      eq(creditCardTransactions.status, 'completed')
    ));
  
  const paymentStatus: 'PAID' | 'PENDING' = paymentRecords.length > 0 ? 'PAID' : 'PENDING';

  if (notesField === 'internal_notes') {
    snapshot.notes = order.notes || undefined;
  }

  return {
    ...snapshot,
    paymentStatus,
  };
}

/**
 * Get the order snapshot from followup_orders table.
 * Throws if snapshot is required but missing.
 */
async function getStoredSnapshot(orderId: string): Promise<OrderSnapshot> {
  const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
  
  if (!followupOrder) {
    throw new Error(`[PDF-SERVICE-INVARIANT] No followup order found for ${orderId}. Cannot use snapshot-based intent.`);
  }
  
  if (!followupOrder.orderSnapshot) {
    throw new Error(`[PDF-SERVICE-INVARIANT] Snapshot missing for order ${orderId}. Run backfill or recreate followup order.`);
  }
  
  return followupOrder.orderSnapshot as OrderSnapshot;
}

/**
 * Main entry point: Generate a sales order PDF.
 * 
 * Controllers call ONLY this function with orderId and intent.
 * All behavior is determined by the intent - no overrides allowed.
 */
export async function generateOrderPdf(
  orderId: string,
  intent: PdfIntent
): Promise<PdfGenerationResult> {
  console.log(`📄 [PDF-SERVICE] generateOrderPdf called: ${orderId}, intent: ${intent}`);
  
  const config = INTENT_CONFIGS[intent];
  ensureUploadsDir();

  let orderData: OrderSnapshot & { paymentStatus?: 'PAID' | 'PENDING' };
  let signatureData: string | null = null;
  let snapshotToReturn: OrderSnapshot | undefined;

  if (config.dataSource === 'snapshot') {
    if (intent === PdfIntent.SIGNATURE_EMAIL) {
      orderData = await createOrderSnapshot(orderId);
      snapshotToReturn = orderData; // Return snapshot so caller can store it
      console.log(`📸 [PDF-SERVICE] Using NEW snapshot for SIGNATURE_EMAIL`);
    } else {
      orderData = await getStoredSnapshot(orderId);
      console.log(`📸 [PDF-SERVICE] Using STORED snapshot for ${intent}`);
    }
    
    if (config.embedSignature) {
      const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
      if (!followupOrder?.signatureData) {
        throw new Error(`[PDF-SERVICE-INVARIANT] Cannot generate SIGNED_ARCHIVE without signature data for ${orderId}`);
      }
      if (followupOrder.signedPdfPath && fs.existsSync(followupOrder.signedPdfPath)) {
        console.log(`🔒 [PDF-SERVICE] SIGNED_ARCHIVE already exists for ${orderId}, returning existing file`);
        const buffer = fs.readFileSync(followupOrder.signedPdfPath);
        return {
          buffer,
          filePath: followupOrder.signedPdfPath,
          generatedAt: followupOrder.signedAt || new Date(),
        };
      }
      signatureData = followupOrder.signatureData;
    }
  } else {
    const liveData = await fetchLiveOrderData(orderId, config.notesField);
    orderData = liveData;
  }

  let paymentStatus: 'PAID' | 'PENDING';
  if (config.paymentStatus === 'pending') {
    paymentStatus = 'PENDING';
  } else if (config.paymentStatus === 'live') {
    paymentStatus = orderData.paymentStatus || 'PENDING';
  } else {
    paymentStatus = 'PENDING';
  }

  const pdfOrderData = {
    orderId: orderData.orderId,
    orderDate: new Date(orderData.orderDate),
    dueDate: new Date(orderData.dueDate),
    customerId: orderData.customerId,
    customerPO: orderData.customerPO,
    customerName: orderData.customerName,
    customerEmail: orderData.customerEmail,
    customerPhone: orderData.customerPhone,
    customerCompany: orderData.customerCompany,
    customerAddress: orderData.customerAddress,
    modelId: orderData.modelId,
    modelName: orderData.modelName,
    modelDisplayName: orderData.modelDisplayName,
    modelPrice: orderData.modelPrice,
    handedness: orderData.handedness,
    features: orderData.features,
    featurePrices: orderData.featurePrices,
    featureDisplayNames: orderData.featureDisplayNames,
    featureSelectionDisplayNames: orderData.featureSelectionDisplayNames,
    featureSelectionPrices: orderData.featureSelectionPrices,
    featureQuantities: orderData.featureQuantities,
    miscItems: orderData.miscItems,
    notes: orderData.notes,
    shipping: orderData.shipping,
    paymentStatus,
    discountCode: orderData.discountCode,
    discountDisplayName: orderData.discountDisplayName,
    discountAppliesTo: orderData.discountAppliesTo,
    customDiscountType: orderData.customDiscountType,
    customDiscountValue: orderData.customDiscountValue,
    showCustomDiscount: orderData.showCustomDiscount,
  };

  console.log(`📄 [PDF-SERVICE] Generating PDF with:`, {
    orderId: pdfOrderData.orderId,
    intent,
    paymentStatus,
    includeSignatureBox: config.includeSignatureBox,
    storePdf: config.storePdf,
    embedSignature: config.embedSignature,
  });

  let pdfBuffer = await generateSalesOrderPDF(pdfOrderData, config.includeSignatureBox);

  if (config.embedSignature && signatureData) {
    console.log(`✍️ [PDF-SERVICE] Embedding signature for ${orderId}`);
    const tempPath = path.join(UPLOADS_DIR, `temp_${orderId}_${Date.now()}.pdf`);
    fs.writeFileSync(tempPath, pdfBuffer);
    pdfBuffer = await embedSignatureInPDF(tempPath, signatureData);
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }

  let filePath: string | undefined;
  const generatedAt = new Date();

  if (config.storePdf) {
    const prefix = config.embedSignature ? 'signed_sales_order' : 'sales_order';
    const filename = `${prefix}_${orderId}_${generatedAt.getTime()}.pdf`;
    filePath = path.join(UPLOADS_DIR, filename);
    fs.writeFileSync(filePath, pdfBuffer);
    console.log(`💾 [PDF-SERVICE] PDF stored at: ${filePath}`);
  }

  return {
    buffer: pdfBuffer,
    filePath,
    generatedAt,
    snapshot: snapshotToReturn, // Only included for SIGNATURE_EMAIL intent
  };
}

/**
 * Store the order snapshot when creating a followup order for signature.
 * This MUST be called during initial signature email creation.
 */
export async function storeOrderSnapshot(orderId: string, snapshot: OrderSnapshot): Promise<void> {
  console.log(`💾 [PDF-SERVICE] Storing snapshot for ${orderId}`);
  
  const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
  if (!followupOrder) {
    throw new Error(`Cannot store snapshot: followup order not found for ${orderId}`);
  }
  
  await db
    .update(followupOrders)
    .set({ orderSnapshot: snapshot })
    .where(eq(followupOrders.orderId, orderId));
  
  console.log(`✅ [PDF-SERVICE] Snapshot stored for ${orderId}`);
}

/**
 * Compare critical fields between the current order state and a stored snapshot.
 * Returns true if the order has changed in ways that require customer re-approval.
 * 
 * Critical fields that require re-approval:
 * - modelId (stock model changed)
 * - handedness
 * - features (any option changes)
 * - customDiscountValue / customDiscountType (pricing changed)
 * - shipping cost
 * - miscItems
 */
export async function hasOrderChangedSinceSnapshot(orderId: string, storedSnapshot: OrderSnapshot): Promise<{
  hasChanged: boolean;
  changes: string[];
}> {
  console.log(`🔍 [PDF-SERVICE] Comparing current order ${orderId} with stored snapshot`);
  
  const currentSnapshot = await createOrderSnapshot(orderId);
  const changes: string[] = [];

  // Compare critical fields
  if (currentSnapshot.modelId !== storedSnapshot.modelId) {
    changes.push(`Stock model changed: ${storedSnapshot.modelId || 'None'} → ${currentSnapshot.modelId || 'None'}`);
  }
  
  if (currentSnapshot.handedness !== storedSnapshot.handedness) {
    changes.push(`Handedness changed: ${storedSnapshot.handedness || 'None'} → ${currentSnapshot.handedness || 'None'}`);
  }

  if (currentSnapshot.modelPrice !== storedSnapshot.modelPrice) {
    changes.push(`Model price changed: $${(storedSnapshot.modelPrice || 0) / 100} → $${(currentSnapshot.modelPrice || 0) / 100}`);
  }

  if (currentSnapshot.shipping !== storedSnapshot.shipping) {
    changes.push(`Shipping changed: $${(storedSnapshot.shipping || 0) / 100} → $${(currentSnapshot.shipping || 0) / 100}`);
  }

  if (currentSnapshot.customDiscountValue !== storedSnapshot.customDiscountValue) {
    changes.push(`Discount value changed: ${storedSnapshot.customDiscountValue || 0} → ${currentSnapshot.customDiscountValue || 0}`);
  }

  if (currentSnapshot.customDiscountType !== storedSnapshot.customDiscountType) {
    changes.push(`Discount type changed: ${storedSnapshot.customDiscountType || 'none'} → ${currentSnapshot.customDiscountType || 'none'}`);
  }

  // Deep compare features object
  const currentFeatures = JSON.stringify(sortObject(currentSnapshot.features || {}));
  const storedFeatures = JSON.stringify(sortObject(storedSnapshot.features || {}));
  if (currentFeatures !== storedFeatures) {
    changes.push('Order features/options have changed');
  }

  // Deep compare misc items
  const currentMisc = JSON.stringify(sortObject(currentSnapshot.miscItems || []));
  const storedMisc = JSON.stringify(sortObject(storedSnapshot.miscItems || []));
  if (currentMisc !== storedMisc) {
    changes.push('Miscellaneous items have changed');
  }

  // Notes changes don't require re-approval, so not comparing those
  
  const hasChanged = changes.length > 0;
  if (hasChanged) {
    console.log(`⚠️ [PDF-SERVICE] Order ${orderId} has ${changes.length} changes since snapshot:`, changes);
  } else {
    console.log(`✅ [PDF-SERVICE] Order ${orderId} matches stored snapshot`);
  }

  return { hasChanged, changes };
}

function sortObject(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(sortObject).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  if (obj !== null && typeof obj === 'object') {
    return Object.keys(obj).sort().reduce((result: any, key) => {
      result[key] = sortObject(obj[key]);
      return result;
    }, {});
  }
  return obj;
}

/**
 * Get the active (non-superseded, unsigned) followup order for an order.
 * Returns null if no active followup order exists.
 */
export async function getActiveFollowupOrder(orderId: string): Promise<any | null> {
  const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
  
  if (!followupOrder) {
    return null;
  }

  // Already signed = immutable, not active for new signatures
  if (followupOrder.signatureSigned) {
    return null;
  }

  // Already superseded = not active
  if ((followupOrder as any).supersededAt) {
    return null;
  }

  return followupOrder;
}
