
import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { db } from '../../db';
import { eq, inArray } from 'drizzle-orm';
import { allOrders, orderDrafts } from '../../schema';
import axios from 'axios';

const router = Router();

// Get order by ID with customer and address data for shipping
router.get('/order/:orderId', async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;
    
    // Try finalized orders first
    let order = await storage.getFinalizedOrderById(orderId);
    
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
    
    if (order.customerId) {
      try {
        customer = await storage.getCustomer(order.customerId);
        addresses = await storage.getCustomerAddresses(order.customerId);
      } catch (customerError) {
        console.warn('Could not fetch customer data:', customerError);
      }
    }
    
    res.json({
      ...order,
      customer,
      addresses
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
      return res.status(400).json({ error: 'orderIds query parameter is required' });
    }
    
    const ids = orderIds.split(',').map(id => id.trim());
    
    // Get from both finalized and draft orders
    const finalizedOrders = await db.select()
      .from(allOrders)
      .where(inArray(allOrders.orderId, ids));
    
    const draftOrders = await db.select()
      .from(orderDrafts)
      .where(inArray(orderDrafts.orderId, ids));
    
    // Combine and deduplicate (prioritize finalized over draft)
    const orderMap = new Map();
    
    // Add draft orders first
    draftOrders.forEach(order => {
      orderMap.set(order.orderId, { ...order, isFinalized: false });
    });
    
    // Add finalized orders (will overwrite drafts if same ID)
    finalizedOrders.forEach(order => {
      orderMap.set(order.orderId, { ...order, isFinalized: true });
    });
    
    const orders = Array.from(orderMap.values());
    
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
    const shippingOrders = allOrders.filter((order: any) => 
      order.currentDepartment === 'Shipping' ||
      order.status === 'Ready for Shipping' ||
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
      notificationMethod = 'email'
    } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    // Update order with shipping information
    const updateData = {
      currentDepartment: 'Shipped',
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
        const { sendCustomerNotification } = await import('../../utils/notifications');
        await sendCustomerNotification({
          orderId,
          trackingNumber,
          carrier: shippingCarrier,
          estimatedDelivery: estimatedDelivery ? new Date(estimatedDelivery) : undefined
        });
      } catch (notificationError) {
        console.error('Failed to send customer notification:', notificationError);
        // Don't fail the entire request if notification fails
      }
    }

    res.json({ 
      success: true, 
      message: 'Order marked as shipped',
      order: updatedOrder 
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
      notificationMethod 
    } = req.body;

    const updateData: any = {};
    
    if (trackingNumber !== undefined) updateData.trackingNumber = trackingNumber;
    if (shippingCarrier !== undefined) updateData.shippingCarrier = shippingCarrier;
    if (shippingMethod !== undefined) updateData.shippingMethod = shippingMethod;
    if (estimatedDelivery !== undefined) updateData.estimatedDelivery = estimatedDelivery ? new Date(estimatedDelivery) : null;
    if (deliveryConfirmed !== undefined) {
      updateData.deliveryConfirmed = deliveryConfirmed;
      if (deliveryConfirmed) {
        updateData.deliveryConfirmedAt = new Date();
      }
    }
    if (customerNotified !== undefined) updateData.customerNotified = customerNotified;
    if (notificationMethod !== undefined) updateData.notificationMethod = notificationMethod;

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
      order: updatedOrder 
    });

  } catch (error) {
    console.error('Error updating tracking information:', error);
    res.status(500).json({ error: 'Failed to update tracking information' });
  }
});

