import { Router, Request, Response } from 'express';
import {
  insertCustomerSchema,
  insertCustomerAddressSchema,
  insertCommunicationLogSchema,
  insertP2CustomerSchema,
} from '@shared/schema';

import { storage } from '../../storage';
import { pool } from '../../db';

const router = Router();

// P2 Customers Management - Bypass route (must be before parameterized routes)
router.get('/p2-customers-bypass', async (req: Request, res: Response) => {
  try {
    console.log('🔧 P2 CUSTOMERS BYPASS ROUTE CALLED');
    const p2Customers = await storage.getAllP2Customers();
    console.log('🔧 Found P2 customers:', p2Customers.length);
    res.json(p2Customers);
  } catch (error) {
    console.error('Get P2 customers error:', error);
    res.status(500).json({ error: 'Failed to fetch P2 customers' });
  }
});

// P2 Purchase Orders Bypass Routes (to avoid monolithic route conflicts)
router.get(
  '/p2-purchase-orders-bypass',
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 DIRECT P2 PURCHASE ORDERS BYPASS ROUTE CALLED');
      const pos = await storage.getAllP2PurchaseOrders();
      console.log('🔧 Found P2 purchase orders:', pos.length);
      res.json(pos);
    } catch (error) {
      console.error('🔧 P2 purchase orders bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch P2 purchase orders via bypass route' });
    }
  }
);

router.post(
  '/p2-purchase-orders-bypass',
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER CREATE BYPASS ROUTE CALLED');
      const poData = req.body;
      const po = await storage.createP2PurchaseOrder(poData);
      console.log('🔧 Created P2 purchase order:', po.id);
      res.status(201).json(po);
    } catch (error) {
      console.error('🔧 P2 purchase order create bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to create P2 purchase order via bypass route' });
    }
  }
);

router.put(
  '/p2-purchase-orders-bypass/:id',
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER UPDATE BYPASS ROUTE CALLED');
      const { id } = req.params;
      const poData = req.body;
      const po = await storage.updateP2PurchaseOrder(parseInt(id), poData);
      console.log('🔧 Updated P2 purchase order:', po.id);
      res.json(po);
    } catch (error) {
      console.error('🔧 P2 purchase order update bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to update P2 purchase order via bypass route' });
    }
  }
);

router.delete(
  '/p2-purchase-orders-bypass/:id',
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER DELETE BYPASS ROUTE CALLED');
      const { id } = req.params;
      await storage.deleteP2PurchaseOrder(parseInt(id));
      console.log('🔧 Deleted P2 purchase order:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 P2 purchase order delete bypass error:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete P2 purchase order via bypass route' });
    }
  }
);

// Bypass route to get all customers (without authentication)
router.get('/bypass', async (req: Request, res: Response) => {
  try {
    console.log('🔧 CUSTOMERS BYPASS ROUTE CALLED');
    const customers = await storage.getAllCustomers();
    console.log('🔧 Found customers:', customers.length);
    res.json(customers);
  } catch (error) {
    console.error('🔧 Get customers bypass error:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch customers via bypass route' });
  }
});

