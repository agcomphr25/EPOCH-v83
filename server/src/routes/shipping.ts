import { Router, Request, Response } from 'express';
import { eq, inArray, gte, lte, and, sql } from 'drizzle-orm';
import axios from 'axios';
import { format } from 'date-fns';

import { storage } from '../../storage';
import { db } from '../../db';
import { auditService } from '../services/auditService';
import { allOrders, linkedOrders, linkedOrderGroups, nonconformanceRecords, shipmentAccountingSnapshots, stockModels } from '../../schema';
import { v4 as uuidv4 } from 'uuid';
import {
  getOperationalWeek,
  getOperationalYear,
  getOperationalWeekStart,
  getOperationalWeekEnd,
} from '../../../shared/weekUtils';

const router = Router();

// Helper function to normalize country names to ISO country codes for UPS API
function getCountryCode(country: string | undefined): string {
  if (!country) return 'US';
  if (country === 'United States' || country === 'USA') return 'US';
  if (country === 'Canada') return 'CA';
  if (country === 'Mexico') return 'MX';
  // If already a 2-letter code, return as-is
  if (country.length === 2) return country.toUpperCase();
  return 'US'; // Default to US
}

// Helper function to check if an order is linked to other orders
async function checkLinkedOrders(orderId: string) {
  const linkedOrder = await db
    .select()
    .from(linkedOrders)
    .where(eq(linkedOrders.orderId, orderId))
    .limit(1);

  if (linkedOrder.length === 0) {
    return { isLinked: false, linkGroup: null, linkedOrders: [] };
  }

  const linkGroup = await db
    .select()
    .from(linkedOrderGroups)
    .where(eq(linkedOrderGroups.id, linkedOrder[0].linkGroupId))
    .limit(1);

  const groupOrders = await db
    .select()
    .from(linkedOrders)
    .where(eq(linkedOrders.linkGroupId, linkedOrder[0].linkGroupId));

  return {
    isLinked: true,
    linkGroup: linkGroup[0],
    linkedOrders: groupOrders.map(lo => lo.orderId),
  };
}

/**
 * Captures an immutable accounting snapshot when an order is shipped.
 * 
 * ASSUMPTION: Each order currently produces a single shipment.
 * If partial or multi-shipment fulfillment is introduced,
 * accounting snapshot capture must be revisited to create one snapshot
 * per actual shipment event rather than per sales order.
 * 
 * REVENUE SOURCE OF TRUTH:
 * - Primary: getAllOrdersWithPaymentStatus().totalPrice - this is the calculated
 *   order total including all line items, options, and adjustments.
 * - Fallback: order.priceOverride or order.flattopPriceOverride fields.
 * - Stock revenue = totalPrice - shipping (to separate product vs shipping income).
 * 
 * NET TOTAL CALCULATION:
 * - netTotal is derived at capture time as: stockRevenue + shippingIncome - discounts
 * - On manual adjustment, netTotal is always recalculated from component fields
 *   (see accountingPrep.ts PATCH route) to maintain consistency.
 * - Original values are preserved in original* fields for audit purposes.
 */
async function captureAccountingSnapshot(orderId: string) {
  try {
    let order = await storage.getFinalizedOrderById(orderId) as any;
    if (!order) {
      order = await storage.getOrderDraft(orderId);
    }
    if (!order) {
      console.log(`[Accounting Prep] Order ${orderId} not found, skipping snapshot`);
      return null;
    }
    
    // Enforce one snapshot per sales order (unique constraint also exists in DB)
    const [existing] = await db
      .select()
      .from(shipmentAccountingSnapshots)
      .where(eq(shipmentAccountingSnapshots.salesOrderId, orderId))
      .limit(1);
    
    if (existing) {
      console.log(`[Accounting Prep] Snapshot already exists for order ${orderId}`);
      return existing;
    }
    
    const shippingAmount = parseFloat(order.shipping || 0);
    
    // Revenue source of truth: Use order total from payment status calculation,
    // which includes all pricing logic (base price, options, adjustments).
    // Stock revenue = total price minus shipping to separate income streams.
    let stockRevenue = 0;
    const ordersWithPayment = await storage.getAllOrdersWithPaymentStatus([orderId]);
    const orderWithPayment = ordersWithPayment[0];
    if (orderWithPayment && orderWithPayment.totalPrice) {
      stockRevenue = parseFloat(String(orderWithPayment.totalPrice)) - shippingAmount;
      if (stockRevenue < 0) stockRevenue = 0;
    } else if (order.priceOverride) {
      // Fallback: manual price override
      stockRevenue = parseFloat(order.priceOverride);
    } else if (order.flattopPriceOverride) {
      // Fallback: flattop price override
      stockRevenue = parseFloat(order.flattopPriceOverride);
    }
    
    let discountAmount = 0;
    if (order.discountValue) {
      const discountVal = parseFloat(order.discountValue);
      if (order.discountType === 'percentage' || order.discountType === 'percent') {
        discountAmount = (stockRevenue + shippingAmount) * (discountVal / 100);
      } else {
        discountAmount = discountVal;
      }
    }
    if (order.customDiscountValue && order.showCustomDiscount) {
      const customDiscount = parseFloat(order.customDiscountValue || 0);
      if (order.customDiscountType === 'percent') {
        discountAmount += stockRevenue * (customDiscount / 100);
      } else {
        discountAmount += customDiscount;
      }
    }
    
    const netTotal = stockRevenue + shippingAmount - discountAmount;
    const arAmount = netTotal;
    
    const shipmentId = uuidv4();
    
    let customerName = order.customerName || null;
    if (!customerName && order.customerId) {
      try {
        const customer = await storage.getCustomer(parseInt(order.customerId));
        customerName = customer?.name || null;
      } catch (e) {
      }
    }
    
    const [snapshot] = await db
      .insert(shipmentAccountingSnapshots)
      .values({
        shipmentId,
        shipmentDate: new Date(),
        customerId: String(order.customerId || ''),
        customerName,
        salesOrderId: orderId,
        arAmount: String(arAmount),
        stockRevenueAmount: String(stockRevenue),
        shippingIncomeAmount: String(shippingAmount),
        discountAmount: String(discountAmount),
        netTotal: String(netTotal),
        currency: 'USD',
        originalArAmount: String(arAmount),
        originalStockRevenueAmount: String(stockRevenue),
        originalShippingIncomeAmount: String(shippingAmount),
        originalDiscountAmount: String(discountAmount),
        originalNetTotal: String(netTotal),
      })
      .returning();
    
    console.log(`[Accounting Prep] Captured snapshot for order ${orderId}: AR=$${arAmount}, Stock=$${stockRevenue}, Shipping=$${shippingAmount}, Discount=$${discountAmount}, Net=$${netTotal}`);
    return snapshot;
  } catch (error) {
    console.error('[Accounting Prep] Failed to capture snapshot:', error);
    return null;
  }
}

// Get order by ID with customer and address data for shipping
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    // Try finalized orders first
    let order = await storage.getFinalizedOrderById(orderId) as any;

    // If not found, try draft orders
    if (!order) {
      order = await storage.getOrderDraft(orderId);
    }

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get customer data if customerId exists
    let customer: any = null;
    let addresses: any[] = [];
    let shippingAddress: any = null;

    if (order.customerId) {
      try {
        customer = await storage.getCustomer(parseInt(order.customerId));
        addresses = await storage.getCustomerAddresses(order.customerId);
      } catch (customerError) {
        console.warn('Could not fetch customer data:', customerError);
      }
    }

    // Priority 1: Check for order-specific alternate shipping address
    if (order.hasAltShipTo && order.altShipToAddress) {
      const altAddr = order.altShipToAddress as any;
      shippingAddress = {
        source: 'order_specific',
        name: order.altShipToName || customer?.name || '',
        company: order.altShipToCompany || '',
        email: order.altShipToEmail || customer?.email || '',
        phone: order.altShipToPhone || customer?.phone || '',
        street: altAddr?.street || '',
        city: altAddr?.city || '',
        state: altAddr?.state || '',
        zipCode: altAddr?.zip || altAddr?.zipCode || '',
        country: altAddr?.country || 'United States',
      };
    }
    // Priority 2: Check if using existing customer as alternate shipping
    else if (
      order.hasAltShipTo &&
      order.altShipToCustomerId &&
      addresses.length > 0
    ) {
      try {
        const altCustomerId = parseInt(order.altShipToCustomerId);
        const altCustomer = await storage.getCustomer(altCustomerId);
        const altAddresses = await storage.getCustomerAddresses(
          order.altShipToCustomerId
        );
        if (altCustomer && altAddresses.length > 0) {
          shippingAddress = {
            source: 'alternate_customer',
            name: altCustomer.name || '',
            company: altCustomer.company || '',
            email: altCustomer.email || '',
            phone: altCustomer.phone || '',
            street: altAddresses[0].street || '',
            city: altAddresses[0].city || '',
            state: altAddresses[0].state || '',
            zipCode: altAddresses[0].zipCode || '',
            country: altAddresses[0].country || 'United States',
          };
        }
      } catch (customerIdError) {
        console.warn('Error parsing alternate customer ID:', customerIdError);
      }
    }
    // Priority 3: Use customer default address as fallback
    else if (addresses.length > 0) {
      shippingAddress = {
        source: 'customer_default',
        name: customer?.name || '',
        company: customer?.company || '',
        email: customer?.email || '',
        phone: customer?.phone || '',
        street: addresses[0].street || '',
        city: addresses[0].city || '',
        state: addresses[0].state || '',
        zipCode: addresses[0].zipCode || '',
        country: addresses[0].country || 'United States',
      };
    }

    res.json({
      ...order,
      customer,
      addresses,
      shippingAddress,
    });
  } catch (error) {
    console.error('Error getting order:', error);
    res.status(500).json({ error: 'Failed to get order' });
  }
});

// Get multiple orders by IDs
router.get('/orders/bulk', async (req: Request, res: Response) => {
  try {
    const { orderIds } = req.query;

    if (!orderIds || typeof orderIds !== 'string') {
      return res
        .status(400)
        .json({ error: 'orderIds query parameter is required' });
    }

    const ids = orderIds.split(',').map((id) => id.trim());

    // Get orders from allOrders table
    const orders = await db
      .select()
      .from(allOrders)
      .where(inArray(allOrders.orderId, ids));

    res.json(orders);
  } catch (error) {
    console.error('Error getting orders in bulk:', error);
    res.status(500).json({ error: 'Failed to get orders' });
  }
});

// Get orders ready for shipping
router.get('/ready-for-shipping', async (req: Request, res: Response) => {
  try {
    // Get orders from both finalized and draft tables
    const finalizedOrders = await storage.getAllFinalizedOrders();
    const draftOrders = await storage.getAllOrderDrafts();

    // Combine and filter for shipping-ready orders
    const allOrders = [...finalizedOrders, ...draftOrders];
    const shippingOrders = allOrders.filter(
      (order: any) =>
        order.currentDepartment === 'Shipping' ||
        order.currentDepartment === 'Fulfilled' ||
        order.status === 'Ready for Shipping' ||
        order.status === 'FULFILLED' ||
        (order.qcCompletedAt && !order.shippedDate) ||
        (order.currentDepartment === 'QC' && order.qcPassed)
    );

    res.json(shippingOrders);
  } catch (error) {
    console.error('Error getting shipping-ready orders:', error);
    res.status(500).json({ error: 'Failed to get shipping-ready orders' });
  }
});

