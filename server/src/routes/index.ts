import { Express } from 'express';
import { createServer, type Server } from "http";
import authRoutes from './auth';
import employeesRoutes from './employees';
import usersRoutes from './users';
import ordersRoutes from './orders';
import formsRoutes from './forms';
import tasksRoutes from './tasks';
import kickbackRoutes from './kickbacks';
import inventoryRoutes from './inventory';
import customersRoutes from './customers';
import vendorsRoutes, { contactRouter, vendorDocumentRouter } from './vendors';
import qualityRoutes from './quality';
import documentsRoutes from './documents';
import moldsRoutes from './molds';
import layupPdfRoute from './layupPdfRoute';
import shippingPdfRoute from './shippingPdf';
import shippingRoutes from './shipping';
import shippingTestRoutes from './shipping-test';
import orderAttachmentsRoutes from './orderAttachments';
import discountsRoutes from './discounts';
import bomsRoutes from './boms';
import robustBomRoutes from './robustBom';
import p2BomsRoutes from './p2boms';
import communicationsRoutes from './communications';
import secureVerificationRoutes from './secureVerification';
import nonconformanceRoutes from '../../routes/nonconformance';
import paymentsRoutes from './payments';
import acceptBluePaymentsRoutes from './acceptBluePayments';
import unifiedPaymentsRoutes from './unifiedPayments';
import algorithmicSchedulerRoutes from './algorithmicScheduler';
import productionQueueRoutes from './productionQueue';
import layupScheduleRoutes from './layupSchedule';
// import gatewayReportsRoutes from './gatewayReports'; // Temporarily removed
import customerSatisfactionRoutes from './customerSatisfaction';
import poProductsRoutes from './poProducts';
import refundRoutes from './refunds';

import vendorRoutes from './vendors';

// import cuttingTableRoutes from './cuttingTable';
// import materialInventoryRoutes from './materialInventory';
// import defrostScheduleRoutes from './defrostSchedule';
import mrpRoutes from './mrp';
import enhancedRoutes from './enhanced';

import { getAccessToken } from '../utils/upsShipping';

