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
import { followupOrders, persistentDiscounts } from '../schema';
import { eq, sql } from 'drizzle-orm';

/**
 * Core order data structure - only contains guaranteed database columns.
 * This is the safe interface for querying orders without schema failures.
 */
interface CoreOrderData {
  orderId: string;
  orderDate: Date | null;
  dueDate: Date | null;
  customerId: string | null;
  customerPO: string | null;
  fbOrderNumber: string | null;
  modelId: string | null;
  features: Record<string, any> | null;
  featureQuantities: Record<string, number> | null;
  notes: string | null;
  shipping: number | null;
  handedness: string | null;
  status: string | null;
  barcode: string | null;
  hasAltShipTo: boolean | null;
  altShipToName: string | null;
  altShipToCompany: string | null;
  altShipToEmail: string | null;
  altShipToPhone: string | null;
  altShipToAddress: Record<string, any> | null;
  altShipToCustomerId: string | null;
  discountCode: string | null;
  customDiscountType: string | null;
  customDiscountValue: number | null;
  showCustomDiscount: boolean | null;
  priceOverride: number | null;
}

/**
 * SCHEMA-SAFE query: Only selects guaranteed core columns that exist in the database.
 * This prevents PDF generation from failing due to missing optional columns.
 * 
 * Feature-related data, discounts, flags, and experimental options are read
 * from the 'features' JSONB field - NOT from individual columns.
 */