// Mark order as shipped
router.post('/mark-shipped/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const {
      trackingNumber,
      shippingCarrier = 'UPS',
      shippingMethod = 'Ground',
      estimatedDelivery,
      sendNotification = true,
      notificationMethod = 'email',
      bypassLinkValidation = false,
    } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Check if order is linked to other orders
    const linkInfo = await checkLinkedOrders(orderId);
    if (linkInfo.isLinked && linkInfo.linkedOrders.length > 1) {
      const otherOrders = linkInfo.linkedOrders.filter(id => id !== orderId);
      
      // If link group requires approval and bypass is requested, verify approval code
      if (linkInfo.linkGroup?.requiresApprovalToSeparate && bypassLinkValidation) {
        const { approvalCode } = req.body;
        if (!approvalCode || approvalCode !== linkInfo.linkGroup.approvalCode) {
          return res.status(403).json({
            error: 'Invalid or missing approval code',
            linkedOrders: otherOrders,
            linkGroupName: linkInfo.linkGroup?.name,
            requiresApproval: true,
            message: `This order is part of a link group that requires an approval code to ship separately. Please provide the correct approval code.`,
          });
        }
      } else if (!bypassLinkValidation) {
        // If not bypassing, block the request
        return res.status(400).json({
          error: 'This order is linked to other orders',
          linkedOrders: otherOrders,
          linkGroupName: linkInfo.linkGroup?.name,
          requiresApproval: linkInfo.linkGroup?.requiresApprovalToSeparate,
          message: `This order is part of a link group with ${otherOrders.length} other order(s). All linked orders should ship together. Set bypassLinkValidation=true${linkInfo.linkGroup?.requiresApprovalToSeparate ? ' and provide approvalCode' : ''} to override.`,
        });
      }
    }

    // Update order with shipping information
    const updateData = {
      currentDepartment: 'Fulfilled',
      trackingNumber,
      shippingCarrier,
      shippingMethod,
      shippedDate: new Date(),
      shippingCompletedAt: new Date(),
      estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : null,
      customerNotified: sendNotification,
      notificationMethod: sendNotification ? notificationMethod : null,
      notificationSentAt: sendNotification ? new Date() : null,
    };

    // Try to update in finalized orders first
    let updatedOrder;
    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
    } catch (error) {
      // If not found in finalized orders, try draft orders
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
    }

    // Send customer notification if requested
    if (sendNotification) {
      try {
        const { sendCustomerNotification } = await import(
          '../../utils/notifications'
        );
        await sendCustomerNotification({
          orderId,
          trackingNumber,
          carrier: shippingCarrier,
          estimatedDelivery: estimatedDelivery
            ? new Date(estimatedDelivery)
            : undefined,
        });
      } catch (notificationError) {
        console.error(
          'Failed to send customer notification:',
          notificationError
        );
        // Don't fail the entire request if notification fails
      }
    }

    // Capture accounting snapshot for QuickBooks journal entry prep
    try {
      await captureAccountingSnapshot(orderId);
    } catch (snapshotError) {
      console.error('[Accounting Prep] Error capturing snapshot:', snapshotError);
    }

    // Log audit event for shipped order
    try {
      await auditService.logEvent({
        entityType: 'p1_order',
        entityId: orderId,
        action: 'ORDER_SHIPPED',
        actor: {
          id: (req as any).user?.id,
          username: (req as any).user?.username || 'System',
          role: (req as any).user?.role || 'system',
        },
        reason: `Order shipped via ${shippingCarrier} ${shippingMethod}`,
        meta: {
          trackingNumber,
          shippingCarrier,
          shippingMethod,
          estimatedDelivery: estimatedDelivery || null,
          customerNotified: sendNotification,
        },
      });
    } catch (auditError) {
      console.error('Failed to log shipping audit event:', auditError);
    }

    res.json({
      success: true,
      message: 'Order marked as shipped',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Error marking order as shipped:', error);
    res.status(500).json({ error: 'Failed to mark order as shipped' });
  }
});

// Update tracking information
router.put('/tracking/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const {
      trackingNumber,
      shippingCarrier,
      shippingMethod,
      estimatedDelivery,
      deliveryConfirmed,
      customerNotified,
      notificationMethod,
    } = req.body;

    const updateData: any = {};

    if (trackingNumber !== undefined)
      updateData.trackingNumber = trackingNumber;
    if (shippingCarrier !== undefined)
      updateData.shippingCarrier = shippingCarrier;
    if (shippingMethod !== undefined)
      updateData.shippingMethod = shippingMethod;
    if (estimatedDelivery !== undefined)
      updateData.estimatedDelivery = estimatedDelivery
        ? new Date(estimatedDelivery)
        : null;
    if (deliveryConfirmed !== undefined) {
      updateData.deliveryConfirmed = deliveryConfirmed;
      if (deliveryConfirmed) {
        updateData.deliveryConfirmedAt = new Date();
      }
    }
    if (customerNotified !== undefined)
      updateData.customerNotified = customerNotified;
    if (notificationMethod !== undefined)
      updateData.notificationMethod = notificationMethod;

    // Try to update in finalized orders first
    let updatedOrder;
    try {
      updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
    } catch (error) {
      // If not found in finalized orders, try draft orders
      updatedOrder = await storage.updateOrderDraft(orderId, updateData);
    }

    res.json({
      success: true,
      message: 'Tracking information updated',
      order: updatedOrder,
    });
  } catch (error) {
    console.error('Error updating tracking information:', error);
    res.status(500).json({ error: 'Failed to update tracking information' });
  }
});

// Update tracking and optionally send notification (POST version for component compatibility)
router.post('/update-tracking/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const {
      trackingNumber,
      carrier,
      estimatedDelivery,
      sendNotification = false,
    } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Update order with tracking information
    const updateData: any = {
      trackingNumber: trackingNumber.trim(),
      shippingCarrier: carrier || 'UPS',
      updatedAt: new Date(),
    };

    if (estimatedDelivery) {
      updateData.estimatedDelivery = new Date(estimatedDelivery);
    }

    // If order doesn't have a shipped date, set it now
    updateData.shippedDate = new Date();

    // Update in allOrders table
    await db
      .update(allOrders)
      .set(updateData)
      .where(eq(allOrders.orderId, orderId));

    console.log(`Updated tracking for order ${orderId}: ${trackingNumber}`);

    // Send notification if requested
    let notificationResult = null;
    if (sendNotification) {
      try {
        const { sendCustomerNotification } = await import('../../utils/notifications');
        notificationResult = await sendCustomerNotification({
          orderId,
          trackingNumber: trackingNumber.trim(),
          carrier: carrier || 'UPS',
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : undefined,
        });

        if (notificationResult.success) {
          console.log(`Notification sent for order ${orderId} via ${notificationResult.methods?.join(', ') || 'unknown'}`);
        } else {
          console.error(`Notification failed for order ${orderId}:`, notificationResult.errors);
        }
      } catch (notificationError) {
        console.error('Failed to send customer notification:', notificationError);
      }
    }

    res.json({
      success: true,
      message: sendNotification && notificationResult?.success 
        ? `Tracking updated and customer notified via ${notificationResult.methods?.join(' and ') || 'email/sms'}`
        : 'Tracking information updated',
      trackingNumber: trackingNumber.trim(),
      carrier: carrier || 'UPS',
      notificationSent: notificationResult?.success || false,
      notificationMethods: notificationResult?.methods || [],
    });
  } catch (error) {
    console.error('Error updating tracking:', error);
    res.status(500).json({ error: 'Failed to update tracking information' });
  }
});

// Get shipping statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllFinalizedOrders();

    const stats = {
      readyForShipping: orders.filter(
        (o: any) =>
          (o.currentDepartment === 'Shipping QC' ||
            o.currentDepartment === 'Shipping') &&
          !o.shippedDate
      ).length,
      shipped: orders.filter((o: any) => o.shippedDate).length,
      delivered: orders.filter((o: any) => o.deliveryConfirmed).length,
      pending: orders.filter((o: any) => o.shippedDate && !o.deliveryConfirmed)
        .length,
    };

    res.json(stats);
  } catch (error) {
    console.error('Error getting shipping stats:', error);
    res.status(500).json({ error: 'Failed to get shipping statistics' });
  }
});

// Helper to build UPS API requests
function buildUPSShipmentPayload(details: any) {
  const {
    orderId,
    shipToAddress,
    shipFromAddress,
    packageWeight,
    packageDimensions,
    serviceType = '03', // UPS Ground
    packageType = '02', // Customer Package
    reference1,
    reference2,
    billingOption = 'sender',
    receiverAccount,
  } = details;

  const upsUsername = process.env.UPS_USERNAME?.trim();
  const upsPassword = process.env.UPS_PASSWORD?.trim();
  const upsAccessKey = process.env.UPS_ACCESS_KEY?.trim();
  const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

  return {
    UPSSecurity: {
      UsernameToken: {
        Username: upsUsername,
        Password: upsPassword,
      },
      ServiceAccessToken: {
        AccessLicenseNumber: upsAccessKey,
      },
    },
    ShipmentRequest: {
      Request: {
        RequestOption: 'nonvalidate',
        TransactionReference: {
          CustomerContext: `Order ${orderId}`,
        },
      },
      Shipment: {
        Description: `Order ${orderId} - Manufacturing Product`,
        Shipper: {
          Name: shipFromAddress.name || 'AG Composites',
          AttentionName: shipFromAddress.contact || 'Shipping Department',
          CompanyDisplayableName: shipFromAddress.company || 'AG Composites',
          Phone: {
            Number: shipFromAddress.phone || '5555551234',
            Extension: shipFromAddress.phoneExt || '',
          },
          ShipperNumber: upsShipperNumber,
          Address: {
            AddressLine: [
              shipFromAddress.street,
              shipFromAddress.street2,
            ].filter(Boolean),
            City: shipFromAddress.city,
            StateProvinceCode: shipFromAddress.state,
            PostalCode: shipFromAddress.zipCode,
            CountryCode: shipFromAddress.country || 'US',
          },
        },
        ShipTo: {
          Name: (shipToAddress.name || '').substring(0, 35), // UPS limit
          AttentionName: (
            shipToAddress.contact ||
            shipToAddress.name ||
            ''
          ).substring(0, 35),
          CompanyDisplayableName: (shipToAddress.company || '').substring(
            0,
            35
          ),
          Phone:
            shipToAddress.phone && shipToAddress.phone.length >= 10
              ? {
                  Number: shipToAddress.phone
                    .replace(/\D/g, '')
                    .substring(0, 15),
                }
              : undefined,
          Address: {
            AddressLine: [shipToAddress.street, shipToAddress.street2]
              .filter(Boolean)
              .map((line) => line.substring(0, 35)),
            City: (shipToAddress.city || '').substring(0, 30),
            StateProvinceCode: (shipToAddress.state || '').substring(0, 2),
            PostalCode: (shipToAddress.zipCode || '')
              .replace(/\D/g, '')
              .substring(0, 9),
            CountryCode: shipToAddress.country || 'US',
          },
        },
        PaymentInformation: {
          ShipmentCharge:
            billingOption === 'receiver'
              ? {
                  Type: '01', // Transportation
                  BillReceiver: {
                    AccountNumber: receiverAccount?.accountNumber,
                    Address: {
                      PostalCode: receiverAccount?.zipCode,
                    },
                  },
                }
              : {
                  Type: '01', // Transportation
                  BillShipper: {
                    AccountNumber: process.env.UPS_SHIPPER_NUMBER?.trim(),
                  },
                },
        },
        Service: {
          Code: serviceType,
        },
        Package: {
          Description: `Order ${orderId}`,
          Packaging: {
            Code: packageType,
          },
          Dimensions: packageDimensions
            ? {
                UnitOfMeasurement: {
                  Code: 'IN',
                },
                Length: packageDimensions.length.toString(),
                Width: packageDimensions.width.toString(),
                Height: packageDimensions.height.toString(),
              }
            : undefined,
          PackageWeight: {
            UnitOfMeasurement: {
              Code: 'LBS',
            },
            Weight: packageWeight?.toString() || '1',
          },
          ReferenceNumber: [
            reference1 ? { Code: '01', Value: reference1 } : undefined,
            reference2 ? { Code: '02', Value: reference2 } : undefined,
          ].filter(Boolean),
        },

        LabelSpecification: {
          LabelImageFormat: {
            Code: 'GIF',
          },
          HTTPUserAgent: 'Mozilla/4.0',
          LabelStockSize: {
            Height: '6',
            Width: '4',
          },
        },
      },
    },
  };
}

