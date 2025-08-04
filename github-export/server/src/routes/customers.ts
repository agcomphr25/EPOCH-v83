import { Router, Request, Response } from 'express';
import { storage } from '../../storage';
import { authenticateToken } from '../../middleware/auth';
import {
  insertCustomerSchema,
  insertCustomerAddressSchema,
  insertCommunicationLogSchema,
  insertP2CustomerSchema
} from '@shared/schema';

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
    res.status(500).json({ error: "Failed to fetch P2 customers" });
  }
});

// P2 Purchase Orders Bypass Routes (to avoid monolithic route conflicts)
router.get('/p2-purchase-orders-bypass', async (req: Request, res: Response) => {
  try {
    console.log('🔧 DIRECT P2 PURCHASE ORDERS BYPASS ROUTE CALLED');
    const pos = await storage.getAllP2PurchaseOrders();
    console.log('🔧 Found P2 purchase orders:', pos.length);
    res.json(pos);
  } catch (error) {
    console.error('🔧 P2 purchase orders bypass error:', error);
    res.status(500).json({ error: "Failed to fetch P2 purchase orders via bypass route" });
  }
});

router.post('/p2-purchase-orders-bypass', async (req: Request, res: Response) => {
  try {
    console.log('🔧 P2 PURCHASE ORDER CREATE BYPASS ROUTE CALLED');
    const poData = req.body;
    const po = await storage.createP2PurchaseOrder(poData);
    console.log('🔧 Created P2 purchase order:', po.id);
    res.status(201).json(po);
  } catch (error) {
    console.error('🔧 P2 purchase order create bypass error:', error);
    res.status(500).json({ error: "Failed to create P2 purchase order via bypass route" });
  }
});

router.put('/p2-purchase-orders-bypass/:id', async (req: Request, res: Response) => {
  try {
    console.log('🔧 P2 PURCHASE ORDER UPDATE BYPASS ROUTE CALLED');
    const { id } = req.params;
    const poData = req.body;
    const po = await storage.updateP2PurchaseOrder(parseInt(id), poData);
    console.log('🔧 Updated P2 purchase order:', po.id);
    res.json(po);
  } catch (error) {
    console.error('🔧 P2 purchase order update bypass error:', error);
    res.status(500).json({ error: "Failed to update P2 purchase order via bypass route" });
  }
});

router.delete('/p2-purchase-orders-bypass/:id', async (req: Request, res: Response) => {
  try {
    console.log('🔧 P2 PURCHASE ORDER DELETE BYPASS ROUTE CALLED');
    const { id } = req.params;
    await storage.deleteP2PurchaseOrder(parseInt(id));
    console.log('🔧 Deleted P2 purchase order:', id);
    res.json({ success: true });
  } catch (error) {
    console.error('🔧 P2 purchase order delete bypass error:', error);
    res.status(500).json({ error: "Failed to delete P2 purchase order via bypass route" });
  }
});

// Regular Customers Management
router.get('/', async (req: Request, res: Response) => {
  try {
    const customers = await storage.getAllCustomers();
    res.json(customers);
  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({ error: "Failed to fetch customers" });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  try {
    const { query } = req.query;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: "Search query is required" });
    }
    
    const customers = await storage.searchCustomers(query);
    res.json(customers);
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ error: "Failed to search customers" });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const customer = await storage.getCustomer(customerId);
    
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }
    
    res.json(customer);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: "Failed to fetch customer" });
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
    res.status(500).json({ error: "Failed to create customer" });
  }
});

router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerData = insertCustomerSchema.parse(req.body);
    const newCustomer = await storage.createCustomer(customerData);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create customer" });
  }
});

router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCustomer = await storage.updateCustomer(customerId, updates);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update customer error:', error);
    res.status(500).json({ error: "Failed to update customer" });
  }
});

router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    await storage.deleteCustomer(customerId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({ error: "Failed to delete customer" });
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
    res.status(500).json({ error: "Failed to fetch customer addresses" });
  }
});

router.post('/:id/addresses', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const addressData = insertCustomerAddressSchema.parse({
      ...req.body,
      customerId
    });
    const newAddress = await storage.createCustomerAddress(addressData);
    res.status(201).json(newAddress);
  } catch (error) {
    console.error('Create customer address error:', error);
    res.status(500).json({ error: "Failed to create customer address" });
  }
});

// Communication Logs
router.get('/:id/communications', async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const communications = await storage.getCommunicationLogs(customerId.toString());
    res.json(communications);
  } catch (error) {
    console.error('Get communication logs error:', error);
    res.status(500).json({ error: "Failed to fetch communication logs" });
  }
});