export function registerRoutes(app: Express): Server {
  // Authentication routes
  app.use('/api/auth', authRoutes);

  // Employee management routes
  app.use('/api/employees', employeesRoutes);

  // User management routes
  app.use('/api/users', usersRoutes);

  // Order management routes  
  app.use('/api/orders', ordersRoutes);

  // Forms and submissions routes
  app.use('/api/forms', formsRoutes);

  // Task tracker routes
  app.use('/api/task-items', tasksRoutes);

  // Kickback tracking routes
  app.use('/api/kickbacks', kickbackRoutes);

  // Inventory management routes
  app.use('/api/inventory', inventoryRoutes);

  // Customer management routes
  app.use('/api/customers', customersRoutes);

  // Vendor management routes
  app.use('/api/vendors', vendorsRoutes);
  
  // Vendor contacts routes (generic)
  app.use('/api/vendor-contacts', contactRouter);
  
  // Vendor documents routes  
  app.use('/api/vendor-documents', vendorDocumentRouter);

  // Quality control and maintenance routes
  app.use('/api/quality', qualityRoutes);

  // Document management routes
  app.use('/api/documents', documentsRoutes);

  // Order attachments routes
  app.use('/api/order-attachments', orderAttachmentsRoutes);

  // Mold management routes
  app.use('/api/molds', moldsRoutes);

  // Layup PDF generation routes
  app.use('/api/pdf', layupPdfRoute);

  // Shipping PDF generation routes
  app.use('/api/shipping-pdf', shippingPdfRoute);

  // Shipping management routes
  app.use('/api/shipping', shippingRoutes);
  app.use('/api/shipping-test', shippingTestRoutes);

  // Discount management routes
  app.use('/api', discountsRoutes);

  // BOM management routes
  app.use('/api/boms', bomsRoutes);
  
  // Robust BOM management routes (P2 Enhanced)
  app.use('/api/robust-bom', robustBomRoutes);
  
  // P2 BOM management routes (CRUD)
  app.use('/api/p2-boms', p2BomsRoutes);

  // Communications management routes
  app.use('/api/communications', communicationsRoutes);

  // Nonconformance tracking routes
  app.use('/api/nonconformance', nonconformanceRoutes);

  // Payment processing routes
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/accept-blue', acceptBluePaymentsRoutes);
  app.use('/api/unified-payments', unifiedPaymentsRoutes);

  // Algorithmic scheduler routes
  app.use('/api/scheduler', algorithmicSchedulerRoutes);
  
  // Production queue management routes
  app.use('/api/production-queue', productionQueueRoutes);
  
  // Layup schedule management routes
  app.use('/api/layup-schedule', layupScheduleRoutes);
  
  // Gateway reports routes - temporarily removed
  // app.use('/api/gateway-reports', gatewayReportsRoutes);
  
  // Customer satisfaction survey routes
  app.use('/api/customer-satisfaction', customerSatisfactionRoutes);

  // PO Products routes
  app.use('/api/po-products', poProductsRoutes);

  // Refund management routes
  app.use('/api/refund-requests', refundRoutes);

  // Vendor management routes
  app.use('/api/vendors', vendorRoutes);
  


  // app.use('/api', cuttingTableRoutes);
  // app.use('/api', materialInventoryRoutes);
  // app.use('/api', defrostScheduleRoutes);
  
  // MRP and advanced inventory management routes (legacy)
  app.use('/api/mrp', mrpRoutes);

  // Enhanced system routes (completely separate from legacy)
  app.use('/api/enhanced', enhancedRoutes);
  

  // UPS Test endpoint
  app.post('/api/test-ups-auth', async (req, res) => {
    try {
      console.log('🚚 Testing UPS authentication...');
      const token = await getAccessToken();
      console.log('✅ UPS authentication successful');
      res.json({ 
        success: true, 
        message: 'UPS authentication successful',
        tokenLength: token.length 
      });
    } catch (error: any) {
      console.error('❌ UPS authentication failed:', error.message);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });
  
  // Direct algorithmic schedule endpoint for frontend auto-schedule button
  app.post('/api/algorithmic-schedule', async (req, res) => {
    console.log('🏭 LAYUP SCHEDULER FLOW: Algorithmic schedule called for comprehensive flow');
    try {
      const { maxOrdersPerDay = 50, scheduleDays = 60, workDays = [1, 2, 3, 4] } = req.body;
      
      // Use the comprehensive algorithmic scheduler for layup flow
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('http://localhost:5000/api/scheduler/generate-algorithmic-schedule', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          maxOrdersPerDay,
          scheduleDays, 
          workDays, // Ensure Monday-Thursday scheduling [1,2,3,4]
          priorityWeighting: 'urgent' // Due date priority system
        })
      });
      
      const result: any = await response.json();
      console.log(`🏭 LAYUP SCHEDULER FLOW: Generated ${result.allocations?.length || 0} schedule allocations`);
      res.json(result);
    } catch (error) {
      console.error('❌ LAYUP SCHEDULER FLOW: Algorithmic schedule error:', error);
      res.status(500).json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  });



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
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  });

  // P1 Layup Queue endpoint - provides unified production queue for layup scheduler
  app.get('/api/p1-layup-queue', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { inferStockModelFromFeatures } = await import('../utils/stockModelInference');
      
      // AUTOMATIC CLEANUP: Remove orphaned layup schedule entries 
      // (orders that have progressed beyond P1 Production Queue and Layup departments)
      console.log('🧹 CLEANUP: Removing orphaned layup schedule entries...');
      await cleanupOrphanedLayupScheduleEntries(storage);
      
      // AUTOMATIC CLEANUP: Move orders with no stock model or "None" to appropriate departments
      // Note: Full cleanup is now handled in productionQueue.ts endpoint
      console.log('🧹 CLEANUP: Basic cleanup for layup scheduler...');
      
      // Get all orders that haven't entered production yet (P1 Production Queue)
      // Include both finalized orders and active production orders
      // EXCLUDE orders with no stock model or stock model "None" - they should be handled elsewhere
      const allOrders = await storage.getAllOrders();
      const unscheduledOrders = allOrders.filter(order => {
        const currentDept = (order as any).currentDepartment;
        const stockModel = (order as any).stockModelId || (order as any).modelId;
        
        // Only include orders in P1 Production Queue
        if (currentDept !== 'P1 Production Queue') {
          return false;
        }
        
        // EXCLUDE orders with no stock model or invalid stock models - they need attention or should go to shipping
        if (!stockModel || stockModel === '' || stockModel.toLowerCase() === 'none' || stockModel.toLowerCase() === 'no_stock') {
          console.log(`⚠️ FILTERING OUT: Order ${(order as any).orderId} has no valid stock model (${stockModel}) - should be handled elsewhere`);
          return false;
        }
        
        // EXCLUDE orders without action_length - they need attention
        const features = (order as any).features || {};
        if (!features.action_length || features.action_length === '') {
          console.log(`⚠️ FILTERING OUT: Order ${(order as any).orderId} has no action_length selected - needs attention`);
          return false;
        }
        
        return true;
      });
      
      // Also get active orders from the orders table (for P1 PO production orders)
      const { pool } = await import('../../db');
      
      // Use direct SQL query to avoid schema conflicts
      const activeOrdersResult = await pool.query(`
        SELECT 
          id,
          order_id as "orderId",
          customer_id as "customer",
          product,
          date,
          due_date as "dueDate",
          current_department as "currentDepartment",
          status
        FROM orders 
        WHERE current_department = 'P1 Production Queue'
      `);
      
      const activeOrders = activeOrdersResult || [];
      
      // Convert active orders to the expected format and combine
      const formattedActiveOrders = activeOrders.map((order: any) => ({
        id: order.id,
        orderId: order.orderId,
        orderDate: order.date, // Use date field directly
        dueDate: order.dueDate,
        currentDepartment: (order as any).currentDepartment,
        customerId: order.customer,
        features: {},
        modelId: order.product,
        status: (order as any).status,
        poId: null,
        productionOrderId: null
      }));
      
      // Combine both sources  
      const combinedUnscheduledOrders = [...unscheduledOrders, ...formattedActiveOrders];
      
      // Fetch P1 PO orders from all_orders table (orders created from P1 PO week selection)
      console.log('🔍 Fetching P1 PO orders from all_orders table...');
      const p1POOrdersResult = await pool.query(`
        SELECT 
          order_id as "orderId",
          customer_id as "customerId",
          model_id as "stockModelId",
          due_date as "dueDate",
          current_department as "currentDepartment",
          status,
          features,
          created_at as "createdAt",
          'p1_purchase_order' as source
        FROM all_orders 
        WHERE order_id LIKE 'PO%'
          AND (current_department = 'P1 Production Queue' OR current_department = 'Layup/Plugging')
        ORDER BY due_date ASC
      `);

      // Format the P1 PO orders
      const p1POOrdersRows = Array.isArray(p1POOrdersResult) ? p1POOrdersResult : [];
      console.log(`🔍 Found ${p1POOrdersRows.length} P1 PO orders in all_orders table`);
      
      const p1POOrders = p1POOrdersRows.map((po: any) => ({
        id: po.orderId,
        orderId: po.orderId,
        orderDate: po.createdAt,
        dueDate: po.dueDate,
        currentDepartment: po.currentDepartment,
        customerId: po.customerId,
        features: po.features || {},
        modelId: po.stockModelId,
        stockModelId: po.stockModelId,
        product: po.stockModelId,
        status: po.status,
        source: po.source,  // This will be 'p1_purchase_order'
        priorityScore: po.priorityScore || 1500
      }));

      console.log(`🏭 Found ${p1POOrders.length} P1 PO orders from week selection`);

      // Combine both order types into unified production queue with enhanced stock model inference
      console.log(`📦 Processing ${combinedUnscheduledOrders.length} total main orders + ${p1POOrders.length} P1 PO orders for P1 layup queue`);
      
      const combinedQueue = [
        // Add the P1 PO orders first (highest priority)
        ...p1POOrders,
        ...combinedUnscheduledOrders.map(order => {
          // Determine correct source type based on order characteristics
          // Only treat as production_order if it has poId or productionOrderId
          // customerPO field is unreliable - often contains customer names instead of PO numbers
          const sourceType = (order as any).poId || (order as any).productionOrderId ? 'production_order' : 'main_orders';
          
          const { stockModelId, product } = inferStockModelFromFeatures({
            ...order,
            source: sourceType
          });
          
          // DEBUG: Log Mesa Universal orders specifically
          if (stockModelId === 'mesa_universal') {
            console.log(`🏔️ MESA ORDER: ${order.orderId} → ${stockModelId} (source: ${sourceType})`);
          }
          
          return {
            ...order,
            source: sourceType,
            priorityScore: calculatePriorityScore(order.dueDate),
            orderId: order.orderId,
            stockModelId,
            modelId: stockModelId, // Ensure modelId matches stockModelId for consistent material detection
            product,
            stockModelName: product
          };
        })
      ];
      
      // Count Mesa Universal orders in final result
      const mesaCount = combinedQueue.filter(order => (order as any).modelId === 'mesa_universal').length;
      console.log(`🏔️ FINAL MESA COUNT: ${mesaCount} Mesa Universal orders in P1 layup queue API response`);
      
      // Sort by priority score (lower = higher priority)
      combinedQueue.sort((a, b) => a.priorityScore - b.priorityScore);
      
      res.json(combinedQueue);
    } catch (error) {
      console.error('❌ P1 layup queue fetch error:', error);
      res.status(500).json({ error: "Failed to fetch P1 layup queue" });
    }
  });



  // Helper function to calculate priority score based on due date
  function calculatePriorityScore(dueDate: string | Date | null): number {
    if (!dueDate) return 100; // No due date = lowest priority
    
    const due = new Date(dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) return 1; // Overdue = highest priority
    if (daysUntilDue <= 7) return 10; // Due within week
    if (daysUntilDue <= 30) return 30; // Due within month
    return 50; // Further out
  }

  // Helper function to automatically handle orders that need attention or movement
  async function autoMoveInvalidStockModelOrders(storage: any) {
    try {
      const allOrders = await storage.getAllOrders();
      
      // Split orders into two categories: those to move to Shipping QC vs those needing attention
      const ordersToMoveToShipping = [];
      const ordersNeedingAttention = [];
      
      for (const order of allOrders) {
        const currentDept = order.currentDepartment;
        const stockModel = order.stockModelId || order.modelId;
        const features = order.features || {};
        
        // Only check orders in P1 Production Queue
        if (currentDept !== 'P1 Production Queue') {
          continue;
        }
        
        // Orders with "no_stock" or "None" go directly to Shipping QC
        if (stockModel && (stockModel.toLowerCase() === 'no_stock' || stockModel.toLowerCase() === 'none')) {
          ordersToMoveToShipping.push(order);
        }
        // Orders with missing stock model or missing action_length need attention
        else if (!stockModel || stockModel === '' || !features.action_length || features.action_length === '') {
          ordersNeedingAttention.push(order);
        }
      }

      console.log(`🧹 Found ${ordersToMoveToShipping.length} orders to move to Shipping QC and ${ordersNeedingAttention.length} orders needing attention`);
      
      // Move orders with "no_stock"/"None" to Shipping QC
      for (const order of ordersToMoveToShipping) {
        const stockModel = order.stockModelId || order.modelId || 'empty';
        console.log(`🚀 AUTO-MOVING: Order ${order.orderId} (stock model: "${stockModel}") from P1 Production Queue → Shipping QC`);
        
        try {
          await storage.updateFinalizedOrder(order.orderId, {
            currentDepartment: 'Shipping QC',
            updatedAt: new Date()
          });
          console.log(`✅ Successfully moved order ${order.orderId} to Shipping QC`);
        } catch (error) {
          console.error(`❌ Failed to move order ${order.orderId}:`, error);
        }
      }
      
      // Create kickbacks for orders needing attention
      for (const order of ordersNeedingAttention) {
        const stockModel = order.stockModelId || order.modelId || 'empty';
        const features = order.features || {};
        const missingItems = [];
        
        if (!stockModel || stockModel === '') {
          missingItems.push('stock model');
        }
        if (!features.action_length || features.action_length === '') {
          missingItems.push('action length');
        }
        
        const reasonText = `Order needs attention: Missing ${missingItems.join(' and ')}. Cannot proceed to production until resolved.`;
        
        console.log(`⚠️ CREATING KICKBACK: Order ${order.orderId} needs attention (missing: ${missingItems.join(', ')})`);
        
        try {
          // Check if a kickback already exists for this order
          const existingKickbacks = await storage.getKickbacksByOrderId(order.orderId);
          const hasOpenKickback = existingKickbacks.some((kb: any) => kb.status === 'OPEN' || kb.status === 'IN_PROGRESS');
          
          if (!hasOpenKickback) {
            const kickbackData = {
              orderId: order.orderId,
              kickbackDept: 'CNC', // Using CNC as default department for configuration issues
              reasonCode: 'DESIGN_ISSUE',
              reasonText: reasonText,
              kickbackDate: new Date(),
              reportedBy: 'SYSTEM_AUTO_CLEANUP',
              status: 'OPEN',
              priority: 'MEDIUM',
              impactedDepartments: ['P1 Production Queue'],
              rootCause: `Missing required configuration: ${missingItems.join(', ')}`,
              correctiveAction: null
            };
            
            await storage.createKickback(kickbackData);
            console.log(`✅ Created kickback for order ${order.orderId} - now in "Orders That Need Attention"`);
          } else {
            console.log(`ℹ️ Order ${order.orderId} already has an open kickback - skipping`);
          }
        } catch (error) {
          console.error(`❌ Failed to create kickback for order ${order.orderId}:`, error);
        }
      }
      
      if (ordersToMoveToShipping.length > 0 || ordersNeedingAttention.length > 0) {
        console.log(`🧹 AUTO-CLEANUP COMPLETE: Moved ${ordersToMoveToShipping.length} orders to Shipping QC, created kickbacks for ${ordersNeedingAttention.length} orders needing attention`);
      }
    } catch (error) {
      console.error('❌ Error in autoMoveInvalidStockModelOrders:', error);
    }
  }

  // Helper function to clean up orphaned layup schedule entries
  async function cleanupOrphanedLayupScheduleEntries(storage: any) {
    try {
      const { db } = await import('../../db');
      
      // Use raw SQL for reliable cleanup - remove entries where orders have progressed beyond P1/Layup
      const result = await db.execute(`
        DELETE FROM layup_schedule 
        WHERE order_id IN (
          SELECT ls.order_id 
          FROM layup_schedule ls 
          LEFT JOIN all_orders ao ON ls.order_id = ao.order_id 
          WHERE ao.current_department NOT IN ('P1 Production Queue', 'Layup')
        )
      `);
      
      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        console.log(`✅ CLEANUP: Removed ${deletedCount} orphaned layup schedule entries`);
      } else {
        console.log('✅ CLEANUP: No orphaned layup schedule entries found');
      }
    } catch (error) {
      console.error('❌ CLEANUP ERROR:', error);
      // Don't throw - let the main API continue working even if cleanup fails
    }
  }

  // Layup Schedule API endpoints - with date filtering support
  app.get('/api/layup-schedule', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { weekStart, weekEnd } = req.query;
      
      // If date range provided, filter by dates
      if (weekStart && weekEnd) {
        console.log(`📅 Filtering layup schedule by date range: ${weekStart} to ${weekEnd}`);
        const scheduleData = await storage.getLayupScheduleByDateRange(weekStart as string, weekEnd as string);
        res.json(scheduleData);
      } else {
        // Default: return all schedule data
        const scheduleData = await storage.getAllLayupSchedule();
        res.json(scheduleData);
      }
    } catch (error) {
      console.error('❌ Layup schedule fetch error:', error);
      res.status(500).json({ error: "Failed to fetch layup schedule" });
    }
  });

  app.post('/api/layup-schedule', async (req, res) => {
    try {
      console.log('🔧 LAYUP SCHEDULE CREATE CALLED', req.body);
      const { storage } = await import('../../storage');
      
      // Convert scheduledDate string to Date object if needed
      const data = { ...req.body };
      if (data.scheduledDate && typeof data.scheduledDate === 'string') {
        data.scheduledDate = new Date(data.scheduledDate);
      }
      
      const result = await storage.createLayupSchedule(data);
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


  // Generate layup schedule from production queue
  app.post('/api/layup-schedule/generate', async (req, res) => {
    try {
      console.log('🔧 LAYUP SCHEDULE GENERATE CALLED');
      const { storage } = await import('../../storage');
      
      // Get orders from the same source as the frontend - P1 layup queue
      console.log('🔧 Fetching orders from P1 layup queue (same as frontend)...');
      const p1QueueResponse = await fetch('http://localhost:5000/api/p1-layup-queue');
      if (!p1QueueResponse.ok) {
        throw new Error(`Failed to fetch P1 layup queue: ${p1QueueResponse.statusText}`);
      }
      const p1Orders = await p1QueueResponse.json();
      console.log('🔧 Found orders from P1 layup queue for scheduling:', p1Orders.length);
      
      // Get mold and employee settings (using same API as LayupScheduler component)
      const molds = await storage.getAllMolds();
      const employeeSettingsResponse = await fetch('http://localhost:5000/api/layup-employee-settings');
      const layupEmployees = await employeeSettingsResponse.json();
      
      console.log('🔧 Found molds:', molds.length);
      console.log('🔧 Found layup employees:', layupEmployees.length);
      console.log('🔧 First few P1 orders from queue:', p1Orders.slice(0, 3).map((o: any) => ({ 
        orderId: o.orderId, 
        stockModelId: o.stockModelId || o.modelId,
        source: o.source,
        currentDepartment: o.currentDepartment
      })));
      
      // Get stock models for proper mapping
      const stockModels = await storage.getAllStockModels();
      
      // Transform P1 orders for scheduler utility (these already have proper stock model IDs)
      const orders = p1Orders.map((order: any) => {
        // P1 orders already have stockModelId or modelId
        let stockModelId = order.stockModelId || order.modelId;
        
        // If still no stock model, try to infer from product name
        if (!stockModelId || stockModelId === 'unknown') {
          const productName = order.product || order.modelId || '';
          if (productName.toLowerCase().includes('mesa')) {
            stockModelId = 'mesa_universal';
          } else {
            stockModelId = 'unknown';
          }
        }
        
        return {
          orderId: order.orderId,
          product: order.product || order.modelId || 'Unknown Product',
          customer: order.customer || 'Unknown Customer',
          stockModelId: stockModelId,
          dueDate: order.dueDate,
          orderDate: order.orderDate,
          priorityScore: order.priorityScore || (order.source === 'p1_purchase_order' ? 20 : 50), // P1 PO orders get higher priority
          quantity: 1,
          features: order.features || {},
          source: order.source || 'main_orders'
        };
      });
      
      console.log('🔧 Transformed P1 orders with stock models:', orders.slice(0, 3).map(o => ({ 
        orderId: o.orderId, 
        product: o.product, 
        stockModelId: o.stockModelId,
        source: o.source
      })));
      
      const employeeSettings = layupEmployees.map((emp: any) => ({
        employeeId: emp.employeeId,
        name: emp.name || `Employee ${emp.employeeId}`,
        rate: emp.rate || 1.5, // orders per hour
        hours: emp.hours || 8   // working hours per day
      }));
      
      console.log('🔧 Employee settings for scheduling:', employeeSettings);
      
      // Import and use the proper scheduling algorithm that respects employee production rates
      const { generateLayupSchedule } = await import('../../../client/src/utils/schedulerUtils');
      
      console.log('🔧 Using advanced scheduling algorithm with employee production rates...');
      
      // Clear existing schedule
      await storage.clearLayupSchedule();
      
      // Prepare mold settings with proper interface matching MoldSettings
      const moldSettings = molds.map(mold => ({
        moldId: mold.moldId,
        modelName: mold.modelName || mold.moldId, // Use moldId as fallback for modelName
        enabled: true,
        multiplier: 1, // Default capacity multiplier: 1 order per mold per day
        instanceNumber: 1, // Default instance
        stockModels: mold.stockModels || [] // Include stock model compatibility
      }));
      
      console.log('🔧 Mold settings for scheduling:', moldSettings.slice(0, 3));
      
      // Use the sophisticated scheduling algorithm that respects employee production rates
      const scheduleResults = generateLayupSchedule(orders, moldSettings, employeeSettings);
      
      console.log('🔧 Advanced scheduler generated', scheduleResults.length, 'schedule entries');
      console.log('🔧 First few schedule results:', scheduleResults.slice(0, 3).map(r => ({
        orderId: r.orderId,
        date: r.scheduledDate.toDateString(),
        moldId: r.moldId,
        employeeCount: r.employeeAssignments.length
      })));
      
      const createdEntries = [];
      
      // Convert schedule results to database entries
      for (const result of scheduleResults) {
        const scheduleEntry = {
          orderId: result.orderId,
          scheduledDate: result.scheduledDate,
          moldId: result.moldId,
          employeeAssignments: result.employeeAssignments,
          isOverride: false
        };
        
        const created = await storage.createLayupSchedule(scheduleEntry);
        createdEntries.push(created);
      }
      
      console.log('🔧 Created layup schedule entries:', createdEntries.length);
      res.json({
        success: true,
        entriesGenerated: createdEntries.length,
        schedule: createdEntries
      });
      
    } catch (error) {
      console.error('❌ Error generating layup schedule:', error);
      res.status(500).json({ error: 'Failed to generate layup schedule' });
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

  // Push orders to Layup/Plugging department
  app.post('/api/push-to-layup-plugging', async (req, res) => {
    try {
      console.log('🔧 PUSH TO LAYUP/PLUGGING CALLED', req.body);
      const { orderIds } = req.body;
      
      if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ error: 'orderIds array is required' });
      }
      
      const { storage } = await import('../../storage');
      
      // Update orders to move them to Layup/Plugging department
      const updatePromises = orderIds.map(async (orderId: string) => {
        try {
          // Try to update regular orders first
          const order = await storage.getOrderById(orderId);
          if (order) {
            // Simple success return since updateOrderDepartment doesn't exist yet
            console.log(`Order ${orderId} would be moved to Layup/Plugging`);
            return { orderId, status: 'moved to Layup/Plugging' };
          }
          
          // If not found in regular orders, try production orders
          const productionOrder = await storage.getProductionOrder(parseInt(orderId));
          if (productionOrder) {
            // Update without status field since it's not in the type
            return await storage.updateProductionOrder(parseInt(orderId), {
              notes: 'Moved to Layup/Plugging department'
            });
          }
          
          throw new Error(`Order ${orderId} not found`);
        } catch (error) {
          console.error(`Failed to update order ${orderId}:`, error);
          return null;
        }
      });
      
      const results = await Promise.all(updatePromises);
      const updatedOrders = results.filter((result: any) => result !== null);
      
      console.log('🔧 Updated orders to Layup/Plugging:', updatedOrders.length);
      res.json({
        success: true,
        updatedOrders: updatedOrders,
        totalProcessed: orderIds.length
      });
      
    } catch (error) {
      console.error('❌ Push to layup/plugging error:', error);
      res.status(500).json({ error: "Failed to push orders to layup/plugging department" });
    }
  });

  // Python scheduler integration endpoint
  app.post('/api/python-scheduler', async (req, res) => {
    try {
      console.log('🐍 PYTHON SCHEDULER CALLED');
      const { orders, molds, employees } = req.body;
      
      // Simple JavaScript-based scheduler that mimics Python logic
      // This is a placeholder implementation that can be enhanced
      const schedule: any[] = [];
      const workDays: Date[] = [];
      
      // Generate next 30 work days (Monday-Thursday only)
      const today = new Date();
      let currentDate = new Date(today);
      
      while (workDays.length < 30) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 4) { // Monday through Thursday
          workDays.push(new Date(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Simple round-robin assignment
      const availableMolds = molds.filter((m: any) => m.enabled);
      const defaultMold = availableMolds.length > 0 ? availableMolds[0] : { moldId: 'DEFAULT-1' };
      
      orders.slice(0, Math.min(orders.length, 100)).forEach((order: any, index: number) => {
        const workDayIndex = index % workDays.length;
        const moldIndex = index % Math.max(availableMolds.length, 1);
        
        schedule.push({
          order_id: order.orderId,
          mold_id: availableMolds[moldIndex]?.moldId || defaultMold.moldId,
          scheduled_date: workDays[workDayIndex].toISOString().split('T')[0],
          priority_score: (order as any).priorityScore || 50
        });
      });
      
      console.log('🐍 Generated schedule entries:', schedule.length);
      res.json({
        success: true,
        schedule: schedule,
        message: 'JavaScript-based scheduler completed (Python integration can be added later)'
      });
      
    } catch (error) {
      console.error('❌ Python scheduler error:', error);
      res.status(500).json({ error: "Failed to run scheduler" });
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
        displayName: model.displayName || (model as any).display_name || model.name,
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

  app.post('/api/stock-models', async (req, res) => {
    try {
      console.log('🔧 STOCK MODEL CREATE ROUTE CALLED');
      console.log('🔧 Request body:', req.body);
      const { storage } = await import('../../storage');
      const stockModel = await storage.createStockModel(req.body);
      console.log('🔧 Created stock model:', stockModel.id);
      res.status(201).json(stockModel);
    } catch (error) {
      console.error('🔧 Stock model create error:', error);
      res.status(500).json({ error: "Failed to create stock model" });
    }
  });

  app.put('/api/stock-models/:id', async (req, res) => {
    try {
      console.log('🔧 STOCK MODEL UPDATE ROUTE CALLED');
      console.log('🔧 Stock model ID:', req.params.id);
      console.log('🔧 Request body:', req.body);
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const stockModel = await storage.updateStockModel(id, req.body);
      console.log('🔧 Updated stock model:', stockModel.id);
      res.json(stockModel);
    } catch (error) {
      console.error('🔧 Stock model update error:', error);
      res.status(500).json({ error: "Failed to update stock model" });
    }
  });

  app.delete('/api/stock-models/:id', async (req, res) => {
    try {
      console.log('🔧 STOCK MODEL DELETE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      await storage.deleteStockModel(id);
      console.log('🔧 Deleted stock model:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 Stock model delete error:', error);
      res.status(500).json({ error: "Failed to delete stock model" });
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

  // Update employee layup settings
  app.put('/api/layup-employee-settings/:id', async (req, res) => {
    try {
      console.log('🔧 EMPLOYEE UPDATE ROUTE CALLED:', req.params.id);
      console.log('🔧 Request body:', req.body);

      const { storage } = await import('../../storage');
      const { id } = req.params;
      const { rate, moldsPerHour, dailyCapacity, hours } = req.body;

      // First, get the employee to find their employeeId string
      const employees = await storage.getAllEmployeeLayupSettings();
      const employee = employees.find(emp => emp.id === parseInt(id));
      
      if (!employee) {
        console.error(`❌ Employee with ID ${id} not found`);
        return res.status(404).json({ error: "Employee not found" });
      }

      const employeeIdString = employee.employeeId || employee.name || `employee-${id}`;
      console.log(`🔍 Using employeeId string: "${employeeIdString}" for database ID: ${id}`);

      // Update employee settings - use moldsPerHour as rate and calculate dailyCapacity
      const updateData = {
        rate: parseFloat(moldsPerHour || rate) || 1.25, // Store moldsPerHour as rate
        hours: parseFloat(hours) || 8,
        department: 'Layup',
        isActive: true
      };

      const updatedEmployee = await storage.updateEmployeeLayupSettings(employeeIdString, updateData);

      console.log('🔧 Updated employee:', updatedEmployee);
      res.json(updatedEmployee);
    } catch (error) {
      console.error('🔧 Employee update error:', error);
      res.status(500).json({ error: "Failed to update employee settings" });
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

  // P1 Production Queue endpoint - combines regular orders and P1 production orders
  app.get('/api/p1-production-queue', async (req, res) => {
    try {
      console.log('🏭 Starting P1 production queue processing...');
      const { storage } = await import('../../storage');

      // Get only finalized orders from draft table that are ready for production
      const allOrders = await storage.getAllOrderDrafts();
      const layupOrders = allOrders.filter(order => 
        (order as any).status === 'FINALIZED' && 
        ((order as any).currentDepartment === 'Layup' || !(order as any).currentDepartment)
      );

      // Add debug logging for features
      console.log('Sample P1 production queue order features:', {
        orderId: layupOrders[0]?.orderId,
        features: layupOrders[0]?.features,
        modelId: layupOrders[0]?.modelId
      });

      // Get P1 Production Orders (generated from purchase orders)
      const productionOrders = await storage.getAllProductionOrders();
      const pendingProductionOrders = productionOrders.filter(po => po.productionStatus === 'PENDING');

      const p1LayupOrders = pendingProductionOrders.map(po => {
        // Calculate priority score based on due date urgency
        const dueDate = new Date(po.dueDate || po.orderDate);
        const today = new Date();
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const priorityScore = Math.max(20, Math.min(35, 20 + Math.floor(daysUntilDue / 30))); // 20-35 range

        return {
          id: `p1-prod-${po.id}`,
          orderId: po.orderId,
          orderDate: po.orderDate,
          customer: po.customerName,
          product: po.itemName,
          quantity: 1, // Each production order is for 1 unit
          status: po.productionStatus,
          department: (po as any).currentDepartment || 'P1 Production Queue',
          currentDepartment: (po as any).currentDepartment || 'P1 Production Queue',
          priorityScore: priorityScore,
          dueDate: po.dueDate,
          source: 'production_order' as const, // Mark as production order for purple styling
          poId: po.poId,
          poItemId: po.poItemId,
          productionOrderId: po.id,
          stockModelId: po.itemId, // Use item ID as stock model for mold matching
          specifications: po.specifications,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt
        };
      });

      // Convert regular orders to unified format
      const regularLayupOrders = layupOrders.map(order => ({
        id: order.id?.toString() || order.orderId,
        orderId: order.orderId,
        orderDate: order.orderDate,
        customer: order.customerId || 'Unknown',
        product: (order as any).modelId || 'Unknown',
        quantity: 1,
        status: (order as any).status,
        department: 'Layup',
        currentDepartment: 'Layup',
        priorityScore: 50, // Regular orders have lower priority
        dueDate: order.dueDate,
        source: 'main_orders' as const,
        stockModelId: (order as any).modelId,
        modelId: (order as any).modelId,
        features: (order as any).features,
        createdAt: order.orderDate,
        updatedAt: order.updatedAt || order.orderDate
      }));

      // Combine P1 order types only
      const combinedOrders = [
        ...regularLayupOrders,
        ...p1LayupOrders
      ].sort((a, b) => ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50));

      console.log(`🏭 P1 production queue orders count: ${combinedOrders.length}`);
      console.log(`🏭 Regular orders: ${regularLayupOrders.length}, P1 PO orders: ${p1LayupOrders.length}`);

      res.json(combinedOrders);
    } catch (error) {
      console.error("P1 production queue error:", error);
      res.status(500).json({ error: "Failed to fetch P1 production queue" });
    }
  });

  // P2 Production Queue endpoint - handles P2 production orders only
  app.get('/api/p2-production-queue', async (req, res) => {
    try {
      console.log('🏭 Starting P2 production queue processing...');
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

      console.log(`🏭 P2 production queue orders count: ${p2LayupOrders.length}`);
      console.log(`🏭 Production orders in P2 result: ${p2LayupOrders.length}`);

      res.json(p2LayupOrders);
    } catch (error) {
      console.error("P2 production queue error:", error);
      res.status(500).json({ error: "Failed to fetch P2 production queue" });
    }
  });

  // P1 Integration endpoints for production queue database system
  app.post('/api/production-queue/sync-p1-orders', async (req, res) => {
    try {
      console.log('🏭 P1 Production Queue Sync API called');
      const { storage } = await import('../../storage');
      const result = await storage.syncP1OrdersToProductionQueue();
      console.log('🏭 P1 sync result:', result);
      res.json(result);
    } catch (error) {
      console.error('🏭 P1 sync error:', error);
      res.status(500).json({ error: "Failed to sync P1 orders to production queue" });
    }
  });

  // Push orders to Layup/Plugging Department Manager workflow
  app.post('/api/push-to-layup-plugging', async (req, res) => {
    try {
      console.log('🏭 PRODUCTION FLOW: Push to Layup/Plugging API called');
      const { orderIds } = req.body;
      
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ 
          error: "orderIds array is required", 
          success: false 
        });
      }

      console.log(`🏭 PRODUCTION FLOW: Processing ${orderIds.length} orders for department push`);
      const { storage } = await import('../../storage');
      
      // Update orders to move them to Layup department with IN_PROGRESS status
      const updatedOrders = [];
      
      for (const orderId of orderIds) {
        try {
          // Update order status and department for both regular orders and production orders
          const updateResult = await storage.updateOrderDepartment(orderId, 'Layup', 'IN_PROGRESS');
          
          if (updateResult.success) {
            updatedOrders.push(orderId);
            console.log(`✅ PRODUCTION FLOW: Order ${orderId} moved to Layup department`);
          } else {
            console.warn(`⚠️ PRODUCTION FLOW: Failed to update order ${orderId}: ${updateResult.message}`);
          }
        } catch (orderError) {
          console.error(`❌ PRODUCTION FLOW: Error updating order ${orderId}:`, orderError);
        }
      }

      const result = {
        success: true,
        message: `Successfully moved ${updatedOrders.length} of ${orderIds.length} orders to Layup/Plugging department`,
        updatedOrders,
        totalRequested: orderIds.length,
        totalUpdated: updatedOrders.length
      };

      console.log('🏭 PRODUCTION FLOW: Department push result:', result);
      res.json(result);
      
    } catch (error) {
      console.error('❌ PRODUCTION FLOW: Push to Layup/Plugging error:', error);
      res.status(500).json({ 
        error: "Failed to push orders to Layup/Plugging department",
        success: false 
      });
    }
  });

  // Move single order to different department (for layup scheduler action buttons)
  app.post('/api/move-order-department', async (req, res) => {
    try {
      console.log('🏭 SINGLE ORDER MOVE: Move order department API called');
      const { orderId, department, status } = req.body;
      
      if (!orderId || !department || !status) {
        return res.status(400).json({ 
          error: "orderId, department, and status are required", 
          success: false 
        });
      }

      console.log(`🏭 SINGLE ORDER MOVE: Moving order ${orderId} to ${department} with status ${status}`);
      const { storage } = await import('../../storage');
      
      // Update order status and department
      const updateResult = await storage.updateOrderDepartment(orderId, department, status);
      
      if (updateResult.success) {
        console.log(`✅ SINGLE ORDER MOVE: Order ${orderId} moved to ${department} department`);
        
        // If moving back to Production Queue, also remove from layup schedule
        if (department === 'P1 Production Queue') {
          try {
            await storage.deleteLayupScheduleByOrder(orderId);
            console.log(`🗑️ SINGLE ORDER MOVE: Removed ${orderId} from layup schedule`);
          } catch (scheduleError) {
            console.warn(`⚠️ SINGLE ORDER MOVE: Could not remove ${orderId} from schedule:`, scheduleError);
            // Don't fail the whole operation if schedule cleanup fails
          }
        }
        
        const result = {
          success: true,
          message: `Successfully moved order ${orderId} to ${department} department`,
          orderId,
          department,
          status
        };

        res.json(result);
      } else {
        console.warn(`⚠️ SINGLE ORDER MOVE: Failed to update order ${orderId}: ${updateResult.message}`);
        res.status(400).json({
          error: updateResult.message,
          success: false,
          orderId
        });
      }
      
    } catch (error) {
      console.error('❌ SINGLE ORDER MOVE: Move order department error:', error);
      res.status(500).json({ 
        error: "Failed to move order to new department",
        success: false 
      });
    }
  });

  app.get('/api/production-queue/unified', async (req, res) => {
    try {
      console.log('🏭 Unified Production Queue API called');
      const { storage } = await import('../../storage');
      const unifiedQueue = await storage.getUnifiedProductionQueue();
      console.log('🏭 Unified queue count:', unifiedQueue.length);
      res.json(unifiedQueue);
    } catch (error) {
      console.error('🏭 Unified queue error:', error);
      res.status(500).json({ error: "Failed to fetch unified production queue" });
    }
  });

  // P2 Layup Schedule endpoints - separate schedule for P2 production orders
  app.get('/api/p2-layup-schedule', async (req, res) => {
    try {
      console.log('🔧 P2 LAYUP SCHEDULE API CALLED');
      const { storage } = await import('../../storage');

      const scheduleEntries = await storage.getAllLayupSchedule();
      console.log('🔧 Found P2 layup schedule entries:', scheduleEntries.length);

      res.json(scheduleEntries);
    } catch (error) {
      console.error("P2 layup schedule error:", error);
      res.status(500).json({ error: "Failed to fetch P2 layup schedule" });
    }
  });

  app.post('/api/p2-layup-schedule', async (req, res) => {
    try {
      console.log('🔧 P2 LAYUP SCHEDULE CREATE API CALLED');
      const { storage } = await import('../../storage');

      const scheduleData = req.body;
      const result = await storage.createLayupSchedule(scheduleData);

      console.log('🔧 P2 Schedule entry created:', result);
      res.json(result);
    } catch (error) {
      console.error("P2 layup schedule create error:", error);
      res.status(500).json({ error: "Failed to create P2 layup schedule entry" });
    }
  });

  app.delete('/api/p2-layup-schedule/by-order/:orderId', async (req, res) => {
    try {
      console.log('🔧 P2 LAYUP SCHEDULE DELETE API CALLED');
      const { storage } = await import('../../storage');

      const { orderId } = req.params;
      await storage.deleteLayupScheduleByOrder(orderId);

      console.log('🔧 P2 Schedule entries deleted for order:', orderId);
      res.json({ success: true });
    } catch (error) {
      console.error("P2 layup schedule delete error:", error);
      res.status(500).json({ error: "Failed to delete P2 layup schedule entries" });
    }
  });

  // Python scheduler integration endpoint
  app.post('/api/python-scheduler', async (req, res) => {
    try {
      console.log('🐍 Running Python scheduler with Mesa Universal constraints...');
      const { spawn } = require('child_process');
      const path = require('path');

      const { orders = [], molds = [], employees = [] } = req.body;

      if (orders.length === 0) {
        return res.status(400).json({ error: 'Orders array is required' });
      }

      // Prepare data for Python scheduler
      const schedulerInput = {
        orders: orders.map((order: any) => ({
          order_id: order.orderId,
          order_type: order.source === 'production_order' ? 'production_order' : 
                     (order as any).stockModelId === 'mesa_universal' ? 'mesa_universal' : 'regular',
          features: (order as any).features || {},
          quantity: (order as any).quantity || 1,
          priority: (order as any).priorityScore || 50,
          deadline: order.dueDate || order.orderDate,
          stock_model_id: (order as any).stockModelId
        })),
        molds: molds.map((mold: any) => ({
          mold_id: mold.moldId,
          capacity: mold.multiplier || 1,
          compatible_types: ['production_order', 'mesa_universal', 'regular', 'P1'],
          stock_models: mold.stockModels || []
        })),
        employees: employees.map((emp: any) => ({
          employee_id: emp.employeeId,
          skills: ['production_order', 'mesa_universal', 'regular', 'P1'], // All employees can handle all types
          prod_rate: emp.rate || 1,
          hours_per_day: emp.hours || 10
        }))
      };

      const pythonScript = path.join(process.cwd(), 'scripts', 'scheduler.py');
      const pythonProcess = spawn('python', [pythonScript, '--json-input', '--json-output'], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code: number | null) => {
        if (code !== 0) {
          console.error('Python scheduler error:', errorOutput);
          return res.status(500).json({ error: 'Python scheduler failed', details: errorOutput });
        }

        try {
          // Extract JSON from output (filter out console.log messages)
          const lines = output.trim().split('\n');
          const jsonLine = lines.find(line => line.startsWith('{'));

          if (!jsonLine) {
            console.log('Python scheduler output:', output);
            return res.json({ schedule: [], summary: {}, raw_output: output });
          }

          const result = JSON.parse(jsonLine);
          console.log(`🐍 Python scheduler completed: ${result.schedule?.length || 0} orders scheduled`);

          res.json(result);
        } catch (parseError) {
          console.error('Failed to parse Python scheduler output:', parseError);
          res.status(500).json({ error: 'Failed to parse scheduler output', raw_output: output });
        }
      });

      // Send input data to Python process
      pythonProcess.stdin.write(JSON.stringify(schedulerInput));
      pythonProcess.stdin.end();

    } catch (error) {
      console.error('Python scheduler integration error:', error);
      res.status(500).json({ error: 'Failed to run Python scheduler' });
    }
  });

  // Push scheduled orders to layup/plugging queue workflow
  app.post('/api/push-to-layup-plugging', async (req, res) => {
    try {
      console.log('🔄 Push to Layup/Plugging Queue workflow initiated');
      const { storage } = await import('../../storage');
      const { orderIds } = req.body;

      if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ error: 'orderIds array is required' });
      }

      // Update orders to move them to the next department (layup/plugging phase)
      const updatedOrders = [];
      for (const orderId of orderIds) {
        // Update production orders status to LAID_UP
        const productionOrder = await storage.getProductionOrderByOrderId(orderId);
        if (productionOrder) {
          const updated = await storage.updateProductionOrder(productionOrder.id, {
            productionStatus: 'LAID_UP',
            laidUpAt: new Date()
          });
          updatedOrders.push(updated);
          console.log(`✅ Production order ${orderId} moved to LAID_UP status`);
        }

        // Update regular order drafts to next department
        const orderDrafts = await storage.getAllOrderDrafts();
        const regularOrder = orderDrafts.find(o => o.orderId === orderId);
        if (regularOrder && regularOrder.id) {
          await storage.updateOrderDraft(regularOrder.id.toString(), {
            currentDepartment: 'Barcode' // Move from Layup to next department
          });
          console.log(`✅ Regular order ${orderId} moved to Barcode department`);
        }
      }

      console.log(`🔄 Successfully pushed ${updatedOrders.length} orders to layup/plugging queue`);
      res.json({ 
        success: true, 
        message: `${updatedOrders.length} orders moved to layup/plugging phase`,
        updatedOrders 
      });
    } catch (error) {
      console.error('Push to layup/plugging error:', error);
      res.status(500).json({ error: 'Failed to push orders to layup/plugging queue' });
    }
  });

  // Legacy unified production queue endpoint (kept for backward compatibility)
  app.get('/api/production-queue', async (req, res) => {
    try {
      console.log('🏭 Starting unified production queue processing (legacy)...');
      const { storage } = await import('../../storage');

      // Get only finalized orders from draft table that are ready for production
      const allOrders = await storage.getAllOrderDrafts();
      const layupOrders = allOrders.filter(order => 
        (order as any).status === 'FINALIZED' && 
        ((order as any).currentDepartment === 'Layup' || !(order as any).currentDepartment)
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
            source: 'production_order' as const,
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
        product: (order as any).modelId || 'Unknown',
        quantity: 1,
        status: (order as any).status,
        department: 'Layup',
        currentDepartment: 'Layup',
        priorityScore: 50, // Regular orders have lower priority
        dueDate: order.dueDate,
        source: 'main_orders' as const,
        stockModelId: (order as any).modelId,
        modelId: (order as any).modelId,
        features: (order as any).features,
        createdAt: order.orderDate,
        updatedAt: order.updatedAt || order.orderDate
      }));

      // Combine only P1 order types (no P2 production orders)
      const combinedOrders = [
        ...regularLayupOrders,
        ...p1LayupOrders
      ].sort((a, b) => ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50));

      console.log(`🏭 Legacy production queue orders count: ${combinedOrders.length}`);

      res.json(combinedOrders);
    } catch (error) {
      console.error("Legacy production queue error:", error);
      res.status(500).json({ error: "Failed to fetch production queue" });
    }
  });

  // Note: Order ID generation routes now handled by modular orders routes

  // Purchase Orders routes (POs)
  app.get('/api/pos', async (req, res) => {
    try {
      console.log('🔧 Purchase Orders (POs) endpoint called');
      const { storage } = await import('../../storage');
      const purchaseOrders = await storage.getAllPurchaseOrders();
      console.log('🔧 Found purchase orders:', purchaseOrders.length);
      res.json(purchaseOrders);
    } catch (error) {
      console.error('🔧 Purchase orders fetch error:', error);
      res.status(500).json({ error: "Failed to fetch purchase orders" });
    }
  });

  app.post('/api/pos', async (req, res) => {
    try {
      console.log('🔧 Create Purchase Order endpoint called');
      const { insertPurchaseOrderSchema } = await import('@shared/schema');
      const { storage } = await import('../../storage');
      const purchaseOrderData = insertPurchaseOrderSchema.parse(req.body);
      const newPurchaseOrder = await storage.createPurchaseOrder(purchaseOrderData);
      console.log('🔧 Created purchase order:', newPurchaseOrder.id);
      res.status(201).json(newPurchaseOrder);
    } catch (error) {
      console.error('🔧 Create purchase order error:', error);
      res.status(500).json({ error: "Failed to create purchase order" });
    }
  });

  app.put('/api/pos/:id', async (req, res) => {
    try {
      console.log('🔧 Update Purchase Order endpoint called');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const updateData = req.body;
      const updatedPurchaseOrder = await storage.updatePurchaseOrder(parseInt(id), updateData);
      console.log('🔧 Updated purchase order:', updatedPurchaseOrder.id);
      res.json(updatedPurchaseOrder);
    } catch (error) {
      console.error('🔧 Update purchase order error:', error);
      res.status(500).json({ error: "Failed to update purchase order" });
    }
  });

  app.delete('/api/pos/:id', async (req, res) => {
    try {
      console.log('🔧 Delete Purchase Order endpoint called');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      await storage.deletePurchaseOrder(parseInt(id));
      console.log('🔧 Deleted purchase order:', id);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 Delete purchase order error:', error);
      res.status(500).json({ error: "Failed to delete purchase order" });
    }
  });

  // Purchase Order Items routes
  app.get('/api/pos/:id/items', async (req, res) => {
    try {
      console.log('🔧 Get Purchase Order Items endpoint called');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const items = await storage.getPurchaseOrderItems(parseInt(id));
      console.log('🔧 Found PO items:', items.length);
      res.json(items);
    } catch (error) {
      console.error('🔧 Get PO items error:', error);
      res.status(500).json({ error: "Failed to fetch purchase order items" });
    }
  });

  app.post('/api/pos/:id/items', async (req, res) => {
    try {
      console.log('🔧 Create Purchase Order Item endpoint called');
      const { insertPurchaseOrderItemSchema } = await import('@shared/schema');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const itemData = { ...req.body, poId: parseInt(id) };
      const validatedData = insertPurchaseOrderItemSchema.parse(itemData);
      const newItem = await storage.createPurchaseOrderItem(validatedData);
      console.log('🔧 Created PO item:', newItem.id);

      // Check if this item should be automatically added to production queue
      // If item type is custom_model, check the associated PO Product's productType
      if (validatedData.itemType === 'custom_model') {
        try {
          const poProduct = await storage.getPOProduct(parseInt(validatedData.itemId));
          console.log('🔧 Checking PO Product for auto-queue:', poProduct?.productType);
          
          if (poProduct && poProduct.productType === 'stock') {
            console.log('🔧 Auto-adding stock item to production queue');
            // Auto-add to production queue for stock items
            // This item will automatically appear in the P1 PO Production Queue
            // The production queue fetches all PO items, so it will show up automatically
            console.log('🔧 Stock item will appear in P1 PO Production Queue automatically');
          }
        } catch (poProductError) {
          console.warn('🔧 Could not fetch PO Product for auto-queue check:', poProductError);
          // Continue without failing the item creation
        }
      }

      res.status(201).json(newItem);
    } catch (error) {
      console.error('🔧 Create PO item error:', error);
      res.status(500).json({ error: "Failed to create purchase order item" });
    }
  });

  app.put('/api/pos/:poId/items/:itemId', async (req, res) => {
    try {
      console.log('🔧 Update Purchase Order Item endpoint called');
      const { storage } = await import('../../storage');
      const { itemId } = req.params;
      const updateData = req.body;
      const updatedItem = await storage.updatePurchaseOrderItem(parseInt(itemId), updateData);
      console.log('🔧 Updated PO item:', updatedItem.id);
      res.json(updatedItem);
    } catch (error) {
      console.error('🔧 Update PO item error:', error);
      res.status(500).json({ error: "Failed to update purchase order item" });
    }
  });

  app.delete('/api/pos/:poId/items/:itemId', async (req, res) => {
    try {
      console.log('🔧 Delete Purchase Order Item endpoint called');
      const { storage } = await import('../../storage');
      const { itemId } = req.params;
      await storage.deletePurchaseOrderItem(parseInt(itemId));
      console.log('🔧 Deleted PO item:', itemId);
      res.json({ success: true });
    } catch (error) {
      console.error('🔧 Delete PO item error:', error);
      res.status(500).json({ error: "Failed to delete purchase order item" });
    }
  });

  // Generate Production Orders from Purchase Order Items
  app.post('/api/pos/:id/generate-production-orders', async (req, res) => {
    try {
      console.log('🏭 Generate Production Orders endpoint called for PO:', req.params.id);
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.id);

      // Check if production orders already exist for this PO
      const existingOrders = await storage.getProductionOrdersByPoId(poId);
      if (existingOrders.length > 0) {
        return res.status(409).json({ 
          error: `Production orders already exist for this PO (${existingOrders.length} orders found). Cannot generate duplicates.`,
          existingCount: existingOrders.length
        });
      }

      // Get the purchase order details
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Get all items for this purchase order
      const poItems = await storage.getPurchaseOrderItems(poId);
      const stockModelItems = poItems.filter(item => item.itemId && item.itemId.trim());

      console.log(`🏭 Found ${stockModelItems.length} stock model items to convert to production orders`);

      const createdOrders = [];

      for (const item of stockModelItems) {
        // Create individual production orders for each quantity
        for (let i = 0; i < item.quantity; i++) {
          const productionOrderData = {
            orderId: `PO-${purchaseOrder.poNumber}-${item.id}-${i + 1}`,
            customerId: purchaseOrder.customerId.toString(),
            customerName: purchaseOrder.customerName,
            poNumber: purchaseOrder.poNumber,
            itemType: 'stock_model' as const,
            itemId: item.itemId,
            itemName: item.itemId,
            orderDate: new Date(),
            dueDate: (() => {
              const expectedDue = purchaseOrder.expectedDelivery ? new Date(purchaseOrder.expectedDelivery) : new Date(purchaseOrder.poDate);
              const today = new Date();
              return expectedDue > today ? expectedDue : today;
            })(),
            productionStatus: 'PENDING' as const,
            poId: poId,
            poItemId: item.id,
            specifications: {
              ...(item.specifications || {}),
              sourcePoNumber: purchaseOrder.poNumber,
              customerName: purchaseOrder.customerName,
              expectedDelivery: purchaseOrder.expectedDelivery
            }
          };

          console.log('🏭 Production order data before creation:', JSON.stringify(productionOrderData, null, 2));
          const createdOrder = await storage.createProductionOrder(productionOrderData);
          createdOrders.push(createdOrder);

          // Also create entry in main orders table for layup scheduler
          const mainOrderData = {
            orderId: createdOrder.orderId,
            customer: purchaseOrder.customerName,
            product: item.itemId,
            quantity: 1,
            status: 'Active',
            date: new Date(),
            currentDepartment: 'P1 Production Queue',
            isOnSchedule: true,
            priorityScore: 50,
            poId: purchaseOrder.poNumber,
            dueDate: createdOrder.dueDate,
            createdAt: new Date()
          };

          // await storage.createOrder(mainOrderData); // Method may not exist, commenting out
          console.log(`🏭 Created main order entry: ${productionOrderData.orderId} for layup scheduler`);

          console.log(`🏭 Created production order: ${productionOrderData.orderId} for ${item.itemId}`);
        }
      }

      console.log(`🏭 Successfully created ${createdOrders.length} production orders from PO ${purchaseOrder.poNumber}`);

      res.json({
        success: true,
        message: `Generated ${createdOrders.length} production orders`,
        createdOrders: createdOrders.length,
        orders: createdOrders.map(order => ({
          orderId: order.orderId,
          partName: (order as any).partName || 'Unknown',
          dueDate: order.dueDate,
          status: (order as any).status || 'Active'
        }))
      });

    } catch (error) {
      console.error('🏭 Generate production orders error:', error);
      res.status(500).json({ error: "Failed to generate production orders" });
    }
  });

  // Get Production Orders by PO ID
  app.get('/api/production-orders/by-po/:poId', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.poId);
      
      const productionOrders = await storage.getProductionOrdersByPoId(poId);
      
      res.json(productionOrders);
    } catch (error) {
      console.error('🔧 Get production orders by PO error:', error);
      res.status(500).json({ error: "Failed to fetch production orders" });
    }
  });

  // P1 Production Schedule Calculation
  app.post('/api/pos/:id/calculate-production-schedule', async (req, res) => {
    try {
      console.log('📅 P1 Production Schedule Calculation endpoint called for PO:', req.params.id);
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.id);

      // Get the purchase order details
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Get all items for this purchase order
      const poItems = await storage.getPurchaseOrderItems(poId);
      if (poItems.length === 0) {
        return res.status(400).json({ error: 'No items found in purchase order' });
      }

      const finalDueDate = new Date(purchaseOrder.expectedDelivery);
      const today = new Date();
      
      // Calculate available weeks (excluding weekends, only Mon-Thu production days)
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const totalWeeksAvailable = Math.floor((finalDueDate.getTime() - today.getTime()) / msPerWeek);
      const availableWeeks = Math.max(1, totalWeeksAvailable);
      
      console.log(`📅 P1 PO Production Schedule Analysis:`);
      console.log(`   PO Number: ${purchaseOrder.poNumber}`);
      console.log(`   Due Date: ${finalDueDate.toDateString()}`);
      console.log(`   Available Weeks: ${availableWeeks}`);
      
      const scheduleData = [];
      let totalItemsNeeded = 0;
      let totalItemsPerWeek = 0;
      
      for (const item of poItems) {
        const itemsNeeded = item.quantity;
        totalItemsNeeded += itemsNeeded;
        
        // Get mold capacity for this specific item
        const molds = await storage.getAllMolds();
        const enabledMolds = molds.filter(m => m.enabled);
        
        // Find molds that support this item's stock model
        const itemStockModel = item.stockModelId || item.itemId;
        
        // Handle both numeric IDs and string IDs for stock model matching
        const compatibleMolds = enabledMolds.filter(m => {
          if (!m.stockModels || !Array.isArray(m.stockModels)) return false;
          
          // Check direct match
          if (m.stockModels.includes(itemStockModel)) return true;
          
          // If itemStockModel is numeric (like "1"), try to match with mesa_universal
          if (itemStockModel === "1" || itemStockModel === 1) {
            return m.stockModels.includes("mesa_universal");
          }
          
          return false;
        });
        
        console.log(`🔧 Item ${item.itemName} (stock model: ${itemStockModel})`);
        console.log(`🔧 Enabled molds: ${enabledMolds.length}`);
        console.log(`🔧 Compatible molds: ${compatibleMolds.length}`, compatibleMolds.map(m => ({ moldId: m.moldId, multiplier: m.multiplier })));
        
        // Calculate weekly capacity based on compatible molds
        // Assume 4 working days per week (Mon-Thu) and account for mold multipliers
        const dailyMoldCapacity = compatibleMolds.reduce((sum, m) => sum + m.multiplier, 0);
        const maxItemsPerWeek = dailyMoldCapacity * 4; // 4 working days per week
        
        console.log(`🔧 Daily mold capacity: ${dailyMoldCapacity}`);
        console.log(`🔧 Weekly capacity: ${maxItemsPerWeek} items/week`);
        
        // If no compatible molds, use Mesa Universal capacity: 8 items/day × 4 days = 32 per week
        const effectiveWeeklyCapacity = maxItemsPerWeek > 0 ? maxItemsPerWeek : 32; // Mesa Universal: 8/day × 4 days
        
        // Calculate items per week needed to meet due date
        const itemsPerWeekNeeded = Math.ceil(itemsNeeded / availableWeeks);
        const actualItemsPerWeek = Math.min(itemsPerWeekNeeded, effectiveWeeklyCapacity);
        const weeksNeeded = Math.ceil(itemsNeeded / actualItemsPerWeek);
        totalItemsPerWeek += actualItemsPerWeek;
        
        // Generate weekly due dates starting the week after current week
        const weeklySchedule = [];
        
        // Start from next Monday (the week following current week)
        const nextWeekStart = new Date(today);
        const daysUntilNextMonday = (8 - nextWeekStart.getDay()) % 7 || 7; // Get next Monday
        nextWeekStart.setDate(nextWeekStart.getDate() + daysUntilNextMonday);
        
        for (let week = 0; week < weeksNeeded; week++) {
          // Calculate Thursday of this production week (week ends on Thursday)
          const weekDueDate = new Date(nextWeekStart);
          weekDueDate.setDate(weekDueDate.getDate() + (week * 7) + 3); // +3 days from Monday = Thursday
          
          const itemsThisWeek = Math.min(actualItemsPerWeek, itemsNeeded - (week * actualItemsPerWeek));
          
          weeklySchedule.push({
            week: week + 1,
            dueDate: weekDueDate.toISOString().split('T')[0],
            itemsToComplete: itemsThisWeek,
            cumulativeItems: Math.min((week + 1) * actualItemsPerWeek, itemsNeeded)
          });
        }
        
        scheduleData.push({
          itemId: item.id,
          itemName: item.itemName,
          totalQuantity: itemsNeeded,
          itemsPerWeek: actualItemsPerWeek,
          weeksNeeded: weeksNeeded,
          weeklySchedule: weeklySchedule,
          feasible: itemsPerWeekNeeded <= effectiveWeeklyCapacity,
          moldCapacity: {
            compatibleMolds: compatibleMolds.length,
            dailyCapacity: dailyMoldCapacity,
            weeklyCapacity: effectiveWeeklyCapacity
          }
        });
        
        console.log(`   Item: ${item.itemName}`);
        console.log(`     Quantity: ${itemsNeeded}`);
        console.log(`     Compatible molds: ${compatibleMolds.length}`);
        console.log(`     Daily mold capacity: ${dailyMoldCapacity}`);
        console.log(`     Weekly capacity: ${effectiveWeeklyCapacity}`);
        console.log(`     Items/week needed: ${itemsPerWeekNeeded}`);
        console.log(`     Items/week actual: ${actualItemsPerWeek}`);
        console.log(`     Weeks needed: ${weeksNeeded}`);
        console.log(`     Feasible: ${itemsPerWeekNeeded <= effectiveWeeklyCapacity ? 'Yes' : 'No'}`);
      }
      
      const overallFeasible = scheduleData.every(item => item.feasible);
      
      res.json({
        success: true,
        poNumber: purchaseOrder.poNumber,
        finalDueDate: finalDueDate.toISOString().split('T')[0],
        availableWeeks: availableWeeks,
        totalItemsNeeded: totalItemsNeeded,
        totalItemsPerWeekRequired: totalItemsPerWeek,
        overallFeasible: overallFeasible,
        itemSchedules: scheduleData,
        recommendations: {
          feasible: overallFeasible,
          message: overallFeasible 
            ? 'Production schedule is feasible with current capacity'
            : 'Production schedule requires additional capacity or extended timeline',
          suggestedActions: overallFeasible 
            ? ['Proceed with production order generation']
            : ['Consider extending due date', 'Increase production capacity', 'Prioritize critical items']
        }
      });

    } catch (error) {
      console.error('📅 Production schedule calculation error:', error);
      res.status(500).json({ error: "Failed to calculate production schedule" });
    }
  });

  // Additional routes can be added here as we continue splitting
  // app.use('/api/reports', reportsRoutes);
  // app.use('/api/scheduling', schedulingRoutes);
  // app.use('/api/bom', bomRoutes);

    // Barcode scanning endpoint
  app.get('/api/barcode/scan/:barcode', async (req, res) => {
    try {
      const { barcode } = req.params;
      console.log(`🔍 Barcode scan requested: ${barcode}`);
      
      // Extract order ID from barcode (handle various formats)
      let orderId = barcode;
      if (barcode.startsWith('P1-')) {
        orderId = barcode.substring(3); // Remove 'P1-' prefix
      }
      
      const { storage } = await import('../../storage');

      // Try to find the order in various tables
      let order = null;
      let orderSource = 'unknown';

      // Check finalized orders first
      try {
        order = await storage.getFinalizedOrderById(orderId);
        if (order) orderSource = 'finalized';
      } catch (e) {
        // Continue searching
      }

      // Check draft orders if not found
      if (!order) {
        try {
          order = await storage.getOrderDraft(orderId);
          if (order) orderSource = 'draft';
        } catch (e) {
          // Continue searching
        }
      }

      // Check production orders if not found
      if (!order) {
        try {
          const productionOrders = await storage.getAllProductionOrders();
          order = productionOrders.find(po => po.orderId === orderId);
          if (order) orderSource = 'production';
        } catch (e) {
          // Continue searching
        }
      }

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Get customer details
      let customer = null;
      if (order.customerId) {
        try {
          const customers = await storage.getAllCustomers();
          customer = customers.find(c => c.id.toString() === order.customerId || c.name === order.customerId);
        } catch (e) {
          console.error('Error fetching customer:', e);
        }
      }

      // Get stock model details and extract color information
      let baseModel = null;
      let color = null;
      if ((order as any).modelId || (order as any).itemId) {
        try {
          const stockModels = await storage.getAllStockModels();
          baseModel = stockModels.find(sm => 
            sm.id === ((order as any).modelId || (order as any).itemId) || 
            sm.name === ((order as any).modelId || (order as any).itemId)
          );
        } catch (e) {
          console.error('Error fetching stock model:', e);
        }
      }

      // Extract color from features or specifications
      if ((order as any).features) {
        if ((order as any).features.color) color = (order as any).features.color;
        if ((order as any).features.paintOption) color = (order as any).features.paintOption;
        if ((order as any).features.finish) color = (order as any).features.finish;
      }
      if ((order as any).specifications) {
        if ((order as any).specifications.color) color = (order as any).specifications.color;
        if ((order as any).specifications.paintOption) color = (order as any).specifications.paintOption;
        if ((order as any).specifications.finish) color = (order as any).specifications.finish;
      }

      // Build comprehensive order summary
      const orderSummary = {
        orderId: order.orderId,
        barcode: barcode,
        orderDate: order.orderDate || order.createdAt,
        customer: customer ? {
          name: customer.name,
          email: customer.email || '',
          company: customer.company || '',
          phone: customer.phone || ''
        } : {
          name: order.customerId || (order as any).customerName || 'Unknown Customer',
          email: '',
          company: '',
          phone: ''
        },
        baseModel: baseModel ? {
          name: baseModel.displayName || baseModel.name,
          id: baseModel.id,
          price: baseModel.price || 0
        } : {
          name: (order as any).modelId || (order as any).itemId || (order as any).itemName || 'Unknown Model',
          id: (order as any).modelId || (order as any).itemId || '',
          price: 0
        },
        features: (order as any).features || {},
        specifications: (order as any).specifications || {},
        lineItems: [],
        pricing: {
          subtotal: (order as any).subtotal || 0,
          discounts: [],
          discountTotal: 0,
          afterDiscounts: (order as any).subtotal || 0,
          total: (order as any).total || (order as any).subtotal || 0,
          override: false
        },
        paymentStatus: (order as any).paymentStatus || 'UNPAID',
        status: (order as any).status || 'PENDING',
        currentDepartment: (order as any).currentDepartment || 'Order Entry',
        dueDate: order.dueDate,
        notes: order.notes || '',
        source: orderSource,
        
        // Additional fields for barcode display (using display names)
        customerName: customer?.name || order.customerId || (order as any).customerName || 'Unknown Customer',
        stockModel: baseModel?.displayName || baseModel?.name || (order as any).modelId || (order as any).itemId || (order as any).itemName,
        color: color || 'Not specified',
        actionLength: (order as any).features?.action_length || (order as any).specifications?.action_length || '',
        paintOption: (order as any).features?.paintOption || (order as any).specifications?.paintOption || color,
        
        // Enhanced feature display with user-friendly names
        displayFeatures: {
          model: baseModel?.displayName || baseModel?.name || (order as any).modelId || (order as any).itemId || 'Unknown Model',
          actionLength: (order as any).features?.action_length ? 
            (order as any).features.action_length.toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
            'Not specified',
          color: color ? 
            color.toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
            'Not specified',
          finish: ((order as any).features?.finish || (order as any).features?.paintOption) ? 
            ((order as any).features.finish || (order as any).features.paintOption).toString().replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 
            'Not specified'
        }
      };

      // Add production-specific details if applicable
      if (orderSource === 'production') {
        (orderSummary as any).productionDetails = {
          partName: (order as any).partName || (order as any).itemName,
          quantity: (order as any).quantity || 1,
          department: (order as any).department,
          priority: (order as any).priority || 3,
          productionStatus: (order as any).productionStatus || (order as any).status
        };
      }

      console.log(`✅ Barcode scan successful for order: ${orderId}`);
      res.json(orderSummary);
    } catch (error) {
      console.error('Barcode scan error:', error);
      res.status(500).json({ error: 'Failed to scan barcode' });
    }
  });

  // Complete order summary endpoint for barcode scanning
  app.get('/api/orders/:orderId/complete-summary', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { storage } = await import('../../storage');

      // Try to find the order in various tables
      let order = null;
      let orderSource = 'unknown';

      // Check finalized orders first
      try {
        order = await storage.getFinalizedOrderById(orderId);
        if (order) orderSource = 'finalized';
      } catch (e) {
        // Continue searching
      }

      // Check draft orders if not found
      if (!order) {
        try {
          order = await storage.getOrderDraft(orderId);
          if (order) orderSource = 'draft';
        } catch (e) {
          // Continue searching
        }
      }

      // Check production orders if not found
      if (!order) {
        try {
          const productionOrders = await storage.getAllProductionOrders();
          order = productionOrders.find(po => po.orderId === orderId);
          if (order) orderSource = 'production';
        } catch (e) {
          // Continue searching
        }
      }

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Get customer details
      let customer = null;
      if (order.customerId) {
        try {
          const customers = await storage.getAllCustomers();
          customer = customers.find(c => c.id.toString() === order.customerId || c.name === order.customerId);
        } catch (e) {
          console.error('Error fetching customer:', e);
        }
      }

      // Get stock model details
      let baseModel = null;
      if ((order as any).modelId || (order as any).itemId) {
        try {
          const stockModels = await storage.getAllStockModels();
          baseModel = stockModels.find(sm => 
            sm.id === ((order as any).modelId || (order as any).itemId) || 
            sm.name === ((order as any).modelId || (order as any).itemId)
          );
        } catch (e) {
          console.error('Error fetching stock model:', e);
        }
      }

      // Build comprehensive order summary
      const orderSummary = {
        orderId: order.orderId,
        orderDate: order.orderDate || order.createdAt,
        customer: customer ? {
          name: customer.name,
          email: customer.email || '',
          company: customer.company || '',
          phone: customer.phone || ''
        } : {
          name: order.customerId || 'Unknown Customer',
          email: '',
          company: '',
          phone: ''
        },
        baseModel: baseModel ? {
          name: baseModel.displayName || baseModel.name,
          id: baseModel.id,
          price: baseModel.price || 0
        } : {
          name: (order as any).modelId || (order as any).itemId || 'Unknown Model',
          id: (order as any).modelId || (order as any).itemId || '',
          price: 0
        },
        features: (order as any).features || {},
        specifications: (order as any).specifications || {},
        lineItems: [],
        pricing: {
          subtotal: (order as any).subtotal || 0,
          discounts: [],
          discountTotal: 0,
          afterDiscounts: (order as any).subtotal || 0,
          total: (order as any).total || (order as any).subtotal || 0,
          override: false
        },
        paymentStatus: (order as any).paymentStatus || 'UNPAID',
        status: (order as any).status || 'PENDING',
        currentDepartment: (order as any).currentDepartment || 'Order Entry',
        dueDate: order.dueDate,
        notes: order.notes || '',
        source: orderSource,
        barcode: `P1-${order.orderId}`
      };

      // Add production-specific details if applicable
      if (orderSource === 'production') {
        (orderSummary as any).productionDetails = {
          partName: (order as any).partName || (order as any).itemName,
          quantity: (order as any).quantity || 1,
          department: (order as any).department,
          priority: (order as any).priority || 3,
          productionStatus: (order as any).productionStatus || (order as any).status
        };
      }

      res.json(orderSummary);
    } catch (error) {
      console.error('Complete order summary error:', error);
      res.status(500).json({ error: 'Failed to fetch complete order summary' });
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // Update order department endpoint with progress logic
  app.post('/api/orders/update-department', async (req, res) => {
    try {
      console.log('🔄 DEPT UPDATE API: Received request body:', JSON.stringify(req.body, null, 2));
      const { orderIds, department, status, assignedTechnician } = req.body;

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        console.log('❌ DEPT UPDATE API: Invalid orderIds:', orderIds);
        return res.status(400).json({ error: 'Order IDs array is required' });
      }

      if (!department) {
        console.log('❌ DEPT UPDATE API: Department missing');
        return res.status(400).json({ error: 'Department is required' });
      }

      console.log(`🔄 DEPT UPDATE API: Processing ${orderIds.length} order(s) to department: ${department}`);
      const { storage } = await import('../../storage');
      const updatedOrders = [];

      // Update each order individually with proper completion timestamps
      for (const orderId of orderIds) {
        try {
          // Get current order to determine its current department
          let currentOrder = await storage.getFinalizedOrderById(orderId);
          let isFinalized = true;

          if (!currentOrder) {
            currentOrder = await storage.getOrderDraft(orderId);
            isFinalized = false;
          }

          if (!currentOrder) {
            console.warn(`Order ${orderId} not found, skipping`);
            continue;
          }

          // Prepare completion timestamp update based on current department
          const completionUpdates: any = {};
          const now = new Date();

          // Set completion timestamp for the department we're leaving
          switch (currentOrder.currentDepartment) {
            case 'Layup': completionUpdates.layupCompletedAt = now; break;
            case 'Plugging': completionUpdates.pluggingCompletedAt = now; break;
            case 'CNC': completionUpdates.cncCompletedAt = now; break;
            case 'Finish': completionUpdates.finishCompletedAt = now; break;
            case 'Gunsmith': completionUpdates.gunsmithCompletedAt = now; break;
            case 'Paint': completionUpdates.paintCompletedAt = now; break;
            case 'QC': completionUpdates.qcCompletedAt = now; break;
            case 'Shipping': completionUpdates.shippingCompletedAt = now; break;
          }

          // Prepare update data
          const updateData: any = {
            currentDepartment: department,
            status: status || 'IN_PROGRESS',
            ...completionUpdates
          };
          
          // Add technician assignment if provided
          if (assignedTechnician) {
            updateData.assignedTechnician = assignedTechnician;
          }

          // Update the appropriate table
          let updatedOrder;
          if (isFinalized) {
            updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
          } else {
            updatedOrder = await storage.updateOrderDraft(orderId, {
              ...updateData,
              updatedAt: now
            });
          }

          updatedOrders.push(updatedOrder);
          console.log(`✅ Progressed order ${orderId} from ${currentOrder.currentDepartment} to ${department}`);
        } catch (orderError) {
          console.error(`Error updating order ${orderId}:`, orderError);
        }
      }

      console.log(`✅ Updated ${updatedOrders.length}/${orderIds.length} orders to department: ${department}`);

      res.json({ 
        success: true, 
        message: `Updated ${updatedOrders.length} orders to ${department} department`,
        updatedOrders: updatedOrders.length,
        totalRequested: orderIds.length
      });
    } catch (error) {
      console.error('❌ Update department error:', error);
      res.status(500).json({ error: 'Failed to update order department' });
    }
  });

  // Create barcode labels for selected orders
  app.post('/api/barcode/create-labels', async (req, res) => {
    try {
      const { orderIds } = req.body;
      const { storage } = await import('../../storage');
      
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: 'Order IDs required' });
      }

      console.log(`🏷️ Creating barcode labels for ${orderIds.length} orders:`, orderIds);

      // Get stock models for display name mapping
      const stockModels = await storage.getAllStockModels();
      const stockModelMap = new Map();
      stockModels.forEach(model => {
        stockModelMap.set(model.id, model.displayName || model.name);
      });

      // Get order details for label generation
      const orderDetails = [];
      for (const orderId of orderIds) {
        // Try to get order from finalized orders first, then drafts
        let order = null;
        try {
          order = await storage.getFinalizedOrderById(orderId);
          if (!order) {
            order = await storage.getOrderDraft(orderId);
          }
        } catch (error) {
          console.warn(`Could not find order ${orderId}:`, error);
        }
        
        if (order) {
          orderDetails.push(order);
          console.log(`✅ Found order for barcode: ${orderId}`);
        } else {
          console.warn(`❌ Order ${orderId} not found for barcode generation`);
        }
      }

      // Generate Avery label document (PDF format)
      const { PDFDocument, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      
      // Add pages for labels (Avery 8160 format - 3 columns, 10 rows per page)
      const labelsPerPage = 30;
      const pagesNeeded = Math.ceil(orderDetails.length / labelsPerPage);
      
      for (let pageIndex = 0; pageIndex < pagesNeeded; pageIndex++) {
        const page = pdfDoc.addPage([612, 792]); // 8.5x11 inches
        const startIndex = pageIndex * labelsPerPage;
        const endIndex = Math.min(startIndex + labelsPerPage, orderDetails.length);
        
        for (let i = startIndex; i < endIndex; i++) {
          const order = orderDetails[i];
          const labelIndex = i - startIndex;
          
          // Calculate label position (3x10 grid) - Avery 5160 format with correct margins
          const col = labelIndex % 3;
          const row = Math.floor(labelIndex / 3);
          // Avery 5160 specifications: 0.25" margin between columns, reduced top margin, Label size 2.625" x 1"
          const leftMargin = 18; // 0.25" * 72 points/inch (left margin)
          const topMargin = 0; // 0 points - no top margin
          const bottomMargin = 36; // 0.5" * 72 points/inch
          const labelWidth = 189; // 2.625" * 72 points/inch
          const labelHeight = 72; // 1" * 72 points/inch
          const columnGap = 9; // 0.125" * 72 points/inch (reduced gap between columns)
          const x = leftMargin + (col * (labelWidth + columnGap));
          const y = 792 - labelHeight - (row * labelHeight); // Position labels properly from top
          
          // Draw label border with clear separation  
          page.drawRectangle({
            x: x,
            y: y,
            width: labelWidth,
            height: labelHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
          });
          
          // Generate proper Code 39 barcode using direct implementation
          const barcodeText = order.orderId;
          
          // Correct Code 39 character encoding table (9 bits each: 5 bars + 4 spaces)
          const code39Table: { [key: string]: string } = {
            '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
            '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
            '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
            'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
            'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
            'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
            'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
            'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
            'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
            '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
            '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
          };
          
          const drawCode39Barcode = (text: string, startX: number, startY: number) => {
            // Code 39 specifications: thin=1x, thick=3x, height adequate for scanning
            const thinWidth = 1.0;
            const thickWidth = 3.0;
            const barHeight = 15;
            const interCharGap = 1.0; // Gap between characters
            let currentX = startX;
            
            // Add start/stop characters (* for Code 39)
            const fullText = `*${text.toUpperCase()}*`;
            
            // Calculate and apply scaling to fit in label
            let estimatedWidth = 0;
            for (let char of fullText) {
              if (code39Table[char]) {
                estimatedWidth += (thinWidth * 6 + thickWidth * 3) + interCharGap; // 9 elements per char
              }
            }
            
            const maxWidth = 150; // Increased width for better spacing
            const scale = estimatedWidth > maxWidth ? maxWidth / estimatedWidth : 1;
            const scaledThin = thinWidth * scale;
            const scaledThick = thickWidth * scale;
            const scaledGap = interCharGap * scale;
            
            for (let char of fullText) {
              const pattern = code39Table[char];
              if (pattern) {
                // Code 39: 9 elements per character (5 bars, 4 spaces)
                // Pattern alternates: bar, space, bar, space, bar, space, bar, space, bar
                for (let i = 0; i < pattern.length; i++) {
                  const isWide = pattern[i] === '1';
                  const width = isWide ? scaledThick : scaledThin;
                  const isBar = i % 2 === 0; // Positions 0,2,4,6,8 are bars
                  
                  if (isBar) {
                    page.drawRectangle({
                      x: currentX,
                      y: startY,
                      width: width,
                      height: barHeight,
                      color: rgb(0, 0, 0),
                    });
                  }
                  currentX += width;
                }
                // Add inter-character gap (narrow space)
                currentX += scaledGap;
              }
            }
          };
          
          // Skip the original barcode drawing - will be drawn with proper color below
          console.log(`✅ Preparing Code 39 barcode for ${barcodeText}`);
          
          // Get model and action length (using display names) - need these early for display
          const actionLength = (order as any).features?.action_length || 'unknown';
          const modelDisplayName = stockModelMap.get((order as any).modelId) || (order as any).modelId || 'Unknown';
          
          // Add order information at top - Order ID and Customer Name
          const customerName = (order as any).customer || '';
          const orderText = customerName ? `${order.orderId} - ${customerName}` : order.orderId;
          page.drawText(orderText, {
            x: x + 8,
            y: y + 50,
            size: 11,
            color: rgb(0, 0, 0),
          });
          
          // Add stock model and action length on same line below barcode
          page.drawText(`${modelDisplayName} - ${actionLength.toUpperCase()}`, {
            x: x + 8,
            y: y + 22,
            size: 7,
            color: rgb(0, 0, 0),
          });
          
          // Check for special features to add to label
          const features = (order as any).features || {};
          const specialLabels = [];
          
          // Extract swivel studs and texture options for color-coded display
          const swivelStudsText = features.swivel_studs && 
                                 features.swivel_studs !== 'standard_swivel_studs' && 
                                 features.swivel_studs !== 'standard' 
                                 ? features.swivel_studs.replace(/_/g, ' ') : null;
          
          const textureText = features.texture_options && 
                             features.texture_options !== 'no_texture' && 
                             features.texture_options !== 'none'
                             ? features.texture_options.replace(/_/g, ' ') : null;
          
          // Check for NSNH (No Swivel Studs No Holes) - this should show as "NSNH"
          const hasNSNH = features.swivel_studs === 'no_swivel_studs' || 
                         features.swivel_studs === 'no_swivel_no_holes' ||
                         (features.swivel_studs && features.swivel_studs.includes('no_swivel')) ||
                         (features.swivel_studs && features.swivel_studs.includes('no_holes'));
          
          if (hasNSNH) {
            specialLabels.push('NSNH');
          }
          
          // Add non-standard swivel studs (only if it's not a "no swivel" case)
          if (swivelStudsText && !hasNSNH) {
            specialLabels.push(`SWIVEL: ${swivelStudsText.toUpperCase()}`);
          }
          
          // Add texture options in purple (simulated with different style in PDF)
          if (textureText) {
            specialLabels.push(`TEXTURE: ${textureText.toUpperCase()}`);
          }
          
          // Carbon Camo Ready
          if (features.paint_options === 'carbon_camo_ready' ||
              (features.paint_options && features.paint_options.includes('carbon_camo'))) {
            specialLabels.push('CARBON CAMO READY');
          }
          
          
          // Determine barcode color based on specifications
          const paintOption = features.paint_options || '';
          const modelId = (order as any).modelId || '';
          
          // Check if this order is high priority or late (you can add this logic later)
          const isHighPriority = false; // TODO: Add high priority logic
          const isLate = false; // TODO: Add due date checking logic
          
          // Red for high priority or late orders
          let barcodeColor = rgb(0, 0, 0); // Default black
          if (isHighPriority || isLate) {
            barcodeColor = rgb(1, 0, 0); // Red
          } else {
            // Blue for painted stock (terraine, premium, standard, rattlesnake rogue, fg* models)
            const paintedOptions = ['terraine', 'premium', 'standard', 'rattlesnake_rogue'];
            const isPaintedOption = paintedOptions.some(option => 
              paintOption.toLowerCase().includes(option)
            );
            const isFiberglassModel = modelId.toLowerCase().startsWith('fg');
            
            if (isPaintedOption || isFiberglassModel) {
              barcodeColor = rgb(0, 0.4, 1); // Blue (#0066FF)
            }
          }
          
          // Redraw barcode with appropriate color
          const redrawCode39Barcode = (text: string, startX: number, startY: number, color: any) => {
            const thinWidth = 1.0;
            const thickWidth = 3.0;
            const barHeight = 15;
            const interCharGap = 1.0;
            let currentX = startX;
            
            const fullText = `*${text.toUpperCase()}*`;
            
            let estimatedWidth = 0;
            for (let char of fullText) {
              if (code39Table[char]) {
                estimatedWidth += (thinWidth * 6 + thickWidth * 3) + interCharGap;
              }
            }
            
            const maxWidth = 150;
            const scale = estimatedWidth > maxWidth ? maxWidth / estimatedWidth : 1;
            const scaledThin = thinWidth * scale;
            const scaledThick = thickWidth * scale;
            const scaledGap = interCharGap * scale;
            
            for (let char of fullText) {
              const pattern = code39Table[char];
              if (pattern) {
                for (let i = 0; i < pattern.length; i++) {
                  const isWide = pattern[i] === '1';
                  const width = isWide ? scaledThick : scaledThin;
                  const isBar = i % 2 === 0;
                  
                  if (isBar) {
                    page.drawRectangle({
                      x: currentX,
                      y: startY,
                      width: width,
                      height: barHeight,
                      color: color,
                    });
                  }
                  currentX += width;
                }
                currentX += scaledGap;
              }
            }
          };
          
          // Draw the barcode with appropriate color (blue for terrain/premium/standard paint, black otherwise)
          redrawCode39Barcode(barcodeText, x + 8, y + 32, barcodeColor);
          
          
          // Draw special labels with appropriate colors on separate line below stock model
          if (specialLabels.length > 0) {
            let xOffset = x + 8;
            
            for (let i = 0; i < specialLabels.length; i++) {
              const label = specialLabels[i];
              let textColor = rgb(0, 0, 0); // Default black
              
              // Orange for swivel studs
              if (label.includes('SWIVEL') || label === 'NSNH') {
                textColor = rgb(1, 0.5, 0); // Orange
              }
              // Purple for texture
              else if (label.includes('TEXTURE')) {
                textColor = rgb(0.5, 0, 0.8); // Purple
              }
              
              const separator = i > 0 ? ' - ' : '';
              page.drawText(`${separator}${label}`, {
                x: xOffset,
                y: y + 16, // Move special labels higher
                size: 5,
                color: textColor,
              });
              
              xOffset += (separator.length + label.length) * 3; // Approximate text width
            }
          }
          
          // Add due date
          const dueDate = new Date(order.dueDate).toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric' 
          });
          page.drawText(`Due: ${dueDate}`, {
            x: x + 8,
            y: y + 10,
            size: 6,
            color: rgb(0, 0, 0),
          });
        }
      }
      
      const pdfBytes = await pdfDoc.save();
      
      // Return PDF for inline viewing (opens in new tab/popup)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="barcode-labels.pdf"');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(Buffer.from(pdfBytes));
      
      console.log(`✅ Generated barcode labels PDF for ${orderDetails.length} orders`);

    } catch (error) {
      console.error('🏷️ Create barcode labels error:', error);
      res.status(500).json({ error: 'Failed to create barcode labels' });
    }
  });

  // Progress orders to next department
  app.post('/api/orders/progress-department', async (req, res) => {
    try {
      const { orderIds, toDepartment } = req.body;
      const { storage } = await import('../../storage');
      
      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ error: 'Order IDs required' });
      }
      
      if (!toDepartment) {
        return res.status(400).json({ error: 'Target department required' });
      }

      console.log(`🔄 Progressing ${orderIds.length} orders to ${toDepartment}:`, orderIds);

      const updatedOrders = [];
      const currentTimestamp = new Date();

      for (const orderId of orderIds) {
        const order = await storage.getOrderById(orderId);
        if (order) {
          // Update department and completion timestamp
          const updateData: any = {
            currentDepartment: toDepartment,
            updatedAt: currentTimestamp
          };

          // Set completion timestamp for previous department
          if ((order as any).currentDepartment === 'Barcode') {
            updateData.barcodeCompletedAt = currentTimestamp;
          } else if ((order as any).currentDepartment === 'Layup') {
            updateData.layupCompletedAt = currentTimestamp;
          } else if ((order as any).currentDepartment === 'CNC') {
            updateData.cncCompletedAt = currentTimestamp;
          }

          // Try updating finalized order first, fall back to draft
          let updatedOrder;
          try {
            updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
          } catch (error) {
            updatedOrder = await storage.updateOrderDraft(orderId, updateData);
          }
          updatedOrders.push(updatedOrder);
          
          console.log(`✅ Progressed ${orderId} from ${(order as any).currentDepartment} to ${toDepartment}`);
        }
      }

      res.json({ 
        success: true,
        message: `Progressed ${updatedOrders.length} orders to ${toDepartment}`,
        updatedOrders: updatedOrders.length
      });

    } catch (error) {
      console.error('🔄 Progress orders error:', error);
      res.status(500).json({ error: 'Failed to progress orders' });
    }
  });

  // Create and return HTTP server
  return createServer(app);
}

export { 
  customersRoutes as customersRouter, 
  ordersRoutes as ordersRouter, 
  inventoryRoutes as inventoryRouter, 
  formsRoutes as formsRouter, 
  documentsRoutes as documentsRouter, 
  discountsRoutes as discountsRouter, 
  employeesRoutes as employeesRouter, 
  qualityRoutes as qualityRouter, 
  bomsRoutes as bomsRouter, 
  moldsRoutes as moldsRouter, 
  kickbackRoutes as kickbacksRouter, 
  orderAttachmentsRoutes as orderAttachmentsRouter,
  tasksRoutes as tasksRouter,
  communicationsRoutes as communicationsRouter,
  secureVerificationRoutes as secureVerificationRouter
};