async function getOrderCoreDataForPdf(orderId: string): Promise<CoreOrderData | null> {
  // RESILIENT: This function never throws - returns null on any error
  // Callers should fall back to stored snapshots when this returns null
  try {
    // First try all_orders table (finalized orders)
    const result = await db.execute(sql`
      SELECT 
        order_id as "orderId",
        order_date as "orderDate",
        due_date as "dueDate",
        customer_id as "customerId",
        customer_po as "customerPO",
        fb_order_number as "fbOrderNumber",
        model_id as "modelId",
        features,
        feature_quantities as "featureQuantities",
        notes,
        shipping,
        handedness,
        status,
        barcode,
        has_alt_ship_to as "hasAltShipTo",
        alt_ship_to_name as "altShipToName",
        alt_ship_to_company as "altShipToCompany",
        alt_ship_to_email as "altShipToEmail",
        alt_ship_to_phone as "altShipToPhone",
        alt_ship_to_address as "altShipToAddress",
        alt_ship_to_customer_id as "altShipToCustomerId",
        discount_code as "discountCode",
        custom_discount_type as "customDiscountType",
        custom_discount_value as "customDiscountValue",
        show_custom_discount as "showCustomDiscount",
        price_override as "priceOverride"
      FROM all_orders 
      WHERE order_id = ${orderId}
      LIMIT 1
    `);
    
    if (result.rows && result.rows.length > 0) {
      const row = result.rows[0] as any;
      return {
        orderId: row.orderId,
        orderDate: row.orderDate ? new Date(row.orderDate) : null,
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        customerId: row.customerId,
        customerPO: row.customerPO,
        fbOrderNumber: row.fbOrderNumber,
        modelId: row.modelId,
        features: row.features || {},
        featureQuantities: row.featureQuantities || {},
        notes: row.notes,
        shipping: row.shipping ? parseFloat(row.shipping) : null,
        handedness: row.handedness,
        status: row.status,
        barcode: row.barcode,
        hasAltShipTo: row.hasAltShipTo || false,
        altShipToName: row.altShipToName,
        altShipToCompany: row.altShipToCompany,
        altShipToEmail: row.altShipToEmail,
        altShipToPhone: row.altShipToPhone,
        altShipToAddress: row.altShipToAddress,
        altShipToCustomerId: row.altShipToCustomerId,
        discountCode: row.discountCode || null,
        customDiscountType: row.customDiscountType || null,
        customDiscountValue: row.customDiscountValue ? parseFloat(row.customDiscountValue) : null,
        showCustomDiscount: row.showCustomDiscount || false,
        priceOverride: row.priceOverride ? parseFloat(row.priceOverride) : null,
      };
    }
    
    // Try order_drafts table
    const draftResult = await db.execute(sql`
      SELECT 
        order_id as "orderId",
        order_date as "orderDate",
        due_date as "dueDate",
        customer_id as "customerId",
        customer_po as "customerPO",
        fb_order_number as "fbOrderNumber",
        model_id as "modelId",
        features,
        feature_quantities as "featureQuantities",
        notes,
        shipping,
        handedness,
        status,
        barcode,
        has_alt_ship_to as "hasAltShipTo",
        alt_ship_to_name as "altShipToName",
        alt_ship_to_company as "altShipToCompany",
        alt_ship_to_email as "altShipToEmail",
        alt_ship_to_phone as "altShipToPhone",
        alt_ship_to_address as "altShipToAddress",
        alt_ship_to_customer_id as "altShipToCustomerId",
        discount_code as "discountCode",
        custom_discount_type as "customDiscountType",
        custom_discount_value as "customDiscountValue",
        show_custom_discount as "showCustomDiscount",
        price_override as "priceOverride"
      FROM order_drafts 
      WHERE order_id = ${orderId}
      LIMIT 1
    `);
    
    if (draftResult.rows && draftResult.rows.length > 0) {
      const row = draftResult.rows[0] as any;
      return {
        orderId: row.orderId,
        orderDate: row.orderDate ? new Date(row.orderDate) : null,
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        customerId: row.customerId,
        customerPO: row.customerPO,
        fbOrderNumber: row.fbOrderNumber,
        modelId: row.modelId,
        features: row.features || {},
        featureQuantities: row.featureQuantities || {},
        notes: row.notes,
        shipping: row.shipping ? parseFloat(row.shipping) : null,
        handedness: row.handedness,
        status: row.status,
        barcode: row.barcode,
        hasAltShipTo: row.hasAltShipTo || false,
        altShipToName: row.altShipToName,
        altShipToCompany: row.altShipToCompany,
        altShipToEmail: row.altShipToEmail,
        altShipToPhone: row.altShipToPhone,
        altShipToAddress: row.altShipToAddress,
        altShipToCustomerId: row.altShipToCustomerId,
        discountCode: row.discountCode || null,
        customDiscountType: row.customDiscountType || null,
        customDiscountValue: row.customDiscountValue ? parseFloat(row.customDiscountValue) : null,
        showCustomDiscount: row.showCustomDiscount || false,
        priceOverride: row.priceOverride ? parseFloat(row.priceOverride) : null,
      };
    }
    
    // Try by FB Order Number
    const fbResult = await db.execute(sql`
      SELECT 
        order_id as "orderId",
        order_date as "orderDate",
        due_date as "dueDate",
        customer_id as "customerId",
        customer_po as "customerPO",
        fb_order_number as "fbOrderNumber",
        model_id as "modelId",
        features,
        feature_quantities as "featureQuantities",
        notes,
        shipping,
        handedness,
        status,
        barcode,
        has_alt_ship_to as "hasAltShipTo",
        alt_ship_to_name as "altShipToName",
        alt_ship_to_company as "altShipToCompany",
        alt_ship_to_email as "altShipToEmail",
        alt_ship_to_phone as "altShipToPhone",
        alt_ship_to_address as "altShipToAddress",
        alt_ship_to_customer_id as "altShipToCustomerId",
        discount_code as "discountCode",
        custom_discount_type as "customDiscountType",
        custom_discount_value as "customDiscountValue",
        show_custom_discount as "showCustomDiscount",
        price_override as "priceOverride"
      FROM all_orders 
      WHERE fb_order_number = ${orderId}
      LIMIT 1
    `);
    
    if (fbResult.rows && fbResult.rows.length > 0) {
      const row = fbResult.rows[0] as any;
      return {
        orderId: row.orderId,
        orderDate: row.orderDate ? new Date(row.orderDate) : null,
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        customerId: row.customerId,
        customerPO: row.customerPO,
        fbOrderNumber: row.fbOrderNumber,
        modelId: row.modelId,
        features: row.features || {},
        featureQuantities: row.featureQuantities || {},
        notes: row.notes,
        shipping: row.shipping ? parseFloat(row.shipping) : null,
        handedness: row.handedness,
        status: row.status,
        barcode: row.barcode,
        hasAltShipTo: row.hasAltShipTo || false,
        altShipToName: row.altShipToName,
        altShipToCompany: row.altShipToCompany,
        altShipToEmail: row.altShipToEmail,
        altShipToPhone: row.altShipToPhone,
        altShipToAddress: row.altShipToAddress,
        altShipToCustomerId: row.altShipToCustomerId,
        discountCode: row.discountCode || null,
        customDiscountType: row.customDiscountType || null,
        customDiscountValue: row.customDiscountValue ? parseFloat(row.customDiscountValue) : null,
        showCustomDiscount: row.showCustomDiscount || false,
        priceOverride: row.priceOverride ? parseFloat(row.priceOverride) : null,
      };
    }
    
    return null;
  } catch (error) {
    // RESILIENT: Log warning and return null instead of throwing
    // This allows callers to fall back to stored snapshots
    console.warn(`⚠️ [PDF-SERVICE] Error querying core order data for ${orderId}, will try fallback:`, error);
    return null;
  }
}

