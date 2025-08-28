
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
    let shippingAddress: any = null;
    
    if (order.customerId) {
      try {
        customer = await storage.getCustomer(parseInt(order.customerId));
        addresses = await storage.getCustomerAddresses(parseInt(order.customerId));
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
        country: altAddr?.country || 'United States'
      };
    }
    // Priority 2: Check if using existing customer as alternate shipping
    else if (order.hasAltShipTo && order.altShipToCustomerId && addresses.length > 0) {
      try {
        const altCustomerId = parseInt(order.altShipToCustomerId);
        const altCustomer = await storage.getCustomer(altCustomerId);
        const altAddresses = await storage.getCustomerAddresses(altCustomerId);
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
            country: altAddresses[0].country || 'United States'
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
        country: addresses[0].country || 'United States'
      };
    }
    
    res.json({
      ...order,
      customer,
      addresses,
      shippingAddress
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
      order.currentDepartment === 'Shipping Management' ||
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
            AddressLine: [shipFromAddress.street, shipFromAddress.street2].filter(Boolean),
            City: shipFromAddress.city,
            StateProvinceCode: shipFromAddress.state,
            PostalCode: shipFromAddress.zipCode,
            CountryCode: shipFromAddress.country || 'US',
          },
        },
        ShipTo: {
          Name: (shipToAddress.name || '').substring(0, 35), // UPS limit
          AttentionName: (shipToAddress.contact || shipToAddress.name || '').substring(0, 35),
          CompanyDisplayableName: (shipToAddress.company || '').substring(0, 35),
          Phone: shipToAddress.phone && shipToAddress.phone.length >= 10 ? {
            Number: shipToAddress.phone.replace(/\D/g, '').substring(0, 15),
          } : undefined,
          Address: {
            AddressLine: [shipToAddress.street, shipToAddress.street2].filter(Boolean).map(line => line.substring(0, 35)),
            City: (shipToAddress.city || '').substring(0, 30),
            StateProvinceCode: (shipToAddress.state || '').substring(0, 2),
            PostalCode: (shipToAddress.zipCode || '').replace(/\D/g, '').substring(0, 9),
            CountryCode: shipToAddress.country || 'US',
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
    
    console.log('⚡ Creating UPS label for:', orderId, 'billing:', billingOption);
    
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
        name: process.env.SHIP_FROM_NAME || 'AG Composites',
        company: process.env.SHIP_FROM_NAME || 'AG Composites',
        contact: process.env.SHIP_FROM_ATTENTION || 'Shipping',
        street: process.env.SHIP_FROM_ADDRESS1 || '230 Hamer Rd.',
        city: process.env.SHIP_FROM_CITY || 'Owens Crossroads',
        state: process.env.SHIP_FROM_STATE || 'AL',
        zipCode: process.env.SHIP_FROM_POSTAL || '35763',
        country: 'US',
        phone: process.env.SHIP_FROM_PHONE || '256-723-8381',
      },
      packageWeight: packageDetails.weight,
      packageDimensions: packageDetails.dimensions,
      billingOption,
      receiverAccount,
    };

    // Validate required UPS OAuth credentials (2024+ API)
    const upsClientId = process.env.UPS_CLIENT_ID?.trim();
    const upsClientSecret = process.env.UPS_CLIENT_SECRET?.trim();
    const upsShipperNumber = process.env.UPS_SHIPPER_NUMBER?.trim();
    
    if (!upsClientId || !upsClientSecret || !upsShipperNumber) {
      return res.status(500).json({ 
        error: 'UPS OAuth credentials not configured. Please set UPS_CLIENT_ID, UPS_CLIENT_SECRET, and UPS_SHIPPER_NUMBER environment variables for the new UPS API.' 
      });
    }

    // Quick credential validation (optimized logging)
    console.log('⚡ UPS credentials:', upsClientId ? 'OK' : 'MISSING');

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
        details: tokenError.message
      });
    }

    // Step 2: Build shipment payload for new REST API
    const payload = buildUPSShipmentPayloadOAuth(shipmentDetails, upsShipperNumber);

    // Use UPS Production REST API endpoints (2024+) for real tracking numbers
    let upsEndpoint = 'https://onlinetools.ups.com/api/shipments/v1/ship'; // Production endpoint for real tracking
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
        console.log('🚀 Running in deployment environment - using extended timeouts');
      }
      
      response = await axios.post(upsEndpoint, payload, {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: isDeployment ? 90000 : 60000, // 90 seconds in deployment, 60 seconds in development
      });
      console.log('UPS OAuth API call successful');
    } catch (error: any) {
      console.error('UPS Production OAuth endpoint failed:', error.response?.data || error.message);
      throw error; // Re-throw the error for handling
    }

    if (!response) {
      throw new Error('No response from UPS API');
    }

    // UPS OAuth API returns the label in new format
    const shipmentResults = response.data?.ShipmentResponse?.ShipmentResults;
    const labelBase64 = shipmentResults?.PackageResults?.[0]?.ShippingLabel?.GraphicImage || 
                       shipmentResults?.PackageResults?.ShippingLabel?.GraphicImage;
    const trackingNumber = shipmentResults?.ShipmentIdentificationNumber;
    const shipmentCost = shipmentResults?.ShipmentCharges?.TotalCharges?.MonetaryValue;

    if (labelBase64 && trackingNumber) {
      // Update order with tracking information
      if (order) {
        try {
          const updateData = {
            trackingNumber,
            shippingCarrier: 'UPS',
            shippingMethod: getServiceName('03'),
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

          // Send automated customer shipping notification
          try {
            console.log(`🚚 Attempting to send shipping notification for order ${orderId} with tracking ${trackingNumber}`);
            
            // Get customer information for the order
            let customer = null;
            if (order.customerId) {
              try {
                customer = await storage.getCustomerById(order.customerId);
              } catch (customerError) {
                console.log('Could not fetch customer details for notification:', customerError);
              }
            }

            if (customer && customer.phone) {
              // Send SMS notification automatically when label is created
              const { sendCustomerNotification } = await import('../../utils/notifications');
              const notificationResult = await sendCustomerNotification({
                orderId,
                trackingNumber,
                carrier: 'UPS',
                customerPhone: customer.phone,
                customerEmail: customer.email || undefined,
                preferredMethods: ['sms'] // Force SMS for shipping notifications
              });

              if (notificationResult.success) {
                console.log(`✅ Automated shipping notification sent via ${notificationResult.methods.join(', ')} for order ${orderId}`);
              } else {
                console.log(`⚠️ Shipping notification failed for order ${orderId}:`, notificationResult.errors);
              }
            } else {
              console.log(`📱 No customer phone number available for automated shipping notification (Order: ${orderId})`);
            }
          } catch (notificationError) {
            console.error('Failed to send automated shipping notification:', notificationError);
            // Don't fail the label creation if notification fails
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
    console.error('Full error object:', JSON.stringify(error.response?.data, null, 2));
    
    if (error.response?.data) {
      // Extract detailed error information
      const faultDetails = error.response.data.Fault?.detail;
      let errorMessage = 'UPS API error';
      
      if (faultDetails?.Errors) {
        const errors = Array.isArray(faultDetails.Errors) ? faultDetails.Errors : [faultDetails.Errors];
        console.error('UPS Error Details:', JSON.stringify(errors, null, 2));
        
        if (errors[0]) {
          errorMessage = errors[0].ErrorDescription || errors[0].Description || errorMessage;
        }
      }
      
      res.status(500).json({ 
        error: errorMessage,
        details: error.response.data,
        faultString: error.response.data.Fault?.faultstring
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
      labelBase64: result.labelBase64 ? 'Generated' : 'None'
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

// UPS OAuth 2.0 Authentication (2024+ API)
async function getUPSOAuthToken(clientId: string, clientSecret: string): Promise<string> {
  // Use production OAuth endpoint for real tracking numbers
  const tokenEndpoint = 'https://onlinetools.ups.com/security/v1/oauth/token';
    
  console.log('UPS OAuth Token Endpoint:', tokenEndpoint);
  
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  
  try {
    const response = await axios.post(tokenEndpoint, 
      'grant_type=client_credentials',
      {
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        timeout: process.env.REPLIT_DEPLOYMENT === '1' ? 45000 : 30000 // Extra timeout for deployment environment
      }
    );
    
    console.log('OAuth token response status:', response.status);
    
    if (response.data?.access_token) {
      return response.data.access_token;
    } else {
      throw new Error('No access token in response');
    }
  } catch (error: any) {
    console.error('OAuth token error details:', error.response?.data || error.message);
    throw new Error(`Failed to get UPS OAuth token: ${error.response?.data?.error_description || error.message}`);
  }
}

// Build UPS shipment payload for OAuth REST API (2024+) - No notification to avoid validation errors
function buildUPSShipmentPayloadOAuth(shipmentDetails: any, shipperNumber: string): any {
  return {
    "ShipmentRequest": {
      "Request": {
        "RequestOption": "nonvalidate",
        "TransactionReference": {
          "CustomerContext": `Order ${shipmentDetails.orderId}`
        }
      },
      "Shipment": {
        "Description": `Order ${shipmentDetails.orderId} - Manufacturing Product`,
        "Shipper": {
          "Name": process.env.SHIP_FROM_NAME || "AG Composites",
          "AttentionName": process.env.SHIP_FROM_ATTENTION || "Shipping",
          "CompanyDisplayableName": process.env.SHIP_FROM_NAME || "AG Composites",
          "Phone": {
            "Number": process.env.SHIP_FROM_PHONE || "256-723-8381"
          },
          "ShipperNumber": shipperNumber,
          "Address": {
            "AddressLine": [process.env.SHIP_FROM_ADDRESS1 || "230 Hamer Rd."],
            "City": process.env.SHIP_FROM_CITY || "Owens Crossroads",
            "StateProvinceCode": process.env.SHIP_FROM_STATE || "AL",
            "PostalCode": process.env.SHIP_FROM_POSTAL || "35763",
            "CountryCode": "US"
          }
        },
        "ShipTo": {
          "Name": shipmentDetails.shipToAddress.name,
          "AttentionName": shipmentDetails.shipToAddress.name,
          "Address": {
            "AddressLine": [shipmentDetails.shipToAddress.street],
            "City": shipmentDetails.shipToAddress.city,
            "StateProvinceCode": shipmentDetails.shipToAddress.state,
            "PostalCode": shipmentDetails.shipToAddress.zipCode.replace(/\D/g, ''),
            "CountryCode": shipmentDetails.shipToAddress.country || "US"
          }
        },
        "PaymentInformation": {
          "ShipmentCharge": {
            "Type": "01",
            "BillShipper": {
              "AccountNumber": shipperNumber
            }
          }
        },
        "Service": {
          "Code": "03"  // UPS Ground
        },
        "Package": {
          "Description": `Order ${shipmentDetails.orderId}`,
          "Packaging": {
            "Code": "02"  // Customer Supplied Package
          },
          "Dimensions": {
            "UnitOfMeasurement": {
              "Code": "IN"
            },
            "Length": shipmentDetails.packageDimensions.length.toString(),
            "Width": shipmentDetails.packageDimensions.width.toString(),
            "Height": shipmentDetails.packageDimensions.height.toString()
          },
          "PackageWeight": {
            "UnitOfMeasurement": {
              "Code": "LBS"
            },
            "Weight": shipmentDetails.packageWeight.toString()
          }
        },
        "LabelSpecification": {
          "LabelImageFormat": {
            "Code": "GIF"
          },
          "LabelStockSize": {
            "Height": "6",
            "Width": "4"
          }
        }
      }
    }
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
    
    // Try to update finalized order first
    try {
      const result = await db.update(allOrders)
        .set({
          trackingNumber: trackingNumber.trim(),
          shippingCarrier: shippingCarrier || 'UPS',
          updatedAt: new Date()
        })
        .where(eq(allOrders.orderId, orderId));
      
      console.log(`Updated finalized order ${orderId} with tracking number ${trackingNumber}`);
    } catch (finalizedError) {
      // If finalized update fails, try draft orders table
      await db.update(orderDrafts)
        .set({
          trackingNumber: trackingNumber.trim(),
          shippingCarrier: shippingCarrier || 'UPS',
          updatedAt: new Date()
        })
        .where(eq(orderDrafts.orderId, orderId));
      
      console.log(`Updated draft order ${orderId} with tracking number ${trackingNumber}`);
    }
    
    res.json({ 
      success: true, 
      message: 'Tracking number added successfully',
      trackingNumber: trackingNumber.trim(),
      shippingCarrier: shippingCarrier || 'UPS'
    });
    
  } catch (error) {
    console.error('Error adding tracking number:', error);
    res.status(500).json({ error: 'Failed to add tracking number' });
  }
});

export default router;