// Create shipping label using UPS API
router.post('/create-label', async (req: Request, res: Response) => {
  try {
    const { 
      orderId, 
      shipTo, 
      shipToAddress,
      shipFromAddress,
      packageDetails, 
      packageWeight,
      packageDimensions,
      billingOption, 
      receiverAccount, 
      serviceType,
      reference1,
      reference2,
      isResidential
    } = req.body;

    console.log(
      '⚡ Creating UPS label for:',
      orderId,
      'billing:',
      billingOption,
      'service:',
      serviceType || '03',
      isResidential ? '(Residential)' : '(Commercial)'
    );

    // Support both old and new request formats
    const finalShipToAddress = shipToAddress || (shipTo ? {
      name: shipTo.name,
      street: shipTo.street,
      city: shipTo.city,
      state: shipTo.state,
      zipCode: shipTo.zip,
      country: shipTo.country || 'US',
      phone: shipTo.phone || '',
    } : null);

    const finalShipFromAddress = shipFromAddress || {
      name: process.env.SHIP_FROM_NAME || 'AG Composites',
      company: process.env.SHIP_FROM_NAME || 'AG Composites',
      contact: process.env.SHIP_FROM_ATTENTION || 'Shipping',
      street: process.env.SHIP_FROM_ADDRESS1 || '230 Hamer Rd.',
      city: process.env.SHIP_FROM_CITY || 'Owens Crossroads',
      state: process.env.SHIP_FROM_STATE || 'AL',
      zipCode: process.env.SHIP_FROM_POSTAL || '35763',
      country: 'US',
      phone: process.env.SHIP_FROM_PHONE || '256-723-8381',
    };

    const finalPackageWeight = packageWeight || packageDetails?.weight;
    const finalPackageDimensions = packageDimensions || packageDetails?.dimensions;

    // Build shipment details from request body
    const shipmentDetails = {
      orderId,
      shipToAddress: finalShipToAddress,
      shipFromAddress: finalShipFromAddress,
      packageWeight: finalPackageWeight,
      packageDimensions: finalPackageDimensions,
      billingOption,
      receiverAccount,
      serviceType: serviceType || '03', // Use selected service or default to UPS Ground
      reference1,
      reference2,
      isResidential,
    };

    // Get order details for reference (must come before the shipping gate check)
    let order;
    try {
      order = await storage.getFinalizedOrderById(orderId);
      if (!order) {
        order = await storage.getOrderDraft(orderId);
      }
    } catch (error) {
      console.log('Could not fetch order details:', error);
    }

    // Shipping gate: check if ship-to address has been validated
    // Only run when address validation is enabled
    const addressValidationEnabled = process.env.ADDRESS_VALIDATION_ENABLED !== 'false';
    if (addressValidationEnabled && order && order.customerId) {
      try {
        const customerAddresses = await storage.getCustomerAddresses(order.customerId);
        const shipToStreet = finalShipToAddress?.street || '';
        const matchingAddr = customerAddresses.find((a: any) =>
          a.street && shipToStreet && a.street.toLowerCase() === shipToStreet.toLowerCase()
        );
        if (matchingAddr) {
          const status = matchingAddr.validationStatus;
          if (!status || (status !== 'validated' && status !== 'overridden')) {
            console.warn(`⚠️ Shipping gate: address validation_status="${status || 'null'}" for address ${matchingAddr.id}`);
            return res.status(400).json({
              error: 'Ship-to address must be validated before shipping.',
              message: `The shipping address must be validated before creating a label. Current status: ${status || 'null'}. Please validate the address in Customer Management first.`,
              addressId: matchingAddr.id,
              validationStatus: status || null,
            });
          }
        }
      } catch (gateErr) {
        console.warn('Shipping gate check failed (non-blocking):', gateErr);
      }
    }

    // Validate required UPS OAuth credentials (2024+ API)
    const upsClientId = process.env.UPS_CLIENT_ID?.trim();
    const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
    const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

    if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
      return res.status(500).json({
        error:
          'UPS OAuth credentials not configured. Please set UPS_CLIENT_ID, UPS_CLIENT_SECRET, and UPS_SHIPPER_NUMBER environment variables for the new UPS API.',
      });
    }

    // Quick credential validation (optimized logging)
    console.log('⚡ UPS credentials:', upsClientId ? 'OK' : 'MISSING');

    // Step 1: Get OAuth Token from UPS (2024+ API requirement) - FAST CACHED VERSION
    console.log('⚡ Getting cached UPS OAuth token...');
    let accessToken;
    try {
      accessToken = await getUPSOAuthToken(upsClientId, upsClientSecret);
      console.log('⚡ UPS OAuth token ready');
    } catch (tokenError: any) {
      console.error('Failed to get UPS OAuth token:', tokenError.message);
      return res.status(500).json({
        error: 'Failed to authenticate with UPS OAuth API',
        details: tokenError.message,
      });
    }

    // Step 2: Build shipment payload for new REST API
    const payload = buildUPSShipmentPayloadOAuth(
      shipmentDetails,
      upsShipperNumber
    );

    // Use UPS Production REST API endpoints (2024+) for real tracking numbers
    const upsEndpoint = 'https://onlinetools.ups.com/api/shipments/v1/ship'; // Production endpoint for real tracking
    console.log('Using new UPS OAuth REST API endpoint');

    console.log('Creating UPS shipping label for order:', orderId);
    console.log('Using UPS endpoint:', upsEndpoint);
    console.log('UPS OAuth Payload:', JSON.stringify(payload, null, 2));

    // UPS OAuth API call for shipment creation and label generation
    let response;
    try {
      console.log(`Attempting UPS OAuth API call to: ${upsEndpoint}`);

      // Check if we're in deployment environment and add extra logging
      const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
      if (isDeployment) {
        console.log(
          '🚀 Running in deployment environment - using extended timeouts'
        );
      }

      response = await axios.post(upsEndpoint, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        timeout: isDeployment ? 45000 : 30000, // 45 seconds in deployment, 30 seconds in development
      });
      console.log('UPS OAuth API call successful');
    } catch (error: any) {
      console.error(
        'UPS Production OAuth endpoint failed:',
        error.response?.data || error.message
      );
      throw error; // Re-throw the error for handling
    }

    if (!response) {
      throw new Error('No response from UPS API');
    }

    // UPS OAuth API returns the label in new format
    const shipmentResults = response.data?.ShipmentResponse?.ShipmentResults;
    const labelBase64 =
      shipmentResults?.PackageResults?.[0]?.ShippingLabel?.GraphicImage ||
      shipmentResults?.PackageResults?.ShippingLabel?.GraphicImage;
    const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;
    // Use negotiated rate if available, otherwise use retail rate
    const negotiatedCost = shipmentResults?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue;
    const retailCost = shipmentResults?.ShipmentCharges?.TotalCharges?.MonetaryValue;
    const shipmentCost = negotiatedCost || retailCost;
    
    console.log(`⚡ Shipment cost - Negotiated: ${negotiatedCost || 'N/A'}, Retail: ${retailCost || 'N/A'}, Using: ${shipmentCost || 'N/A'}`);

    if (labelBase64 && trackingNumber) {
      // Update order with tracking information
      if (order) {
        try {
          const updateData = {
            trackingNumber,
            shippingCarrier: 'UPS',
            shippingMethod: getServiceName(serviceType || '03'),
            shippingCost: shipmentCost ? parseFloat(shipmentCost) : null,
            labelGenerated: true,
            labelGeneratedAt: new Date(),
            shippedDate: new Date(),
          };

          // Try updating finalized order first, fall back to draft
          try {
            await storage.updateFinalizedOrder(orderId, updateData);
          } catch (error) {
            await storage.updateOrderDraft(orderId, updateData);
          }

          // Send automated customer shipping notification
          try {
            console.log(
              `🚚 Attempting to send shipping notification for order ${orderId} with tracking ${trackingNumber}`
            );

            // Get customer information for the order
            let customer = null;
            if (order.customerId) {
              try {
                customer = await storage.getCustomerById(order.customerId);
              } catch (customerError) {
                console.log(
                  'Could not fetch customer details for notification:',
                  customerError
                );
              }
            }

            if (customer && (customer.email || customer.phone)) {
              // Send notification respecting customer preference (ONE channel only)
              const { sendCustomerNotification } = await import(
                '../../utils/notifications'
              );
              
              // Use customer's preferred communication method - NOT all available channels
              const customerPreference = (customer.preferredCommunicationMethod as string[]) || [];
              const preferredMethods: string[] = customerPreference.length > 0 
                ? customerPreference 
                : (customer.email ? ['email'] : (customer.phone ? ['sms'] : []));
              
              console.log(`[LABEL-NOTIFY] Order ${orderId} - Customer preference: ${preferredMethods.join(', ')}`);
              
              const notificationResult = await sendCustomerNotification({
                orderId,
                trackingNumber,
                carrier: 'UPS',
                customerPhone: customer.phone || undefined,
                customerEmail: customer.email || undefined,
                preferredMethods,
                // forceResend NOT set - will be deduplicated if already sent
              });

              if (notificationResult.success) {
                console.log(
                  `✅ Shipping notification sent via ${notificationResult.methods?.join(', ') || 'unknown'} for order ${orderId}`
                );
                
                // Update order with notification status
                const notificationUpdateData = {
                  customerNotified: true,
                  notificationMethod: notificationResult.methods?.join(', ') || 'email',
                  notificationSentAt: new Date(),
                };
                
                try {
                  await storage.updateFinalizedOrder(orderId, notificationUpdateData);
                } catch {
                  await storage.updateOrderDraft(orderId, notificationUpdateData);
                }
              } else {
                console.log(
                  `⚠️ Shipping notification failed for order ${orderId}:`,
                  notificationResult.errors
                );
              }
            } else {
              console.log(
                `📧 No customer contact information available for shipping notification (Order: ${orderId})`
              );
            }
          } catch (notificationError) {
            console.error(
              'Failed to send automated shipping notification:',
              notificationError
            );
            // Don't fail the label creation if notification fails
          }
        } catch (updateError) {
          console.error(
            'Failed to update order with tracking info:',
            updateError
          );
          // Don't fail the entire request
        }
      }

      // Log audit event for label creation / shipped
      try {
        await auditService.logEvent({
          entityType: 'p1_order',
          entityId: orderId,
          action: 'ORDER_SHIPPED',
          actor: {
            id: (req as any).user?.id,
            username: (req as any).user?.username || 'System',
            role: (req as any).user?.role || 'system',
          },
          reason: `UPS shipping label created`,
          meta: {
            trackingNumber,
            shippingCarrier: 'UPS',
            shippingMethod: getServiceName(serviceType || '03'),
            shipmentCost: shipmentCost ? parseFloat(shipmentCost) : null,
          },
        });
      } catch (auditError) {
        console.error('Failed to log shipping audit event:', auditError);
      }

      res.json({
        success: true,
        labelBase64,
        trackingNumber,
        shipmentCost: shipmentCost ? parseFloat(shipmentCost) : null,
        orderId,
        message: 'Shipping label created successfully',
      });
    } else {
      console.error('UPS API response missing required fields:', response.data);
      res.status(500).json({
        error: 'No label or tracking number returned from UPS.',
        details: response.data,
      });
    }
  } catch (error: any) {
    console.error('UPS API error:', error.response?.data || error.message);
    console.error(
      'Full error object:',
      JSON.stringify(error.response?.data, null, 2)
    );

    if (error.response?.data) {
      const responseData = error.response.data;
      let errorMessage = 'UPS API error';
      let errorCode = null;
      let errorSeverity = null;
      let faultString = null;

      const faultDetails = responseData.Fault?.detail;
      if (faultDetails?.Errors) {
        const errors = Array.isArray(faultDetails.Errors)
          ? faultDetails.Errors
          : [faultDetails.Errors];
        console.error('UPS Fault Error Details:', JSON.stringify(errors, null, 2));

        if (errors[0]) {
          errorMessage =
            errors[0].ErrorDescription || 
            errors[0].Description || 
            errors[0].PrimaryErrorCode?.Description ||
            errorMessage;
          errorCode = errors[0].ErrorCode || errors[0].PrimaryErrorCode?.Code;
          errorSeverity = errors[0].ErrorSeverity || errors[0].PrimaryErrorCode?.Severity;
        }
      }

      faultString = responseData.Fault?.faultstring;
      if (faultString && !errorMessage.includes(faultString)) {
        errorMessage = `${errorMessage} (${faultString})`;
      }

      const restErrors = responseData.response?.errors;
      if (restErrors && Array.isArray(restErrors) && restErrors.length > 0) {
        console.error('UPS REST API Error Details:', JSON.stringify(restErrors, null, 2));
        errorMessage = restErrors.map((e: any) => e.message || e.description || e.code).filter(Boolean).join('; ') || errorMessage;
        errorCode = restErrors[0]?.code || errorCode;
      }

      const shipmentErrors = responseData.ShipmentResponse?.Response?.Alert;
      if (shipmentErrors) {
        const alerts = Array.isArray(shipmentErrors) ? shipmentErrors : [shipmentErrors];
        const errorAlerts = alerts.filter((a: any) => a.Code);
        if (errorAlerts.length > 0) {
          console.error('UPS Shipment Alerts:', JSON.stringify(errorAlerts, null, 2));
          if (errorMessage === 'UPS API error') {
            errorMessage = errorAlerts.map((a: any) => a.Description || a.Code).join('; ');
            errorCode = errorAlerts[0]?.Code || errorCode;
          }
        }
      }

      console.error('Final parsed UPS error:', { errorMessage, errorCode, errorSeverity, faultString, httpStatus: error.response?.status });

      res.status(500).json({
        error: errorMessage,
        errorCode,
        errorSeverity,
        details: responseData,
        faultString,
      });
    } else {
      res.status(500).json({
        error: error.message || 'UPS API error.',
        message: 'Failed to create shipping label',
      });
    }
  }
});