// Get shipping statistics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const orders = await storage.getAllFinalizedOrders();
    
    const stats = {
      readyForShipping: orders.filter((o: any) => 
        (o.currentDepartment === 'Shipping QC' || o.currentDepartment === 'Shipping') && !o.shippedDate
      ).length,
      shipped: orders.filter((o: any) => o.shippedDate).length,
      delivered: orders.filter((o: any) => o.deliveryConfirmed).length,
      pending: orders.filter((o: any) => o.shippedDate && !o.deliveryConfirmed).length
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
    receiverAccount
  } = details;

  return {
    UPSSecurity: {
      UsernameToken: {
        Username: process.env.UPS_USERNAME,
        Password: process.env.UPS_PASSWORD,
      },
      ServiceAccessToken: {
        AccessLicenseNumber: process.env.UPS_ACCESS_KEY,
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
          ShipperNumber: process.env.UPS_SHIPPER_NUMBER,
          Address: {
            AddressLine: [shipFromAddress.street, shipFromAddress.street2].filter(Boolean),
            City: shipFromAddress.city,
            StateProvinceCode: shipFromAddress.state,
            PostalCode: shipFromAddress.zipCode,
            CountryCode: shipFromAddress.country || 'US',
          },
        },
        ShipTo: {
          Name: shipToAddress.name,
          AttentionName: shipToAddress.contact || shipToAddress.name,
          CompanyDisplayableName: shipToAddress.company || '',
          Phone: {
            Number: shipToAddress.phone || '',
          },
          Address: {
            AddressLine: [shipToAddress.street, shipToAddress.street2].filter(Boolean),
            City: shipToAddress.city,
            StateProvinceCode: shipToAddress.state,
            PostalCode: shipToAddress.zipCode,
            CountryCode: shipToAddress.country || 'US',
            ResidentialAddressIndicator: shipToAddress.isResidential ? '' : undefined,
          },
        },
        PaymentInformation: {
          ShipmentCharge: billingOption === 'receiver' ? {
            Type: '01', // Transportation
            BillReceiver: {
              AccountNumber: receiverAccount?.accountNumber,
              Address: {
                PostalCode: receiverAccount?.zipCode,
              },
            },
          } : {
            Type: '01', // Transportation
            BillShipper: {
              AccountNumber: process.env.UPS_SHIPPER_NUMBER,
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
          Dimensions: packageDimensions ? {
            UnitOfMeasurement: {
              Code: 'IN',
            },
            Length: packageDimensions.length.toString(),
            Width: packageDimensions.width.toString(),
            Height: packageDimensions.height.toString(),
          } : undefined,
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
        ShipmentServiceOptions: {
          Notification: {
            NotificationCode: '6', // Ship Notification
            EMail: {
              EMailAddress: shipToAddress.email,
              UndeliverableEMailAddress: shipFromAddress.email || 'shipping@agcomposites.com',
            },
          },
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
    const { orderId, shipTo, packageDetails, billingOption, receiverAccount } = req.body;
    
    console.log('Creating UPS label with billing option:', billingOption);
    
    // Build shipment details from request body
    const shipmentDetails = {
      orderId,
      shipToAddress: {
        name: shipTo.name,
        street: shipTo.street,
        city: shipTo.city,
        state: shipTo.state,
        zipCode: shipTo.zip,
        country: shipTo.country || 'US',
        phone: shipTo.phone || '',
      },
      shipFromAddress: {
        name: 'AG Composites',
        company: 'AG Composites',
        contact: 'Shipping Department',
        street: '123 Manufacturing Way', // Replace with actual address
        city: 'Your City',
        state: 'TX',
        zipCode: '12345',
        country: 'US',
        phone: '5555551234',
      },
      packageWeight: packageDetails.weight,
      packageDimensions: packageDetails.dimensions,
      billingOption,
      receiverAccount,
    };

    // Validate required UPS credentials
    if (!process.env.UPS_USERNAME || !process.env.UPS_PASSWORD || !process.env.UPS_ACCESS_KEY || !process.env.UPS_SHIPPER_NUMBER) {
      return res.status(500).json({ 
        error: 'UPS API credentials not configured. Please set UPS_USERNAME, UPS_PASSWORD, UPS_ACCESS_KEY, and UPS_SHIPPER_NUMBER environment variables.' 
      });
    }

    // Get order details for reference
    let order;
    try {
      order = await storage.getFinalizedOrderById(orderId);
      if (!order) {
        order = await storage.getOrderDraft(orderId);
      }
    } catch (error) {
      console.log('Could not fetch order details:', error);
    }

    const payload = buildUPSShipmentPayload(shipmentDetails);

    // Determine UPS API endpoint based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const upsEndpoint = isProduction 
      ? 'https://onlinetools.ups.com/rest/Ship'
      : 'https://wwwcie.ups.com/rest/Ship';

    console.log('Creating UPS shipping label for order:', orderId);
    console.log('Using UPS endpoint:', upsEndpoint);

    // UPS API endpoint for shipment creation and label generation
    const response = await axios.post(upsEndpoint, payload, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000, // 30 second timeout
    });

    // UPS returns the label as a Base64 string
    const labelBase64 = response.data?.ShipmentResponse?.ShipmentResults?.PackageResults?.ShippingLabel?.GraphicImage;
    const trackingNumber = response.data?.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber;
    const shipmentCost = response.data?.ShipmentResponse?.ShipmentResults?.ShipmentCharges?.TotalCharges?.MonetaryValue;

    if (labelBase64 && trackingNumber) {
      // Update order with tracking information
      if (order) {
        try {
          const updateData = {
            trackingNumber,
            shippingCarrier: 'UPS',
            shippingMethod: getServiceName(shipmentDetails.serviceType || '03'),
            shippingCost: shipmentCost ? parseFloat(shipmentCost) : null,
            labelGenerated: true,
            labelGeneratedAt: new Date(),
          };

          // Try updating finalized order first, fall back to draft
          try {
            await storage.updateFinalizedOrder(orderId, updateData);
          } catch (error) {
            await storage.updateOrderDraft(orderId, updateData);
          }
        } catch (updateError) {
          console.error('Failed to update order with tracking info:', updateError);
          // Don't fail the entire request
        }
      }

      res.json({
        success: true,
        labelBase64,
        trackingNumber,
        shipmentCost: shipmentCost ? parseFloat(shipmentCost) : null,
        orderId,
        message: 'Shipping label created successfully'
      });
    } else {
      console.error('UPS API response missing required fields:', response.data);
      res.status(500).json({ 
        error: 'No label or tracking number returned from UPS.',
        details: response.data 
      });
    }
  } catch (error: any) {
    console.error('UPS API error:', error.response?.data || error.message);
    
    if (error.response?.data) {
      res.status(500).json({ 
        error: 'UPS API error', 
        details: error.response.data,
        message: error.response.data.Fault?.detail?.Errors?.ErrorDetail?.PrimaryErrorCode?.Description || error.message
      });
    } else {
      res.status(500).json({ 
        error: error.message || 'UPS API error.',
        message: 'Failed to create shipping label'
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
    const { shipToAddress, shipFromAddress, packageWeight, packageDimensions } = req.body;

    if (!process.env.UPS_USERNAME || !process.env.UPS_PASSWORD || !process.env.UPS_ACCESS_KEY) {
      return res.status(500).json({ 
        error: 'UPS API credentials not configured.' 
      });
    }

    const ratePayload = {
      UPSSecurity: {
        UsernameToken: {
          Username: process.env.UPS_USERNAME,
          Password: process.env.UPS_PASSWORD,
        },
        ServiceAccessToken: {
          AccessLicenseNumber: process.env.UPS_ACCESS_KEY,
        },
      },
      RateRequest: {
        Request: {
          RequestOption: 'Rate',
        },
        Shipment: {
          Shipper: {
            Address: {
              AddressLine: [shipFromAddress.street],
              City: shipFromAddress.city,
              StateProvinceCode: shipFromAddress.state,
              PostalCode: shipFromAddress.zipCode,
              CountryCode: shipFromAddress.country || 'US',
            },
          },
          ShipTo: {
            Address: {
              AddressLine: [shipToAddress.street],
              City: shipToAddress.city,
              StateProvinceCode: shipToAddress.state,
              PostalCode: shipToAddress.zipCode,
              CountryCode: shipToAddress.country || 'US',
            },
          },
          Package: {
            PackagingType: {
              Code: '02', // Customer Package
            },
            Dimensions: packageDimensions ? {
              UnitOfMeasurement: {
                Code: 'IN',
              },
              Length: packageDimensions.length.toString(),
              Width: packageDimensions.width.toString(),
              Height: packageDimensions.height.toString(),
            } : undefined,
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS',
              },
              Weight: packageWeight?.toString() || '1',
            },
          },
        },
      },
    };

    const isProduction = process.env.NODE_ENV === 'production';
    const upsEndpoint = isProduction 
      ? 'https://onlinetools.ups.com/rest/Rate'
      : 'https://wwwcie.ups.com/rest/Rate';

    const response = await axios.post(upsEndpoint, ratePayload, {
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      timeout: 30000,
    });

    const ratedShipments = response.data?.RateResponse?.RatedShipment;
    if (ratedShipments) {
      const rates = Array.isArray(ratedShipments) ? ratedShipments : [ratedShipments];
      const formattedRates = rates.map((rate: any) => ({
        serviceCode: rate.Service?.Code,
        serviceName: getServiceName(rate.Service?.Code),
        totalCharges: parseFloat(rate.TotalCharges?.MonetaryValue || '0'),
        currency: rate.TotalCharges?.CurrencyCode || 'USD',
        guaranteedDaysToDelivery: rate.GuaranteedDaysToDelivery,
        scheduleDeliveryDate: rate.ScheduledDeliveryDate,
      }));

      res.json({
        success: true,
        rates: formattedRates
      });
    } else {
      res.status(500).json({ 
        error: 'No rates returned from UPS',
        details: response.data 
      });
    }
  } catch (error: any) {
    console.error('UPS Rate API error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to get shipping rates',
      details: error.response?.data || error.message
    });
  }
});

// Test UPS shipment creation endpoint
router.post('/test-ups-shipment', async (req: Request, res: Response) => {
  try {
    const { createShipment } = await import('../utils/upsShipping');
    
    const testShipment = {
      shipTo: {
        name: "Test Customer",
        address1: "123 Test Street",
        city: "Austin", 
        state: "TX",
        postalCode: "78701"
      },
      serviceCode: "03", // UPS Ground
      weightLbs: 5,
      referenceNumber: "TEST-SHIPMENT"
    };

    console.log('🚚 Testing UPS shipment creation...');
    const result = await createShipment(testShipment);
    console.log('✅ UPS shipment creation successful');
    
    res.json({
      success: true,
      message: 'UPS shipment creation successful',
      trackingNumber: result.trackingNumber,
      labelData: result.labelData ? 'Generated' : 'None'
    });
  } catch (error) {
    console.error('❌ UPS shipment creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'UPS shipment creation failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