// Regular Customers Management
router.get('/', async (req: Request, res: Response) => {
  try {
    const customers = await storage.getAllCustomers();
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.get('/with-pos', async (req: Request, res: Response) => {
  try {
    const customers = await storage.getCustomersWithPurchaseOrders();
    res.json(customers);
  } catch (error) {
    console.error('Get customers with POs error:', error);
    res
      .status(500)
      .json({ error: 'Failed to fetch customers with purchase orders' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const customers = await storage.searchCustomers(query);
    res.json(customers);
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ error: 'Failed to search customers' });
  }
});

// RFQ Risk Assessment Routes (must come before /:id route to avoid conflicts)
router.post('/rfq-assessments', async (req: Request, res: Response) => {
  try {
    const assessmentData = req.body;
    
    // Validate that rfqNumber is provided (it should have been generated via GET /:customerId/rfq-next-number)
    if (!assessmentData.rfqNumber) {
      return res.status(400).json({ error: 'RFQ number is required' });
    }
    
    const customer = await storage.getP2CustomerByCustomerId(assessmentData.customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    
    // Use the RFQ number that was already generated and reserved
    const newAssessment = await storage.createRFQRiskAssessment({
      rfqNumber: assessmentData.rfqNumber,
      customerId: assessmentData.customerId,
      customerName: customer.customerName,
      description: assessmentData.description,
      formData: assessmentData.formData,
      totalOverallPoints: assessmentData.totalOverallPoints,
      adjustedRiskLevel: assessmentData.adjustedRiskLevel,
      riskDetermination: assessmentData.riskDetermination,
      bidDecision: assessmentData.bidDecision,
    });
    
    res.status(201).json(newAssessment);
  } catch (error) {
    console.error('Create RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to create RFQ risk assessment' });
  }
});

router.get('/rfq-assessments', async (req: Request, res: Response) => {
  try {
    const assessments = await storage.getAllRFQRiskAssessments();
    res.json(assessments);
  } catch (error) {
    console.error('Get RFQ risk assessments error:', error);
    res.status(500).json({ error: 'Failed to fetch RFQ risk assessments' });
  }
});

router.get('/rfq-assessments/:rfqNumber', async (req: Request, res: Response) => {
  try {
    const { rfqNumber } = req.params;
    const assessment = await storage.getRFQRiskAssessment(rfqNumber);
    
    if (!assessment) {
      return res.status(404).json({ error: 'RFQ risk assessment not found' });
    }
    
    res.json(assessment);
  } catch (error) {
    console.error('Get RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to fetch RFQ risk assessment' });
  }
});

router.put('/rfq-assessments/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const assessmentData = req.body;
    
    // Get the customer name if customerId is provided
    let customerName = assessmentData.customerName;
    if (assessmentData.customerId && !customerName) {
      const customer = await storage.getP2CustomerByCustomerId(assessmentData.customerId);
      if (customer) {
        customerName = customer.customerName;
      }
    }
    
    const updatedAssessment = await storage.updateRFQRiskAssessment(id, {
      customerId: assessmentData.customerId,
      customerName: customerName,
      description: assessmentData.description,
      formData: assessmentData.formData,
      totalOverallPoints: assessmentData.totalOverallPoints,
      adjustedRiskLevel: assessmentData.adjustedRiskLevel,
      riskDetermination: assessmentData.riskDetermination,
      bidDecision: assessmentData.bidDecision,
    });
    
    if (!updatedAssessment) {
      return res.status(404).json({ error: 'RFQ risk assessment not found' });
    }
    
    res.json(updatedAssessment);
  } catch (error) {
    console.error('Update RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to update RFQ risk assessment' });
  }
});

