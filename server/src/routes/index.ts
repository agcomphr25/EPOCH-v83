import { Express } from 'express';
import { createServer, type Server } from "http";
import authRoutes from './auth';
import employeesRoutes from './employees';
import ordersRoutes from './orders';
import formsRoutes from './forms';
import tasksRoutes from './tasks';
import inventoryRoutes from './inventory';
import customersRoutes from './customers';
import qualityRoutes from './quality';
import documentsRoutes from './documents';
import moldsRoutes from './molds';
import layupPdfRoute from './layupPdfRoute';
import discountsRoutes from './discounts';
import bomsRoutes from './boms';

export function registerRoutes(app: Express): Server {
  // Authentication routes
  app.use('/api/auth', authRoutes);
  
  // Employee management routes
  app.use('/api/employees', employeesRoutes);
  
  // Order management routes  
  app.use('/api/orders', ordersRoutes);
  
  // Forms and submissions routes
  app.use('/api/forms', formsRoutes);
  
  // Task tracker routes
  app.use('/api/task-items', tasksRoutes);
  
  // Inventory management routes
  app.use('/api/inventory', inventoryRoutes);
  
  // Customer management routes
  app.use('/api/customers', customersRoutes);
  
  // Quality control and maintenance routes
  app.use('/api/quality', qualityRoutes);
  
  // Document management routes
  app.use('/api/documents', documentsRoutes);
  
  // Mold management routes
  app.use('/api/molds', moldsRoutes);
  
  // Layup PDF generation routes
  app.use('/api/pdf', layupPdfRoute);
  
  // Discount management routes
  app.use('/api', discountsRoutes);
  
  // BOM management routes
  app.use('/api/boms', bomsRoutes);

  // Health check endpoint for deployment debugging
  app.get('/api/health', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { testDatabaseConnection } = await import('../../db');
      
      const dbConnected = await testDatabaseConnection();
      const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        environment: process.env.NODE_ENV || 'development',
        server: 'running'
      };
      
      if (dbConnected) {
        // Test a simple query to verify storage works
        try {
          const stockModels = await storage.getAllStockModels();
          status.database = `connected (${stockModels.length} stock models)`;
        } catch (error) {
          status.database = 'connected but storage error';
        }
      }
      
      res.json(status);
    } catch (error) {
      res.status(500).json({ 
        status: 'error', 
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Layup Schedule API endpoints - missing route handler
  app.get('/api/layup-schedule', async (req, res) => {
    try {
      console.log('🔧 LAYUP SCHEDULE API CALLED');
      const { storage } = await import('../../storage');
      const scheduleData = await storage.getAllLayupSchedule();
      console.log('🔧 Found layup schedule entries:', scheduleData.length);
      res.json(scheduleData);
    } catch (error) {
      console.error('❌ Layup schedule fetch error:', error);
      res.status(500).json({ error: "Failed to fetch layup schedule" });
    }
  });

  app.post('/api/layup-schedule', async (req, res) => {
    try {
      console.log('🔧 LAYUP SCHEDULE CREATE CALLED', req.body);
      const { storage } = await import('../../storage');
      const result = await storage.createLayupSchedule(req.body);
      console.log('🔧 Created layup schedule entry:', result);
      res.json(result);
    } catch (error) {
      console.error('❌ Layup schedule create error:', error);
      res.status(500).json({ error: "Failed to create layup schedule entry" });
    }
  });

  app.delete('/api/layup-schedule/by-order/:orderId', async (req, res) => {
    try {
      console.log('🔧 LAYUP SCHEDULE DELETE BY ORDER CALLED', req.params.orderId);
      const { storage } = await import('../../storage');
      await storage.deleteLayupScheduleByOrder(req.params.orderId);
      res.json({ success: true });
    } catch (error) {
      console.error('❌ Layup schedule delete error:', error);
      res.status(500).json({ error: "Failed to delete layup schedule entries" });
    }
  });

  // P2 Customer bypass route to avoid monolithic conflicts
  app.get('/api/p2-customers-bypass', async (req, res) => {
    try {
      console.log('🔧 DIRECT P2 CUSTOMERS BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const p2Customers = await storage.getAllP2Customers();
      console.log('🔧 Found P2 customers:', p2Customers.length);
      res.json(p2Customers);
    } catch (error) {
      console.error('Get P2 customers error:', error);
      res.status(500).json({ error: "Failed to fetch P2 customers" });
    }
  });

  // P2 Purchase Orders bypass route to avoid monolithic conflicts
  app.get('/api/p2-purchase-orders-bypass', async (req, res) => {
    try {
      console.log('🔧 DIRECT P2 PURCHASE ORDERS BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const pos = await storage.getAllP2PurchaseOrders();
      console.log('🔧 Found P2 purchase orders:', pos.length);
      res.json(pos);
    } catch (error) {
      console.error('🔧 P2 purchase orders bypass error:', error);
      res.status(500).json({ error: "Failed to fetch P2 purchase orders via bypass route" });
    }
  });

  app.post('/api/p2-purchase-orders-bypass', async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER CREATE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const poData = req.body;
      const po = await storage.createP2PurchaseOrder(poData);
      console.log('🔧 Created P2 purchase order:', po.id);
      res.status(201).json(po);
    } catch (error) {
      console.error('🔧 P2 purchase order create bypass error:', error);
      res.status(500).json({ error: "Failed to create P2 purchase order via bypass route" });
    }
  });

  app.put('/api/p2-purchase-orders-bypass/:id', async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER UPDATE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
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

  app.delete('/api/p2-purchase-orders-bypass/:id', async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER DELETE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      await storage.deleteP2PurchaseOrder(parseInt(id));
      console.log('🔧 Deleted P2 purchase order:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 P2 purchase order delete bypass error:', error);
      res.status(500).json({ error: "Failed to delete P2 purchase order via bypass route" });
    }
  });
  
  // Stock Models routes - bypass to old monolithic routes temporarily
  app.get('/api/stock-models', async (req, res) => {
    try {
      console.log("🔍 Stock models API called");
      const { storage } = await import('../../storage');
      const stockModels = await storage.getAllStockModels();
      console.log("🔍 Retrieved stock models from storage:", stockModels.length, "models");
      if (stockModels.length > 0) {
        console.log("🔍 First stock model from storage:", stockModels[0]);
        console.log("🔍 First stock model keys:", Object.keys(stockModels[0]));
      }
      
      // Transform data to ensure proper format for frontend
      const transformedModels = stockModels.map(model => ({
        id: model.id,
        name: model.name,
        displayName: model.displayName,
        price: model.price,
        description: model.description,
        isActive: model.isActive,
        sortOrder: model.sortOrder,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt
      }));
      
      console.log("🔍 Transformed models count:", transformedModels.length);
      if (transformedModels.length > 0) {
        console.log("🔍 First transformed model:", transformedModels[0]);
      }
      
      res.json(transformedModels);
    } catch (error) {
      console.error("🚨 Error retrieving stock models:", error);
      res.status(500).json({ error: "Failed to retrieve stock models" });
    }
  });

  // Features routes - bypass to old monolithic routes temporarily
  app.get('/api/features', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const features = await storage.getAllFeatures();
      res.json(features);
    } catch (error) {
      console.error('🎯 Features API Error:', error);
      res.status(500).json({ error: "Failed to retrieve features" });
    }
  });

  app.post('/api/features', async (req, res) => {
    try {
      console.log('🔧 FEATURE CREATE ROUTE CALLED');
      console.log('🔧 Request body:', req.body);
      const { storage } = await import('../../storage');
      const feature = await storage.createFeature(req.body);
      console.log('🔧 Created feature:', feature.id);
      res.status(201).json(feature);
    } catch (error) {
      console.error('🔧 Feature create error:', error);
      res.status(500).json({ error: "Failed to create feature" });
    }
  });

  app.put('/api/features/:id', async (req, res) => {
    try {
      console.log('🔧 FEATURE UPDATE ROUTE CALLED');
      console.log('🔧 Feature ID:', req.params.id);
      console.log('🔧 Request body:', req.body);
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const feature = await storage.updateFeature(id, req.body);
      console.log('🔧 Updated feature:', feature.id);
      res.json(feature);
    } catch (error) {
      console.error('🔧 Feature update error:', error);
      res.status(500).json({ error: "Failed to update feature" });
    }
  });

  app.delete('/api/features/:id', async (req, res) => {
    try {
      console.log('🔧 FEATURE DELETE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      await storage.deleteFeature(id);
      console.log('🔧 Deleted feature:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 Feature delete error:', error);
      res.status(500).json({ error: "Failed to delete feature" });
    }
  });

  app.get('/api/feature-categories', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const categories = await storage.getAllFeatureCategories();
      res.json(categories);
    } catch (error) {
      console.error("Get feature categories error:", error);
      res.status(500).json({ error: "Failed to get feature categories" });
    }
  });

  app.get('/api/feature-sub-categories', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const subCategories = await storage.getAllFeatureSubCategories();
      res.json(subCategories);
    } catch (error) {
      console.error("Get feature sub-categories error:", error);
      res.status(500).json({ error: "Failed to get feature sub-categories" });
    }
  });
  
  // NEW: Direct employee layup settings route for LayupScheduler
  app.get('/api/employee-layup-data', async (req, res) => {
    try {
      console.log('🚀 NEW ROUTE CALLED: /api/employee-layup-data');
      const { storage } = await import('../../storage');
      const settings = await storage.getAllEmployeeLayupSettings();
      console.log('🚀 Employee data retrieved:', settings.length, 'employees');
      res.setHeader('Content-Type', 'application/json');
      res.json(settings);
    } catch (error) {
      console.error('🚀 Employee data fetch error:', error);
      res.status(500).json({ error: "Failed to fetch employee data" });
    }
  });

  // Temporary bypass route for employee layup settings (different path to avoid conflicts)
  app.get('/api/layup-employee-settings', async (req, res) => {
    try {
      console.log('🔧 BYPASS ROUTE CALLED: /api/layup-employee-settings');
      console.log('🔧 Request method:', req.method);
      console.log('🔧 Request path:', req.path);
      
      const { storage } = await import('../../storage');
      const settings = await storage.getAllEmployeeLayupSettings();
      console.log('🔧 Found employees from database:', settings);
      console.log('🔧 Employee count:', settings.length);
      console.log('🔧 Returning JSON response...');
      
      // Set explicit headers to ensure JSON response
      res.setHeader('Content-Type', 'application/json');
      res.json(settings);
      console.log('🔧 JSON response sent successfully');
    } catch (error) {
      console.error('🔧 Employee layup settings fetch error:', error);
      res.status(500).json({ error: "Failed to fetch employee layup settings" });
    }
  });
  
  // Address routes - bypass to old monolithic routes temporarily
  app.get('/api/addresses/all', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const addresses = await storage.getAllAddresses();
      res.json(addresses);
    } catch (error) {
      console.error("Get all addresses error:", error);
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });

  app.post('/api/addresses', async (req, res) => {
    try {
      console.log('🔧 ADDRESS CREATE ROUTE CALLED');
      console.log('🔧 Request body:', req.body);
      const { storage } = await import('../../storage');
      const addressData = req.body;
      const address = await storage.createCustomerAddress(addressData);
      console.log('🔧 Created address:', address.id);
      res.status(201).json(address);
    } catch (error) {
      console.error('🔧 Address create error:', error);
      res.status(500).json({ error: "Failed to create address" });
    }
  });

  app.put('/api/addresses/:id', async (req, res) => {
    try {
      console.log('🔧 ADDRESS UPDATE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const addressData = req.body;
      const address = await storage.updateCustomerAddress(parseInt(id), addressData);
      console.log('🔧 Updated address:', address.id);
      res.json(address);
    } catch (error) {
      console.error('🔧 Address update error:', error);
      res.status(500).json({ error: "Failed to update address" });
    }
  });

  app.delete('/api/addresses/:id', async (req, res) => {
    try {
      console.log('🔧 ADDRESS DELETE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      await storage.deleteCustomerAddress(parseInt(id));
      console.log('🔧 Deleted address:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 Address delete error:', error);
      res.status(500).json({ error: "Failed to get all addresses" });
    }
  });
  
  app.get('/api/addresses', async (req, res) => {
    try {
      const { customerId } = req.query;
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required" });
      }
      const { storage } = await import('../../storage');
      const addresses = await storage.getCustomerAddresses(customerId as string);
      res.json(addresses);
    } catch (error) {
      console.error("Get customer addresses error:", error);
      res.status(500).json({ error: "Failed to get customer addresses" });
    }
  });
  
  // P1 Layup Queue endpoint - combines regular orders and P1 purchase orders
  app.get('/api/p1-layup-queue', async (req, res) => {
    try {
      console.log('🏭 Starting P1 layup queue processing...');
      const { storage } = await import('../../storage');
      
      // Get only finalized orders from draft table that are ready for production
      const allOrders = await storage.getAllOrderDrafts();
      const layupOrders = allOrders.filter(order => 
        order.status === 'FINALIZED' && 
        (order.currentDepartment === 'Layup' || !order.currentDepartment)
      );
      
      // Add debug logging for features
      console.log('Sample P1 layup order features:', {
        orderId: layupOrders[0]?.orderId,
        features: layupOrders[0]?.features,
        modelId: layupOrders[0]?.modelId
      });

      // Get P1 Purchase Orders with stock model items
      const pos = await storage.getAllPurchaseOrders();
      const activePos = pos.filter(po => po.status === 'OPEN');
      
      const p1LayupOrders = [];
      for (const po of activePos) {
        const items = await storage.getPurchaseOrderItems(po.id);
        const stockModelItems = items.filter(item => item.itemId && item.itemId.trim());
        
        for (const item of stockModelItems) {
          // Calculate priority score based on due date urgency
          const dueDate = new Date(po.expectedDelivery || po.poDate);
          const today = new Date();
          const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const priorityScore = Math.max(20, Math.min(35, 20 + daysUntilDue)); // 20-35 range
          
          p1LayupOrders.push({
            id: `p1-${po.id}-${item.id}`,
            orderId: `P1-${po.poNumber}-${item.id}`,
            orderDate: po.poDate,
            customer: po.customerName,
            product: item.itemId,
            quantity: item.quantity,
            status: 'PENDING',
            department: 'Layup',
            currentDepartment: 'Layup',
            priorityScore: priorityScore,
            dueDate: po.expectedDelivery,
            source: 'p1_purchase_order' as const,
            poId: po.id,
            poItemId: item.id,
            stockModelId: item.itemId, // Use item ID as stock model
            specifications: item.specifications,
            createdAt: po.createdAt,
            updatedAt: po.updatedAt
          });
        }
      }

      // Convert regular orders to unified format
      const regularLayupOrders = layupOrders.map(order => ({
        id: order.id?.toString() || order.orderId,
        orderId: order.orderId,
        orderDate: order.orderDate,
        customer: order.customerId || 'Unknown',
        product: order.modelId || 'Unknown',
        quantity: 1,
        status: order.status,
        department: 'Layup',
        currentDepartment: 'Layup',
        priorityScore: 50, // Regular orders have lower priority
        dueDate: order.dueDate,
        source: 'main_orders' as const,
        stockModelId: order.modelId,
        modelId: order.modelId,
        features: order.features,
        createdAt: order.orderDate,
        updatedAt: order.updatedAt || order.orderDate
      }));

      // Combine P1 order types only
      const combinedOrders = [
        ...regularLayupOrders,
        ...p1LayupOrders
      ].sort((a, b) => ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50));

      console.log(`🏭 P1 layup queue orders count: ${combinedOrders.length}`);
      console.log(`🏭 Regular orders: ${regularLayupOrders.length}, P1 PO orders: ${p1LayupOrders.length}`);
      
      res.json(combinedOrders);
    } catch (error) {
      console.error("P1 layup queue error:", error);
      res.status(500).json({ error: "Failed to fetch P1 layup queue" });
    }
  });

  // P2 Layup Queue endpoint - handles P2 production orders only
  app.get('/api/p2-layup-queue', async (req, res) => {
    try {
      console.log('🏭 Starting P2 layup queue processing...');
      const { storage } = await import('../../storage');

      // Get production orders from P2 system
      const productionOrders = await storage.getAllP2ProductionOrders();
      const pendingProductionOrders = productionOrders.filter(po => po.status === 'PENDING');
      
      const p2LayupOrders = pendingProductionOrders.map(po => {
        // Calculate priority score for production orders (higher priority)
        const dueDate = new Date(po.dueDate || po.createdAt || new Date());
        const today = new Date();
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const priorityScore = Math.max(20, Math.min(35, 20 + Math.floor(daysUntilDue / 2))); // 20-35 range, higher priority
        
        return {
          id: `prod-${po.id}`,
          orderId: po.orderId,
          orderDate: po.createdAt || new Date().toISOString(),
          customer: 'Production Order',
          product: po.partName || po.orderId,
          quantity: po.quantity,
          status: po.status,
          department: po.department,
          currentDepartment: po.department,
          priorityScore: priorityScore,
          dueDate: po.dueDate,
          source: 'production_order' as const,
          productionOrderId: po.id,
          stockModelId: po.orderId, // Use order ID as stock model for mold matching
          specifications: { department: po.department },
          createdAt: po.createdAt || new Date().toISOString(),
          updatedAt: po.updatedAt || po.createdAt || new Date().toISOString()
        };
      });

      console.log(`🏭 P2 layup queue orders count: ${p2LayupOrders.length}`);
      console.log(`🏭 Production orders in P2 result: ${p2LayupOrders.length}`);
      
      res.json(p2LayupOrders);
    } catch (error) {
      console.error("P2 layup queue error:", error);
      res.status(500).json({ error: "Failed to fetch P2 layup queue" });
    }
  });

  // Legacy unified layup queue endpoint (kept for backward compatibility)
  app.get('/api/layup-queue', async (req, res) => {
    try {
      console.log('🏭 Starting unified layup queue processing (legacy)...');
      const { storage } = await import('../../storage');
      
      // Get only finalized orders from draft table that are ready for production
      const allOrders = await storage.getAllOrderDrafts();
      const layupOrders = allOrders.filter(order => 
        order.status === 'FINALIZED' && 
        (order.currentDepartment === 'Layup' || !order.currentDepartment)
      );

      // Get P1 Purchase Orders with stock model items
      const pos = await storage.getAllPurchaseOrders();
      const activePos = pos.filter(po => po.status === 'OPEN');
      
      const p1LayupOrders = [];
      for (const po of activePos) {
        const items = await storage.getPurchaseOrderItems(po.id);
        const stockModelItems = items.filter(item => item.itemId && item.itemId.trim());
        
        for (const item of stockModelItems) {
          // Calculate priority score based on due date urgency
          const dueDate = new Date(po.expectedDelivery || po.poDate);
          const today = new Date();
          const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const priorityScore = Math.max(20, Math.min(35, 20 + daysUntilDue)); // 20-35 range
          
          p1LayupOrders.push({
            id: `p1-${po.id}-${item.id}`,
            orderId: `P1-${po.poNumber}-${item.id}`,
            orderDate: po.poDate,
            customer: po.customerName,
            product: item.itemId,
            quantity: item.quantity,
            status: 'PENDING',
            department: 'Layup',
            currentDepartment: 'Layup',
            priorityScore: priorityScore,
            dueDate: po.expectedDelivery,
            source: 'p1_purchase_order' as const,
            poId: po.id,
            poItemId: item.id,
            stockModelId: item.itemId, // Use item ID as stock model
            specifications: item.specifications,
            createdAt: po.createdAt,
            updatedAt: po.updatedAt
          });
        }
      }

      // Convert regular orders to unified format
      const regularLayupOrders = layupOrders.map(order => ({
        id: order.id?.toString() || order.orderId,
        orderId: order.orderId,
        orderDate: order.orderDate,
        customer: order.customerId || 'Unknown',
        product: order.modelId || 'Unknown',
        quantity: 1,
        status: order.status,
        department: 'Layup',
        currentDepartment: 'Layup',
        priorityScore: 50, // Regular orders have lower priority
        dueDate: order.dueDate,
        source: 'main_orders' as const,
        stockModelId: order.modelId,
        modelId: order.modelId,
        features: order.features,
        createdAt: order.orderDate,
        updatedAt: order.updatedAt || order.orderDate
      }));

      // Combine only P1 order types (no P2 production orders)
      const combinedOrders = [
        ...regularLayupOrders,
        ...p1LayupOrders
      ].sort((a, b) => ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50));

      console.log(`🏭 Legacy layup queue orders count: ${combinedOrders.length}`);
      
      res.json(combinedOrders);
    } catch (error) {
      console.error("Legacy layup queue error:", error);
      res.status(500).json({ error: "Failed to fetch layup queue" });
    }
  });
  
  // Note: Order ID generation routes now handled by modular orders routes

  // Additional routes can be added here as we continue splitting
  // app.use('/api/reports', reportsRoutes);
  // app.use('/api/scheduling', schedulingRoutes);
  // app.use('/api/bom', bomRoutes);
  
  // Create and return HTTP server
  return createServer(app);
}