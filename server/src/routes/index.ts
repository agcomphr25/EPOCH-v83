import { createServer, type Server } from 'http';

import { Express } from 'express';

import employeesRoutes from './employees';
import ordersRoutes from './orders';
import formsRoutes from './forms';
import tasksRoutes from './tasks';
import kickbackRoutes from './kickbacks';
import inventoryRoutes from './inventory';
import customersRoutes from './customers';
import vendorsRoutes from './vendors';
import qualityRoutes from './quality';
import documentsRoutes from './documents';
import moldsRoutes from './molds';
import layupPdfRoute from './layupPdfRoute';
import shippingPdfRoute from './shippingPdf';
import shippingRoutes from './shipping';
import shippingTestRoutes from './shipping-test';
import orderAttachmentsRoutes from './orderAttachments';
import discountsRoutes from './discounts';
// import bomsRoutes from './boms'; // Legacy BOM routes - replaced by Robust BOM system
import robustBomsRoutes from './robustBoms';
import communicationsRoutes from './communications';
import internalMessagesRoutes from './internalMessages';
import nonconformanceRoutes from '../../routes/nonconformance';
import paymentsRoutes from './payments';
import algorithmicSchedulerRoutes from './algorithmicScheduler';
import productionQueueRoutes from './productionQueue';
import layupScheduleRoutes from './layupSchedule';
// import gatewayReportsRoutes from './gatewayReports'; // Temporarily removed
import customerSatisfactionRoutes from './customerSatisfaction';
import poProductsRoutes from './poProducts';
import refundRoutes from './refunds';
import moldSyncRoutes from './moldSync';
import authRoutes from './auth';
import usersRoutes from './users';
import reportsRoutes from './reports';
import oemSettingsRoutes from './oemSettings';
import metalAccessoriesRoutes from './metalAccessories';
import featureSelectionsRoutes from './featureSelections';
import calendarRoutes from './calendar';
import documentIntelligenceRoutes from './documentIntelligence';
import trainingRoutes from './training';
import magicLinkRoutes from './magicLink';
import certificationsRoutes from './certifications';
import { getAccessToken } from '../utils/upsShipping';