router.put('/rfq-assessments/:id/submit', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    // Debug logging
    console.log('🔍 RFQ Submit - Cookies:', req.cookies);
    console.log('🔍 RFQ Submit - Headers:', req.headers);
    
    // Extract session token from cookies or authorization header
    const sessionToken =
      req.cookies?.sessionToken ||
      req.headers.authorization?.replace('Bearer ', '');

    console.log('🔍 RFQ Submit - Session Token:', sessionToken ? 'Found' : 'Not found');

    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Query database for session to get authenticated username
    const result: any = await pool.query(
      'SELECT user_id, username, expires_at FROM user_sessions WHERE session_token = $1',
      [sessionToken]
    );

    console.log('🔍 RFQ Submit - DB Query Result:', {
      result: result,
      rowCount: result.rowCount,
      rows: result.rows,
      hasRows: !!result.rows,
      rowsLength: result.rows?.length,
      isArray: Array.isArray(result),
      resultLength: result.length
    });

    // Handle both result formats (some pools return result.rows, others return array directly)
    const rows = Array.isArray(result) ? result : result.rows;
    
    if (!rows || rows.length === 0) {
      console.log('❌ RFQ Submit - No session found in database');
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    const { username, expires_at } = rows[0];

    console.log('🔍 RFQ Submit - Session found:', {
      username,
      expires_at,
      isExpired: new Date(expires_at) < new Date()
    });

    // Check if session has expired
    if (new Date(expires_at) < new Date()) {
      console.log('❌ RFQ Submit - Session expired');
      return res.status(401).json({ error: 'Session expired' });
    }
    
    // Submit the assessment with the authenticated username
    const submittedAssessment = await storage.submitRFQRiskAssessment(id, username);
    
    if (!submittedAssessment) {
      return res.status(404).json({ error: 'RFQ risk assessment not found' });
    }
    
    res.json(submittedAssessment);
  } catch (error) {
    console.error('Submit RFQ risk assessment error:', error);
    res.status(500).json({ error: 'Failed to submit RFQ risk assessment' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const customer = await storage.getCustomer(customerId);

    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    res.json(customer);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// Customer creation without authentication (for Order Entry)
router.post('/create-bypass', async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS CUSTOMER CREATE ROUTE CALLED');
    console.log('🔧 Request body:', req.body);

    const customerData = insertCustomerSchema.parse(req.body);
    const newCustomer = await storage.createCustomer(customerData);

    console.log('🔧 Customer created successfully:', newCustomer.id);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Customer update without authentication (for Customer Management)
router.put('/update-bypass/:id', async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS CUSTOMER UPDATE ROUTE CALLED');
    console.log('🔧 Customer ID:', req.params.id);
    console.log('🔧 Request body:', req.body);

    const customerId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCustomer = await storage.updateCustomer(customerId, updates);

    console.log('🔧 Customer updated successfully:', updatedCustomer.id);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

// Customer delete without authentication (for Customer Management)
router.delete('/delete-bypass/:id', async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS CUSTOMER DELETE ROUTE CALLED');
    console.log('🔧 Customer ID:', req.params.id);

    const customerId = parseInt(req.params.id);
    await storage.deleteCustomer(customerId);

    console.log('🔧 Customer deleted successfully:', customerId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const customerData = insertCustomerSchema.parse(req.body);
    const newCustomer = await storage.createCustomer(customerData);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCustomer = await storage.updateCustomer(customerId, updates);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    await storage.deleteCustomer(customerId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

// Customer Addresses
router.get('/:id/addresses', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const addresses = await storage.getCustomerAddresses(customerId.toString());
    res.json(addresses);
  } catch (error) {
    console.error('Get customer addresses error:', error);
    res.status(500).json({ error: 'Failed to fetch customer addresses' });
  }
});

router.post('/:id/addresses', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const addressData = insertCustomerAddressSchema.parse({
      ...req.body,
      customerId,
    });
    const newAddress = await storage.createCustomerAddress(addressData);
    res.status(201).json(newAddress);
  } catch (error) {
    console.error('Create customer address error:', error);
    res.status(500).json({ error: 'Failed to create customer address' });
  }
});

// Communication Logs
router.get('/:id/communications', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const communications = await storage.getCommunicationLogs(
      customerId.toString()
    );
    res.json(communications);
  } catch (error) {
    console.error('Get communication logs error:', error);
    res.status(500).json({ error: 'Failed to fetch communication logs' });
  }
});

router.post('/:id/communications', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const communicationData = insertCommunicationLogSchema.parse({
      ...req.body,
      customerId,
    });
    const newCommunication =
      await storage.createCommunicationLog(communicationData);
    res.status(201).json(newCommunication);
  } catch (error) {
    console.error('Create communication log error:', error);
    res.status(500).json({ error: 'Failed to create communication log' });
  }
});

router.post('/customers', async (req: Request, res: Response) => {
  try {
    const customerData = insertP2CustomerSchema.parse(req.body);
    const newCustomer = await storage.createP2Customer(customerData);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create P2 customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create P2 customer' });
  }
});

router.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const updates = req.body;
    
    console.log('📝 Updating P2 customer:', customerId);
    console.log('📊 Update data received:', JSON.stringify(updates, null, 2));
    console.log('🔢 rfqSequences in update:', updates.rfqSequences);
    
    const updatedCustomer = await storage.updateP2Customer(customerId, updates);
    
    console.log('✅ Customer updated, rfqSequences after update:', updatedCustomer.rfqSequences);
    
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update P2 customer error:', error);
    res.status(500).json({ error: 'Failed to update P2 customer' });
  }
});

router.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    await storage.deleteP2Customer(customerId);
    res.json({ success: true, message: 'Customer deleted successfully' });
  } catch (error) {
    console.error('Delete P2 customer error:', error);
    res.status(500).json({ error: 'Failed to delete P2 customer' });
  }
});