// Helper function to get service name from code
function getServiceName(serviceCode: string): string {
  const serviceMap: { [key: string]: string } = {
    '01': 'UPS Next Day Air',
    '02': 'UPS 2nd Day Air',
    '03': 'UPS Ground',
    '07': 'UPS Worldwide Express',
    '08': 'UPS Worldwide Expedited',
    '11': 'UPS Standard',
    '12': 'UPS 3 Day Select',
    '13': 'UPS Next Day Air Saver',
    '14': 'UPS UPS Next Day Air Early AM',
    '54': 'UPS Worldwide Express Plus',
    '59': 'UPS 2nd Day Air A.M.',
    '65': 'UPS UPS Saver',
  };
  return serviceMap[serviceCode] || 'UPS Ground';
}

// Get UPS service rates for an address
router.post('/get-rates', async (req: Request, res: Response) => {
  try {
    const { shipToAddress, shipFromAddress, packageWeight, packageDimensions, isResidential } =
      req.body;

    console.log('⚡ Getting UPS rates...', isResidential ? '(Residential)' : '(Commercial)');

    // Validate OAuth credentials (2024+ API)
    const upsClientId = process.env.UPS_CLIENT_ID?.trim();
    const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
    const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

    if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
      console.error('UPS OAuth credentials not configured for rating');
      return res.status(500).json({
        error: 'UPS API credentials not configured.',
      });
    }

    // Get OAuth Token
    let accessToken;
    try {
      accessToken = await getUPSOAuthToken(upsClientId, upsClientSecret);
      console.log('⚡ UPS OAuth token ready for rating');
    } catch (tokenError: any) {
      console.error('Failed to get UPS OAuth token for rating:', tokenError.message);
      return res.status(500).json({
        error: 'Failed to authenticate with UPS OAuth API',
        details: tokenError.message,
      });
    }

    // Convert country name to ISO code for UPS API
    const getCountryCode = (country: string | undefined): string => {
      if (!country) return 'US';
      if (country === 'United States' || country === 'USA') return 'US';
      if (country === 'Canada') return 'CA';
      if (country === 'Mexico') return 'MX';
      // If already a code, return as-is
      if (country.length === 2) return country.toUpperCase();
      return 'US'; // Default to US
    };

    // Build rate request payload for OAuth REST API
    const ratePayload = {
      RateRequest: {
        Request: {
          TransactionReference: {
            CustomerContext: 'Rating Request',
          },
        },
        Shipment: {
          Shipper: {
            ShipperNumber: upsShipperNumber,
            Address: {
              AddressLine: [shipFromAddress.street || '230 Hamer Rd.'].filter(Boolean),
              City: shipFromAddress.city || 'Owens Crossroads',
              StateProvinceCode: convertStateToAbbreviation(shipFromAddress.state || 'AL'),
              PostalCode: (shipFromAddress.zipCode || '35763').replace(/\D/g, ''),
              CountryCode: getCountryCode(shipFromAddress.country),
            },
          },
          ShipTo: {
            Address: {
              AddressLine: [shipToAddress.street].filter(Boolean),
              City: shipToAddress.city,
              StateProvinceCode: convertStateToAbbreviation(shipToAddress.state),
              PostalCode: (shipToAddress.zipCode || '').replace(/\D/g, ''),
              CountryCode: getCountryCode(shipToAddress.country),
              ResidentialAddressIndicator: isResidential ? '' : undefined,
            },
          },
          ShipFrom: {
            Address: {
              AddressLine: [shipFromAddress.street || '230 Hamer Rd.'].filter(Boolean),
              City: shipFromAddress.city || 'Owens Crossroads',
              StateProvinceCode: convertStateToAbbreviation(shipFromAddress.state || 'AL'),
              PostalCode: (shipFromAddress.zipCode || '35763').replace(/\D/g, ''),
              CountryCode: getCountryCode(shipFromAddress.country),
            },
          },
          ShipmentRatingOptions: {
            NegotiatedRatesIndicator: '',
          },
          Package: {
            PackagingType: {
              Code: '02', // Customer Package
            },
            Dimensions: packageDimensions
              ? {
                  UnitOfMeasurement: {
                    Code: 'IN',
                  },
                  Length: packageDimensions.length.toString(),
                  Width: packageDimensions.width.toString(),
                  Height: packageDimensions.height.toString(),
                }
              : {
                  UnitOfMeasurement: {
                    Code: 'IN',
                  },
                  Length: '12',
                  Width: '12',
                  Height: '6',
                },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS',
              },
              Weight: packageWeight?.toString() || '5',
            },
          },
        },
      },
    };

    // Use UPS Production REST API endpoint for rating (2024+)
    const upsEndpoint = 'https://onlinetools.ups.com/api/rating/v1/Shop';

    console.log('⚡ Calling UPS Rating API:', upsEndpoint);
    console.log('⚡ Request payload:', JSON.stringify(ratePayload, null, 2));

    const response = await axios.post(upsEndpoint, ratePayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    console.log('⚡ UPS Rating API response received');

    const ratedShipments = response.data?.RateResponse?.RatedShipment;
    if (ratedShipments) {
      const rates = Array.isArray(ratedShipments)
        ? ratedShipments
        : [ratedShipments];
      const formattedRates = rates.map((rate: any) => {
        // Use negotiated rates if available, otherwise fall back to retail rates
        const negotiatedRate = rate.NegotiatedRateCharges?.TotalCharge?.MonetaryValue;
        const retailRate = rate.TotalCharges?.MonetaryValue;
        const finalRate = negotiatedRate || retailRate || '0';

        console.log(`⚡ Service ${rate.Service?.Code}: Negotiated=${negotiatedRate || 'N/A'}, Retail=${retailRate || 'N/A'}, Using=${finalRate}`);

        return {
          serviceCode: rate.Service?.Code,
          serviceName: getServiceName(rate.Service?.Code),
          totalCharges: parseFloat(finalRate),
          currency: rate.TotalCharges?.CurrencyCode || 'USD',
          guaranteedDaysToDelivery: rate.GuaranteedDaysToDelivery,
          scheduleDeliveryDate: rate.ScheduledDeliveryDate,
          isNegotiatedRate: !!negotiatedRate,
        };
      });

      console.log(`⚡ Found ${formattedRates.length} shipping rates`);

      res.json({
        success: true,
        rates: formattedRates,
      });
    } else {
      console.error('No rates returned from UPS');
      res.status(500).json({
        error: 'No rates returned from UPS',
        details: response.data,
      });
    }
  } catch (error: any) {
    console.error('UPS Rate API error:', JSON.stringify(error.response?.data || error.message, null, 2));
    res.status(500).json({
      error: 'Failed to get shipping rates',
      details: error.response?.data || error.message,
    });
  }
});