export function registerRoutes(app: Express): Server {
  // Authentication routes
  app.use('/api/auth', authRoutes);

  // Magic Link routes
  app.use('/api/magic-link', magicLinkRoutes);

  // Calendar routes
  app.use('/api/calendar', calendarRoutes);

  // User management routes
  app.use('/api/users', usersRoutes);

  // Employee management routes
  app.use('/api/_employees', employeesRoutes);

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

  // Quality control and maintenance routes
  app.use('/api/quality', qualityRoutes);

  // Document management routes
  app.use('/api/documents', documentsRoutes);

  // Order attachments routes
  app.use('/api/order-attachments', orderAttachmentsRoutes);

  // Mold management routes
  app.use('/api/molds', moldsRoutes);

  // Mold synchronization routes
  app.use('/api', moldSyncRoutes);

  // Layup PDF generation routes
  app.use('/api/pdf', layupPdfRoute);

  // Shipping PDF generation routes
  app.use('/api/shipping-pdf', shippingPdfRoute);

  // Shipping management routes
  app.use('/api/shipping', shippingRoutes);
  app.use('/api/shipping-test', shippingTestRoutes);

  // Discount management routes
  app.use('/api', discountsRoutes);

  // BOM management routes - Legacy BOM system commented out, replaced by Robust BOM
  // app.use('/api/boms', bomsRoutes);

  // Robust BOM management routes - Advanced BOM system with revisions and parts library
  app.use('/api/robust-boms', robustBomsRoutes);

  // Communications management routes
  app.use('/api/communications', communicationsRoutes);

  // Internal messaging routes
  app.use('/api/internal-messages', internalMessagesRoutes);

  // Nonconformance tracking routes
  app.use('/api/nonconformance', nonconformanceRoutes);

  // Payment processing routes
  app.use('/api/payments', paymentsRoutes);

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

  // Reports routes
  app.use('/api/reports', reportsRoutes);

  // OEM Priority Settings routes
  app.use('/api/oem-settings', oemSettingsRoutes);

  // Metal Accessories Tracker routes
  app.use('/api/metal-accessories', metalAccessoriesRoutes);

  // Feature Selection Tracking routes (AI-powered smart sorting)
  app.use('/api/feature-selections', featureSelectionsRoutes);

  // Azure Document Intelligence routes
  app.use('/api/document-intelligence', documentIntelligenceRoutes);

  // Training management routes
  app.use('/api/training', trainingRoutes);

  // Certifications management routes
  app.use('/api/certifications', certificationsRoutes);

  // UPS Test endpoint
  app.post('/api/test-ups-auth', async (req, res) => {
    try {
      console.log('🚚 Testing UPS authentication...');
      const token = await getAccessToken();
      console.log('✅ UPS authentication successful');
      res.json({
        success: true,
        message: 'UPS authentication successful',
        tokenLength: token.length,
      });
    } catch (_error: any) {
      console._error('❌ UPS authentication failed:', _error.message);
      res.status(500).json({
        success: false,
        _error: _error.message,
      });
    }
  });

  // Direct algorithmic schedule endpoint for frontend auto-schedule button
  app.post('/api/algorithmic-schedule', async (req, res) => {
    console.log(
      '🏭 LAYUP SCHEDULER FLOW: Algorithmic schedule called for comprehensive flow'
    );
    try {
      const {
        maxOrdersPerDay = 50,
        scheduleDays = 60,
        workDays = [1, 2, 3, 4],
      } = req.body;

      // Use the comprehensive algorithmic scheduler for layup flow
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(
        'http://localhost:5000/api/scheduler/generate-algorithmic-schedule',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            maxOrdersPerDay,
            scheduleDays,
            workDays, // Ensure Monday-Thursday scheduling [1,2,3,4]
            priorityWeighting: 'urgent', // Due date priority system
          }),
        }
      );

      const result: any = await response.json();
      console.log(
        `🏭 LAYUP SCHEDULER FLOW: Generated ${result.allocations?.length || 0} schedule allocations`
      );
      res.json(result);
    } catch (_error) {
      console._error(
        '❌ LAYUP SCHEDULER FLOW: Algorithmic schedule _error:',
        _error
      );
      res.status(500).json({
        success: false,
        _error: _error instanceof Error ? _error.message : 'Unknown _error',
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
        server: 'running',
      };

      if (dbConnected) {
        // Test a simple query to verify storage works
        try {
          const stockModels = await storage.getAllStockModels();
          status.database = `connected (${stockModels.length} stock models)`;
        } catch (_error) {
          status.database = 'connected but storage _error';
        }
      }

      res.json(status);
    } catch (_error) {
      res.status(500).json({
        status: '_error',
        _error: _error instanceof Error ? _error.message : 'Unknown _error',
        timestamp: new Date().toISOString(),
      });
    }
  });

  // P1 Layup Queue endpoint - provides unified production queue for layup scheduler
  app.get('/api/p1-layup-queue', async (req, res) => {
    try {
      // Extract OEM settings from query parameters
      const oemMode = req.query.oemMode === 'true';
      const selectedPOOrders = req.query.selectedPOOrders
        ? String(req.query.selectedPOOrders).split(',')
        : [];

      console.log('🔧 P1 layup queue with OEM settings:', {
        oemMode,
        selectedPOOrdersCount: selectedPOOrders.length,
      });

      const { storage } = await import('../../storage');
      const { inferStockModelFromFeatures } = await import(
        '../utils/stockModelInference'
      );

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
      const unscheduledOrders = allOrders.filter((order) => {
        const currentDept = (order as any).currentDepartment;
        const stockModel =
          (order as any).stockModelId || (order as any).modelId;

        // Only include orders in P1 Production Queue
        if (currentDept !== 'P1 Production Queue') {
          return false;
        }

        // EXCLUDE orders with no stock model or invalid stock models - they need attention or should go to shipping
        if (
          !stockModel ||
          stockModel === '' ||
          stockModel.toLowerCase() === 'none' ||
          stockModel.toLowerCase() === 'no_stock'
        ) {
          console.log(
            `⚠️ FILTERING OUT: Order ${(order as any).orderId} has no valid stock model (${stockModel}) - should be handled elsewhere`
          );
          return false;
        }

        // EXCLUDE orders without action_length - UNLESS they're from P1 Purchase Orders (which don't need action_length)
        const features = (order as any).features || {};
        const orderId = (order as any).orderId || '';
        const isP1POOrder = orderId.startsWith('PO-'); // P1 PO orders have format: PO-0046-5-1

        if (
          !isP1POOrder &&
          (!features.action_length || features.action_length === '')
        ) {
          console.log(
            `⚠️ FILTERING OUT: Order ${orderId} has no action_length selected - needs attention`
          );
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
          customer as "customer",
          product as "product",
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
        productionOrderId: null,
      }));

      // Combine both sources
      const combinedUnscheduledOrders = [
        ...unscheduledOrders,
        ...formattedActiveOrders,
      ];

      // Fetch P1 PO orders from all_orders table (orders created from P1 PO week selection)
      // ONLY include orders in P1 Production Queue - orders should NOT appear in queue until scheduled
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
          AND current_department = 'P1 Production Queue'
        ORDER BY due_date ASC
      `);

      // Format the P1 PO orders
      const p1POOrdersRows = Array.isArray(p1POOrdersResult)
        ? p1POOrdersResult
        : [];
      console.log(
        `🔍 Found ${p1POOrdersRows.length} P1 PO orders in all_orders table`
      );

      const p1POOrders = p1POOrdersRows.map((po: any) => {
        // Apply OEM priority boost if this P1 PO is selected in OEM mode
        let priorityScore = po.priorityScore || 1500;
        if (oemMode && selectedPOOrders.includes(po.orderId)) {
          priorityScore = 1; // Highest priority for selected P1 PO orders in OEM mode
          console.log(
            `🚀 OEM PRIORITY BOOST: Order ${po.orderId} priority boosted to ${priorityScore}`
          );
        }

        return {
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
          source: po.source, // This will be 'p1_purchase_order'
          priorityScore: priorityScore,
        };
      });

      console.log(
        `🏭 Found ${p1POOrders.length} P1 PO orders from week selection`
      );

      // Fetch production orders from production_orders table (OEM orders)
      // IMPORTANT: Only fetch production orders that match ACTIVE OEM priority settings
      console.log(
        '🔍 Fetching production orders from production_orders table (filtering by active OEM settings)...'
      );
      const productionOrdersResult = await pool.query(`
        SELECT DISTINCT
          po.order_id as "orderId",
          po.customer_id as "customerId",
          CASE 
            WHEN po.item_id = '10' THEN 'cf_alpine_hunter'
            WHEN po.item_id = '11' THEN 'cf_privateer' 
            WHEN po.item_id = '12' THEN 'fg_privateer'
            ELSE 'mesa_universal'
          END as "stockModelId",
          po.due_date as "dueDate",
          po.current_department as "currentDepartment",
          po.production_status as "status",
          '{}' as features,
          po.created_at as "createdAt",
          'production_order' as source
        FROM production_orders po
        INNER JOIN oem_priority_settings ops ON po.po_id = ops.po_id
        WHERE po.production_status = 'PENDING' 
          AND ops.is_active = true
        ORDER BY po.due_date ASC
      `);

      // Format the production orders
      const productionOrdersRows = Array.isArray(productionOrdersResult)
        ? productionOrdersResult
        : [];
      console.log(
        `🔍 Found ${productionOrdersRows.length} production orders in production_orders table`
      );

      const productionOrders = productionOrdersRows.map((po: any) => {
        // FIXED: Infer features from stock model for OEM orders to display action length
        const inferFeaturesFromStockModel = (stockModelId: string) => {
          const features: any = {};

          // Map stock models to their typical action length
          const stockModelActionMap: { [key: string]: string } = {
            cf_alpine_hunter: 'short',
            fg_alpine_hunter: 'short',
            cf_privateer: 'short',
            fg_privateer: 'short',
            cf_sportsman: 'short',
            fg_sportsman: 'short',
            cf_armor: 'short',
            fg_armor: 'short',
            cf_chalk_branch: 'short',
            fg_chalk_branch: 'short',
            cf_adj_chalk_branch: 'short',
            cf_adj_alp_hunter: 'short',
            fg_adj_alp_hunter: 'short',
            cf_adj_armor: 'short',
            fg_adj_armor: 'short',
            cf_visigoth: 'long',
            fg_visigoth: 'long',
            cf_k2: 'long',
            fg_k2: 'long',
            cf_adj_k2: 'long',
            fg_adj_k2: 'long',
            cf_ferrata: 'short',
            fg_ferrata: 'short',
            cf_cat: 'short',
            fg_cat: 'short',
            cf_cat_lh: 'short',
            fg_cat_lh: 'short',
            apr_hunter: 'short',
            m1a_carbon: 'medium',
            mesa_universal: 'short',
          };

          const actionLength = stockModelActionMap[stockModelId] || 'short';
          features.action_length = actionLength;

          // COMMENTED OUT FOR PERFORMANCE - was logging 400+ times per API call
          // console.log(`🎯 OEM Order ${po.orderId}: Inferred action_length="${actionLength}" from stockModelId="${stockModelId}"`);

          return features;
        };

        return {
          id: po.orderId,
          orderId: po.orderId,
          orderDate: po.createdAt,
          dueDate: po.dueDate,
          currentDepartment: po.currentDepartment,
          customerId: po.customerId,
          features: inferFeaturesFromStockModel(po.stockModelId),
          modelId: po.stockModelId,
          stockModelId: po.stockModelId,
          status: po.status,
          source: po.source,
          priorityScore: 2000, // High priority for OEM orders
          product: po.stockModelId
            .replace('_', ' ')
            .replace(/\b\w/g, (l: string) => l.toUpperCase()),
        };
      });

      console.log(
        `🏭 Found ${productionOrders.length} production orders from production_orders table`
      );

      // Combine all order types into unified production queue with enhanced stock model inference
      console.log(
        `📦 Processing ${combinedUnscheduledOrders.length} total main orders + ${p1POOrders.length} P1 PO orders + ${productionOrders.length} production orders for P1 layup queue`
      );

      const combinedQueue = [
        // Add the production orders first (highest priority for OEM)
        ...productionOrders,
        // Add the P1 PO orders second (high priority)
        ...p1POOrders,
        ...combinedUnscheduledOrders.map((order) => {
          // Determine correct source type based on order characteristics
          // Only treat as production_order if it has poId or productionOrderId
          // customerPO field is unreliable - often contains customer names instead of PO numbers
          const sourceType =
            (order as any).poId || (order as any).productionOrderId
              ? 'production_order'
              : 'main_orders';

          const { stockModelId, product } = inferStockModelFromFeatures({
            ...order,
            source: sourceType,
          });

          // DEBUG: Log Mesa Universal orders specifically - COMMENTED OUT FOR PERFORMANCE
          // if (stockModelId === 'mesa_universal') {
          //   console.log(`🏔️ MESA ORDER: ${order.orderId} → ${stockModelId} (source: ${sourceType})`);
          // }

          return {
            ...order,
            source: sourceType,
            priorityScore: calculatePriorityScore(order.dueDate),
            orderId: order.orderId,
            stockModelId,
            modelId: stockModelId, // Ensure modelId matches stockModelId for consistent material detection
            product,
            stockModelName: product,
          };
        }),
      ];

      // Count Mesa Universal orders in final result
      const mesaCount = combinedQueue.filter(
        (order) => (order as any).modelId === 'mesa_universal'
      ).length;
      console.log(
        `🏔️ FINAL MESA COUNT: ${mesaCount} Mesa Universal orders in P1 layup queue API response`
      );

      // Sort by priority score (lower = higher priority)
      combinedQueue.sort((a, b) => a.priorityScore - b.priorityScore);

      // Log OEM priority verification
      if (oemMode && selectedPOOrders.length > 0) {
        const topOrders = combinedQueue.slice(
          0,
          Math.min(5, combinedQueue.length)
        );
        console.log(
          '🚀 OEM MODE VERIFICATION: Top 5 orders after sorting:',
          topOrders.map((o) => ({
            orderId: o.orderId,
            priorityScore: o.priorityScore,
            source: o.source,
          }))
        );
        const boostedOrdersInTop = topOrders.filter((o) =>
          selectedPOOrders.includes(o.orderId)
        );
        console.log(
          `🚀 OEM MODE SUCCESS: ${boostedOrdersInTop.length}/${selectedPOOrders.length} selected P1 POs appear in top 5`
        );
      }

      // Add cache-control headers to prevent browser caching
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');

      res.json(combinedQueue);
    } catch (_error) {
      console._error('❌ P1 layup queue fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P1 layup queue' });
    }
  });

  // Helper function to calculate priority score based on due date
  function calculatePriorityScore(dueDate: string | Date | null): number {
    if (!dueDate) return 100; // No due date = lowest priority

    const due = new Date(dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil(
      (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

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
        if (
          stockModel &&
          (stockModel.toLowerCase() === 'no_stock' ||
            stockModel.toLowerCase() === 'none')
        ) {
          ordersToMoveToShipping.push(order);
        }
        // Orders with missing stock model or missing action_length need attention
        else if (
          !stockModel ||
          stockModel === '' ||
          !features.action_length ||
          features.action_length === ''
        ) {
          ordersNeedingAttention.push(order);
        }
      }

      console.log(
        `🧹 Found ${ordersToMoveToShipping.length} orders to move to Shipping QC and ${ordersNeedingAttention.length} orders needing attention`
      );

      // Move orders with "no_stock"/"None" to Shipping QC
      for (const order of ordersToMoveToShipping) {
        const stockModel = order.stockModelId || order.modelId || 'empty';
        console.log(
          `🚀 AUTO-MOVING: Order ${order.orderId} (stock model: "${stockModel}") from P1 Production Queue → Shipping QC`
        );

        try {
          await storage.updateFinalizedOrder(order.orderId, {
            currentDepartment: 'Shipping QC',
            updatedAt: new Date(),
          });
          console.log(
            `✅ Successfully moved order ${order.orderId} to Shipping QC`
          );
        } catch (_error) {
          console._error(`❌ Failed to move order ${order.orderId}:`, _error);
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

        console.log(
          `⚠️ CREATING KICKBACK: Order ${order.orderId} needs attention (missing: ${missingItems.join(', ')})`
        );

        try {
          // Check if a kickback already exists for this order
          const existingKickbacks = await storage.getKickbacksByOrderId(
            order.orderId
          );
          const hasOpenKickback = existingKickbacks.some(
            (kb: any) => kb.status === 'OPEN' || kb.status === 'IN_PROGRESS'
          );

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
              correctiveAction: null,
            };

            await storage.createKickback(kickbackData);
            console.log(
              `✅ Created kickback for order ${order.orderId} - now in "Orders That Need Attention"`
            );
          } else {
            console.log(
              `ℹ️ Order ${order.orderId} already has an open kickback - skipping`
            );
          }
        } catch (_error) {
          console._error(
            `❌ Failed to create kickback for order ${order.orderId}:`,
            _error
          );
        }
      }

      if (
        ordersToMoveToShipping.length > 0 ||
        ordersNeedingAttention.length > 0
      ) {
        console.log(
          `🧹 AUTO-CLEANUP COMPLETE: Moved ${ordersToMoveToShipping.length} orders to Shipping QC, created kickbacks for ${ordersNeedingAttention.length} orders needing attention`
        );
      }
    } catch (_error) {
      console._error('❌ Error in autoMoveInvalidStockModelOrders:', _error);
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
        console.log(
          `✅ CLEANUP: Removed ${deletedCount} orphaned layup schedule entries`
        );
      } else {
        console.log('✅ CLEANUP: No orphaned layup schedule entries found');
      }
    } catch (_error) {
      console._error('❌ CLEANUP ERROR:', _error);
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
        console.log(
          `📅 Filtering layup schedule by date range: ${weekStart} to ${weekEnd}`
        );
        const scheduleData = await storage.getLayupScheduleByDateRange(
          weekStart as string,
          weekEnd as string
        );
        res.json(scheduleData);
      } else {
        // Default: return all schedule data
        const scheduleData = await storage.getAllLayupSchedule();
        res.json(scheduleData);
      }
    } catch (_error) {
      console._error('❌ Layup schedule fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch layup schedule' });
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
    } catch (_error) {
      console._error('❌ Layup schedule create _error:', _error);
      res.status(500).json({ _error: 'Failed to create layup schedule entry' });
    }
  });

  app.delete('/api/layup-schedule/by-order/:orderId', async (req, res) => {
    try {
      console.log(
        '🔧 LAYUP SCHEDULE DELETE BY ORDER CALLED',
        req.params.orderId
      );
      const { storage } = await import('../../storage');
      await storage.deleteLayupScheduleByOrder(req.params.orderId);
      res.json({ success: true });
    } catch (_error) {
      console._error('❌ Layup schedule delete _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to delete layup schedule entries' });
    }
  });

  // Generate layup schedule from production queue
  app.post('/api/layup-schedule/generate', async (req, res) => {
    try {
      console.log('🔧 LAYUP SCHEDULE GENERATE CALLED');
      const { storage } = await import('../../storage');

      // Get production orders (already sorted by priority)
      const productionOrders = await storage.getAllProductionOrders();
      console.log(
        '🔧 Found production orders for scheduling:',
        productionOrders.length
      );

      // Get mold and employee settings (using same API as LayupScheduler component)
      const molds = await storage.getAllMolds();
      const employeeSettingsResponse = await fetch(
        'http://localhost:5000/api/layup-employee-settings'
      );
      const layupEmployees = await employeeSettingsResponse.json();

      console.log('🔧 Found molds:', molds.length);
      console.log('🔧 Found layup _employees:', layupEmployees.length);
      console.log(
        '🔧 First few production orders:',
        productionOrders.slice(0, 3).map((o) => ({
          orderId: o.orderId,
          itemName: o.itemName,
          itemId: o.itemId,
        }))
      );

      // Get stock models for proper mapping
      const stockModels = await storage.getAllStockModels();

      // Transform data for scheduler utility
      const orders = productionOrders.map((order) => {
        // Map item names to stock model IDs using itemId or itemName
        let stockModelId = (order as any).itemId;
        if (!stockModelId && (order as any).itemName) {
          // Try to find matching stock model by name
          const matchingModel = stockModels.find(
            (model) =>
              model.displayName === (order as any).itemName ||
              model.name ===
                (order as any).itemName
                  .toLowerCase()
                  .replace(/\s+/g, '_')
                  .replace(/[^a-z0-9_]/g, '')
          );
          if (matchingModel) {
            stockModelId = matchingModel.id;
          } else if ((order as any).itemName.includes('Mesa')) {
            // Default Mesa items to mesa_universal if no exact match
            stockModelId = 'mesa_universal';
          } else {
            stockModelId = 'unknown';
          }
        }

        return {
          orderId: order.orderId,
          product: (order as any).itemName || 'Unknown Product',
          customer: (order as any).customerName || 'Unknown Customer',
          stockModelId: stockModelId || 'unknown',
          dueDate: order.dueDate,
          orderDate: order.orderDate,
          priorityScore: 50, // Default priority score since productionOrders doesn't have this field
          quantity: 1,
          features: (order as any).specifications || {}, // Include specifications as features
          source: 'production_order', // Add source for identification
        };
      });

      console.log(
        '🔧 Transformed orders with stock models:',
        orders.slice(0, 3).map((o) => ({
          orderId: o.orderId,
          product: o.product,
          stockModelId: o.stockModelId,
        }))
      );

      const employeeSettings = layupEmployees.map((emp: any) => ({
        employeeId: emp.employeeId,
        name: emp.name || `Employee ${emp.employeeId}`,
        rate: emp.rate || 1.5, // orders per hour
        hours: emp.hours || 8, // working hours per day
      }));

      console.log('🔧 Employee settings for scheduling:', employeeSettings);

      // Import and use the proper scheduling algorithm that respects employee production rates
      const { generateLayupSchedule } = await import(
        '../../../client/src/utils/schedulerUtils'
      );

      console.log(
        '🔧 Using advanced scheduling algorithm with employee production rates...'
      );

      // Clear existing schedule
      await storage.clearLayupSchedule();

      // Prepare mold settings with proper interface matching MoldSettings
      const moldSettings = molds.map((mold) => ({
        moldId: mold.moldId,
        modelName: mold.modelName || mold.moldId, // Use moldId as fallback for modelName
        enabled: true,
        multiplier: 2, // Default capacity multiplier
        instanceNumber: 1, // Default instance
        stockModels: mold.stockModels || [], // Include stock model compatibility
      }));

      console.log('🔧 Mold settings for scheduling:', moldSettings.slice(0, 3));

      // Use the sophisticated scheduling algorithm that respects employee production rates
      const scheduleResults = generateLayupSchedule(
        orders,
        moldSettings,
        employeeSettings
      );

      console.log(
        '🔧 Advanced scheduler generated',
        scheduleResults.length,
        'schedule entries'
      );
      console.log(
        '🔧 First few schedule results:',
        scheduleResults.slice(0, 3).map((r) => ({
          orderId: r.orderId,
          date: r.scheduledDate.toDateString(),
          moldId: r.moldId,
          employeeCount: r.employeeAssignments.length,
        }))
      );

      const createdEntries = [];

      // Convert schedule results to database entries
      for (const result of scheduleResults) {
        const scheduleEntry = {
          orderId: result.orderId,
          scheduledDate: result.scheduledDate,
          moldId: result.moldId,
          employeeAssignments: result.employeeAssignments,
          isOverride: false,
        };

        const created = await storage.createLayupSchedule(scheduleEntry);
        createdEntries.push(created);
      }

      console.log('🔧 Created layup schedule entries:', createdEntries.length);
      res.json({
        success: true,
        entriesGenerated: createdEntries.length,
        schedule: createdEntries,
      });
    } catch (_error) {
      console._error('❌ Error generating layup schedule:', _error);
      res.status(500).json({ _error: 'Failed to generate layup schedule' });
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
    } catch (_error) {
      console._error('Get P2 customers _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P2 customers' });
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
    } catch (_error) {
      console._error('🔧 P2 purchase orders bypass _error:', _error);
      res.status(500).json({
        _error: 'Failed to fetch P2 purchase orders via bypass route',
      });
    }
  });

  // Push orders to Layup/Plugging department
  app.post('/api/push-to-layup-plugging', async (req, res) => {
    try {
      console.log('🔧 PUSH TO LAYUP/PLUGGING CALLED', req.body);
      const { orderIds } = req.body;

      if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ _error: 'orderIds array is required' });
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
          const productionOrder = await storage.getProductionOrder(
            parseInt(orderId)
          );
          if (productionOrder) {
            // Update without status field since it's not in the type
            return await storage.updateProductionOrder(parseInt(orderId), {
              notes: 'Moved to Layup/Plugging department',
            });
          }

          throw new Error(`Order ${orderId} not found`);
        } catch (_error) {
          console._error(`Failed to update order ${orderId}:`, _error);
          return null;
        }
      });

      const results = await Promise.all(updatePromises);
      const updatedOrders = results.filter((result: any) => result !== null);

      console.log('🔧 Updated orders to Layup/Plugging:', updatedOrders.length);
      res.json({
        success: true,
        updatedOrders: updatedOrders,
        totalProcessed: orderIds.length,
      });
    } catch (_error) {
      console._error('❌ Push to layup/plugging _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to push orders to layup/plugging department' });
    }
  });

  // Python scheduler integration endpoint
  app.post('/api/python-scheduler', async (req, res) => {
    try {
      console.log('🐍 PYTHON SCHEDULER CALLED');
      const { orders, molds, _employees } = req.body;

      // Simple JavaScript-based scheduler that mimics Python logic
      // This is a placeholder implementation that can be enhanced
      const schedule: any[] = [];
      const workDays: Date[] = [];

      // Generate next 30 work days (Monday-Thursday only)
      const today = new Date();
      const currentDate = new Date(today);

      while (workDays.length < 30) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek >= 1 && dayOfWeek <= 4) {
          // Monday through Thursday
          workDays.push(new Date(currentDate));
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Simple round-robin assignment
      const availableMolds = molds.filter((m: any) => m.enabled);
      const defaultMold =
        availableMolds.length > 0 ? availableMolds[0] : { moldId: 'DEFAULT-1' };

      orders
        .slice(0, Math.min(orders.length, 100))
        .forEach((order: any, index: number) => {
          const workDayIndex = index % workDays.length;
          const moldIndex = index % Math.max(availableMolds.length, 1);

          schedule.push({
            order_id: order.orderId,
            mold_id: availableMolds[moldIndex]?.moldId || defaultMold.moldId,
            scheduled_date: workDays[workDayIndex].toISOString().split('T')[0],
            priority_score: (order as any).priorityScore || 50,
          });
        });

      console.log('🐍 Generated schedule entries:', schedule.length);
      res.json({
        success: true,
        schedule: schedule,
        message:
          'JavaScript-based scheduler completed (Python integration can be added later)',
      });
    } catch (_error) {
      console._error('❌ Python scheduler _error:', _error);
      res.status(500).json({ _error: 'Failed to run scheduler' });
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
    } catch (_error) {
      console._error('🔧 P2 purchase order create bypass _error:', _error);
      res.status(500).json({
        _error: 'Failed to create P2 purchase order via bypass route',
      });
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
    } catch (_error) {
      console._error('🔧 P2 purchase order update bypass _error:', _error);
      res.status(500).json({
        _error: 'Failed to update P2 purchase order via bypass route',
      });
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
    } catch (_error) {
      console._error('🔧 P2 purchase order delete bypass _error:', _error);
      res.status(500).json({
        _error: 'Failed to delete P2 purchase order via bypass route',
      });
    }
  });

  // Stock Models routes - bypass to old monolithic routes temporarily
  app.get('/api/stock-models', async (req, res) => {
    try {
      console.log('🔍 Stock models API called');
      const { storage } = await import('../../storage');
      const stockModels = await storage.getAllStockModels();
      console.log(
        '🔍 Retrieved stock models from storage:',
        stockModels.length,
        'models'
      );
      if (stockModels.length > 0) {
        console.log('🔍 First stock model from storage:', stockModels[0]);
        console.log('🔍 First stock model keys:', Object.keys(stockModels[0]));
      }

      // Transform data to ensure proper format for frontend
      const transformedModels = stockModels.map((model) => ({
        id: model.id,
        name: model.name,
        displayName:
          model.displayName || (model as any).display_name || model.name,
        price: model.price,
        description: model.description,
        isActive: model.isActive,
        sortOrder: model.sortOrder,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      }));

      console.log('🔍 Transformed models count:', transformedModels.length);
      if (transformedModels.length > 0) {
        console.log('🔍 First transformed model:', transformedModels[0]);
      }

      res.json(transformedModels);
    } catch (_error) {
      console._error('🚨 Error retrieving stock models:', _error);
      res.status(500).json({ _error: 'Failed to retrieve stock models' });
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
    } catch (_error) {
      console._error('🔧 Stock model create _error:', _error);
      res.status(500).json({ _error: 'Failed to create stock model' });
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
    } catch (_error) {
      console._error('🔧 Stock model update _error:', _error);
      res.status(500).json({ _error: 'Failed to update stock model' });
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
    } catch (_error) {
      console._error('🔧 Stock model delete _error:', _error);
      res.status(500).json({ _error: 'Failed to delete stock model' });
    }
  });

  // Features routes - bypass to old monolithic routes temporarily
  app.get('/api/features', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const features = await storage.getAllFeatures();
      res.json(features);
    } catch (_error) {
      console._error('🎯 Features API Error:', _error);
      res.status(500).json({ _error: 'Failed to retrieve features' });
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
    } catch (_error) {
      console._error('🔧 Feature create _error:', _error);
      res.status(500).json({ _error: 'Failed to create feature' });
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
    } catch (_error) {
      console._error('🔧 Feature update _error:', _error);
      res.status(500).json({ _error: 'Failed to update feature' });
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
    } catch (_error) {
      console._error('🔧 Feature delete _error:', _error);
      res.status(500).json({ _error: 'Failed to delete feature' });
    }
  });

  app.get('/api/feature-categories', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const categories = await storage.getAllFeatureCategories();
      res.json(categories);
    } catch (_error) {
      console._error('Get feature categories _error:', _error);
      res.status(500).json({ _error: 'Failed to get feature categories' });
    }
  });

  app.get('/api/feature-sub-categories', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const subCategories = await storage.getAllFeatureSubCategories();
      res.json(subCategories);
    } catch (_error) {
      console._error('Get feature sub-categories _error:', _error);
      res.status(500).json({ _error: 'Failed to get feature sub-categories' });
    }
  });

  // NEW: Direct employee layup settings route for LayupScheduler
  app.get('/api/employee-layup-data', async (req, res) => {
    try {
      console.log('🚀 NEW ROUTE CALLED: /api/employee-layup-data');
      const { storage } = await import('../../storage');
      const settings = await storage.getAllEmployeeLayupSettings();
      console.log('🚀 Employee data retrieved:', settings.length, '_employees');
      res.setHeader('Content-Type', 'application/json');
      res.json(settings);
    } catch (_error) {
      console._error('🚀 Employee data fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch employee data' });
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
      console.log('🔧 Found _employees from database:', settings);
      console.log('🔧 Employee count:', settings.length);
      console.log('🔧 Returning JSON response...');

      // Set explicit headers to ensure JSON response
      res.setHeader('Content-Type', 'application/json');
      res.json(settings);
      console.log('🔧 JSON response sent successfully');
    } catch (_error) {
      console._error('🔧 Employee layup settings fetch _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to fetch employee layup settings' });
    }
  });

  // Update employee layup settings
  app.put('/api/layup-employee-settings/:id', async (req, res) => {
    try {
      console.log('🔧 EMPLOYEE UPDATE ROUTE CALLED:', req.params.id);
      console.log('🔧 Request body:', req.body);

      const { storage } = await import('../../storage');
      const { id } = req.params;
      const { rate, moldsPerHour, _dailyCapacity, hours } = req.body;

      // First, get the employee to find their employeeId string
      const _employees = await storage.getAllEmployeeLayupSettings();
      const employee = _employees.find((emp) => emp.id === parseInt(id));

      if (!employee) {
        console._error(`❌ Employee with ID ${id} not found`);
        return res.status(404).json({ _error: 'Employee not found' });
      }

      const employeeIdString =
        employee.employeeId || employee.name || `employee-${id}`;
      console.log(
        `🔍 Using employeeId string: "${employeeIdString}" for database ID: ${id}`
      );

      // Update employee settings - use moldsPerHour as rate and calculate _dailyCapacity
      const updateData = {
        rate: parseFloat(moldsPerHour || rate) || 1.25, // Store moldsPerHour as rate
        hours: parseFloat(hours) || 8,
        department: 'Layup',
        isActive: true,
      };

      const updatedEmployee = await storage.updateEmployeeLayupSettings(
        employeeIdString,
        updateData
      );

      console.log('🔧 Updated employee:', updatedEmployee);
      res.json(updatedEmployee);
    } catch (_error) {
      console._error('🔧 Employee update _error:', _error);
      res.status(500).json({ _error: 'Failed to update employee settings' });
    }
  });

  // Address routes - bypass to old monolithic routes temporarily
  app.get('/api/addresses/all', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const addresses = await storage.getAllAddresses();
      res.json(addresses);
    } catch (_error) {
      console._error('Get all addresses _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch addresses' });
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
    } catch (_error) {
      console._error('🔧 Address create _error:', _error);
      res.status(500).json({ _error: 'Failed to create address' });
    }
  });

  app.put('/api/addresses/:id', async (req, res) => {
    try {
      console.log('🔧 ADDRESS UPDATE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const addressData = req.body;
      const address = await storage.updateCustomerAddress(
        parseInt(id),
        addressData
      );
      console.log('🔧 Updated address:', address.id);
      res.json(address);
    } catch (_error) {
      console._error('🔧 Address update _error:', _error);
      res.status(500).json({ _error: 'Failed to update address' });
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
    } catch (_error) {
      console._error('🔧 Address delete _error:', _error);
      res.status(500).json({ _error: 'Failed to get all addresses' });
    }
  });

  app.get('/api/addresses', async (req, res) => {
    try {
      const { customerId } = req.query;
      if (!customerId) {
        return res.status(400).json({ _error: 'Customer ID is required' });
      }
      const { storage } = await import('../../storage');
      const addresses = await storage.getCustomerAddresses(
        customerId as string
      );
      res.json(addresses);
    } catch (_error) {
      console._error('Get customer addresses _error:', _error);
      res.status(500).json({ _error: 'Failed to get customer addresses' });
    }
  });

  // P1 Production Queue endpoint - combines regular orders and P1 production orders
  app.get('/api/p1-production-queue', async (req, res) => {
    try {
      console.log('🏭 Starting P1 production queue processing...');
      const { storage } = await import('../../storage');

      // Get only finalized orders from draft table that are ready for production
      const allOrders = await storage.getAllOrderDrafts();
      const layupOrders = allOrders.filter(
        (order) =>
          (order as any).status === 'FINALIZED' &&
          ((order as any).currentDepartment === 'Layup' ||
            !(order as any).currentDepartment)
      );

      // Add debug logging for features
      console.log('Sample P1 production queue order features:', {
        orderId: layupOrders[0]?.orderId,
        features: layupOrders[0]?.features,
        modelId: layupOrders[0]?.modelId,
      });

      // Get P1 Production Orders (generated from purchase orders)
      const productionOrders = await storage.getAllProductionOrders();
      const pendingProductionOrders = productionOrders.filter(
        (po) => po.productionStatus === 'PENDING'
      );

      const p1LayupOrders = pendingProductionOrders.map((po) => {
        // Calculate priority score based on due date urgency
        const dueDate = new Date(po.dueDate || po.orderDate);
        const today = new Date();
        const daysUntilDue = Math.ceil(
          (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const priorityScore = Math.max(
          20,
          Math.min(35, 20 + Math.floor(daysUntilDue / 30))
        ); // 20-35 range

        return {
          id: `p1-prod-${po.id}`,
          orderId: po.orderId,
          orderDate: po.orderDate,
          customer: po.customerName,
          product: po.itemName,
          quantity: 1, // Each production order is for 1 unit
          status: po.productionStatus,
          department: (po as any).currentDepartment || 'P1 Production Queue',
          currentDepartment:
            (po as any).currentDepartment || 'P1 Production Queue',
          priorityScore: priorityScore,
          dueDate: po.dueDate,
          source: 'production_order' as const, // Mark as production order for purple styling
          poId: po.poId,
          poItemId: po.poItemId,
          productionOrderId: po.id,
          stockModelId: po.itemId, // Use item ID as stock model for mold matching
          specifications: po.specifications,
          createdAt: po.createdAt,
          updatedAt: po.updatedAt,
        };
      });

      // Convert regular orders to unified format
      const regularLayupOrders = layupOrders.map((order) => ({
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
        updatedAt: order.updatedAt || order.orderDate,
      }));

      // Combine P1 order types only
      const combinedOrders = [...regularLayupOrders, ...p1LayupOrders].sort(
        (a, b) =>
          ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50)
      );

      console.log(
        `🏭 P1 production queue orders count: ${combinedOrders.length}`
      );
      console.log(
        `🏭 Regular orders: ${regularLayupOrders.length}, P1 PO orders: ${p1LayupOrders.length}`
      );

      res.json(combinedOrders);
    } catch (_error) {
      console._error('P1 production queue _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P1 production queue' });
    }
  });

  // P2 Production Queue endpoint - handles P2 production orders only
  app.get('/api/p2-production-queue', async (req, res) => {
    try {
      console.log('🏭 Starting P2 production queue processing...');
      const { storage } = await import('../../storage');

      // Get production orders from P2 system
      const productionOrders = await storage.getAllP2ProductionOrders();
      const pendingProductionOrders = productionOrders.filter(
        (po) => po.status === 'PENDING'
      );

      const p2LayupOrders = pendingProductionOrders.map((po) => {
        // Calculate priority score for production orders (higher priority)
        const dueDate = new Date(po.dueDate || po.createdAt || new Date());
        const today = new Date();
        const daysUntilDue = Math.ceil(
          (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );
        const priorityScore = Math.max(
          20,
          Math.min(35, 20 + Math.floor(daysUntilDue / 2))
        ); // 20-35 range, higher priority

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
          updatedAt: po.updatedAt || po.createdAt || new Date().toISOString(),
        };
      });

      console.log(
        `🏭 P2 production queue orders count: ${p2LayupOrders.length}`
      );
      console.log(`🏭 Production orders in P2 result: ${p2LayupOrders.length}`);

      res.json(p2LayupOrders);
    } catch (_error) {
      console._error('P2 production queue _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P2 production queue' });
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
    } catch (_error) {
      console._error('🏭 P1 sync _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to sync P1 orders to production queue' });
    }
  });

  // Push orders to Layup/Plugging Department Manager workflow
  app.post('/api/push-to-layup-plugging', async (req, res) => {
    try {
      console.log('🏭 PRODUCTION FLOW: Push to Layup/Plugging API called');
      const { orderIds } = req.body;

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({
          _error: 'orderIds array is required',
          success: false,
        });
      }

      console.log(
        `🏭 PRODUCTION FLOW: Processing ${orderIds.length} orders for department push`
      );
      const { storage } = await import('../../storage');

      // Update orders to move them to Layup department with IN_PROGRESS status
      const updatedOrders = [];

      for (const orderId of orderIds) {
        try {
          // Update order status and department for both regular orders and production orders
          const updateResult = await storage.updateOrderDepartment(
            orderId,
            'Layup',
            'IN_PROGRESS'
          );

          if (updateResult.success) {
            updatedOrders.push(orderId);
            console.log(
              `✅ PRODUCTION FLOW: Order ${orderId} moved to Layup department`
            );
          } else {
            console.warn(
              `⚠️ PRODUCTION FLOW: Failed to update order ${orderId}: ${updateResult.message}`
            );
          }
        } catch (orderError) {
          console._error(
            `❌ PRODUCTION FLOW: Error updating order ${orderId}:`,
            orderError
          );
        }
      }

      const result = {
        success: true,
        message: `Successfully moved ${updatedOrders.length} of ${orderIds.length} orders to Layup/Plugging department`,
        updatedOrders,
        totalRequested: orderIds.length,
        totalUpdated: updatedOrders.length,
      };

      console.log('🏭 PRODUCTION FLOW: Department push result:', result);
      res.json(result);
    } catch (_error) {
      console._error(
        '❌ PRODUCTION FLOW: Push to Layup/Plugging _error:',
        _error
      );
      res.status(500).json({
        _error: 'Failed to push orders to Layup/Plugging department',
        success: false,
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
    } catch (_error) {
      console._error('🏭 Unified queue _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to fetch unified production queue' });
    }
  });

  // P2 Layup Schedule endpoints - separate schedule for P2 production orders
  app.get('/api/p2-layup-schedule', async (req, res) => {
    try {
      console.log('🔧 P2 LAYUP SCHEDULE API CALLED');
      const { storage } = await import('../../storage');

      const scheduleEntries = await storage.getAllLayupSchedule();
      console.log(
        '🔧 Found P2 layup schedule entries:',
        scheduleEntries.length
      );

      res.json(scheduleEntries);
    } catch (_error) {
      console._error('P2 layup schedule _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P2 layup schedule' });
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
    } catch (_error) {
      console._error('P2 layup schedule create _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to create P2 layup schedule entry' });
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
    } catch (_error) {
      console._error('P2 layup schedule delete _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to delete P2 layup schedule entries' });
    }
  });

  // Python scheduler integration endpoint
  app.post('/api/python-scheduler', async (req, res) => {
    try {
      console.log(
        '🐍 Running Python scheduler with Mesa Universal constraints...'
      );
      const { spawn } = require('child_process');
      const path = require('path');

      const { orders = [], molds = [], _employees = [] } = req.body;

      if (orders.length === 0) {
        return res.status(400).json({ _error: 'Orders array is required' });
      }

      // Prepare data for Python scheduler
      const schedulerInput = {
        orders: orders.map((order: any) => ({
          order_id: order.orderId,
          order_type:
            order.source === 'production_order'
              ? 'production_order'
              : (order as any).stockModelId === 'mesa_universal'
                ? 'mesa_universal'
                : 'regular',
          features: (order as any).features || {},
          quantity: (order as any).quantity || 1,
          priority: (order as any).priorityScore || 50,
          deadline: order.dueDate || order.orderDate,
          stock_model_id: (order as any).stockModelId || (order as any).modelId,
        })),
        molds: molds.map((mold: any) => ({
          mold_id: mold.moldId,
          capacity: mold.multiplier || 1,
          compatible_types: [
            'production_order',
            'mesa_universal',
            'regular',
            'P1',
          ],
          stock_models: mold.stockModels || [],
        })),
        _employees: _employees.map((emp: any) => ({
          employee_id: emp.employeeId,
          skills: ['production_order', 'mesa_universal', 'regular', 'P1'], // All _employees can handle all types
          prod_rate: emp.rate || 1,
          hours_per_day: emp.hours || 10,
        })),
      };

      const pythonScript = path.join(process.cwd(), 'scripts', 'scheduler.py');
      const pythonProcess = spawn(
        'python',
        [pythonScript, '--json-input', '--json-output'],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

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
          console._error('Python scheduler _error:', errorOutput);
          return res
            .status(500)
            .json({ _error: 'Python scheduler failed', details: errorOutput });
        }

        try {
          // Extract JSON from output (filter out console.log messages)
          const lines = output.trim().split('\n');
          const jsonLine = lines.find((line) => line.startsWith('{'));

          if (!jsonLine) {
            console.log('Python scheduler output:', output);
            return res.json({ schedule: [], summary: {}, raw_output: output });
          }

          const result = JSON.parse(jsonLine);
          console.log(
            `🐍 Python scheduler completed: ${result.schedule?.length || 0} orders scheduled`
          );

          res.json(result);
        } catch (parseError) {
          console._error(
            'Failed to parse Python scheduler output:',
            parseError
          );
          res.status(500).json({
            _error: 'Failed to parse scheduler output',
            raw_output: output,
          });
        }
      });

      // Send input data to Python process
      pythonProcess.stdin.write(JSON.stringify(schedulerInput));
      pythonProcess.stdin.end();
    } catch (_error) {
      console._error('Python scheduler integration _error:', _error);
      res.status(500).json({ _error: 'Failed to run Python scheduler' });
    }
  });

  // Push scheduled orders to layup/plugging queue workflow
  app.post('/api/push-to-layup-plugging', async (req, res) => {
    try {
      console.log('🔄 Push to Layup/Plugging Queue workflow initiated');
      const { storage } = await import('../../storage');
      const { orderIds } = req.body;

      if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ _error: 'orderIds array is required' });
      }

      // Update orders to move them to the next department (layup/plugging phase)
      const updatedOrders = [];
      for (const orderId of orderIds) {
        // Update production orders status to LAID_UP
        const productionOrder =
          await storage.getProductionOrderByOrderId(orderId);
        if (productionOrder) {
          const updated = await storage.updateProductionOrder(
            productionOrder.id,
            {
              productionStatus: 'LAID_UP',
              laidUpAt: new Date(),
            }
          );
          updatedOrders.push(updated);
          console.log(`✅ Production order ${orderId} moved to LAID_UP status`);
        }

        // Update regular order drafts to next department
        const orderDrafts = await storage.getAllOrderDrafts();
        const regularOrder = orderDrafts.find((o) => o.orderId === orderId);
        if (regularOrder && regularOrder.id) {
          await storage.updateOrderDraft(regularOrder.id.toString(), {
            currentDepartment: 'Barcode', // Move from Layup to next department
          });
          console.log(
            `✅ Regular order ${orderId} moved to Barcode department`
          );
        }
      }

      console.log(
        `🔄 Successfully pushed ${updatedOrders.length} orders to layup/plugging queue`
      );
      res.json({
        success: true,
        message: `${updatedOrders.length} orders moved to layup/plugging phase`,
        updatedOrders,
      });
    } catch (_error) {
      console._error('Push to layup/plugging _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to push orders to layup/plugging queue' });
    }
  });

  // Legacy unified production queue endpoint (kept for backward compatibility)
  app.get('/api/production-queue', async (req, res) => {
    try {
      console.log(
        '🏭 Starting unified production queue processing (legacy)...'
      );
      const { storage } = await import('../../storage');

      // Get only finalized orders from draft table that are ready for production
      const allOrders = await storage.getAllOrderDrafts();
      const layupOrders = allOrders.filter(
        (order) =>
          (order as any).status === 'FINALIZED' &&
          ((order as any).currentDepartment === 'Layup' ||
            !(order as any).currentDepartment)
      );

      // Get P1 Purchase Orders with stock model items
      const pos = await storage.getAllPurchaseOrders();
      const activePos = pos.filter((po) => po.status === 'OPEN');

      const p1LayupOrders = [];
      for (const po of activePos) {
        const items = await storage.getPurchaseOrderItems(po.id);
        const stockModelItems = items.filter(
          (item) => item.itemId && item.itemId.trim()
        );

        for (const item of stockModelItems) {
          // Calculate priority score based on due date urgency
          const dueDate = new Date(po.expectedDelivery || po.poDate);
          const today = new Date();
          const daysUntilDue = Math.ceil(
            (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
          );
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
            updatedAt: po.updatedAt,
          });
        }
      }

      // Convert regular orders to unified format
      const regularLayupOrders = layupOrders.map((order) => ({
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
        updatedAt: order.updatedAt || order.orderDate,
      }));

      // Combine only P1 order types (no P2 production orders)
      const combinedOrders = [...regularLayupOrders, ...p1LayupOrders].sort(
        (a, b) =>
          ((a as any).priorityScore || 50) - ((b as any).priorityScore || 50)
      );

      console.log(
        `🏭 Legacy production queue orders count: ${combinedOrders.length}`
      );

      res.json(combinedOrders);
    } catch (_error) {
      console._error('Legacy production queue _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch production queue' });
    }
  });

  // Note: Order ID generation routes now handled by modular orders routes

  // P1 Purchase Orders with enhanced customer and stock information
  app.get('/api/p1-purchase-orders', async (req, res) => {
    try {
      console.log('🔧 P1 Purchase Orders endpoint called');
      const { storage } = await import('../../storage');
      const purchaseOrders = await storage.getAllPurchaseOrders();

      // Enhance each purchase order with customer details and stock counts
      const enhancedPOs = await Promise.all(
        purchaseOrders.map(async (po) => {
          // Get purchase order items to count stocks
          const items = await storage.getPurchaseOrderItems(po.id);
          // Count all items that are stock items (custom_model items are the actual stocks for PO#P18261)
          const stockItems = items.filter(
            (item) =>
              item.itemType === 'stock_model' ||
              item.itemType === 'custom_model' ||
              (item.itemName &&
                (item.itemName.includes('AG-') ||
                  item.itemName.includes('stock')))
          );
          const stockCount = stockItems.length; // Count number of stock items, not quantities

          return {
            id: po.id,
            poNumber: po.poNumber,
            customerName: po.customerName, // Use customerName instead of vendorName
            customerId: po.customerId,
            dueDate: po.expectedDelivery, // Use expectedDelivery as due date
            status: po.status,
            stockCount: stockCount, // Number of stocks associated
            itemCount: items.length, // Total number of items
            poDate: po.poDate,
            notes: po.notes,
          };
        })
      );

      console.log('🔧 Found P1 purchase orders:', enhancedPOs.length);
      res.json(enhancedPOs);
    } catch (_error) {
      console._error('🔧 P1 purchase orders fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P1 purchase orders' });
    }
  });

  // Get list of PO vendors (customers)
  app.get('/api/po-vendors', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const purchaseOrders = await storage.getAllPurchaseOrders();

      // Group by customer to get unique vendors with counts
      const vendorMap = new Map();

      await Promise.all(
        purchaseOrders.map(async (po) => {
          const customerId = po.customerId;
          const customerName = po.customerName;

          if (!vendorMap.has(customerId)) {
            vendorMap.set(customerId, {
              id: customerId,
              name: customerName,
              poCount: 0,
              totalStockItems: 0,
            });
          }

          const vendor = vendorMap.get(customerId);
          vendor.poCount++;

          // Count stock items for this PO
          const items = await storage.getPurchaseOrderItems(po.id);
          const stockItems = items.filter(
            (item) =>
              item.itemType === 'stock_model' ||
              item.itemType === 'custom_model' ||
              (item.itemName &&
                (item.itemName.includes('AG-') ||
                  item.itemName.includes('stock')))
          );
          vendor.totalStockItems += stockItems.length;
        })
      );

      const vendors = Array.from(vendorMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      res.json(vendors);
    } catch (_error) {
      console._error('🔧 PO vendors fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch PO vendors' });
    }
  });

  // Get POs filtered by vendor
  app.get('/api/po-by-vendor/:vendorId', async (req, res) => {
    try {
      const { vendorId } = req.params;
      const { storage } = await import('../../storage');
      const purchaseOrders = await storage.getAllPurchaseOrders();

      // Filter POs by vendor (customer)
      const vendorPOs = purchaseOrders.filter(
        (po) => po.customerId === vendorId
      );

      // Enhance with stock counts
      const enhancedPOs = await Promise.all(
        vendorPOs.map(async (po) => {
          const items = await storage.getPurchaseOrderItems(po.id);
          const stockItems = items.filter(
            (item) =>
              item.itemType === 'stock_model' ||
              item.itemType === 'custom_model' ||
              (item.itemName &&
                (item.itemName.includes('AG-') ||
                  item.itemName.includes('stock')))
          );

          // Calculate total quantity across all stock items
          const totalStockQuantity = stockItems.reduce(
            (sum, item) => sum + (item.quantity || 0),
            0
          );

          return {
            id: po.id,
            poNumber: po.poNumber,
            customerName: po.customerName,
            customerId: po.customerId,
            dueDate: po.expectedDelivery,
            status: po.status,
            stockCount: totalStockQuantity, // Total quantity, not just count of items
            distinctStockItems: stockItems.length, // Number of distinct stock item types
            itemCount: items.length,
            poDate: po.poDate,
            notes: po.notes,
          };
        })
      );

      res.json(enhancedPOs);
    } catch (_error) {
      console._error('🔧 PO by vendor fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch POs by vendor' });
    }
  });

  // Get stock items for a specific PO with current_department for filtering
  app.get('/api/po-stock-items-list/:poId', async (req, res) => {
    try {
      const { poId } = req.params;
      const { storage } = await import('../../storage');

      const items = await storage.getPurchaseOrderItems(parseInt(poId));
      const stockItems = items.filter(
        (item) =>
          item.itemType === 'stock_model' ||
          item.itemType === 'custom_model' ||
          (item.itemName &&
            (item.itemName.includes('AG-') || item.itemName.includes('stock')))
      );

      // Query production orders to get current_department for each item
      const enhancedStockItems = await Promise.all(
        stockItems.map(async (item) => {
          // Parse specifications if available
          let specs = {};
          try {
            specs = item.specifications
              ? JSON.parse(item.specifications as string)
              : {};
          } catch (_e) {
            specs = {};
          }

          // Get production orders for this PO item to find current_department
          const productionOrders = await pool.query(
            `
            SELECT order_id, current_department, stock_model_id
            FROM production_orders
            WHERE po_id = $1 AND item_id = $2::text
            ORDER BY created_at DESC
            LIMIT 1
          `,
            [parseInt(poId), item.id.toString()]
          );

          const currentDepartment =
            productionOrders.rows?.[0]?.current_department ||
            'P1 Production Queue';

          return {
            id: item.id,
            itemId: item.itemId,
            itemName: item.itemName,
            itemType: item.itemType,
            quantity: item.quantity,
            specifications: specs,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice,
            orderCount: item.orderCount,
            current_department: currentDepartment,
          };
        })
      );

      res.json(enhancedStockItems);
    } catch (_error) {
      console._error('🔧 PO stock items fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch PO stock items' });
    }
  });

  // PO Stock Items to Production Connection endpoint
  app.get('/api/po-stock-items/:poNumber', async (req, res) => {
    try {
      const { poNumber } = req.params;
      console.log('🔧 Fetching stock items for PO:', poNumber);

      // Get PO stock items with detailed specifications
      const stockItemsResult = await pool.query(
        `
        SELECT 
          poi.id,
          poi.item_name,
          poi.item_type,
          poi.quantity,
          poi.stock_model_id,
          poi.specifications,
          poi.order_count,
          po.po_number,
          po.customer_id,
          po.customer_name
        FROM purchase_order_items poi 
        JOIN purchase_orders po ON poi.po_id = po.id 
        WHERE po.po_number = $1
      `,
        [poNumber]
      );

      const stockItems = stockItemsResult.rows || [];

      // For each stock item, check if there are associated production orders
      const enhancedItems = await Promise.all(
        stockItems.map(async (item: any) => {
          // Check for existing production orders that might be linked to this PO item
          const productionOrdersResult = await pool.query(
            `
            SELECT 
              order_id,
              current_department,
              status,
              due_date
            FROM orders 
            WHERE po_id IS NOT NULL OR customer_id = $1
          `,
            [item.customer_id]
          );

          const productionOrders = productionOrdersResult.rows || [];

          // Parse specifications if available
          let specs = {};
          try {
            specs = item.specifications ? JSON.parse(item.specifications) : {};
          } catch (_e) {
            console.warn(
              '⚠️ Failed to parse specifications for item:',
              item.id
            );
          }

          return {
            ...item,
            specifications: specs,
            productionOrders: productionOrders,
            canCreateProductionOrder: productionOrders.length === 0,
            productionStatus:
              productionOrders.length > 0
                ? 'In Production'
                : 'Ready for Production',
          };
        })
      );

      console.log(
        `🔧 Found ${enhancedItems.length} stock items for PO ${poNumber}`
      );
      res.json(enhancedItems);
    } catch (_error) {
      console._error('❌ PO stock items fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch PO stock items' });
    }
  });

  // Create production orders from PO stock items
  app.post(
    '/api/po-stock-items/:poNumber/create-production-orders',
    async (req, res) => {
      try {
        const { poNumber } = req.params;
        const { selectedItems } = req.body;

        console.log(
          `🔧 Creating production orders for PO ${poNumber}, items:`,
          selectedItems
        );

        const { storage } = await import('../../storage');

        // Get PO details and selected items
        const poResult = await pool.query(
          `
        SELECT * FROM purchase_orders WHERE po_number = $1
      `,
          [poNumber]
        );

        if (poResult.rows.length === 0) {
          return res.status(404).json({ _error: 'Purchase order not found' });
        }

        const po = poResult.rows[0];
        const createdOrders = [];

        // Create production orders for each selected item
        for (const itemId of selectedItems) {
          const itemResult = await pool.query(
            `
          SELECT * FROM purchase_order_items WHERE id = $1
        `,
            [itemId]
          );

          if (itemResult.rows.length === 0) {
            console.warn(`⚠️ PO item ${itemId} not found, skipping`);
            continue;
          }

          const item = itemResult.rows[0];
          let specs = {};

          try {
            specs = item.specifications ? JSON.parse(item.specifications) : {};
          } catch (_e) {
            console.warn(
              '⚠️ Failed to parse specifications for item:',
              item.id
            );
          }

          // Generate order ID for new production order
          const orderIdResult = await storage.generateOrderId();
          const newOrderId = orderIdResult.orderId;

          // Create production order with PO connection
          const productionOrderData = {
            orderId: newOrderId,
            customer: po.customer_name || po.customer_id,
            product: item.item_name,
            quantity: item.quantity,
            status: 'ACTIVE',
            date: new Date(),
            currentDepartment: 'P1 Production Queue',
            priorityScore: 40, // Higher priority for PO items
            poId: po.id,
            itemId: item.id.toString(),
            stockModelId: specs.stockModel || null,
            customerId: po.customer_id,
            notes: `Created from PO ${poNumber} - ${item.item_name}`,
            dueDate:
              po.expected_delivery ||
              new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days if no due date
          };

          const _createdOrder = await storage.createOrder(productionOrderData);
          createdOrders.push({
            orderId: newOrderId,
            poItemId: item.id,
            itemName: item.item_name,
            specs: specs,
          });

          console.log(
            `✅ Created production order ${newOrderId} for PO item ${item.item_name}`
          );
        }

        res.json({
          success: true,
          createdOrders: createdOrders,
          message: `Successfully created ${createdOrders.length} production orders from PO ${poNumber}`,
        });
      } catch (_error) {
        console._error('❌ Create production orders _error:', _error);
        res
          .status(500)
          .json({ _error: 'Failed to create production orders from PO items' });
      }
    }
  );

  // Purchase Orders routes (POs)
  app.get('/api/pos', async (req, res) => {
    try {
      console.log('🔧 Purchase Orders (POs) endpoint called');
      const { storage } = await import('../../storage');
      const purchaseOrders = await storage.getAllPurchaseOrders();
      console.log('🔧 Found purchase orders:', purchaseOrders.length);
      res.json(purchaseOrders);
    } catch (_error) {
      console._error('🔧 Purchase orders fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch purchase orders' });
    }
  });

  app.post('/api/pos', async (req, res) => {
    try {
      console.log('🔧 Create Purchase Order endpoint called');
      const { insertPurchaseOrderSchema } = await import('@shared/schema');
      const { storage } = await import('../../storage');
      const purchaseOrderData = insertPurchaseOrderSchema.parse(req.body);
      const newPurchaseOrder =
        await storage.createPurchaseOrder(purchaseOrderData);
      console.log('🔧 Created purchase order:', newPurchaseOrder.id);
      res.status(201).json(newPurchaseOrder);
    } catch (_error: any) {
      console._error('🔧 Create purchase order _error:', _error);

      // Check for duplicate PO number _error
      if (
        _error.code === '23505' &&
        _error.constraint === 'purchase_orders_po_number_key'
      ) {
        return res.status(400).json({
          _error: `PO Number "${req.body.poNumber}" already exists. Please use a different PO number.`,
        });
      }

      // Generic _error for other cases
      res
        .status(500)
        .json({ _error: _error.message || 'Failed to create purchase order' });
    }
  });

  app.put('/api/pos/:id', async (req, res) => {
    try {
      console.log('🔧 Update Purchase Order endpoint called');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const updateData = req.body;
      const updatedPurchaseOrder = await storage.updatePurchaseOrder(
        parseInt(id),
        updateData
      );
      console.log('🔧 Updated purchase order:', updatedPurchaseOrder.id);
      res.json(updatedPurchaseOrder);
    } catch (_error) {
      console._error('🔧 Update purchase order _error:', _error);
      res.status(500).json({ _error: 'Failed to update purchase order' });
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
    } catch (_error) {
      console._error('🔧 Delete purchase order _error:', _error);
      res.status(500).json({ _error: 'Failed to delete purchase order' });
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
    } catch (_error) {
      console._error('🔧 Get PO items _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch purchase order items' });
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
          const poProduct = await storage.getPOProduct(
            parseInt(validatedData.itemId)
          );
          console.log(
            '🔧 Checking PO Product for auto-queue:',
            poProduct?.productType
          );

          if (poProduct && poProduct.productType === 'stock') {
            console.log('🔧 Auto-adding stock item to production queue');
            // Auto-add to production queue for stock items
            // This item will automatically appear in the P1 PO Production Queue
            // The production queue fetches all PO items, so it will show up automatically
            console.log(
              '🔧 Stock item will appear in P1 PO Production Queue automatically'
            );
          }
        } catch (poProductError) {
          console.warn(
            '🔧 Could not fetch PO Product for auto-queue check:',
            poProductError
          );
          // Continue without failing the item creation
        }
      }

      res.status(201).json(newItem);
    } catch (_error) {
      console._error('🔧 Create PO item _error:', _error);
      res.status(500).json({ _error: 'Failed to create purchase order item' });
    }
  });

  app.put('/api/pos/:poId/items/:itemId', async (req, res) => {
    try {
      console.log('🔧 Update Purchase Order Item endpoint called');
      const { storage } = await import('../../storage');
      const { itemId } = req.params;
      const updateData = req.body;
      const updatedItem = await storage.updatePurchaseOrderItem(
        parseInt(itemId),
        updateData
      );
      console.log('🔧 Updated PO item:', updatedItem.id);
      res.json(updatedItem);
    } catch (_error) {
      console._error('🔧 Update PO item _error:', _error);
      res.status(500).json({ _error: 'Failed to update purchase order item' });
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
    } catch (_error) {
      console._error('🔧 Delete PO item _error:', _error);
      res.status(500).json({ _error: 'Failed to delete purchase order item' });
    }
  });

  // Generate Production Orders from Purchase Order Items
  app.post('/api/pos/:id/generate-production-orders', async (req, res) => {
    try {
      console.log(
        '🏭 Generate Production Orders endpoint called for PO:',
        req.params.id
      );
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.id);

      // Check if production orders already exist for this PO
      const existingOrders = await storage.getProductionOrdersByPoId(poId);
      if (existingOrders.length > 0) {
        return res.status(409).json({
          _error: `Production orders already exist for this PO (${existingOrders.length} orders found). Cannot generate duplicates.`,
          existingCount: existingOrders.length,
        });
      }

      // Get the purchase order details
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ _error: 'Purchase order not found' });
      }

      // Get all items for this purchase order
      const poItems = await storage.getPurchaseOrderItems(poId);
      const stockModelItems = poItems.filter(
        (item) => item.itemId && item.itemId.trim()
      );

      console.log(
        `🏭 Found ${stockModelItems.length} stock model items to convert to production orders`
      );

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
              const expectedDue = purchaseOrder.expectedDelivery
                ? new Date(purchaseOrder.expectedDelivery)
                : new Date(purchaseOrder.poDate);
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
              expectedDelivery: purchaseOrder.expectedDelivery,
            },
          };

          console.log(
            '🏭 Production order data before creation:',
            JSON.stringify(productionOrderData, null, 2)
          );
          const _createdOrder =
            await storage.createProductionOrder(productionOrderData);
          createdOrders.push(_createdOrder);

          // Also create entry in main orders table for layup scheduler
          const _mainOrderData = {
            orderId: _createdOrder.orderId,
            customer: purchaseOrder.customerName,
            product: item.itemId,
            quantity: 1,
            status: 'Active',
            date: new Date(),
            currentDepartment: 'P1 Production Queue',
            isOnSchedule: true,
            priorityScore: 50,
            poId: purchaseOrder.poNumber,
            dueDate: _createdOrder.dueDate,
            createdAt: new Date(),
          };

          // await storage.createOrder(_mainOrderData); // Method may not exist, commenting out
          console.log(
            `🏭 Created main order entry: ${productionOrderData.orderId} for layup scheduler`
          );

          console.log(
            `🏭 Created production order: ${productionOrderData.orderId} for ${item.itemId}`
          );
        }
      }

      console.log(
        `🏭 Successfully created ${createdOrders.length} production orders from PO ${purchaseOrder.poNumber}`
      );

      res.json({
        success: true,
        message: `Generated ${createdOrders.length} production orders`,
        createdOrders: createdOrders.length,
        orders: createdOrders.map((order) => ({
          orderId: order.orderId,
          partName: (order as any).partName || 'Unknown',
          dueDate: order.dueDate,
          status: (order as any).status || 'Active',
        })),
      });
    } catch (_error) {
      console._error('🏭 Generate production orders _error:', _error);
      res.status(500).json({ _error: 'Failed to generate production orders' });
    }
  });

  // Get Production Orders by PO ID
  app.get('/api/production-orders/by-po/:poId', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.poId);

      const productionOrders = await storage.getProductionOrdersByPoId(poId);

      res.json(productionOrders);
    } catch (_error) {
      console._error('🔧 Get production orders by PO _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch production orders' });
    }
  });

  // P1 Production Schedule Calculation
  app.post('/api/pos/:id/calculate-production-schedule', async (req, res) => {
    try {
      console.log(
        '📅 P1 Production Schedule Calculation endpoint called for PO:',
        req.params.id
      );
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.id);

      // Get the purchase order details
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ _error: 'Purchase order not found' });
      }

      // Get all items for this purchase order
      const poItems = await storage.getPurchaseOrderItems(poId);
      if (poItems.length === 0) {
        return res
          .status(400)
          .json({ _error: 'No items found in purchase order' });
      }

      const finalDueDate = new Date(purchaseOrder.expectedDelivery);
      const today = new Date();

      // Calculate available weeks (excluding weekends, only Mon-Thu production days)
      const msPerWeek = 7 * 24 * 60 * 60 * 1000;
      const totalWeeksAvailable = Math.floor(
        (finalDueDate.getTime() - today.getTime()) / msPerWeek
      );
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
        const enabledMolds = molds.filter((m) => m.enabled);

        // Find molds that support this item's stock model
        const itemStockModel = item.stockModelId || item.itemId;

        // Handle both numeric IDs and string IDs for stock model matching
        const compatibleMolds = enabledMolds.filter((m) => {
          if (!m.stockModels || !Array.isArray(m.stockModels)) return false;

          // Check direct match
          if (m.stockModels.includes(itemStockModel)) return true;

          // If itemStockModel is numeric (like "1"), try to match with mesa_universal
          if (itemStockModel === '1' || itemStockModel === 1) {
            return m.stockModels.includes('mesa_universal');
          }

          return false;
        });

        console.log(
          `🔧 Item ${item.itemName} (stock model: ${itemStockModel})`
        );
        console.log(`🔧 Enabled molds: ${enabledMolds.length}`);
        console.log(
          `🔧 Compatible molds: ${compatibleMolds.length}`,
          compatibleMolds.map((m) => ({
            moldId: m.moldId,
            multiplier: m.multiplier,
          }))
        );

        // Calculate weekly capacity based on compatible molds
        // Assume 4 working days per week (Mon-Thu) and account for mold multipliers
        const dailyMoldCapacity = compatibleMolds.reduce(
          (sum, m) => sum + m.multiplier,
          0
        );
        const maxItemsPerWeek = dailyMoldCapacity * 4; // 4 working days per week

        console.log(`🔧 Daily mold capacity: ${dailyMoldCapacity}`);
        console.log(`🔧 Weekly capacity: ${maxItemsPerWeek} items/week`);

        // If no compatible molds, use Mesa Universal capacity: 8 items/day × 4 days = 32 per week
        const effectiveWeeklyCapacity =
          maxItemsPerWeek > 0 ? maxItemsPerWeek : 32; // Mesa Universal: 8/day × 4 days

        // Calculate items per week needed to meet due date
        const itemsPerWeekNeeded = Math.ceil(itemsNeeded / availableWeeks);
        const actualItemsPerWeek = Math.min(
          itemsPerWeekNeeded,
          effectiveWeeklyCapacity
        );
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
          weekDueDate.setDate(weekDueDate.getDate() + week * 7 + 3); // +3 days from Monday = Thursday

          const itemsThisWeek = Math.min(
            actualItemsPerWeek,
            itemsNeeded - week * actualItemsPerWeek
          );

          weeklySchedule.push({
            week: week + 1,
            dueDate: weekDueDate.toISOString().split('T')[0],
            itemsToComplete: itemsThisWeek,
            cumulativeItems: Math.min(
              (week + 1) * actualItemsPerWeek,
              itemsNeeded
            ),
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
            _dailyCapacity: dailyMoldCapacity,
            weeklyCapacity: effectiveWeeklyCapacity,
          },
        });

        console.log(`   Item: ${item.itemName}`);
        console.log(`     Quantity: ${itemsNeeded}`);
        console.log(`     Compatible molds: ${compatibleMolds.length}`);
        console.log(`     Daily mold capacity: ${dailyMoldCapacity}`);
        console.log(`     Weekly capacity: ${effectiveWeeklyCapacity}`);
        console.log(`     Items/week needed: ${itemsPerWeekNeeded}`);
        console.log(`     Items/week actual: ${actualItemsPerWeek}`);
        console.log(`     Weeks needed: ${weeksNeeded}`);
        console.log(
          `     Feasible: ${itemsPerWeekNeeded <= effectiveWeeklyCapacity ? 'Yes' : 'No'}`
        );
      }

      const overallFeasible = scheduleData.every((item) => item.feasible);

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
            : [
                'Consider extending due date',
                'Increase production capacity',
                'Prioritize critical items',
              ],
        },
      });
    } catch (_error) {
      console._error('📅 Production schedule calculation _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to calculate production schedule' });
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

      // Check all_orders table FIRST - this is the single source of truth for current department
      try {
        const allOrders = await storage.getAllOrders();
        order = allOrders.find((o) => o.orderId === orderId);
        if (order) orderSource = 'all_orders';
      } catch (_e) {
        console._error('Error checking all_orders:', e);
      }

      // Check finalized orders if not found
      if (!order) {
        try {
          order = await storage.getFinalizedOrderById(orderId);
          if (order) orderSource = 'finalized';
        } catch (_e) {
          // Continue searching
        }
      }

      // Check draft orders if not found
      if (!order) {
        try {
          order = await storage.getOrderDraft(orderId);
          if (order) orderSource = 'draft';
        } catch (_e) {
          // Continue searching
        }
      }

      // Check production orders if not found
      if (!order) {
        try {
          const productionOrders = await storage.getAllProductionOrders();
          order = productionOrders.find((po) => po.orderId === orderId);
          if (order) orderSource = 'production';
        } catch (_e) {
          // Continue searching
        }
      }

      if (!order) {
        return res.status(404).json({ _error: 'Order not found' });
      }

      // Get customer details
      let customer = null;
      if (order.customerId) {
        try {
          const customers = await storage.getAllCustomers();
          customer = customers.find(
            (c) =>
              c.id.toString() === order.customerId ||
              c.name === order.customerId
          );
        } catch (_e) {
          console._error('Error fetching customer:', e);
        }
      }

      // Get stock model details and extract color information
      let baseModel = null;
      let color = null;
      if ((order as any).modelId || (order as any).itemId) {
        try {
          const stockModels = await storage.getAllStockModels();
          baseModel = stockModels.find(
            (sm) =>
              sm.id === ((order as any).modelId || (order as any).itemId) ||
              sm.name === ((order as any).modelId || (order as any).itemId)
          );
        } catch (_e) {
          console._error('Error fetching stock model:', e);
        }
      }

      // Extract color from features or specifications
      if ((order as any).features) {
        if ((order as any).features.color)
          color = (order as any).features.color;
        if ((order as any).features.paintOption)
          color = (order as any).features.paintOption;
        if ((order as any).features.finish)
          color = (order as any).features.finish;
      }
      if ((order as any).specifications) {
        if ((order as any).specifications.color)
          color = (order as any).specifications.color;
        if ((order as any).specifications.paintOption)
          color = (order as any).specifications.paintOption;
        if ((order as any).specifications.finish)
          color = (order as any).specifications.finish;
      }

      // Build comprehensive order summary
      const orderSummary = {
        orderId: order.orderId,
        barcode: barcode,
        orderDate: order.orderDate || order.createdAt,
        customer: customer
          ? {
              name: customer.name,
              email: customer.email || '',
              company: customer.company || '',
              phone: customer.phone || '',
            }
          : {
              name:
                order.customerId ||
                (order as any).customerName ||
                'Unknown Customer',
              email: '',
              company: '',
              phone: '',
            },
        baseModel: baseModel
          ? {
              name: baseModel.displayName || baseModel.name,
              id: baseModel.id,
              price: baseModel.price || 0,
            }
          : {
              name:
                (order as any).modelId ||
                (order as any).itemId ||
                (order as any).itemName ||
                'Unknown Model',
              id: (order as any).modelId || (order as any).itemId || '',
              price: 0,
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
          override: false,
        },
        paymentStatus: (order as any).paymentStatus || 'UNPAID',
        status: (order as any).status || 'PENDING',
        currentDepartment: (order as any).currentDepartment || 'Order Entry',
        dueDate: order.dueDate,
        notes: order.notes || '',
        source: orderSource,

        // Additional fields for barcode display (using display names)
        customerName:
          customer?.name ||
          order.customerId ||
          (order as any).customerName ||
          'Unknown Customer',
        stockModel:
          baseModel?.displayName ||
          baseModel?.name ||
          (order as any).modelId ||
          (order as any).itemId ||
          (order as any).itemName,
        color: color || 'Not specified',
        actionLength:
          (order as any).features?.action_length ||
          (order as any).specifications?.action_length ||
          '',
        paintOption:
          (order as any).features?.paintOption ||
          (order as any).specifications?.paintOption ||
          color,

        // Enhanced feature display with user-friendly names
        displayFeatures: {
          model:
            baseModel?.displayName ||
            baseModel?.name ||
            (order as any).modelId ||
            (order as any).itemId ||
            'Unknown Model',
          actionLength: (order as any).features?.action_length
            ? (order as any).features.action_length
                .toString()
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l) => l.toUpperCase())
            : 'Not specified',
          color: color
            ? color
                .toString()
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (l) => l.toUpperCase())
            : 'Not specified',
          finish:
            (order as any).features?.finish ||
            (order as any).features?.paintOption
              ? (
                  (order as any).features.finish ||
                  (order as any).features.paintOption
                )
                  .toString()
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (l) => l.toUpperCase())
              : 'Not specified',
        },
      };

      // Add production-specific details if applicable
      if (orderSource === 'production') {
        (orderSummary as any).productionDetails = {
          partName: (order as any).partName || (order as any).itemName,
          quantity: (order as any).quantity || 1,
          department: (order as any).department,
          priority: (order as any).priority || 3,
          productionStatus:
            (order as any).productionStatus || (order as any).status,
        };
      }

      console.log(`✅ Barcode scan successful for order: ${orderId}`);
      res.json(orderSummary);
    } catch (_error) {
      console._error('Barcode scan _error:', _error);
      res.status(500).json({ _error: 'Failed to scan barcode' });
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
      } catch (_e) {
        // Continue searching
      }

      // Check draft orders if not found
      if (!order) {
        try {
          order = await storage.getOrderDraft(orderId);
          if (order) orderSource = 'draft';
        } catch (_e) {
          // Continue searching
        }
      }

      // Check production orders if not found
      if (!order) {
        try {
          const productionOrders = await storage.getAllProductionOrders();
          order = productionOrders.find((po) => po.orderId === orderId);
          if (order) orderSource = 'production';
        } catch (_e) {
          // Continue searching
        }
      }

      if (!order) {
        return res.status(404).json({ _error: 'Order not found' });
      }

      // Get customer details
      let customer = null;
      if (order.customerId) {
        try {
          const customers = await storage.getAllCustomers();
          customer = customers.find(
            (c) =>
              c.id.toString() === order.customerId ||
              c.name === order.customerId
          );
        } catch (_e) {
          console._error('Error fetching customer:', e);
        }
      }

      // Get stock model details
      let baseModel = null;
      if ((order as any).modelId || (order as any).itemId) {
        try {
          const stockModels = await storage.getAllStockModels();
          baseModel = stockModels.find(
            (sm) =>
              sm.id === ((order as any).modelId || (order as any).itemId) ||
              sm.name === ((order as any).modelId || (order as any).itemId)
          );
        } catch (_e) {
          console._error('Error fetching stock model:', e);
        }
      }

      // Build comprehensive order summary
      const orderSummary = {
        orderId: order.orderId,
        orderDate: order.orderDate || order.createdAt,
        customer: customer
          ? {
              name: customer.name,
              email: customer.email || '',
              company: customer.company || '',
              phone: customer.phone || '',
            }
          : {
              name: order.customerId || 'Unknown Customer',
              email: '',
              company: '',
              phone: '',
            },
        baseModel: baseModel
          ? {
              name: baseModel.displayName || baseModel.name,
              id: baseModel.id,
              price: baseModel.price || 0,
            }
          : {
              name:
                (order as any).modelId ||
                (order as any).itemId ||
                'Unknown Model',
              id: (order as any).modelId || (order as any).itemId || '',
              price: 0,
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
          override: false,
        },
        paymentStatus: (order as any).paymentStatus || 'UNPAID',
        status: (order as any).status || 'PENDING',
        currentDepartment: (order as any).currentDepartment || 'Order Entry',
        dueDate: order.dueDate,
        notes: order.notes || '',
        source: orderSource,
        barcode: `P1-${order.orderId}`,
      };

      // Add production-specific details if applicable
      if (orderSource === 'production') {
        (orderSummary as any).productionDetails = {
          partName: (order as any).partName || (order as any).itemName,
          quantity: (order as any).quantity || 1,
          department: (order as any).department,
          priority: (order as any).priority || 3,
          productionStatus:
            (order as any).productionStatus || (order as any).status,
        };
      }

      res.json(orderSummary);
    } catch (_error) {
      console._error('Complete order summary _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to fetch complete order summary' });
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Update order department endpoint with progress logic
  app.post('/api/orders/update-department', async (req, res) => {
    try {
      console.log(
        '🔄 DEPT UPDATE API: Received request body:',
        JSON.stringify(req.body, null, 2)
      );
      const { orderIds, department, status, assignedTechnician } = req.body;

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        console.log('❌ DEPT UPDATE API: Invalid orderIds:', orderIds);
        return res.status(400).json({ _error: 'Order IDs array is required' });
      }

      if (!department) {
        console.log('❌ DEPT UPDATE API: Department missing');
        return res.status(400).json({ _error: 'Department is required' });
      }

      console.log(
        `🔄 DEPT UPDATE API: Processing ${orderIds.length} order(s) to department: ${department}`
      );
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
            case 'Layup':
              completionUpdates.layupCompletedAt = now;
              break;
            case 'Plugging':
              completionUpdates.pluggingCompletedAt = now;
              break;
            case 'CNC':
              completionUpdates.cncCompletedAt = now;
              break;
            case 'Finish':
              completionUpdates.finishCompletedAt = now;
              break;
            case 'Gunsmith':
              completionUpdates.gunsmithCompletedAt = now;
              break;
            case 'Paint':
              completionUpdates.paintCompletedAt = now;
              break;
            case 'QC':
              completionUpdates.qcCompletedAt = now;
              break;
            case 'Shipping':
              completionUpdates.shippingCompletedAt = now;
              break;
          }

          // Prepare update data
          const updateData: any = {
            currentDepartment: department,
            status: status || 'IN_PROGRESS',
            ...completionUpdates,
          };

          // Add technician assignment if provided
          if (assignedTechnician) {
            updateData.assignedTechnician = assignedTechnician;
          }

          // Update the appropriate table
          let updatedOrder;
          if (isFinalized) {
            updatedOrder = await storage.updateFinalizedOrder(
              orderId,
              updateData
            );
          } else {
            updatedOrder = await storage.updateOrderDraft(orderId, {
              ...updateData,
              updatedAt: now,
            });
          }

          updatedOrders.push(updatedOrder);
          console.log(
            `✅ Progressed order ${orderId} from ${currentOrder.currentDepartment} to ${department}`
          );
        } catch (orderError) {
          console._error(`Error updating order ${orderId}:`, orderError);
        }
      }

      console.log(
        `✅ Updated ${updatedOrders.length}/${orderIds.length} orders to department: ${department}`
      );

      res.json({
        success: true,
        message: `Updated ${updatedOrders.length} orders to ${department} department`,
        updatedOrders: updatedOrders.length,
        totalRequested: orderIds.length,
      });
    } catch (_error) {
      console._error('❌ Update department _error:', _error);
      res.status(500).json({ _error: 'Failed to update order department' });
    }
  });

  // Create barcode labels for selected orders
  app.post('/api/barcode/create-labels', async (req, res) => {
    try {
      const { orderIds } = req.body;
      const { storage } = await import('../../storage');

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ _error: 'Order IDs required' });
      }

      console.log(
        `🏷️ Creating barcode labels for ${orderIds.length} orders:`,
        orderIds
      );

      // Get stock models for display name mapping
      const stockModels = await storage.getAllStockModels();
      const stockModelMap = new Map();
      stockModels.forEach((model) => {
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
        } catch (_error) {
          console.warn(`Could not find order ${orderId}:`, _error);
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
        const endIndex = Math.min(
          startIndex + labelsPerPage,
          orderDetails.length
        );

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
          const x = leftMargin + col * (labelWidth + columnGap);
          const y = 792 - labelHeight - row * labelHeight; // Position labels properly from top

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
            '0': '000110100',
            '1': '100100001',
            '2': '001100001',
            '3': '101100000',
            '4': '000110001',
            '5': '100110000',
            '6': '001110000',
            '7': '000100101',
            '8': '100100100',
            '9': '001100100',
            A: '100001001',
            B: '001001001',
            C: '101001000',
            D: '000011001',
            E: '100011000',
            F: '001011000',
            G: '000001101',
            H: '100001100',
            I: '001001100',
            J: '000011100',
            K: '100000011',
            L: '001000011',
            M: '101000010',
            N: '000010011',
            O: '100010010',
            P: '001010010',
            Q: '000000111',
            R: '100000110',
            S: '001000110',
            T: '000010110',
            U: '110000001',
            V: '011000001',
            W: '111000000',
            X: '010010001',
            Y: '110010000',
            Z: '011010000',
            '-': '010000101',
            '.': '110000100',
            ' ': '011000100',
            $: '010101000',
            '/': '010100010',
            '+': '010001010',
            '%': '000101010',
            '*': '010010100',
          };

          const drawCode39Barcode = (
            text: string,
            startX: number,
            startY: number
          ) => {
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
            for (const char of fullText) {
              if (code39Table[char]) {
                estimatedWidth += thinWidth * 6 + thickWidth * 3 + interCharGap; // 9 elements per char
              }
            }

            const maxWidth = 150; // Increased width for better spacing
            const scale =
              estimatedWidth > maxWidth ? maxWidth / estimatedWidth : 1;
            const scaledThin = thinWidth * scale;
            const scaledThick = thickWidth * scale;
            const scaledGap = interCharGap * scale;

            for (const char of fullText) {
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
          const actionLength =
            (order as any).features?.action_length || 'unknown';
          const modelDisplayName =
            stockModelMap.get((order as any).modelId) ||
            (order as any).modelId ||
            'Unknown';

          // Add order information at top
          page.drawText(`${order.orderId}`, {
            x: x + 8,
            y: y + 50,
            size: 11,
            color: rgb(0, 0, 0),
          });

          // Check for special features to add to label
          const features = (order as any).features || {};

          // Get paint option for display with subcategory
          const paintOption = features.paint_options || '';

          // Map paint values to their subcategories
          const paintSubcategoryMap: { [key: string]: string } = {
            // Standard Options
            black_sky: 'STANDARD',
            charcoal_gray: 'STANDARD',
            primed_only: 'STANDARD',
            // Terrain Options
            muddy_creek_terrain: 'TERRAIN',
            sunset_terrain: 'TERRAIN',
            prairie_terrain: 'TERRAIN',
            blackthorn_terrain: 'TERRAIN',
            basin_terrain: 'TERRAIN',
            bayou_terrain: 'TERRAIN',
            dark_timber_terrain: 'TERRAIN',
            everglades_terrain: 'TERRAIN',
            ravine_terrain: 'TERRAIN',
            red_terrain: 'TERRAIN',
            riverbed_terrain: 'TERRAIN',
            rocky_terrain: 'TERRAIN',
            snowline_terrain: 'TERRAIN',
            verglas_terrain: 'TERRAIN',
            // Rogue Options
            arctic_rogue: 'ROGUE',
            badland_rogue: 'ROGUE',
            bengal_rogue: 'ROGUE',
            canyon_rogue: 'ROGUE',
            erosion_rogue: 'ROGUE',
            glacier_rogue: 'ROGUE',
            hazard_rogue: 'ROGUE',
            killshot_rogue: 'ROGUE',
            kodiak_rogue: 'ROGUE',
            mudshot_rogue: 'ROGUE',
            purple_haze_rogue: 'ROGUE',
            rattlesnake_rogue: 'ROGUE',
            swamper_rogue: 'ROGUE',
            winter_pine_rogue: 'ROGUE',
            wintergreen_rogue: 'ROGUE',
            zombie_rogue: 'ROGUE',
            // Premium Options
            black_bronze_web: 'PREMIUM',
            white_rock_web: 'PREMIUM',
            brown_widow_web: 'PREMIUM',
            green_widow_web: 'PREMIUM',
            sawtooth_web: 'PREMIUM',
            granite_web: 'PREMIUM',
            yellow_web: 'PREMIUM',
            tan_widow: 'PREMIUM',
            red_web: 'PREMIUM',
            orange_web: 'PREMIUM',
            neon_green_web: 'PREMIUM',
            blue_web: 'PREMIUM',
            tungsten_black_web: 'PREMIUM',
            yellow_camo: 'PREMIUM',
            red_camo: 'PREMIUM',
            orange_camo: 'PREMIUM',
            blue_camo: 'PREMIUM',
            green_camo: 'PREMIUM',
            sand_storm: 'PREMIUM',
            urban_pattern: 'PREMIUM',
            midnight_forest: 'PREMIUM',
            desert_night: 'PREMIUM',
            sagebrush_pattern: 'PREMIUM',
            // Camo Options (Carbon patterns)
            carbon_neon_green_camo: 'CARBON',
            carbon_midnight_forest: 'CARBON',
            carbon_yellow_camo: 'CARBON',
            carbon_black_tan_camo: 'CARBON',
            carbon_mossy_rock_camo: 'CARBON',
            carbon_red_camo: 'CARBON',
            carbon_steel_camo: 'CARBON',
            carbon_black_camo: 'CARBON',
            carbon_blue_camo: 'CARBON',
            carbon_desert_night_camo: 'CARBON',
            carbon_orange_camo: 'CARBON',
            carbon_sagebrush_camo: 'CARBON',
            carbon_urban_camo: 'CARBON',
            carbon_bronze_camo: 'CARBON',
            carbon_zebra_camo: 'CARBON',
            neon_green_camo: 'CARBON',
            // Carbon Camo Ready
            carbon_camo_ready: 'CARBON READY',
          };

          const subcategory = paintOption
            ? paintSubcategoryMap[paintOption] || ''
            : '';
          const paintDisplayName = paintOption
            ? paintOption.replace(/_/g, ' ').toUpperCase()
            : '';

          // Add stock model, action length, and paint option with subcategory on same line below barcode
          const labelLine = paintDisplayName
            ? subcategory
              ? `${modelDisplayName} - ${actionLength.toUpperCase()} - ${subcategory}: ${paintDisplayName}`
              : `${modelDisplayName} - ${actionLength.toUpperCase()} - PAINT: ${paintDisplayName}`
            : `${modelDisplayName} - ${actionLength.toUpperCase()}`;

          page.drawText(labelLine, {
            x: x + 8,
            y: y + 22,
            size: 6, // Smaller to fit subcategory + paint name
            color: rgb(0, 0, 0),
          });

          const specialLabels = [];

          // Extract swivel studs and texture options for color-coded display
          const swivelStudsText =
            features.swivel_studs &&
            features.swivel_studs !== 'standard_swivel_studs' &&
            features.swivel_studs !== 'standard'
              ? features.swivel_studs.replace(/_/g, ' ')
              : null;

          const textureText =
            features.texture_options &&
            features.texture_options !== 'no_texture' &&
            features.texture_options !== 'none'
              ? features.texture_options.replace(/_/g, ' ')
              : null;

          // Check for NSNH (No Swivel Studs No Holes) - this should show as "NSNH"
          const hasNSNH =
            features.swivel_studs === 'no_swivel_studs' ||
            features.swivel_studs === 'no_swivel_no_holes' ||
            (features.swivel_studs &&
              features.swivel_studs.includes('no_swivel')) ||
            (features.swivel_studs &&
              features.swivel_studs.includes('no_holes'));

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
          if (
            features.paint_options === 'carbon_camo_ready' ||
            (features.paint_options &&
              features.paint_options.includes('carbon_camo'))
          ) {
            specialLabels.push('CARBON CAMO READY');
          }

          // Determine barcode color based on specifications
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
            const paintedOptions = [
              'terraine',
              'premium',
              'standard',
              'rattlesnake_rogue',
            ];
            const isPaintedOption = paintedOptions.some((option) =>
              paintOption.toLowerCase().includes(option)
            );
            const isFiberglassModel = modelId.toLowerCase().startsWith('fg');

            if (isPaintedOption || isFiberglassModel) {
              barcodeColor = rgb(0, 0.4, 1); // Blue (#0066FF)
            }
          }

          // Redraw barcode with appropriate color
          const redrawCode39Barcode = (
            text: string,
            startX: number,
            startY: number,
            color: any
          ) => {
            const thinWidth = 1.0;
            const thickWidth = 3.0;
            const barHeight = 15;
            const interCharGap = 1.0;
            let currentX = startX;

            const fullText = `*${text.toUpperCase()}*`;

            let estimatedWidth = 0;
            for (const char of fullText) {
              if (code39Table[char]) {
                estimatedWidth += thinWidth * 6 + thickWidth * 3 + interCharGap;
              }
            }

            const maxWidth = 150;
            const scale =
              estimatedWidth > maxWidth ? maxWidth / estimatedWidth : 1;
            const scaledThin = thinWidth * scale;
            const scaledThick = thickWidth * scale;
            const scaledGap = interCharGap * scale;

            for (const char of fullText) {
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
            day: 'numeric',
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
      res.setHeader(
        'Content-Disposition',
        'inline; filename="barcode-labels.pdf"'
      );
      res.setHeader('Cache-Control', 'no-cache');
      res.send(Buffer.from(pdfBytes));

      console.log(
        `✅ Generated barcode labels PDF for ${orderDetails.length} orders`
      );
    } catch (_error) {
      console._error('🏷️ Create barcode labels _error:', _error);
      res.status(500).json({ _error: 'Failed to create barcode labels' });
    }
  });

  // Progress orders to next department
  app.post('/api/orders/progress-department', async (req, res) => {
    try {
      const { orderIds, toDepartment } = req.body;
      const { storage } = await import('../../storage');

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ _error: 'Order IDs required' });
      }

      if (!toDepartment) {
        return res.status(400).json({ _error: 'Target department required' });
      }

      console.log(
        `🔄 Progressing ${orderIds.length} orders to ${toDepartment}:`,
        orderIds
      );

      const updatedOrders = [];
      const currentTimestamp = new Date();

      for (const orderId of orderIds) {
        const order = await storage.getOrderById(orderId);
        if (order) {
          // Update department and completion timestamp
          const updateData: any = {
            currentDepartment: toDepartment,
            updatedAt: currentTimestamp,
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
            updatedOrder = await storage.updateFinalizedOrder(
              orderId,
              updateData
            );
          } catch (_error) {
            updatedOrder = await storage.updateOrderDraft(orderId, updateData);
          }
          updatedOrders.push(updatedOrder);

          console.log(
            `✅ Progressed ${orderId} from ${(order as any).currentDepartment} to ${toDepartment}`
          );
        }
      }

      res.json({
        success: true,
        message: `Progressed ${updatedOrders.length} orders to ${toDepartment}`,
        updatedOrders: updatedOrders.length,
      });
    } catch (_error) {
      console._error('🔄 Progress orders _error:', _error);
      res.status(500).json({ _error: 'Failed to progress orders' });
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
};