/**
 * Extract discount information from the features JSONB or safe defaults.
 * This reads discount data from the order's features field, NOT from database columns.
 */
function extractDiscountFromFeatures(features: Record<string, any> | null): {
  discountCode?: string;
  discountDisplayName?: string;
  discountAppliesTo?: 'stock_model' | 'total_order';
  customDiscountType?: string;
  customDiscountValue?: number;
  showCustomDiscount?: boolean;
} {
  if (!features) return {};
  
  // Discount data may be stored in the features JSONB under various keys
  return {
    discountCode: features.discountCode || features.discount_code || undefined,
    discountDisplayName: features.discountDisplayName || features.discount_display_name || undefined,
    discountAppliesTo: features.discountAppliesTo || features.discount_applies_to || undefined,
    customDiscountType: features.customDiscountType || features.custom_discount_type || undefined,
    customDiscountValue: features.customDiscountValue || features.custom_discount_value || undefined,
    showCustomDiscount: features.showCustomDiscount || features.show_custom_discount || false,
  };
}

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
  // NEW: Resolved pricing summary for consistent UI/PDF display
  pricingSummary?: {
    basePrice: number;
    basePriceSource: 'override' | 'standard';
    featuresTotal: number;
    featureBreakdown: Array<{ featureId: string; featureName: string; optionValue: string; price: number }>;
    miscItemsTotal: number;
    miscItems: Array<{ description: string; quantity: number; price: number; total: number }>;
    subtotal: number;
    discounts: Array<{ source: string; type: 'percent' | 'fixed'; value: number; amount: number; appliesTo: string }>;
    discountTotal: number;
    shipping: number;
    finalTotal: number;
  };
}

interface IntentConfig {
  dataSource: 'snapshot' | 'live';
  notesField: 'customer_notes' | 'internal_notes';
  paymentStatus: 'pending' | 'live' | 'as_signed';
  includeSignatureBox: boolean;
  storePdf: boolean;
  embedSignature: boolean;
  termsType: 'initial' | 'warranty';
}