// Test UPS shipment creation endpoint
router.post('/test-ups-shipment', async (req: Request, res: Response) => {
  try {
    const { createShipment } = await import('../utils/upsShipping');

    const testShipment = {
      shipTo: {
        name: 'Test Customer',
        address1: '123 Test Street',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
      },
      serviceCode: '03', // UPS Ground
      weightLbs: 5,
      referenceNumber: 'TEST-SHIPMENT',
    };

    console.log('🚚 Testing UPS shipment creation...');
    const result = await createShipment(testShipment);
    console.log('✅ UPS shipment creation successful');

    res.json({
      success: true,
      message: 'UPS shipment creation successful',
      trackingNumber: result.trackingNumber,
      labelBase64: result.labelBase64 ? 'Generated' : 'None',
    });
  } catch (error) {
    console.error('❌ UPS shipment creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'UPS shipment creation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// UPS OAuth 2.0 Authentication (2024+ API)
async function getUPSOAuthToken(
  clientId: string,
  clientSecret: string
): Promise<string> {
  // Use production OAuth endpoint for real tracking numbers
  const tokenEndpoint = 'https://onlinetools.ups.com/security/v1/oauth/token';

  console.log('UPS OAuth Token Endpoint:', tokenEndpoint);

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    'base64'
  );

  try {
    const response = await axios.post(
      tokenEndpoint,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        timeout: process.env.REPLIT_DEPLOYMENT === '1' ? 20000 : 15000, // Shorter timeout for OAuth token
      }
    );

    console.log('OAuth token response status:', response.status);

    if (response.data?.access_token) {
      return response.data.access_token;
    } else {
      throw new Error('No access token in response');
    }
  } catch (error: any) {
    console.error(
      'OAuth token error details:',
      error.response?.data || error.message
    );
    throw new Error(
      `Failed to get UPS OAuth token: ${error.response?.data?.error_description || error.message}`
    );
  }
}

// Convert full state names to 2-letter abbreviations for UPS API
function convertStateToAbbreviation(state: string): string {
  const stateMap: { [key: string]: string } = {
    Alabama: 'AL',
    Alaska: 'AK',
    Arizona: 'AZ',
    Arkansas: 'AR',
    California: 'CA',
    Colorado: 'CO',
    Connecticut: 'CT',
    Delaware: 'DE',
    Florida: 'FL',
    Georgia: 'GA',
    Hawaii: 'HI',
    Idaho: 'ID',
    Illinois: 'IL',
    Indiana: 'IN',
    Iowa: 'IA',
    Kansas: 'KS',
    Kentucky: 'KY',
    Louisiana: 'LA',
    Maine: 'ME',
    Maryland: 'MD',
    Massachusetts: 'MA',
    Michigan: 'MI',
    Minnesota: 'MN',
    Mississippi: 'MS',
    Missouri: 'MO',
    Montana: 'MT',
    Nebraska: 'NE',
    Nevada: 'NV',
    'New Hampshire': 'NH',
    'New Jersey': 'NJ',
    'New Mexico': 'NM',
    'New York': 'NY',
    'North Carolina': 'NC',
    'North Dakota': 'ND',
    Ohio: 'OH',
    Oklahoma: 'OK',
    Oregon: 'OR',
    Pennsylvania: 'PA',
    'Rhode Island': 'RI',
    'South Carolina': 'SC',
    'South Dakota': 'SD',
    Tennessee: 'TN',
    Texas: 'TX',
    Utah: 'UT',
    Vermont: 'VT',
    Virginia: 'VA',
    Washington: 'WA',
    'West Virginia': 'WV',
    Wisconsin: 'WI',
    Wyoming: 'WY',
    'District of Columbia': 'DC',
  };

  // If already an abbreviation, return as-is
  if (state && state.length === 2) {
    return state.toUpperCase();
  }

  // Convert full name to abbreviation
  return stateMap[state] || state;
}

// Build UPS shipment payload for OAuth REST API (2024+) - No notification to avoid validation errors
function buildUPSShipmentPayloadOAuth(
  shipmentDetails: any,
  shipperNumber: string
): any {
  // Detect consolidated shipments and use shorter description (UPS limit: 50 chars)
  const isConsolidated = shipmentDetails.orderId.includes('+');
  const description = isConsolidated 
    ? 'Consolidated Manufacturing Shipment' // 36 chars - safe
    : `Order ${shipmentDetails.orderId} - Manufacturing Product`.substring(0, 50);
  
  return {
    ShipmentRequest: {
      Request: {
        RequestOption: 'nonvalidate',
        TransactionReference: {
          CustomerContext: `Order ${shipmentDetails.orderId}`.substring(0, 50),
        },
      },
      Shipment: {
        Description: description,
        Shipper: {
          Name: process.env.SHIP_FROM_NAME || 'AG Composites',
          AttentionName: process.env.SHIP_FROM_ATTENTION || 'Shipping',
          CompanyDisplayableName: process.env.SHIP_FROM_NAME || 'AG Composites',
          Phone: {
            Number: process.env.SHIP_FROM_PHONE || '256-723-8381',
          },
          ShipperNumber: shipperNumber,
          Address: {
            AddressLine: [process.env.SHIP_FROM_ADDRESS1 || '230 Hamer Rd.'],
            City: process.env.SHIP_FROM_CITY || 'Owens Crossroads',
            StateProvinceCode: process.env.SHIP_FROM_STATE || 'AL',
            PostalCode: process.env.SHIP_FROM_POSTAL || '35763',
            CountryCode: 'US',
          },
        },
        ShipTo: {
          Name: shipmentDetails.shipToAddress.name,
          AttentionName: shipmentDetails.shipToAddress.name,
          Phone: {
            Number: shipmentDetails.shipToAddress.phone || '2567238381',
          },
          Address: {
            AddressLine: [shipmentDetails.shipToAddress.street],
            City: shipmentDetails.shipToAddress.city,
            StateProvinceCode: convertStateToAbbreviation(
              shipmentDetails.shipToAddress.state
            ),
            PostalCode: shipmentDetails.shipToAddress.zipCode.replace(
              /\D/g,
              ''
            ),
            CountryCode: getCountryCode(shipmentDetails.shipToAddress.country),
            ResidentialAddressIndicator: shipmentDetails.isResidential ? '' : undefined,
          },
        },
        PaymentInformation: {
          ShipmentCharge:
            shipmentDetails.billingOption === 'receiver'
              ? {
                  Type: '01',
                  BillReceiver: {
                    AccountNumber: shipmentDetails.receiverAccount?.accountNumber,
                    Address: {
                      PostalCode: shipmentDetails.receiverAccount?.zipCode,
                      CountryCode: getCountryCode(shipmentDetails.shipToAddress.country),
                    },
                  },
                }
              : {
                  Type: '01',
                  BillShipper: {
                    AccountNumber: shipperNumber,
                  },
                },
        },
        ShipmentRatingOptions: {
          NegotiatedRatesIndicator: '',
        },
        Service: {
          Code: shipmentDetails.serviceType || '03', // Use selected service or default to UPS Ground
        },
        Package: {
          Description: isConsolidated 
            ? `Consolidated (${shipmentDetails.reference2 || 'Multiple Orders'})`.substring(0, 35)
            : `Order ${shipmentDetails.orderId}`.substring(0, 35),
          Packaging: {
            Code: '02', // Customer Supplied Package
          },
          Dimensions: {
            UnitOfMeasurement: {
              Code: 'IN',
            },
            Length: shipmentDetails.packageDimensions.length.toString(),
            Width: shipmentDetails.packageDimensions.width.toString(),
            Height: shipmentDetails.packageDimensions.height.toString(),
          },
          PackageWeight: {
            UnitOfMeasurement: {
              Code: 'LBS',
            },
            Weight: shipmentDetails.packageWeight.toString(),
          },
          ReferenceNumber: [
            shipmentDetails.reference1 ? { Code: '01', Value: shipmentDetails.reference1 } : undefined,
            shipmentDetails.reference2 ? { Code: '02', Value: shipmentDetails.reference2 } : undefined,
          ].filter(Boolean),
        },
        LabelSpecification: {
          LabelImageFormat: {
            Code: 'GIF',
          },
          LabelStockSize: {
            Height: '6',
            Width: '4',
          },
        },
      },
    },
  };
}

// Add tracking number to an order
router.post('/add-tracking/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    const { trackingNumber, shippingCarrier } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Update order with tracking number
    await db
      .update(allOrders)
      .set({
        trackingNumber: trackingNumber.trim(),
        shippingCarrier: shippingCarrier || 'UPS',
        updatedAt: new Date(),
      })
      .where(eq(allOrders.orderId, orderId));

    console.log(
      `Updated order ${orderId} with tracking number ${trackingNumber}`
    );

    res.json({
      success: true,
      message: 'Tracking number added successfully',
      trackingNumber: trackingNumber.trim(),
      shippingCarrier: shippingCarrier || 'UPS',
    });
  } catch (error) {
    console.error('Error adding tracking number:', error);
    res.status(500).json({ error: 'Failed to add tracking number' });
  }
});