router.post('/:id/communications', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const communicationData = insertCommunicationLogSchema.parse({
      ...req.body,
      customerId
    });
    const newCommunication = await storage.createCommunicationLog(communicationData);
    res.status(201).json(newCommunication);
  } catch (error) {
    console.error('Create communication log error:', error);
    res.status(500).json({ error: "Failed to create communication log" });
  }
});



router.post('/customers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerData = insertP2CustomerSchema.parse(req.body);
    const newCustomer = await storage.createP2Customer(customerData);
    res.status(201).json(newCustomer);
  } catch (error) {
    console.error('Create P2 customer error:', error);
    if (error instanceof Error) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: "Failed to create P2 customer" });
  }
});

router.put('/customers/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    const updates = req.body;
    const updatedCustomer = await storage.updateP2Customer(customerId, updates);
    res.json(updatedCustomer);
  } catch (error) {
    console.error('Update P2 customer error:', error);
    res.status(500).json({ error: "Failed to update P2 customer" });
  }
});

router.delete('/customers/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    await storage.deleteP2Customer(customerId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete P2 customer error:', error);
    res.status(500).json({ error: "Failed to delete P2 customer" });
  }
});

// Address autocomplete bypass route (to avoid monolithic route conflicts)
router.post('/address-autocomplete-bypass', async (req: Request, res: Response) => {
  try {
    console.log('🔧 BYPASS ADDRESS AUTOCOMPLETE CALLED');
    console.log('🔧 Request body:', req.body);
    
    const { search, getZipCode } = req.body;
    
    if (!search || typeof search !== 'string') {
      console.log('🔧 Invalid search parameter:', search);
      return res.status(400).json({ error: "Search parameter is required" });
    }
    
    // Check if we have SmartyStreets credentials
    const authId = process.env.SMARTYSTREETS_AUTH_ID;
    const authToken = process.env.SMARTYSTREETS_AUTH_TOKEN;
    
    console.log('🔧 SmartyStreets credentials check:', { 
      hasAuthId: !!authId, 
      hasAuthToken: !!authToken 
    });
    
    if (!authId || !authToken) {
      console.log('🔧 Missing SmartyStreets credentials');
      return res.status(500).json({ 
        error: "SmartyStreets credentials not configured" 
      });
    }
    
    // If getZipCode is true and we have a complete address, use Street API
    if (getZipCode && search.includes(',')) {
      console.log('🔧 Using Street API for ZIP code lookup');
      
      // Parse the complete address for Street API
      const addressParts = search.split(', ');
      if (addressParts.length >= 3) {
        const street = addressParts[0];
        const city = addressParts[1];
        const state = addressParts[2];
        
        const streetUrl = `https://us-street.api.smartystreets.com/street-address?auth-id=${authId}&auth-token=${authToken}&street=${encodeURIComponent(street)}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`;
        
        const streetResponse = await fetch(streetUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        });
        
        if (streetResponse.ok) {
          const streetData = await streetResponse.json();
          console.log('🔧 Street API response:', streetData);
          
          if (streetData && streetData.length > 0) {
            const result = streetData[0];
            const suggestion = {
              text: `${result.delivery_line_1}, ${result.components.city_name}, ${result.components.state_abbreviation} ${result.components.zipcode}`,
              streetLine: result.delivery_line_1,
              city: result.components.city_name,
              state: result.components.state_abbreviation,
              zipCode: result.components.zipcode + (result.components.plus4_code ? '-' + result.components.plus4_code : ''),
              entries: 1
            };
            
            console.log('🔧 Street API suggestion with ZIP:', suggestion);
            return res.json({ suggestions: [suggestion] });
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
      }
    });
    
    console.log('🔧 SmartyStreets response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('🔧 SmartyStreets error response:', errorText);
      throw new Error(`SmartyStreets Autocomplete API error: ${response.status} - ${errorText}`);
    }
    
    const data = await response.json();
    console.log('🔧 SmartyStreets raw response:', data);
    
    // Transform SmartyStreets autocomplete response
    const suggestions = data.suggestions?.map((item: any) => ({
      text: item.text,
      streetLine: item.street_line,
      city: item.city,
      state: item.state,
      zipCode: item.zipcode,
      entries: item.entries
    })) || [];
    
    console.log('🔧 Transformed suggestions:', suggestions);
    console.log('🔧 Sending response with suggestions count:', suggestions.length);
    
    res.json({
      suggestions: suggestions
    });
    
  } catch (error) {
    console.error('🔧 Address autocomplete error:', error);
    res.status(500).json({ 
      error: "Failed to get address suggestions",
      details: (error as any).message || 'Unknown error'
    });
  }
});

export default router;