// RFQ Configuration Routes
router.put('/:id/rfq-config', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const { rfqPrefix, rfqSequences } = req.body;
    
    const updatedCustomer = await storage.updateP2CustomerRFQConfig(customerId, {
      rfqPrefix,
      rfqSequences,
    });
    
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update P2 customer RFQ config error:', error);
    res.status(500).json({ error: 'Failed to update RFQ configuration' });
  }
});

router.get('/:customerId/rfq-next-number', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    
    const currentYear = new Date().getFullYear().toString();
    
    // Use atomic reservation method to prevent race conditions
    const result = await storage.reserveNextRFQNumber(customerId, currentYear);
    
    res.json(result);
  } catch (error) {
    console.error('Get next RFQ number error:', error);
    res.status(500).json({ error: 'Failed to generate RFQ number' });
  }
});

// Address autocomplete bypass route (to avoid monolithic route conflicts)
router.post(
  '/address-autocomplete-bypass',
  async (req: Request, res: Response) => {
    try {
      console.log('🔧 BYPASS ADDRESS AUTOCOMPLETE CALLED');
      console.log('🔧 Request body:', req.body);

      const { search, getZipCode } = req.body;

      if (!search || typeof search !== 'string') {
        console.log('🔧 Invalid search parameter:', search);
        return res.status(400).json({ error: 'Search parameter is required' });
      }

      // Check if we have SmartyStreets credentials
      const authId = process.env.SMARTYSTREETS_AUTH_ID;
      const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;

      console.log('🔧 SmartyStreets credentials check:', {
        hasAuthId: !!authId,
        hasAuthToken: !!authToken,
      });

      if (!authId || !authToken) {
        console.log('🔧 Missing SmartyStreets credentials');
        return res.status(500).json({
          error: 'SmartyStreets credentials not configured',
        });
      }

      // If getZipCode is true and we have a complete address, use Street API
      if (getZipCode && search.includes(',')) {
        console.log('🔧 Using Street API for ZIP code lookup');

        // Parse the complete address for Street API
        const addressParts = search.split(', ');
        if (addressParts.length >= 2) {
          const street = addressParts[0];
          let city, state;

          if (addressParts.length >= 3) {
            city = addressParts[1];
            state = addressParts[2];
          } else {
            // Handle "City State" format
            const cityStateParts = addressParts[1].split(' ');
            state = cityStateParts.pop(); // Last part is state
            city = cityStateParts.join(' '); // Rest is city
          }

          console.log('🔧 Street API params:', { street, city, state });

          const streetUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`;

          console.log('🔧 Street API URL:', streetUrl);

          const streetResponse = await fetch(streetUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });

          console.log('🔧 Street API response status:', streetResponse.status);

          if (streetResponse.ok) {
            const streetData = await streetResponse.json();
            console.log('🔧 Street API response:', streetData);

            if (streetData && streetData.length > 0) {
              const result = streetData[0];
              const fullAddress = {
                delivery_line_1: result.delivery_line_1,
                components: {
                  city_name: result.components.city_name,
                  state_abbreviation: result.components.state_abbreviation,
                  zipcode:
                    result.components.zipcode +
                    (result.components.plus4_code
                      ? '-' + result.components.plus4_code
                      : ''),
                },
              };

              console.log('🔧 Returning full address with ZIP:', fullAddress);
              return res.json({ fullAddress: fullAddress });
            } else {
              console.log(
                '🔧 Street API returned empty results, falling back to autocomplete'
              );
            }
          } else {
            const errorText = await streetResponse.text();
            console.log(
              '🔧 Street API error:',
              streetResponse.status,
              errorText
            );

            // If Street API fails (like 402 subscription error), try to extract ZIP from the search text
            const zipMatch = search.match(/\b(\d{5}(?:-\d{4})?)\b/);
            if (zipMatch) {
              console.log(
                '🔧 Extracted ZIP code from search text:',
                zipMatch[1]
              );
              return res.json({
                fullAddress: {
                  delivery_line_1: street,
                  components: {
                    city_name: city,
                    state_abbreviation: state,
                    zipcode: zipMatch[1],
                  },
                },
              });
            }
          }
        }
      }

      // Use SmartyStreets US Autocomplete API for partial searches
      const smartyStreetsUrl = `https://us-autocomplete.api.smartystreets.com/suggest?auth-id=${authId}&auth-token=${authToken}&prefix=${encodeURIComponent(search)}&max_suggestions=10`;

      console.log('🔧 Making SmartyStreets Autocomplete API call');

      const response = await fetch(smartyStreetsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('🔧 SmartyStreets response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.log('🔧 SmartyStreets error response:', errorText);
        throw new Error(
          `SmartyStreets Autocomplete API error: ${response.status} - ${errorText}`
        );
      }

      const data = await response.json();
      console.log('🔧 SmartyStreets raw response:', data);

      // Transform SmartyStreets autocomplete response
      const suggestions =
        data.suggestions?.map((item: any) => {
          // Extract ZIP code from text if zipcode field is empty but text contains it
          let zipCode = item.zipcode;
          if (!zipCode && item.text) {
            const zipMatch = item.text.match(/\b(\d{5}(?:-\d{4})?)\b/);
            if (zipMatch) {
              zipCode = zipMatch[1];
            }
          }

          return {
            text: item.text,
            streetLine: item.street_line,
            city: item.city,
            state: item.state,
            zipCode: zipCode,
            entries: item.entries,
          };
        }) || [];

      console.log('🔧 Transformed suggestions:', suggestions);
      console.log(
        '🔧 Sending response with suggestions count:',
        suggestions.length
      );

      res.json({
        suggestions: suggestions,
      });
    } catch (error) {
      console.error('🔧 Address autocomplete error:', error);
      res.status(500).json({
        error: 'Failed to get address suggestions',
        details: (error as any).message || 'Unknown error',
      });
    }
  }
);

// Address validation endpoint using SmartyStreets API
router.post('/validate-address', async (req: Request, res: Response) => {
  try {
    const { street, city, state, zipCode } = req.body;

    // Check if we have SmartyStreets credentials
    const authId = process.env.SMARTYSTREETS_AUTH_ID;
    const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;

    if (!authId || !authToken) {
      return res.status(500).json({
        error: 'SmartyStreets credentials not configured',
      });
    }

    // Use SmartyStreets US Street API for validation
    const smartyStreetsUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}`;

    const requestBody = [
      {
        street: street || '',
        city: city || '',
        state: state || '',
        zipcode: zipCode || '',
        candidates: 3, // Request up to 3 suggestions
      },
    ];

    const response = await fetch(smartyStreetsUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`SmartyStreets API error: ${response.status}`);
    }

    const data = await response.json();

    // Transform SmartyStreets response to our format
    const suggestions = data.map((item: any) => ({
      street: item.delivery_line_1 || '',
      city: item.components?.city_name || '',
      state: item.components?.state_abbreviation || '',
      zipCode: item.components?.zipcode || '',
      isValid: true,
      smartyStreetsData: {
        deliveryLine1: item.delivery_line_1,
        lastLine: item.last_line,
        deliveryPointBarcode: item.delivery_point_barcode,
        components: item.components,
        metadata: item.metadata,
        analysis: item.analysis,
      },
    }));

    res.json({
      isValid: suggestions.length > 0,
      suggestions: suggestions,
    });
  } catch (error) {
    console.error('Address validation error:', error);
    res.status(500).json({
      error: 'Failed to validate address',
      details: (error as any).message || 'Unknown error',
    });
  }
});

// Get balance due for a specific customer (glennj only)
router.get('/:id/balance-due', async (req: Request, res: Response) => {
  try {
    // Restrict to glennj only
    const user = (req as any).user;
    if (!user || user.username !== 'glennj') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Only glennj can access balance due information',
      });
    }

    const customerId = req.params.id;
    console.log(`Calculating balance due for customer ${customerId} (requested by ${user.username})`);

    // Get unpaid orders for this customer using existing method
    const unpaidOrders = await storage.getUnpaidOrdersByCustomer(customerId);

    // Get refund data for these orders
    const { refundRequests } = await import('@shared/schema');
    const { db } = await import('../../db');
    const { eq, inArray, sql: drizzleSql } = await import('drizzle-orm');

    // Get all processed refunds for this customer's orders
    const orderIds = unpaidOrders.map((o) => o.orderId);
    let refundsData: Array<{ orderId: string; totalRefunded: number }> = [];

    if (orderIds.length > 0) {
      const { and } = await import('drizzle-orm');
      
      const refunds = await db
        .select({
          orderId: refundRequests.orderId,
          totalRefunded: drizzleSql`SUM(COALESCE(${refundRequests.refundAmount}, ${refundRequests.amount}, 0))`.as('totalRefunded'),
        })
        .from(refundRequests)
        .where(
          and(
            inArray(refundRequests.orderId, orderIds),
            eq(refundRequests.status, 'PROCESSED')
          )
        )
        .groupBy(refundRequests.orderId);

      refundsData = refunds.map((r: any) => ({
        orderId: r.orderId as string,
        totalRefunded: Number(r.totalRefunded || 0),
      }));
    }

    // Create a map for quick refund lookup
    const refundMap = new Map(refundsData.map((r) => [r.orderId, r.totalRefunded]));

    // Enrich unpaid orders with refund information and adjust balance
    // IMPORTANT: Refunds INCREASE the balance due (money owed back to customer reduces what they paid)
    const ordersWithRefunds = unpaidOrders.map((order) => {
      const totalRefunded = refundMap.get(order.orderId) || 0;
      // Balance due = Order Total - (Payments - Refunds)
      // Which simplifies to: Balance due = Order Total - Payments + Refunds
      const adjustedBalance = Math.max(0, order.balanceDue + totalRefunded);
      // Calculate net paid amount for display (payments minus refunds)
      // NOTE: This can be negative if refunds exceed payments (over-refund/credit situation)
      const netPaid = order.totalPaid - totalRefunded;

      return {
        orderId: order.orderId,
        customerPO: order.customerPO,
        orderDate: order.orderDate,
        dueDate: order.dueDate,
        status: order.status,
        orderTotal: order.totalAmount,
        totalPaid: order.totalPaid,
        netPaid: Math.round(netPaid * 100) / 100, // Round to 2 decimal places
        totalRefunded: totalRefunded,
        balanceDue: adjustedBalance,
      };
    });

    // Filter out orders with $0 balance after refunds
    const ordersWithBalance = ordersWithRefunds.filter((o) => o.balanceDue > 0);

    // Calculate total balance due
    const totalBalanceDue = ordersWithBalance.reduce((sum, order) => sum + order.balanceDue, 0);

    res.json({
      customerId,
      orders: ordersWithBalance,
      totalBalanceDue: Math.round(totalBalanceDue * 100) / 100,
      orderCount: ordersWithBalance.length,
    });
  } catch (error) {
    console.error('Error calculating balance due:', error);
    res.status(500).json({
      error: 'Failed to calculate balance due',
      details: (error as any).message,
    });
  }
});

// P2 Purchase Order Items Routes
router.get(
  '/purchase-orders/:id/items',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const items = await storage.getP2PurchaseOrderItems(parseInt(id));
      res.json(items);
    } catch (error) {
      console.error('Error fetching P2 purchase order items:', error);
      res.status(500).json({ error: 'Failed to fetch P2 purchase order items' });
    }
  }
);

router.post(
  '/purchase-orders/:id/items',
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const itemData = { ...req.body, poId: parseInt(id) };
      const item = await storage.createP2PurchaseOrderItem(itemData);
      res.status(201).json(item);
    } catch (error) {
      console.error('Error creating P2 purchase order item:', error);
      res.status(500).json({ error: 'Failed to create P2 purchase order item' });
    }
  }
);

router.put(
  '/purchase-orders/:poId/items/:itemId',
  async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      const item = await storage.updateP2PurchaseOrderItem(parseInt(itemId), req.body);
      res.json(item);
    } catch (error) {
      console.error('Error updating P2 purchase order item:', error);
      res.status(500).json({ error: 'Failed to update P2 purchase order item' });
    }
  }
);

router.delete(
  '/purchase-orders/:poId/items/:itemId',
  async (req: Request, res: Response) => {
    try {
      const { itemId } = req.params;
      await storage.deleteP2PurchaseOrderItem(parseInt(itemId));
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting P2 purchase order item:', error);
      res.status(500).json({ error: 'Failed to delete P2 purchase order item' });
    }
  }
);

export default router;