// Consolidated Bulk Shipping - Create ONE label for multiple orders
router.post('/bulk/create-consolidated-label', async (req: Request, res: Response) => {
  try {
    const {
      items, // New: array of {orderId, isRma, rmaId, originalOrderId}
      packageDetails,
      serviceCode,
      billingOption,
      receiverAccount,
      declaredValue,
    } = req.body;

    // Derive orderIds from request body or from items array (safety fallback)
    const orderIds: string[] = req.body.orderIds || items?.map((i: any) => i.orderId) || [];

    // Support both old format (orderIds) and new format (items with RMA info)
    const shipmentItems = items || orderIds?.map((id: string) => ({ orderId: id })) || [];

    if (shipmentItems.length === 0) {
      return res.status(400).json({ error: 'orderIds or items array is required' });
    }

    // Validate service code
    if (!serviceCode || serviceCode.trim() === '') {
      return res.status(400).json({ error: 'Missing or invalid shipping service code. Please select a shipping service.' });
    }

    console.log(`⚡ Creating consolidated label for ${shipmentItems.length} items:`, shipmentItems.map((i: any) => i.orderId).join(', '));

    // Validate UPS credentials
    const upsClientId = process.env.UPS_CLIENT_ID?.trim();
    const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
    const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

    if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
      return res.status(500).json({
        error: 'UPS API credentials not configured.',
      });
    }

    // Fetch all items and resolve their shipping addresses
    // For RMAs: frontend shippingAddress > original order address > NCR repairAddress
    const orders: any[] = [];
    const rmaItems: any[] = []; // Track RMAs to update later
    const addresses: any[] = [];

    // Helper to resolve address for an order
    async function resolveOrderAddress(order: any): Promise<any> {
      if (!order.customerId) return null;
      
      const customerAddresses = await storage.getCustomerAddresses(order.customerId);
      if (order.hasAltShipTo && order.altShipToAddress) {
        const altAddr = order.altShipToAddress as any;
        return {
          name: order.altShipToName || '',
          company: order.altShipToCompany || '',
          street: altAddr?.street || '',
          city: altAddr?.city || '',
          state: altAddr?.state || '',
          zipCode: altAddr?.zip || altAddr?.zipCode || '',
          country: altAddr?.country || 'US',
          phone: altAddr?.phone || '',
        };
      } else if (customerAddresses.length > 0) {
        const customer = await storage.getCustomerById(order.customerId);
        return {
          name: customer?.name || '',
          company: customer?.company || '',
          street: customerAddresses[0].street || '',
          city: customerAddresses[0].city || '',
          state: customerAddresses[0].state || '',
          zipCode: customerAddresses[0].zipCode || '',
          country: customerAddresses[0].country || 'US',
          phone: customer?.phone || '',
        };
      }
      return null;
    }

    for (const item of shipmentItems) {
      if (item.isRma) {
        // Handle RMA shipment
        rmaItems.push(item);
        let resolvedAddress = null;
        
        // Priority 1: Use shippingAddress passed from frontend (enriched from ready-to-ship)
        if (item.shippingAddress && item.shippingAddress.zipCode) {
          resolvedAddress = item.shippingAddress;
        }
        
        // Priority 2: Get from original order if available
        if (!resolvedAddress && item.originalOrderId) {
          let order = await storage.getFinalizedOrderById(item.originalOrderId) as any;
          if (!order) {
            order = await storage.getOrderDraft(item.originalOrderId);
          }
          if (order) {
            resolvedAddress = await resolveOrderAddress(order);
          }
        }
        
        // Priority 3: Fetch NCR directly and use repairAddress
        if (!resolvedAddress && item.rmaId) {
          try {
            const [ncr] = await db
              .select()
              .from(nonconformanceRecords)
              .where(eq(nonconformanceRecords.id, parseInt(item.rmaId)))
              .limit(1);
            
            if (ncr && ncr.repairAddress) {
              const repairAddr = ncr.repairAddress as any;
              resolvedAddress = {
                name: repairAddr.name || ncr.customerName || '',
                company: '',
                street: repairAddr.street || '',
                city: repairAddr.city || '',
                state: repairAddr.state || '',
                zipCode: repairAddr.zip || repairAddr.zipCode || '',
                country: repairAddr.country || 'US',
                phone: repairAddr.phone || '',
              };
            }
          } catch (err) {
            console.error(`Failed to fetch NCR ${item.rmaId} for repair address:`, err);
          }
        }
        
        if (resolvedAddress && resolvedAddress.zipCode) {
          addresses.push(resolvedAddress);
          orders.push({ id: item.rmaId, orderId: item.orderId, isRma: true, rmaId: item.rmaId });
        } else {
          console.error(`No address found for RMA ${item.orderId}`);
        }
      } else {
        // Regular order
        let order = await storage.getFinalizedOrderById(item.orderId) as any;
        if (!order) {
          order = await storage.getOrderDraft(item.orderId);
        }
        if (order) {
          const resolvedAddress = await resolveOrderAddress(order);
          if (resolvedAddress && resolvedAddress.zipCode) {
            addresses.push(resolvedAddress);
            orders.push(order);
          }
        }
      }
    }

    if (orders.length === 0) {
      return res.status(400).json({ error: 'No valid orders found' });
    }

    if (addresses.length === 0) {
      return res.status(400).json({ error: 'No shipping addresses found for orders' });
    }

    // Validate all addresses are the same
    const addressKeys = addresses.map(
      (addr) => `${addr.street}|${addr.city}|${addr.state}|${addr.zipCode}`
    );
    const uniqueAddresses = Array.from(new Set(addressKeys));

    if (uniqueAddresses.length > 1) {
      return res.status(400).json({
        error: 'All orders must have the same shipping address for consolidated shipping',
      });
    }

    if (addresses.length === 0) {
      return res.status(400).json({ error: 'No shipping address found for orders' });
    }

    // Use first order's shipping address
    const shipToAddress = addresses[0];

    // Get OAuth token
    let accessToken;
    try {
      accessToken = await getUPSOAuthToken(upsClientId, upsClientSecret);
    } catch (tokenError: any) {
      return res.status(500).json({
        error: 'Failed to authenticate with UPS',
        details: tokenError.message,
      });
    }

    // Build shipment payload
    const shipFromAddress = {
      name: 'AG Composites',
      company: 'AG Composites',
      contact: 'Shipping',
      street: '230 Hamer Rd.',
      city: 'Owens Crossroads',
      state: 'AL',
      zipCode: '35763',
      country: 'US',
      phone: '256-723-8381',
    };

    const shipmentPayload = buildUPSShipmentPayloadOAuth(
      {
        orderId: orderIds.length ? orderIds.join('+') : 'UNKNOWN', // Safely combine order IDs
        shipToAddress,
        shipFromAddress,
        packageWeight: packageDetails.weight || 5,
        packageDimensions: {
          length: packageDetails.length || 12,
          width: packageDetails.width || 12,
          height: packageDetails.height || 12,
        },
        billingOption: billingOption || 'sender',
        receiverAccount: billingOption === 'receiver' ? receiverAccount : undefined,
        serviceType: serviceCode || '03',
        reference1: orderIds.length
          ? `${orderIds.length} orders: ${orderIds[0]}`.substring(0, 35)
          : 'Consolidated shipment'.substring(0, 35),
        reference2: `Consolidated shipment`.substring(0, 35),
      },
      upsShipperNumber
    );

    // Call UPS Ship API
    console.log('⚡ Calling UPS Ship API for consolidated shipment...');
    const upsEndpoint = 'https://onlinetools.ups.com/api/shipments/v1/ship';
    const shipResponse = await axios.post(upsEndpoint, shipmentPayload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    const shipmentResults = shipResponse.data?.ShipmentResponse?.ShipmentResults;
    const labelBase64 =
      shipmentResults?.PackageResults?.[0]?.ShippingLabel?.GraphicImage ||
      shipmentResults?.PackageResults?.ShippingLabel?.GraphicImage;
    const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;
    // Use negotiated rate if available, otherwise use retail rate
    const negotiatedCost = shipmentResults?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue;
    const retailCost = shipmentResults?.ShipmentCharges?.TotalCharges?.MonetaryValue;
    const shipmentCost = negotiatedCost || retailCost;
    
    console.log(`⚡ Consolidated shipment cost - Negotiated: ${negotiatedCost || 'N/A'}, Retail: ${retailCost || 'N/A'}, Using: ${shipmentCost || 'N/A'}`);

    if (labelBase64 && trackingNumber) {
      console.log(`✅ Consolidated label created with tracking: ${trackingNumber}`);
      console.log(`📦 Updating ${shipmentItems.length} items with tracking number...`);

      // Update ALL orders with the same tracking number
      const updateData = {
        trackingNumber,
        shippingCarrier: 'UPS',
        shippingMethod: getServiceName(serviceCode || '03'),
        shippingCost: shipmentCost ? parseFloat(shipmentCost) : null,
        shippedDate: new Date(),
        shippingLabelGenerated: true,
        labelGeneratedAt: new Date(),
      };

      // Update regular orders
      for (const item of shipmentItems) {
        if (item.isRma) continue; // Skip RMAs, handle separately
        try {
          try {
            await storage.updateFinalizedOrder(item.orderId, updateData);
            console.log(`  ✓ Updated finalized order ${item.orderId}`);
          } catch {
            await storage.updateOrderDraft(item.orderId, updateData);
            console.log(`  ✓ Updated draft order ${item.orderId}`);
          }
        } catch (updateError) {
          console.error(`  ✗ Failed to update order ${item.orderId}:`, updateError);
        }
      }

      // Update RMAs with tracking info
      for (const rma of rmaItems) {
        try {
          await db
            .update(nonconformanceRecords)
            .set({
              trackingNumber,
              shippingCarrier: 'UPS',
              shippedDate: new Date().toISOString().split('T')[0],
              shippingStatus: 'Shipped',
              updatedAt: new Date(),
            })
            .where(eq(nonconformanceRecords.id, parseInt(rma.rmaId)));
          console.log(`  ✓ Updated RMA ${rma.orderId} (NCR #${rma.rmaId})`);
        } catch (updateError) {
          console.error(`  ✗ Failed to update RMA ${rma.rmaId}:`, updateError);
        }
      }

      // Log audit events for all shipped orders in consolidated label
      for (const item of shipmentItems) {
        try {
          await auditService.logEvent({
            entityType: 'p1_order',
            entityId: item.orderId,
            action: 'ORDER_SHIPPED',
            actor: {
              id: (req as any).user?.id,
              username: (req as any).user?.username || 'System',
              role: (req as any).user?.role || 'system',
            },
            reason: `Shipped via consolidated UPS label with ${shipmentItems.length} items`,
            meta: {
              trackingNumber,
              shippingCarrier: 'UPS',
              shippingMethod: getServiceName(serviceCode || '03'),
              consolidated: true,
              consolidatedOrderIds: shipmentItems.map((i: any) => i.orderId),
            },
          });
        } catch (auditError) {
          console.error(`Failed to log shipping audit for ${item.orderId}:`, auditError);
        }
      }

      res.json({
        success: true,
        trackingNumber,
        labelImage: labelBase64,
        orderIds: shipmentItems.map((i: any) => i.orderId),
        message: `Consolidated label created for ${shipmentItems.length} items`,
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'No label or tracking number returned from UPS',
      });
    }
  } catch (error: any) {
    console.error('Error creating consolidated label:', error);
    // Log full UPS error response for debugging
    if (error?.response?.data) {
      console.error('[UPS SHIP ERROR]', JSON.stringify(error.response.data, null, 2));
    }
    res.status(500).json({
      success: false,
      error: error.response?.data?.response?.errors?.[0]?.message || error.message || 'Failed to create consolidated shipping label',
    });
  }
});