const INTENT_CONFIGS: Record<PdfIntent, IntentConfig> = {
  [PdfIntent.SIGNATURE_EMAIL]: {
    dataSource: 'snapshot',
    notesField: 'customer_notes',
    paymentStatus: 'pending',
    includeSignatureBox: true,
    storePdf: true,
    embedSignature: false,
    termsType: 'initial',
  },
  [PdfIntent.RESEND_EMAIL]: {
    dataSource: 'snapshot',
    notesField: 'customer_notes',
    paymentStatus: 'pending',
    includeSignatureBox: true,
    storePdf: true,
    embedSignature: false,
    termsType: 'initial',
  },
  [PdfIntent.CUSTOMER_VIEW]: {
    dataSource: 'live',
    notesField: 'customer_notes',
    paymentStatus: 'live',
    includeSignatureBox: false,
    storePdf: false,
    embedSignature: false,
    termsType: 'initial',
  },
  [PdfIntent.SHIPPING_PRINT]: {
    dataSource: 'live',
    notesField: 'internal_notes',
    paymentStatus: 'live',
    includeSignatureBox: false,
    storePdf: false,
    embedSignature: false,
    termsType: 'warranty',
  },
  [PdfIntent.SIGNED_ARCHIVE]: {
    dataSource: 'snapshot',
    notesField: 'customer_notes',
    paymentStatus: 'as_signed',
    includeSignatureBox: true,
    storePdf: true,
    embedSignature: true,
    termsType: 'initial',
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
 * 
 * SCHEMA-SAFE: Uses getOrderCoreDataForPdf() which only queries guaranteed core columns.
 * All feature-related data is extracted from the 'features' JSONB field.
 * 
 * RESILIENT: If live query fails, attempts to use stored snapshot from followup_orders.
 */
export async function createOrderSnapshot(orderId: string): Promise<OrderSnapshot> {
  console.log(`📸 [PDF-SERVICE] Creating order snapshot for ${orderId} (SCHEMA-SAFE)`);
  
  // Use schema-safe query that only selects guaranteed core columns
  const order = await getOrderCoreDataForPdf(orderId);
  if (!order) {
    // FALLBACK: Try to use stored snapshot if available
    console.warn(`⚠️ [PDF-SERVICE] Live query failed for ${orderId}, checking for stored snapshot...`);
    try {
      const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
      if (followupOrder?.orderSnapshot) {
        console.log(`📸 [PDF-SERVICE] Using stored snapshot for ${orderId}`);
        return followupOrder.orderSnapshot as OrderSnapshot;
      }
    } catch (err) {
      console.warn(`⚠️ [PDF-SERVICE] Could not retrieve stored snapshot for ${orderId}:`, err);
    }
    throw new Error(`Order ${orderId} not found and no stored snapshot available`);
  }

  let customer = await storage.getCustomerById(order.customerId || '');
  let defaultAddress: any = null;
  
  // If customer found, load addresses
  if (customer && order.customerId) {
    const addresses = await storage.getCustomerAddresses(order.customerId);
    defaultAddress = addresses.find(addr => addr.isDefault) || addresses[0];
  }
  
  // If no customer found, create a fallback customer object
  if (!customer) {
    console.warn(`⚠️ [PDF-SERVICE] Customer not found for order ${orderId}, using fallback`);
    // Try to get customer name from full order data if available
    const fullOrder = await storage.getOrderById(orderId);
    const customerName = (fullOrder as any)?.customer || 'Unknown Customer';
    customer = {
      id: 0,
      name: customerName,
      email: '',
      phone: '',
      company: '',
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any;
  }

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

        // Handle handedness specially — it's not in the features table
        if (featureKey === 'handedness') {
          featureDisplayNames[featureKey] = 'Handedness';
          const handednessLabels: Record<string, string> = {
            left: 'Left Hand',
            right: 'Right Hand',
            lh: 'Left Hand',
            rh: 'Right Hand',
          };
          const rawVal = String(featureValue).toLowerCase();
          featureSelectionDisplayNames[String(featureValue)] = handednessLabels[rawVal] || createFallbackDisplayName(String(featureValue));
          featurePrices[featureKey] = 0;
          continue;
        }

        // Some orders store action inlet as 'action_inlet' but the features table uses 'action'
        const featureIdAlias: Record<string, string> = {
          action_inlet: 'action',
        };
        const lookupId = featureIdAlias[featureKey] || featureKey;

        const featureDetail = allFeatures.find((f: any) => f.id === lookupId);
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

  const miscItems = order.features?.miscItems || [];

  // Extract discount information: DB columns are authoritative, features JSONB is fallback
  const discountFromFeatures = extractDiscountFromFeatures(order.features);
  const discountCode = order.discountCode || discountFromFeatures.discountCode || undefined;
  const customDiscountType = order.customDiscountType || discountFromFeatures.customDiscountType || undefined;
  const customDiscountValue = order.customDiscountValue ?? discountFromFeatures.customDiscountValue ?? undefined;
  const showCustomDiscount = order.showCustomDiscount ?? discountFromFeatures.showCustomDiscount ?? false;
  
  let discountDisplayName: string | undefined = discountFromFeatures.discountDisplayName;
  let discountAppliesTo: 'stock_model' | 'total_order' | undefined = discountFromFeatures.discountAppliesTo;

  // Look up display name from discount tables if we have a discount code
  if (discountCode && !discountDisplayName) {
    try {
      if (discountCode.startsWith('persistent_')) {
        const discountId = parseInt(discountCode.replace('persistent_', ''));
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
      } else if (discountCode.startsWith('short_term_')) {
        const saleId = parseInt(discountCode.replace('short_term_', ''));
        const saleResults = await db.execute(sql`
          SELECT name, applies_to as "appliesTo" FROM short_term_sales WHERE id = ${saleId} LIMIT 1
        `);
        if (saleResults.rows && saleResults.rows.length > 0) {
          const sale = saleResults.rows[0] as any;
          discountDisplayName = sale.name;
          discountAppliesTo = (sale.appliesTo === 'stock_model' ? 'stock_model' : 'total_order');
        }
      } else {
        const discountResults = await db
          .select()
          .from(persistentDiscounts)
          .where(eq(persistentDiscounts.name, discountCode))
          .limit(1);
        if (discountResults.length > 0) {
          const discount = discountResults[0];
          discountDisplayName = discount.description || discount.name;
          discountAppliesTo = discount.appliesTo as 'stock_model' | 'total_order' || 'stock_model';
        }
      }
    } catch (err) {
      console.warn(`⚠️ [PDF-SERVICE] Could not look up discount ${discountCode}:`, err);
    }
  }

  // Resolve Ship-To Address with proper precedence:
  // Priority 1: Order-level alt ship-to override (highest priority)
  // Priority 2: Customer's default address (fallback)
  // NOTE: Sales Order PDFs must never pull ship-to data directly from customer profiles 
  // without checking order overrides first.
  let resolvedShipToAddress: OrderSnapshot['customerAddress'];
  let shipToSource: 'order_override' | 'customer_default' = 'customer_default';
  
  if (order.hasAltShipTo && order.altShipToAddress) {
    // Order-level override takes priority
    const altAddr = order.altShipToAddress as any;
    resolvedShipToAddress = {
      street: altAddr?.street || '',
      street2: altAddr?.street2 || undefined,
      city: altAddr?.city || '',
      state: altAddr?.state || '',
      zipCode: altAddr?.zip || altAddr?.zipCode || '',
      country: altAddr?.country || undefined,
    };
    shipToSource = 'order_override';
    console.log(`📬 [PDF-SERVICE] Using ORDER-LEVEL ship-to override for ${orderId}:`, {
      name: order.altShipToName,
      company: order.altShipToCompany,
      city: resolvedShipToAddress.city,
      state: resolvedShipToAddress.state,
    });
  } else if (defaultAddress) {
    // Fall back to customer's default address
    resolvedShipToAddress = {
      street: defaultAddress.street,
      street2: defaultAddress.street2 || undefined,
      city: defaultAddress.city,
      state: defaultAddress.state,
      zipCode: defaultAddress.zipCode,
      country: defaultAddress.country || undefined,
    };
    console.log(`📬 [PDF-SERVICE] Using CUSTOMER DEFAULT address for ${orderId}:`, {
      city: resolvedShipToAddress.city,
      state: resolvedShipToAddress.state,
    });
  }

  // Build snapshot using only data from core columns and features JSONB
  // This is schema-safe and won't fail due to missing columns
  const snapshot: OrderSnapshot = {
    orderId: order.orderId,
    orderDate: order.orderDate ? new Date(order.orderDate).toISOString() : new Date().toISOString(),
    dueDate: order.dueDate ? new Date(order.dueDate).toISOString() : new Date().toISOString(),
    customerId: order.customerId || '',
    customerPO: order.customerPO || undefined,
    // When order has alt ship-to, use override name/company; otherwise use customer profile
    customerName: order.hasAltShipTo && order.altShipToName ? order.altShipToName : (customer?.name || 'Unknown Customer'),
    customerEmail: order.hasAltShipTo && order.altShipToEmail ? order.altShipToEmail : (customer?.email || undefined),
    customerPhone: order.hasAltShipTo && order.altShipToPhone ? order.altShipToPhone : (customer?.phone || undefined),
    customerCompany: order.hasAltShipTo && order.altShipToCompany ? order.altShipToCompany : (customer?.company || undefined),
    customerAddress: resolvedShipToAddress,
    modelId: order.modelId || undefined,
    modelName: stockModel?.name || undefined,
    modelDisplayName: stockModel?.displayName || undefined,
    modelPrice: stockModel?.price || 0,
    handedness: order.handedness || order.features?.handedness || undefined,
    features: order.features || undefined,
    featurePrices,
    featureDisplayNames,
    featureSelectionDisplayNames,
    featureSelectionPrices,
    featureQuantities: order.featureQuantities || undefined,
    miscItems: miscItems.length > 0 ? miscItems : undefined,
    notes: order.notes || undefined,
    shipping: order.shipping || 0,
    discountCode: discountCode || undefined,
    discountDisplayName,
    discountAppliesTo,
    customDiscountType: customDiscountType || undefined,
    customDiscountValue: customDiscountValue || undefined,
    showCustomDiscount: showCustomDiscount || false,
  };

  // NEW: Add resolved pricing summary using shared function
  try {
    const pricingSummary = await storage.resolveOrderPricingSummary(orderId);
    snapshot.pricingSummary = pricingSummary;
    console.log(`💰 [PDF-SERVICE] Pricing summary for ${orderId}:`, JSON.stringify({
      basePrice: pricingSummary.basePrice,
      basePriceSource: pricingSummary.basePriceSource,
      featuresTotal: pricingSummary.featuresTotal,
      miscItemsTotal: pricingSummary.miscItemsTotal,
      subtotal: pricingSummary.subtotal,
      discounts: pricingSummary.discounts,
      discountTotal: pricingSummary.discountTotal,
      shipping: pricingSummary.shipping,
      finalTotal: pricingSummary.finalTotal,
    }, null, 2));
  } catch (err) {
    console.warn(`⚠️ [PDF-SERVICE] Could not resolve pricing summary for ${orderId}:`, err);
    // Continue without pricing summary - will fall back to legacy calculation in PDF
  }

  console.log(`📸 [PDF-SERVICE] Snapshot created for ${orderId}:`, {
    customerName: snapshot.customerName,
    modelId: snapshot.modelId,
    featureCount: Object.keys(snapshot.features || {}).length,
    hasDiscount: !!snapshot.discountCode || !!snapshot.showCustomDiscount,
    shipToSource: shipToSource,
    hasAltShipTo: order.hasAltShipTo,
  });

  return snapshot;
}

/**
 * Fetch live order data (for CUSTOMER_VIEW and SHIPPING_PRINT intents).
 * This always queries the current state of the order.
 * 
 * SCHEMA-SAFE: Uses getOrderCoreDataForPdf() which only queries guaranteed core columns.
 */
async function fetchLiveOrderData(orderId: string, notesField: 'customer_notes' | 'internal_notes'): Promise<OrderSnapshot & { paymentStatus: 'PAID' | 'PENDING' }> {
  console.log(`📊 [PDF-SERVICE] Fetching live data for ${orderId} (SCHEMA-SAFE)`);
  
  // createOrderSnapshot already uses the schema-safe query
  const snapshot = await createOrderSnapshot(orderId);
  
  // If internal notes are needed, re-query just the notes field using the safe query
  if (notesField === 'internal_notes') {
    const order = await getOrderCoreDataForPdf(orderId);
    if (order) {
      snapshot.notes = order.notes || undefined;
    }
  }

  // FIXED: Use shared payment status resolver (same logic as Order Entry UI)
  // Source of truth: payments table + calculateOrderTotalOptimized()
  // This correctly handles cash/check/ACH payments and partial payments
  let paymentStatus: 'PAID' | 'PENDING' = 'PENDING';
  try {
    const paymentResult = await storage.resolvePaymentStatus(orderId);
    paymentStatus = paymentResult.status;
    console.log(`💰 [PDF-SERVICE] Payment status for ${orderId}: ${paymentStatus} (paid: ${paymentResult.paymentTotal}, total: ${paymentResult.orderTotal})`);
  } catch (err) {
    console.warn(`⚠️ [PDF-SERVICE] Could not resolve payment status for ${orderId}:`, err);
    // Continue with PENDING status - won't throw
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
    pricingSummary: orderData.pricingSummary,
  };

  console.log(`📄 [PDF-SERVICE] Generating PDF with:`, {
    orderId: pdfOrderData.orderId,
    intent,
    paymentStatus,
    includeSignatureBox: config.includeSignatureBox,
    termsType: config.termsType,
    storePdf: config.storePdf,
    embedSignature: config.embedSignature,
  });

  let pdfBuffer = await generateSalesOrderPDF(pdfOrderData, config.includeSignatureBox, config.termsType);

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
 * Store the order snapshot on a specific followup order record.
 * This MUST be called during signature email creation, using the specific followup order ID.
 * CRITICAL: Uses followup order ID, not order ID, to prevent overwriting other followups' snapshots.
 */
export async function storeOrderSnapshotById(followupOrderId: number, snapshot: OrderSnapshot): Promise<void> {
  console.log(`💾 [PDF-SERVICE] Storing snapshot for followup order ${followupOrderId}`);
  
  await db
    .update(followupOrders)
    .set({ orderSnapshot: snapshot })
    .where(eq(followupOrders.id, followupOrderId));
  
  console.log(`✅ [PDF-SERVICE] Snapshot stored for followup order ${followupOrderId}`);
}

/**
 * @deprecated Use storeOrderSnapshotById instead to avoid overwriting snapshots
 * Store the order snapshot when creating a followup order for signature.
 * This MUST be called during initial signature email creation.
 */
export async function storeOrderSnapshot(orderId: string, snapshot: OrderSnapshot): Promise<void> {
  console.log(`⚠️ [PDF-SERVICE] DEPRECATED: storeOrderSnapshot called for ${orderId} - use storeOrderSnapshotById instead`);
  
  const followupOrder = await storage.getFollowupOrderByOrderId(orderId);
  if (!followupOrder) {
    throw new Error(`Cannot store snapshot: followup order not found for ${orderId}`);
  }
  
  await storeOrderSnapshotById(followupOrder.id, snapshot);
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