// Bulk Shipping - Get rates for multiple orders
router.post('/bulk/rates', async (req: Request, res: Response) => {
  try {
    const { orderIds, packageDefaults } = req.body;

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ error: 'orderIds array is required' });
    }

    // Validate UPS credentials
    const upsClientId = process.env.UPS_CLIENT_ID?.trim();
    const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
    const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

    if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
      return res.status(500).json({
        error: 'UPS API credentials not configured.',
      });
    }

    // Get OAuth Token once for all rate requests
    let accessToken;
    try {
      accessToken = await getUPSOAuthToken(upsClientId, upsClientSecret);
    } catch (tokenError: any) {
      return res.status(500).json({
        error: 'Failed to authenticate with UPS',
        details: tokenError.message,
      });
    }

    // Fetch all orders with their shipping addresses
    const ordersWithRates = [];

    for (const orderId of orderIds) {
      try {
        // Get order data
        let order = await storage.getFinalizedOrderById(orderId) as any;
        if (!order) {
          order = await storage.getOrderDraft(orderId);
        }

        if (!order) {
          ordersWithRates.push({
            orderId,
            error: 'Order not found',
            rates: [],
          });
          continue;
        }

        // Get shipping address
        let shippingAddress: any = null;
        if (order.customerId) {
          const addresses = await storage.getCustomerAddresses(order.customerId);
          if (order.hasAltShipTo && order.altShipToAddress) {
            const altAddr = order.altShipToAddress as any;
            shippingAddress = {
              street: altAddr?.street || '',
              city: altAddr?.city || '',
              state: altAddr?.state || '',
              zipCode: altAddr?.zip || altAddr?.zipCode || '',
              country: altAddr?.country || 'US',
            };
          } else if (addresses.length > 0) {
            shippingAddress = {
              street: addresses[0].street || '',
              city: addresses[0].city || '',
              state: addresses[0].state || '',
              zipCode: addresses[0].zipCode || '',
              country: addresses[0].country || 'US',
            };
          }
        }

        if (!shippingAddress || !shippingAddress.zipCode) {
          ordersWithRates.push({
            orderId,
            error: 'No shipping address found',
            rates: [],
          });
          continue;
        }

        // Build UPS rate request payload
        const shipFromAddress = {
          street: '230 Hamer Rd.',
          city: 'Owens Crossroads',
          state: 'AL',
          zipCode: '35763',
          country: 'US',
        };

        const ratePayload = {
          RateRequest: {
            Request: {
              TransactionReference: {
                CustomerContext: `Bulk Rate ${orderId}`,
              },
            },
            Shipment: {
              Shipper: {
                ShipperNumber: upsShipperNumber,
                Address: {
                  AddressLine: [shipFromAddress.street].filter(Boolean),
                  City: shipFromAddress.city,
                  StateProvinceCode: convertStateToAbbreviation(shipFromAddress.state),
                  PostalCode: shipFromAddress.zipCode.replace(/\D/g, ''),
                  CountryCode: shipFromAddress.country,
                },
              },
              ShipTo: {
                Address: {
                  AddressLine: [shippingAddress.street].filter(Boolean),
                  City: shippingAddress.city,
                  StateProvinceCode: convertStateToAbbreviation(shippingAddress.state),
                  PostalCode: (shippingAddress.zipCode || '').replace(/\D/g, ''),
                  CountryCode: shippingAddress.country,
                },
              },
              ShipFrom: {
                Address: {
                  AddressLine: [shipFromAddress.street].filter(Boolean),
                  City: shipFromAddress.city,
                  StateProvinceCode: convertStateToAbbreviation(shipFromAddress.state),
                  PostalCode: shipFromAddress.zipCode.replace(/\D/g, ''),
                  CountryCode: shipFromAddress.country,
                },
              },
              Package: {
                PackagingType: {
                  Code: '02',
                },
                Dimensions: {
                  UnitOfMeasurement: {
                    Code: 'IN',
                  },
                  Length: String(packageDefaults.length || 12),
                  Width: String(packageDefaults.width || 12),
                  Height: String(packageDefaults.height || 12),
                },
                PackageWeight: {
                  UnitOfMeasurement: {
                    Code: 'LBS',
                  },
                  Weight: String(packageDefaults.weight || 5),
                },
              },
            },
          },
        };

        // Call UPS Rate API
        const rateEndpoint = 'https://onlinetools.ups.com/api/rating/v1/Rate';
        const rateResponse = await axios.post(rateEndpoint, ratePayload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
        });

        // Parse rates from response
        const ratedShipments = rateResponse.data?.RateResponse?.RatedShipment || [];
        const rates = ratedShipments.map((shipment: any) => ({
          serviceCode: shipment.Service?.Code || '',
          serviceName: getServiceName(shipment.Service?.Code || ''),
          totalCharges: parseFloat(shipment.TotalCharges?.MonetaryValue || '0'),
          currency: shipment.TotalCharges?.CurrencyCode || 'USD',
          guaranteedDaysToDelivery: shipment.GuaranteedDelivery?.BusinessDaysInTransit || null,
        }));

        ordersWithRates.push({
          orderId,
          customer: order.customerId,
          shippingAddress,
          rates,
        });
      } catch (orderError: any) {
        console.error(`Error fetching rates for order ${orderId}:`, orderError);
        ordersWithRates.push({
          orderId,
          error: orderError.response?.data?.response?.errors?.[0]?.message || orderError.message || 'Failed to fetch rates',
          rates: [],
        });
      }
    }

    res.json({ orders: ordersWithRates });
  } catch (error) {
    console.error('Error in bulk rates:', error);
    res.status(500).json({ error: 'Failed to fetch bulk rates' });
  }
});

// Bulk Shipping - Create labels for multiple orders
router.post('/bulk/create-labels', async (req: Request, res: Response) => {
  try {
    const { shipments, packageDefaults } = req.body;

    if (!shipments || !Array.isArray(shipments) || shipments.length === 0) {
      return res.status(400).json({ error: 'shipments array is required' });
    }

    const results = [];

    for (const shipment of shipments) {
      try {
        const { orderId, serviceCode, billingOption, receiverAccount, declaredValue, isRma, rmaId, originalOrderId } = shipment;

        // Handle RMA shipments differently
        if (isRma && rmaId) {
          // RMA shipment - get address from original order or NCR repair address
          let order = await storage.getFinalizedOrderById(originalOrderId) as any;
          if (!order) {
            order = await storage.getOrderDraft(originalOrderId);
          }

          if (!order) {
            results.push({
              orderId,
              success: false,
              error: 'Original order not found for RMA',
              isRma: true,
              rmaId,
            });
            continue;
          }

          // Get shipping address for RMA (same logic as regular orders)
          let shippingAddress: any = null;
          let customer: any = null;
          if (order.customerId) {
            customer = await storage.getCustomer(parseInt(order.customerId));
            const addresses = await storage.getCustomerAddresses(order.customerId);
            
            if (order.hasAltShipTo && order.altShipToAddress) {
              const altAddr = order.altShipToAddress as any;
              shippingAddress = {
                name: order.altShipToName || customer?.name || '',
                company: order.altShipToCompany || '',
                street: altAddr?.street || '',
                city: altAddr?.city || '',
                state: altAddr?.state || '',
                zipCode: altAddr?.zip || altAddr?.zipCode || '',
                country: altAddr?.country || 'US',
              };
            } else if (addresses.length > 0) {
              shippingAddress = {
                name: customer?.name || '',
                company: customer?.company || '',
                street: addresses[0].street || '',
                city: addresses[0].city || '',
                state: addresses[0].state || '',
                zipCode: addresses[0].zipCode || '',
                country: addresses[0].country || 'US',
              };
            }
          }

          if (!shippingAddress || !shippingAddress.zipCode) {
            results.push({
              orderId,
              success: false,
              error: 'No shipping address found for RMA',
              isRma: true,
              rmaId,
            });
            continue;
          }

          // Get UPS credentials and create label (same as regular orders)
          const upsClientId = process.env.UPS_CLIENT_ID?.trim();
          const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
          const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

          if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
            results.push({
              orderId,
              success: false,
              error: 'UPS credentials not configured',
              isRma: true,
              rmaId,
            });
            continue;
          }

          let accessToken;
          try {
            accessToken = await getUPSOAuthToken(upsClientId, upsClientSecret);
          } catch (tokenError: any) {
            results.push({
              orderId,
              success: false,
              error: 'Failed to authenticate with UPS',
              isRma: true,
              rmaId,
            });
            continue;
          }

          const shipFromAddress = {
            name: 'AG Composites',
            company: 'AG Composites',
            contact: 'Shipping',
            street: '230 Hamer Rd.',
            city: 'Owens Crossroads',
            state: 'AL',
            zipCode: '35763',
            country: 'US',
            phone: '256-723-8381',
          };

          const shipmentPayload = buildUPSShipmentPayloadOAuth(
            {
              orderId,
              shipToAddress: shippingAddress,
              shipFromAddress,
              packageWeight: packageDefaults.weight || 5,
              packageDimensions: {
                length: packageDefaults.length || 12,
                width: packageDefaults.width || 12,
                height: packageDefaults.height || 12,
              },
              billingOption: billingOption || 'sender',
              receiverAccount: billingOption === 'receiver' ? receiverAccount : undefined,
              serviceType: serviceCode || '03',
            },
            upsShipperNumber
          );

          const upsEndpoint = 'https://onlinetools.ups.com/api/shipments/v1/ship';
          const shipResponse = await axios.post(upsEndpoint, shipmentPayload, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 30000,
          });

          const shipmentResults = shipResponse.data?.ShipmentResponse?.ShipmentResults;
          const labelBase64 = shipmentResults?.PackageResults?.[0]?.ShippingLabel?.GraphicImage;
          const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;

          if (labelBase64 && trackingNumber) {
            // Update NCR with tracking number (instead of order)
            try {
              await db
                .update(nonconformanceRecords)
                .set({
                  trackingNumber,
                  shippingCarrier: 'UPS',
                  shippedDate: new Date().toISOString().split('T')[0],
                  shippingStatus: 'Shipped',
                  updatedAt: new Date(),
                })
                .where(eq(nonconformanceRecords.id, parseInt(rmaId)));
              
              console.log(`✅ Updated RMA ${orderId} with tracking ${trackingNumber}`);
            } catch (updateError) {
              console.error(`Failed to update RMA ${rmaId}:`, updateError);
            }

            results.push({
              orderId,
              success: true,
              labelBase64,
              trackingNumber,
              isRma: true,
              rmaId,
            });
          } else {
            results.push({
              orderId,
              success: false,
              error: 'No label or tracking returned',
              isRma: true,
              rmaId,
            });
          }
          continue; // Skip regular order processing
        }

        // Regular order processing (existing code)
        // Get order data
        let order = await storage.getFinalizedOrderById(orderId) as any;
        if (!order) {
          order = await storage.getOrderDraft(orderId);
        }

        if (!order) {
          results.push({
            orderId,
            success: false,
            error: 'Order not found',
          });
          continue;
        }

        // Validate receiver billing if required
        if (billingOption === 'receiver') {
          if (!receiverAccount || !receiverAccount.accountNumber || !receiverAccount.zipCode) {
            results.push({
              orderId,
              success: false,
              error: 'Receiver account number and ZIP code are required for bill-to-receiver',
            });
            continue;
          }
        }

        // Get shipping address
        let shippingAddress: any = null;
        let customer: any = null;
        if (order.customerId) {
          customer = await storage.getCustomer(parseInt(order.customerId));
          const addresses = await storage.getCustomerAddresses(order.customerId);
          
          if (order.hasAltShipTo && order.altShipToAddress) {
            const altAddr = order.altShipToAddress as any;
            shippingAddress = {
              name: order.altShipToName || customer?.name || '',
              company: order.altShipToCompany || '',
              street: altAddr?.street || '',
              city: altAddr?.city || '',
              state: altAddr?.state || '',
              zipCode: altAddr?.zip || altAddr?.zipCode || '',
              country: altAddr?.country || 'US',
            };
          } else if (addresses.length > 0) {
            shippingAddress = {
              name: customer?.name || '',
              company: customer?.company || '',
              street: addresses[0].street || '',
              city: addresses[0].city || '',
              state: addresses[0].state || '',
              zipCode: addresses[0].zipCode || '',
              country: addresses[0].country || 'US',
            };
          }
        }

        if (!shippingAddress || !shippingAddress.zipCode) {
          results.push({
            orderId,
            success: false,
            error: 'No shipping address found',
          });
          continue;
        }

        // Get UPS credentials
        const upsClientId = process.env.UPS_CLIENT_ID?.trim();
        const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
        const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();

        if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
          results.push({
            orderId,
            success: false,
            error: 'UPS credentials not configured',
          });
          continue;
        }

        // Get OAuth token
        let accessToken;
        try {
          accessToken = await getUPSOAuthToken(upsClientId, upsClientSecret);
        } catch (tokenError: any) {
          results.push({
            orderId,
            success: false,
            error: 'Failed to authenticate with UPS',
          });
          continue;
        }

        // Build shipment payload
        const shipFromAddress = {
          name: 'AG Composites',
          company: 'AG Composites',
          contact: 'Shipping',
          street: '230 Hamer Rd.',
          city: 'Owens Crossroads',
          state: 'AL',
          zipCode: '35763',
          country: 'US',
          phone: '256-723-8381',
        };

        const shipmentPayload = buildUPSShipmentPayloadOAuth(
          {
            orderId,
            shipToAddress: shippingAddress,
            shipFromAddress,
            packageWeight: packageDefaults.weight || 5,
            packageDimensions: {
              length: packageDefaults.length || 12,
              width: packageDefaults.width || 12,
              height: packageDefaults.height || 12,
            },
            billingOption: billingOption || 'sender',
            receiverAccount: billingOption === 'receiver' ? receiverAccount : undefined,
            serviceType: serviceCode || '03',
          },
          upsShipperNumber
        );

        // Call UPS Ship API
        const upsEndpoint = 'https://onlinetools.ups.com/api/shipments/v1/ship';
        const shipResponse = await axios.post(upsEndpoint, shipmentPayload, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000,
        });

        const shipmentResults = shipResponse.data?.ShipmentResponse?.ShipmentResults;
        const labelBase64 = shipmentResults?.PackageResults?.[0]?.ShippingLabel?.GraphicImage;
        const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;

        if (labelBase64 && trackingNumber) {
          // Update order with tracking number
          try {
            const updateData = {
              trackingNumber,
              shippingCarrier: 'UPS',
              shippingMethod: getServiceName(serviceCode || '03'),
              shippedDate: new Date(),
              shippingLabelGenerated: true,
            };
            
            try {
              await storage.updateFinalizedOrder(orderId, updateData);
            } catch {
              await storage.updateOrderDraft(orderId, updateData);
            }
          } catch (updateError) {
            console.error(`Failed to update order ${orderId}:`, updateError);
          }

          results.push({
            orderId,
            success: true,
            trackingNumber,
            labelImage: labelBase64,
          });
        } else {
          results.push({
            orderId,
            success: false,
            error: 'No label or tracking number returned from UPS',
          });
        }
      } catch (shipmentError: any) {
        console.error(`Error creating label for order ${shipment.orderId}:`, shipmentError);
        results.push({
          orderId: shipment.orderId,
          success: false,
          error: shipmentError.response?.data?.error || shipmentError.message || 'Failed to create label',
        });
      }
    }

    // Count successes and failures
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      summary: {
        total: results.length,
        successful,
        failed,
      },
      results,
    });
  } catch (error) {
    console.error('Error in bulk label creation:', error);
    res.status(500).json({ error: 'Failed to create bulk labels' });
  }
});

// Send shipping notification to customer
router.post('/notify-customer/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    // Get order data from allOrders table
    const order = await storage.getOrderById(orderId) as any;

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.trackingNumber) {
      return res.status(400).json({ error: 'Order does not have a tracking number' });
    }

    // Get customer data
    if (!order.customerId) {
      return res.status(400).json({ error: 'Order does not have a customer' });
    }

    const customer = await storage.getCustomerById(order.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    if (!customer.email && !customer.phone) {
      return res.status(400).json({ 
        error: 'Customer has no email or phone number for notifications' 
      });
    }

    // ===========================================
    // 🔥 MANUAL RESEND - BYPASSES DEDUPLICATION
    // ===========================================
    const { sendCustomerNotification } = await import('../../utils/notifications');
    
    // Use customer's actual preferred communication method, or default to email if not set
    const customerPreference = (customer.preferredCommunicationMethod as string[]) || [];
    const preferredMethods: string[] = customerPreference.length > 0 
      ? customerPreference 
      : (customer.email ? ['email'] : (customer.phone ? ['sms'] : []));
    
    console.log('[NOTIFY-CUSTOMER] Customer preference:', customerPreference, '→ Using:', preferredMethods);
    
    const notificationResult = await sendCustomerNotification({
      orderId: order.orderId,
      trackingNumber: order.trackingNumber,
      carrier: order.shippingCarrier || 'UPS',
      estimatedDelivery: order.estimatedDelivery ? new Date(order.estimatedDelivery) : undefined,
      preferredMethods,
      forceResend: true, // Manual resend bypasses deduplication
    });
    
    console.log('[NOTIFY-CUSTOMER] Result:', JSON.stringify(notificationResult));

    // If at least one notification method succeeded → return success
    const succeededMethods = notificationResult.methods || [];
    
    if (succeededMethods.length > 0) {
      console.log('[API RESPONSE] Notification successful via:', succeededMethods);
      
      return res.status(200).json({
        success: true,
        methods: succeededMethods,
        message: `Notification sent via: ${succeededMethods.join(', ')}`,
      });
    }

    // Otherwise fail (email+sms both failed)
    console.log('[API RESPONSE] All notification methods failed:', notificationResult.errors);
    return res.status(500).json({
      success: false,
      error: 'No valid notification method could be delivered',
      details: notificationResult.errors,
    });

  } catch (err: any) {
    console.error('[API ERROR] Notification failed:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Notification failed',
    });
  }
});

router.get('/weekly-history', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const currentOpWeek = getOperationalWeek(now);
    const currentOpYear = getOperationalYear(now);

    const weeks: Array<{
      operationalWeek: number;
      operationalYear: number;
      weekLabel: string;
      dateRange: string;
      shipped: number;
    }> = [];

    let opWeek = currentOpWeek;
    let opYear = currentOpYear;
    const weekSlots: Array<{ week: number; year: number; start: Date; end: Date }> = [];

    for (let i = 0; i < 12; i++) {
      weekSlots.unshift({ week: opWeek, year: opYear, start: getOperationalWeekStart(opWeek, opYear), end: getOperationalWeekEnd(opWeek, opYear) });
      opWeek--;
      if (opWeek < 1) {
        opYear--;
        const lastDayPrevYear = getOperationalWeekStart(1, opYear + 1);
        lastDayPrevYear.setDate(lastDayPrevYear.getDate() - 1);
        opWeek = getOperationalWeek(lastDayPrevYear);
      }
    }

    const earliestStart = weekSlots[0].start;
    const latestEnd = weekSlots[weekSlots.length - 1].end;

    const shippedOrders = await db
      .select({
        shippedDate: allOrders.shippedDate,
      })
      .from(allOrders)
      .where(
        and(
          gte(allOrders.shippedDate, earliestStart),
          lte(allOrders.shippedDate, latestEnd)
        )
      );

    for (const slot of weekSlots) {
      const count = shippedOrders.filter((o) => {
        if (!o.shippedDate) return false;
        const d = new Date(o.shippedDate);
        return d >= slot.start && d <= slot.end;
      }).length;

      weeks.push({
        operationalWeek: slot.week,
        operationalYear: slot.year,
        weekLabel: `W${slot.week}`,
        dateRange: `${format(slot.start, 'MMM d')} - ${format(slot.end, 'MMM d')}`,
        shipped: count,
      });
    }

    res.json({ weeks });
  } catch (error) {
    console.error('Error getting weekly shipping history:', error);
    res.status(500).json({ error: 'Failed to get weekly shipping history' });
  }
});

router.get('/stock-model-bubbles', async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const weeksBack = 12;
    const currentOpWeek = getOperationalWeek(now);
    const currentOpYear = getOperationalYear(now);

    let opWeek = currentOpWeek;
    let opYear = currentOpYear;
    for (let i = 0; i < weeksBack; i++) {
      opWeek--;
      if (opWeek < 1) {
        opYear--;
        const lastDayPrevYear = getOperationalWeekStart(1, opYear + 1);
        lastDayPrevYear.setDate(lastDayPrevYear.getDate() - 1);
        opWeek = getOperationalWeek(lastDayPrevYear);
      }
    }
    const earliestStart = getOperationalWeekStart(opWeek, opYear);

    const shippedRows = await db
      .select({
        modelId: allOrders.modelId,
        paymentAmount: allOrders.paymentAmount,
        shippedDate: allOrders.shippedDate,
      })
      .from(allOrders)
      .where(
        and(
          gte(allOrders.shippedDate, earliestStart),
          lte(allOrders.shippedDate, now),
          sql`${allOrders.modelId} IS NOT NULL`,
          sql`${allOrders.modelId} != ''`
        )
      );

    const stockModelRows = await db
      .select({ id: stockModels.id, displayName: stockModels.displayName, price: stockModels.price })
      .from(stockModels);

    const stockModelLookup = new Map(stockModelRows.map(m => [m.id, m]));

    const modelMap = new Map<string, { count: number; totalRevenue: number }>();
    for (const row of shippedRows) {
      const mid = row.modelId!;
      const entry = modelMap.get(mid) || { count: 0, totalRevenue: 0 };
      entry.count++;
      const basePrice = stockModelLookup.get(mid)?.price || 0;
      const effectiveRevenue = (row.paymentAmount && row.paymentAmount > 0) ? row.paymentAmount : basePrice;
      entry.totalRevenue += effectiveRevenue;
      modelMap.set(mid, entry);
    }

    const bubbles = Array.from(modelMap.entries())
      .map(([modelId, stats]) => {
        const sm = stockModelLookup.get(modelId);
        const name = sm?.displayName || modelId;
        const weeklyShipments = parseFloat((stats.count / weeksBack).toFixed(1));
        const totalRevenue = Math.round(stats.totalRevenue);
        const avgPrice = stats.count > 0 ? Math.round(stats.totalRevenue / stats.count) : 0;
        return { name, modelId, weeklyShipments, avgPrice, totalRevenue };
      })
      .filter(b => b.weeklyShipments > 0)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 15);

    res.json({ bubbles, weeksAnalyzed: weeksBack });
  } catch (error) {
    console.error('Error getting stock model bubble data:', error);
    res.status(500).json({ error: 'Failed to get stock model bubble data' });
  }
});

export default router;
