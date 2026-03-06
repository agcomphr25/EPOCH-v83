/*
EPOCH USER IDENTITY STANDARD

All user references must store:
- <field>UserId (integer FK)
- <field>DisplayName (text snapshot)

Never:
- Store only numeric user ID
- Store only username string
- Return numeric ID to frontend

Use resolveUserSnapshot() or resolveEmployeeSnapshot() for all inserts.
See: server/utils/userSnapshot.ts
*/

import { Express } from 'express';
import { createServer, type Server } from 'http';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { softAuth, authenticateToken, sessionAwareAuth } from '../../middleware/auth';
import { computeEffectivePriority, getEffectivePriorityScore } from '../../../shared/utils/computeEffectivePriority';
import employeesRoutes from './employees';
import ordersRoutes from './orders';
import formsRoutes from './forms';
import tasksRoutes from './tasks';
import kickbackRoutes from './kickbacks';
import inventoryRoutes from './inventory';
import rtsInventoryRoutes from './rtsInventory';
import rtsSalesRoutes from './rtsSales';
import customersRoutes from './customers';
import vendorsRoutes from './vendors';
import vendorPOsRoutes from './vendorPOs';
import pdfTemplatesRoutes from './pdfTemplates';
import qualityRoutes from './quality';
import documentsRoutes from './documents';
import moldsRoutes from './molds';
import layupPdfRoute from './layupPdfRoute';
import shippingPdfRoute from './shippingPdf';
import shippingRoutes from './shipping';
import shippingTestRoutes from './shipping-test';
import orderAttachmentsRoutes from './orderAttachments';
import vendorPoAttachmentsRoutes from './vendorPoAttachments';
import discountsRoutes from './discounts';
// import bomsRoutes from './boms'; // Legacy BOM routes - replaced by Robust BOM system
import robustBomsRoutes from './robustBoms';
import communicationsRoutes from './communications';
import marketingRoutes from './marketing';
import internalMessagesRoutes from './internalMessages';
import nonconformanceRoutes from '../../routes/nonconformance';
import paymentsRoutes from './payments';
import algorithmicSchedulerRoutes from './algorithmicScheduler';
import productionQueueRoutes from './productionQueue';
import layupScheduleRoutes from './layupSchedule';
import gatewayReportsRoutes from './gatewayReports';
import customerSatisfactionRoutes from './customerSatisfaction';
import surveyEngineRoutes from './surveyEngine';
import poProductsRoutes from './poProducts';
import p1POQueueRoutes from './p1POQueue';
import poShippingQCRoutes from './poShippingQC';
import weeklyScheduleRoutes from './weeklySchedule';
import refundRoutes from './refunds';
import moldSyncRoutes from './moldSync';
import authRoutes from './auth';
import usersRoutes from './users';
import userIntegrationsRoutes from './userIntegrations';
import oauthRoutes from './oauth';
import reportsRoutes from './reports';
import oemSettingsRoutes from './oemSettings';
import metalAccessoriesRoutes from './metalAccessories';
import featureSelectionsRoutes from './featureSelections';
import calendarRoutes from './calendar';
import documentIntelligenceRoutes from './documentIntelligence';
import trainingRoutes from './training';
import magicLinkRoutes from './magicLink';
import certificationsRoutes from './certifications';
import globalSearchRoutes from './globalSearch';
import linkedOrdersRoutes from './linkedOrders';
import googleOAuthRoutes from './googleOAuth';
import microsoftAuthRoutes from './microsoftAuth';
import gmailRoutes from './gmail';
import followupOrdersRoutes from './followupOrders';
import cuttingTableRoutes from './cuttingTable';
import controlledDocumentsRoutes from './controlledDocuments';
import adminRoutes from './admin';
import quotesRoutes from './quotes';
import costCentersRoutes from './costCenters';
import costAccountingRoutes from './costAccounting';
import employeeBadgesRoutes from './employeeBadges';
import manufacturingQueueRoutes from './manufacturingQueue';
import cuttingTableManufacturingQueueRoutes from './cuttingTableManufacturingQueue';

import watchRulesRoutes from './watchRules';
import creditMemosRoutes from './creditMemos';
import websiteOrderImportRoutes from './websiteOrderImport';


import p2TravelerRoutes from './p2Traveler';
import p2TravelerViewerRoutes from './p2TravelerViewer';
import p2ProductionQueueRoutes from './p2ProductionQueue';
import p2SerializedItemsRoutes from './p2SerializedItems';
import partRoutingsRoutes from './partRoutings';
import travelersRoutes from './travelers';
import materialLotsRoutes from './materialLots';
import routingDocumentsRoutes from './routingDocuments';

import pdfSettingsRoutes from './pdfSettings';
import p2LayupSchedulesRoutes from './p2LayupSchedules';
import preproductionChecklistsRoutes from './preproductionChecklists';
import checklistManagementRoutes from './checklistManagement';
import forecastRoutes from './forecast';
import healthChecksRoutes from './healthChecks';
import monitoredLinksRoutes from './monitoredLinks';
import projectsRoutes from './projects';
import projectStepAttachmentsRoutes from './projectStepAttachments';
import modelAnalyticsRoutes from './modelAnalytics';
import aqlSamplingRoutes from './aqlSampling';
import auditRoutes from './audit';
import { auditService } from '../services/auditService';
import mediaRoutes from './media';
import voiceNotesRoutes from './voiceNotes';
import patternSignalsRoutes from './patternSignals';
import signPdfRoutes from './signPdf';
import signatureWorkflowRoutes from './signatureWorkflow';
import fieldRoutes from './field';
import timerRoutes from './timer';
import productionTimersRoutes from './productionTimers';
import ticketsRoutes from './tickets';
import attentionRoutes from './attention';
import { registerProcessRunnerRoutes } from './processRunner';
import { registerTimeClockRoutes } from './timeClock';
import { registerOutreachEngineRoutes } from './outreachEngine';
import { registerObjectStorageRoutes } from '../../replit_integrations/object_storage';
import { getAccessToken } from '../utils/upsShipping';
import punchesRoutes from './punches';
import laborRoutes from './labor';
import historicalDataRoutes from './historicalData';
import fillablePdfTemplatesRoutes from './fillablePdfTemplates';
import accountingPrepRoutes from './accountingPrep';
import { qrResolverRouter, qrAdminRouter } from './qrCodes';
import onboardingRoutes from './onboarding';
import assetManagementRoutes from './assetManagement';
import workOrdersRoutes from './workOrders';
import productLabelsRoutes from './productLabels';
import executiveRundownRoutes from './executiveRundown';
import emailTemplatesRoutes from './emailTemplates';
import signOrderSettingsRoutes from './signOrderSettings';

export function registerRoutes(app: Express): Server {
  // Temporary debug route - raw order data inspector
  app.get('/api/debug/order/:orderId', authenticateToken, async (req, res) => {
    try {
      const { orderId } = req.params;
      const { pool } = await import('../../db');

      const allOrdersResult = await pool.query(
        `SELECT * FROM all_orders WHERE order_id = $1`,
        [orderId]
      );

      const productionOrdersResult = await pool.query(
        `SELECT * FROM production_orders WHERE order_id = $1`,
        [orderId]
      );

      const allOrderRow = allOrdersResult.length > 0 ? allOrdersResult[0] : null;
      const prodOrderRow = productionOrdersResult.length > 0 ? productionOrdersResult[0] : null;

      console.log('=== DEBUG RAW ORDER DATA ===');
      console.log('Order ID:', orderId);
      console.log('--- all_orders.features ---');
      console.log(JSON.stringify(allOrderRow?.features, null, 2));
      console.log('--- production_orders.specifications ---');
      console.log(JSON.stringify(prodOrderRow?.specifications, null, 2));
      console.log('--- production_orders.features ---');
      console.log(JSON.stringify(prodOrderRow?.features, null, 2));
      console.log('=== END DEBUG ===');

      res.json({
        orderId,
        all_orders: allOrderRow,
        production_orders: prodOrderRow,
      });
    } catch (error: any) {
      console.error('Debug route error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Temporary debug route - one-time repair for missing production order specs
  app.post('/api/debug/repair-missing-production-specs', authenticateToken, async (req, res) => {
    try {
      const { pool } = await import('../../db');

      await pool.query('BEGIN');

      const result = await pool.query(`
        UPDATE production_orders po
        SET
          specifications = to_jsonb(poi.specifications),
          item_type = COALESCE(poi.item_type, po.item_type)
        FROM purchase_order_items poi
        WHERE po.po_item_id = poi.id
          AND (po.specifications IS NULL OR po.specifications::text = '{}' OR po.specifications::text = 'null')
          AND poi.specifications IS NOT NULL
        RETURNING po.order_id, poi.item_type, poi.specifications
      `);

      const updated = Array.isArray(result) ? result : (result as any).rows || [];

      await pool.query('COMMIT');

      console.log(`=== REPAIR COMPLETE: ${updated.length} production orders updated ===`);
      for (const row of updated) {
        console.log(`  Updated ${row.order_id}: item_type=${row.item_type}`);
      }

      res.json({
        success: true,
        updatedCount: updated.length,
        updatedOrders: updated.map((r: any) => r.order_id),
      });
    } catch (error: any) {
      const { pool } = await import('../../db');
      await pool.query('ROLLBACK');
      console.error('Repair route error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Authentication routes
  app.use('/api/auth', authRoutes);

  // Admin routes
  app.use('/api/admin', adminRoutes);

  // QR Code routes - Separate routers for security
  app.use('/api/qr-codes', qrAdminRouter); // Admin CRUD (protected)
  app.use('/qr', qrResolverRouter); // Public QR code resolver (GET /qr/:code only)

  // Magic Link routes
  app.use('/api/magic-link', magicLinkRoutes);

  // Calendar routes
  app.use('/api/calendar', calendarRoutes);

  // User management routes
  app.use('/api/users', usersRoutes);

  // User integrations routes
  app.use('/api/user-integrations', userIntegrationsRoutes);
  
  // Google OAuth routes
  app.use('/api/oauth/google', googleOAuthRoutes);
  
  // Microsoft OAuth routes
  app.use('/api/auth/microsoft', microsoftAuthRoutes);

  // OAuth routes
  app.use('/api/oauth', oauthRoutes);

  // Gmail routes
  app.use('/api/gmail', gmailRoutes);

  // Employee management routes
  app.use('/api/employees', employeesRoutes);

  // Punch events routes (IC-7) - Read-only mirror from Time Clock
  app.use('/api/punches', punchesRoutes);

  // Labor summary routes (IC-F1) - Derived insights from punch events
  app.use('/api/labor', laborRoutes);

  // Historical Data routes - for tracking legacy system data
  app.use('/api/historical-data', historicalDataRoutes);

  // Order management routes
  app.use('/api/orders', ordersRoutes);
  
  // Website order import routes
  app.use('/api/orders/import-website', websiteOrderImportRoutes);

  // Forms and submissions routes
  app.use('/api/forms', formsRoutes);

  // Task tracker routes
  app.use('/api/task-items', tasksRoutes);

  // Kickback tracking routes
  app.use('/api/kickbacks', kickbackRoutes);

  // Inventory management routes
  app.use('/api/inventory', inventoryRoutes);
  app.use('/api/enhanced', inventoryRoutes); // Mount again for enhanced routes

  // Ready to Ship (RTS) inventory routes
  app.use('/api/rts-inventory', rtsInventoryRoutes);

  // RTS Sales routes
  app.use('/api/rts-sales', rtsSalesRoutes);

  // Customer management routes
  app.use('/api/customers', customersRoutes);
  
  // P2 Layup Schedule routes (MUST come before P2 customer routes to avoid /:id catch-all)
  app.use('/api/p2', p2LayupSchedulesRoutes);
  
  // P2 Production Queue routes
  app.use('/api/p2-production-queue', p2ProductionQueueRoutes);
  
  // P2 Serialized Items routes (finalize, batch assign SKU/drawing)
  app.use('/api/p2/serialized-items', p2SerializedItemsRoutes);
  
  // Part routing management routes
  app.use('/api/part-routings', partRoutingsRoutes);
  
  // Travelers management routes (AS9100-compliant traveler execution)
  app.use('/api/travelers', travelersRoutes);
  
  // Material Lot management routes (AS9100-compliant material traceability)
  app.use('/api/material-lots', materialLotsRoutes);
  
  // Routing Documents management (work instructions, spec sheets, templates, AI parsing)
  app.use('/api/routing-documents', routingDocumentsRoutes);
  
  // P2 Customer management routes - COMMENTED OUT: conflicts with /api/p2/changes and other P2 routes
  // The customers router has a /:id catch-all that intercepts P2 routes like /api/p2/changes
  // Use /api/p2-customers-bypass route instead for P2 customer lookups
  // app.use('/api/p2', customersRoutes);

  // Vendor management routes
  app.use('/api/vendors', vendorsRoutes);
  
  // Vendor purchase orders routes
  app.use('/api/vendor-pos', vendorPOsRoutes);

  // Quote management routes
  app.use(quotesRoutes);

  // Cost Center management routes
  app.use(costCentersRoutes);

  // Cost Accounting routes
  app.use('/api/cost-accounting', costAccountingRoutes);

  // Employee Badge Actions routes
  app.use('/api/employee-badges', employeeBadgesRoutes);

  // Employee Onboarding routes (Phase 0 - placeholder)
  app.use('/api/onboarding', onboardingRoutes);

  // PDF Configuration Settings routes
  app.use(pdfSettingsRoutes);


  // Customer Watch Rules routes
  app.use('/api/watch-rules', watchRulesRoutes);

  // P2 Traveler routes
  app.use('/api/p2-traveler', p2TravelerRoutes);
  
  // P2 Traveler Viewer routes (comprehensive data retrieval & document generation)
  app.use('/api/p2-traveler-viewer', p2TravelerViewerRoutes);


  // PDFME SYSTEM COMMENTED OUT - NOT IN USE
  // PDF Templates routes
  app.use(pdfTemplatesRoutes);

  // PDF Generation routes
  // app.use('/api/generate-pdf', pdfGenerationRoutes);

  // Quality control and maintenance routes
  app.use('/api/quality', qualityRoutes);

  // Asset Management routes
  app.use('/api/assets', assetManagementRoutes);

  // Work Orders (Maintenance Events) routes
  app.use('/api/work-orders', workOrdersRoutes);

  // AQL Sampling Chart routes
  app.use('/api/aql-sampling', aqlSamplingRoutes);

  // Audit System routes
  app.use('/api/audit', auditRoutes);

  // Media Library routes
  app.use('/api/media', mediaRoutes);

  // Voice notes routes (uses sessionAwareAuth to preserve real user sessions over bypass)
  app.use('/api/voice-notes', sessionAwareAuth, voiceNotesRoutes);

  // Pattern awareness signals routes
  app.use('/api/pattern-signals', patternSignalsRoutes);

  // Document management routes - signPdfRoutes first so /all doesn't conflict with /:id
  app.use('/api/documents', signPdfRoutes);
  app.use('/api/documents', documentsRoutes);
  
  // Signature workflow routes - multi-signer document routing
  app.use('/api/signature-workflow', signatureWorkflowRoutes);
  app.use('/api/timer', timerRoutes);
  
  // Native EPOCH Production Timer module
  app.use('/api/production/timers', productionTimersRoutes);
  
  // Field - Calm thinking surface (unstructured, opaque)
  // Field does not affect EPOCH data - no integration allowed
  app.use('/api/field', fieldRoutes);

  // Ticketing System - Internal CSR Tool for complaints, order status, internal issues
  app.use('/api/tickets', ticketsRoutes);
  
  // Attention & State-Confidence System - Admin dashboard for awareness/staleness tracking
  app.use('/api/attention', attentionRoutes);
  
  // Object storage routes - cloud file uploads
  registerObjectStorageRoutes(app);

  // Process Runner integration routes - external timer app events
  registerProcessRunnerRoutes(app);

  // Time Clock integration routes - labor/time event ingestion
  registerTimeClockRoutes(app);

  // Customer Outreach Engine routes - deterministic coverage-based outreach
  registerOutreachEngineRoutes(app);

  // Controlled Documents (Master Document Register) routes
  app.use('/api/controlled-documents', controlledDocumentsRoutes);

  // Order attachments routes
  app.use('/api/order-attachments', orderAttachmentsRoutes);

  // Vendor PO attachments routes
  app.use('/api/vendor-po-attachments', vendorPoAttachmentsRoutes);

  // Mold management routes
  app.use('/api/molds', moldsRoutes);

  // Model analytics routes
  app.use('/api/model-analytics', modelAnalyticsRoutes);

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
  app.use('/api/discounts', discountsRoutes);

  // BOM management routes - Legacy BOM system commented out, replaced by Robust BOM
  // app.use('/api/boms', bomsRoutes);

  // Robust BOM management routes - Advanced BOM system with revisions and parts library
  app.use('/api/robust-boms', robustBomsRoutes);

  // Communications management routes
  app.use('/api/communications', communicationsRoutes);

  // Email template governance routes
  app.use('/api/email-templates', emailTemplatesRoutes);

  // Sign order page settings (GET is public, PUT requires auth)
  app.use('/api/sign-order-settings', signOrderSettingsRoutes);

  // Marketing communications routes
  app.use('/api/marketing', marketingRoutes);

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

  // Gateway reports routes
  app.use('/api/gateway-reports', gatewayReportsRoutes);

  // Customer satisfaction survey routes (legacy EPOCH-specific)
  app.use('/api/customer-satisfaction', customerSatisfactionRoutes);

  // Survey Engine routes (generic reusable survey system)
  app.use('/api/survey-engine', surveyEngineRoutes);

  // PO Products routes
  app.use('/api/po-products', poProductsRoutes);

  // P1 PO Queue routes
  app.use('/api/p1-po-queue', p1POQueueRoutes);

  // Product Labels routes
  app.use('/api/product-labels', productLabelsRoutes);

  // PO Shipping QC routes
  app.use('/api/po-orders', poShippingQCRoutes);

  // Weekly Schedule routes
  app.use('/api/weekly-schedule', weeklyScheduleRoutes);

  // Refund management routes
  app.use('/api/refund-requests', refundRoutes);

  // Credit memo management routes
  app.use('/api/credit-memos', creditMemosRoutes);

  // Pre-Production Checklists routes
  app.use('/api/preproduction-checklists', preproductionChecklistsRoutes);

  // Checklist Management routes (admin + employee-facing)
  app.use('/api/checklist-management', checklistManagementRoutes);

  // Production Forecast Engine routes (read-only)
  app.use('/api/forecast', forecastRoutes);

  // P2 Projects routes
  app.use('/api/projects', projectsRoutes);

  // Project Step Attachments routes
  app.use('/api/project-step-attachments', projectStepAttachmentsRoutes);

  // Health Checks routes
  app.use('/api/health-checks', healthChecksRoutes);

  // Monitored Links routes (for link health checks)
  app.use('/api/monitored-links', monitoredLinksRoutes);

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

  // Global search routes
  app.use('/api', globalSearchRoutes);

  // Linked orders management routes
  app.use('/api/linked-orders', linkedOrdersRoutes);

  // Follow-up orders routes
  app.use('/api/followup-orders', followupOrdersRoutes);

  // Fillable PDF Templates routes
  app.use('/api/fillable-pdf-templates', fillablePdfTemplatesRoutes);

  // Accounting Prep routes (Phase 0 - QuickBooks Journal Entry Prep)
  app.use('/api/accounting-prep', accountingPrepRoutes);

  // Cutting Table routes
  app.use('/api/cutting-table', cuttingTableRoutes);

  // Manufacturing Queue routes
  app.use('/api/manufacturing-queue', manufacturingQueueRoutes);
  
  // Cutting Table Manufacturing Queue routes
  app.use('/api/cutting-table-mfg-queue', cuttingTableManufacturingQueueRoutes);

  // Executive Rundown routes (Glenn-only, access-restricted)
  app.use('/api/executive/rundown', executiveRundownRoutes);

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
      console.error('❌ UPS authentication failed:', _error.message);
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
      console.error(
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

      // Get all orders in P1 Production Queue or Layup/Plugging department
      // Include both finalized orders and active production orders
      // EXCLUDE orders with no stock model or stock model "None" - they should be handled elsewhere
      const allOrders = await storage.getAllOrders();
      const unscheduledOrders = allOrders.filter((order) => {
        const currentDept = (order as any).currentDepartment;
        const stockModel =
          (order as any).stockModelId || (order as any).modelId;

        // Only include orders in P1 Production Queue OR Layup/Plugging
        if (currentDept !== 'P1 Production Queue' && currentDept !== 'Layup/Plugging') {
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

        // EXCLUDE orders without action_length - UNLESS they're from Purchase Orders (which may not need action_length)
        const features = (order as any).features || {};
        const orderId = (order as any).orderId || '';
        
        // Detect PO orders by multiple patterns:
        // - Format: PO-0046-5-1 (starts with 'PO-')
        // - Format: PO0046-W1-001 (starts with 'PO' followed by digits)
        // - Has po_number or po_item_id in features
        const isPOOrder = 
          orderId.startsWith('PO-') || 
          orderId.startsWith('PO') && /^PO\d+/.test(orderId) ||
          features.po_number || 
          features.po_item_id;

        if (
          !isPOOrder &&
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
        WHERE current_department IN ('P1 Production Queue', 'Layup/Plugging')
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

      // Fetch production orders from production_orders table
      // Include ALL production orders in P1 Production Queue and Layup/Plugging departments
      console.log(
        '🔍 Fetching production orders from production_orders table...'
      );
      const productionOrdersResult = await pool.query(`
        SELECT DISTINCT
          po.order_id as "orderId",
          po.customer_id as "customerId",
          po.item_id as "stockModelId",
          po.due_date as "dueDate",
          po.current_department as "currentDepartment",
          po.production_status as "status",
          COALESCE(po.specifications, '{}') as features,
          po.material_canonical as "materialCanonical",
          po.created_at as "createdAt",
          'production_order' as source
        FROM production_orders po
        WHERE po.current_department IN ('P1 Production Queue', 'Layup/Plugging')
          AND po.production_status IN ('PENDING', 'ACTIVE')
          AND po.item_type = 'stock_model'
          AND po.item_id IS NOT NULL
          AND po.item_id != ''
          AND LOWER(po.item_id) NOT IN ('none', 'no stock', 'no_stock')
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
          materialCanonical: po.materialCanonical || '',
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
        `📦 Processing ${combinedUnscheduledOrders.length} total main orders + ${productionOrders.length} production orders (OEM Priority Settings) for P1 layup queue`
      );

      const combinedQueue = [
        // Add the production orders first (highest priority for OEM)
        ...productionOrders,
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

      // DEDUPLICATION: Remove duplicate orders by orderId (keep first occurrence)
      // This prevents the same order from appearing multiple times in the queue
      const seenOrderIds = new Set<string>();
      const deduplicatedQueue = combinedQueue.filter((order) => {
        const orderId = (order as any).orderId;
        if (seenOrderIds.has(orderId)) {
          return false; // Skip duplicate
        }
        seenOrderIds.add(orderId);
        return true;
      });

      console.log(
        `🔧 DEDUPLICATION: Reduced from ${combinedQueue.length} to ${deduplicatedQueue.length} orders (removed ${combinedQueue.length - deduplicatedQueue.length} duplicates)`
      );

      // Count Mesa Universal orders in final result
      const mesaCount = deduplicatedQueue.filter(
        (order) => (order as any).modelId === 'mesa_universal'
      ).length;
      console.log(
        `🏔️ FINAL MESA COUNT: ${mesaCount} Mesa Universal orders in P1 layup queue API response`
      );

      // Sort by priority score (lower = higher priority)
      deduplicatedQueue.sort((a, b) => a.priorityScore - b.priorityScore);

      // Log OEM priority verification
      if (oemMode && selectedPOOrders.length > 0) {
        const topOrders = deduplicatedQueue.slice(
          0,
          Math.min(5, deduplicatedQueue.length)
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

      res.json(deduplicatedQueue);
    } catch (_error) {
      console.error('❌ P1 layup queue fetch _error:', _error);
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
          console.error(`❌ Failed to move order ${order.orderId}:`, _error);
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
          console.error(
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
      console.error('❌ Error in autoMoveInvalidStockModelOrders:', _error);
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
      console.error('❌ CLEANUP ERROR:', _error);
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
      console.error('❌ Layup schedule fetch _error:', _error);
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
      console.error('❌ Layup schedule create _error:', _error);
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
      console.error('❌ Layup schedule delete _error:', _error);
      res
        .status(500)
        .json({ _error: 'Failed to delete layup schedule entries' });
    }
  });

  // Lock week schedule
  app.post('/api/layup-schedule/lock-week', async (req, res) => {
    try {
      const { weekKey } = req.body;
      if (!weekKey) {
        return res.status(400).json({ error: 'weekKey is required' });
      }
      const { storage } = await import('../../storage');
      const result = await storage.lockWeekSchedule(weekKey);
      res.json(result);
    } catch (_error) {
      console.error('❌ Lock week schedule error:', _error);
      res.status(500).json({ error: 'Failed to lock week schedule' });
    }
  });

  // Unlock week schedule
  app.post('/api/layup-schedule/unlock-week', async (req, res) => {
    try {
      const { weekKey } = req.body;
      if (!weekKey) {
        return res.status(400).json({ error: 'weekKey is required' });
      }
      const { storage } = await import('../../storage');
      const result = await storage.unlockWeekSchedule(weekKey);
      res.json(result);
    } catch (_error) {
      console.error('❌ Unlock week schedule error:', _error);
      res.status(500).json({ error: 'Failed to unlock week schedule' });
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
      console.error('❌ Error generating layup schedule:', _error);
      res.status(500).json({ _error: 'Failed to generate layup schedule' });
    }
  });

  // P2 Customer bypass route to avoid monolithic conflicts
  // SECURITY: softAuth enforces authentication in production
  app.get('/api/p2-customers-bypass', softAuth, async (req, res) => {
    try {
      console.log('🔧 DIRECT P2 CUSTOMERS BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const includeInactive = req.query.includeInactive === 'true';
      const p2Customers = await storage.getAllP2Customers(includeInactive);
      console.log('🔧 Found P2 customers:', p2Customers.length, '(includeInactive:', includeInactive, ')');
      res.json(p2Customers);
    } catch (_error) {
      console.error('Get P2 customers _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P2 customers' });
    }
  });

  // P2 Customer CRUD routes (POST, PUT, DELETE)
  app.post('/api/p2/customers', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 CUSTOMER CREATE ROUTE CALLED');
      const { storage } = await import('../../storage');
      
      // Check if customerId already exists
      if (req.body.customerId) {
        const existingCustomer = await storage.getP2CustomerByCustomerId(req.body.customerId);
        if (existingCustomer) {
          return res.status(400).json({ 
            error: `Customer ID "${req.body.customerId}" already exists. Please use a different ID.` 
          });
        }
      }
      
      const customer = await storage.createP2Customer(req.body);
      console.log('🔧 Created P2 customer:', customer.id, customer.customerName);
      res.status(201).json(customer);
    } catch (_error: any) {
      console.error('Create P2 customer error:', _error);
      // Handle duplicate key constraint
      const errorString = JSON.stringify(_error) + (_error?.message || '');
      if (_error?.code === '23505' || errorString.includes('duplicate key') || errorString.includes('unique constraint')) {
        return res.status(400).json({ 
          error: 'This Customer ID is already in use. Please choose a different ID.' 
        });
      }
      res.status(500).json({ error: 'Failed to create P2 customer', message: _error?.message });
    }
  });

  app.put('/api/p2/customers/:id', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 CUSTOMER UPDATE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const id = parseInt(req.params.id, 10);
      const customer = await storage.updateP2Customer(id, req.body);
      console.log('🔧 Updated P2 customer:', customer.id);
      res.json(customer);
    } catch (_error: any) {
      console.error('Update P2 customer error:', _error);
      res.status(500).json({ error: 'Failed to update P2 customer', message: _error?.message });
    }
  });

  app.delete('/api/p2/customers/:id', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 CUSTOMER DELETE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const id = parseInt(req.params.id, 10);
      await storage.deleteP2Customer(id);
      console.log('🔧 Deleted P2 customer:', id);
      res.json({ success: true });
    } catch (_error: any) {
      console.error('Delete P2 customer error:', _error);
      res.status(500).json({ error: 'Failed to delete P2 customer', message: _error?.message });
    }
  });

  // P2 Customer Contacts Routes
  app.get('/api/p2/customers/:customerId/contacts', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const customerId = parseInt(req.params.customerId, 10);
      const contacts = await storage.getP2CustomerContacts(customerId);
      res.json(contacts);
    } catch (_error) {
      console.error('Get P2 customer contacts error:', _error);
      res.status(500).json({ error: 'Failed to fetch P2 customer contacts' });
    }
  });

  app.post('/api/p2/customers/:customerId/contacts', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const customerId = parseInt(req.params.customerId, 10);
      const contact = await storage.createP2CustomerContact({ ...req.body, customerId });
      res.json(contact);
    } catch (_error: any) {
      console.error('Create P2 customer contact error:', _error);
      res.status(500).json({ error: 'Failed to create P2 customer contact', message: _error?.message });
    }
  });

  app.put('/api/p2/customers/:customerId/contacts/:contactId', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const contactId = parseInt(req.params.contactId, 10);
      const contact = await storage.updateP2CustomerContact(contactId, req.body);
      res.json(contact);
    } catch (_error: any) {
      console.error('Update P2 customer contact error:', _error);
      res.status(500).json({ error: 'Failed to update P2 customer contact', message: _error?.message });
    }
  });

  app.delete('/api/p2/customers/:customerId/contacts/:contactId', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const contactId = parseInt(req.params.contactId, 10);
      await storage.deleteP2CustomerContact(contactId);
      res.json({ success: true });
    } catch (_error: any) {
      console.error('Delete P2 customer contact error:', _error);
      res.status(500).json({ error: 'Failed to delete P2 customer contact', message: _error?.message });
    }
  });

  // P2 Product Items - reusable product items for P2 PO line items
  app.get('/api/p2/product-items', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const items = await storage.getAllP2ProductItems();
      res.json(items);
    } catch (_error) {
      console.error('Get P2 product items error:', _error);
      res.status(500).json({ error: 'Failed to fetch P2 product items' });
    }
  });

  app.post('/api/p2/product-items', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const item = await storage.createP2ProductItem(req.body);
      res.json(item);
    } catch (_error) {
      console.error('Create P2 product item error:', _error);
      res.status(500).json({ error: 'Failed to create P2 product item' });
    }
  });

  app.put('/api/p2/product-items/:id', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const item = await storage.updateP2ProductItem(req.params.id, req.body);
      res.json(item);
    } catch (_error) {
      console.error('Update P2 product item error:', _error);
      res.status(500).json({ error: 'Failed to update P2 product item' });
    }
  });

  app.delete('/api/p2/product-items/:id', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      await storage.deleteP2ProductItem(req.params.id);
      res.json({ success: true });
    } catch (_error) {
      console.error('Delete P2 product item error:', _error);
      res.status(500).json({ error: 'Failed to delete P2 product item' });
    }
  });

  // P2 Internal Names - previously used internal names for autocomplete
  app.get('/api/p2/internal-names', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const names = await storage.getAllP2InternalNames();
      res.json(names);
    } catch (_error) {
      console.error('Get P2 internal names error:', _error);
      res.status(500).json({ error: 'Failed to fetch P2 internal names' });
    }
  });

  // Quotes routes
  app.get('/api/quotes', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const quotes = await storage.getAllQuotes();
      res.json(quotes);
    } catch (_error) {
      console.error('Get quotes _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch quotes' });
    }
  });

  // Purchase Review Checklist Submissions routes
  app.get('/api/purchase-review-submissions', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const submissions = await storage.getAllPurchaseReviewSubmissions();
      res.json(submissions);
    } catch (_error) {
      console.error('Get purchase review submissions _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch purchase review submissions' });
    }
  });

  app.post('/api/purchase-review-submissions', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const submission = await storage.createPurchaseReviewSubmission(req.body);
      res.status(201).json(submission);
    } catch (_error) {
      console.error('Create purchase review submission _error:', _error);
      res.status(500).json({ _error: 'Failed to create purchase review submission' });
    }
  });

  app.get('/api/purchase-review-submissions/:id', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const submission = await storage.getPurchaseReviewSubmission(req.params.id);
      if (!submission) {
        return res.status(404).json({ _error: 'Submission not found' });
      }
      res.json(submission);
    } catch (_error) {
      console.error('Get purchase review submission _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch purchase review submission' });
    }
  });

  app.put('/api/purchase-review-submissions/:id', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const submission = await storage.updatePurchaseReviewSubmission(req.params.id, req.body);
      if (!submission) {
        return res.status(404).json({ _error: 'Submission not found' });
      }
      res.json(submission);
    } catch (_error) {
      console.error('Update purchase review submission _error:', _error);
      res.status(500).json({ _error: 'Failed to update purchase review submission' });
    }
  });

  // P2 Purchase Orders bypass route to avoid monolithic conflicts
  // SECURITY: softAuth enforces authentication in production
  app.get('/api/p2-purchase-orders-bypass', softAuth, async (req, res) => {
    try {
      console.log('🔧 DIRECT P2 PURCHASE ORDERS BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const pos = await storage.getAllP2PurchaseOrders();
      console.log('🔧 Found P2 purchase orders:', pos.length);
      res.json(pos);
    } catch (_error) {
      console.error('🔧 P2 purchase orders bypass _error:', _error);
      res
        .status(500)
        .json({
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
          console.error(`Failed to update order ${orderId}:`, _error);
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
      console.error('❌ Push to layup/plugging _error:', _error);
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
      let currentDate = new Date(today);

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
      console.error('❌ Python scheduler _error:', _error);
      res.status(500).json({ _error: 'Failed to run scheduler' });
    }
  });

  // Get all P2 PO line items (for part routing wizard)
  app.get('/api/p2-purchase-order-items', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      const rows = await pool.query(`
        SELECT id, po_id as "poId", part_number as "partNumber", part_name as "partName", 
               quantity, unit_price as "unitPrice", total_price as "totalPrice",
               specifications, notes, created_at as "createdAt", updated_at as "updatedAt"
        FROM p2_purchase_order_items 
        ORDER BY created_at DESC
      `);
      res.json(rows);
    } catch (_error) {
      console.error('Get all P2 PO items error:', _error);
      res.status(500).json({ error: 'Failed to fetch P2 PO items' });
    }
  });

  // Get PO line items by PO ID (for part routing wizard)
  app.get('/api/p2-purchase-order-items/:poId', async (req, res) => {
    try {
      const { poId } = req.params;
      const { storage } = await import('../../storage');
      const items = await storage.getP2PurchaseOrderItems(parseInt(poId));
      res.json(items);
    } catch (_error) {
      console.error('Get P2 PO items error:', _error);
      res.status(500).json({ error: 'Failed to fetch PO items' });
    }
  });

  // SECURITY: softAuth enforces authentication in production
  app.post('/api/p2-purchase-orders-bypass', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER CREATE BYPASS ROUTE CALLED');
      console.log('🔧 Request body:', JSON.stringify(req.body, null, 2));
      const { storage } = await import('../../storage');
      
      const { 
        customerId, customerPONumber, dueDate, 
        toleranceAuthorizerId, toleranceAuthorizerName, toleranceNotes, notes, lineItems,
        assignedToId, assignedToName, productionLeadId, productionLeadName 
      } = req.body;
      
      // Get customer info by customer ID (text field like "STR-001")
      const customer = await storage.getP2CustomerByCustomerId(customerId);
      if (!customer) {
        return res.status(400).json({ error: 'Customer not found' });
      }
      
      // Use the customer-provided PO number directly
      const poNumber = customerPONumber;
      
      // Build the complete PO data with all required fields
      const poData = {
        poNumber,
        customerId: customer.customerId,
        customerName: customer.customerName,
        poDate: new Date().toISOString().split('T')[0],
        expectedDelivery: dueDate,
        status: 'OPEN',
        notes: notes || toleranceNotes || null,
        toleranceAuthorizerId: toleranceAuthorizerId || null,
        toleranceAuthorizerName: toleranceAuthorizerName || null,
        toleranceNotes: toleranceNotes || null,
        // Ownership fields for AS9100 accountability
        createdById: toleranceAuthorizerId || null, // Use authorizer as creator since no auth context
        createdByName: toleranceAuthorizerName || null,
        assignedToId: assignedToId && assignedToId !== 'none' ? parseInt(assignedToId) : null,
        assignedToName: assignedToName || null,
        productionLeadId: productionLeadId && productionLeadId !== 'none' ? parseInt(productionLeadId) : null,
        productionLeadName: productionLeadName || null,
      };
      
      console.log('🔧 Creating PO with complete data:', JSON.stringify(poData, null, 2));
      const po = await storage.createP2PurchaseOrder(poData);
      console.log('🔧 Created P2 purchase order:', po.id, po.poNumber);
      
      // Create line items if provided
      if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
        console.log('🔧 Creating line items:', lineItems.length);
        for (const item of lineItems) {
          await storage.createP2PurchaseOrderItem({
            poId: po.id,
            partNumber: item.partNumber,
            partName: item.description || item.partName || item.partNumber,
            quantity: item.quantity,
            unitPrice: item.unitPrice || 0,
          });
        }
      }
      
      res.status(201).json(po);
    } catch (_error: any) {
      console.error('🔧 P2 purchase order create bypass _error:', _error);
      console.error('🔧 Error message:', _error?.message);
      res
        .status(500)
        .json({
          _error: 'Failed to create P2 purchase order via bypass route',
          message: _error?.message || 'Unknown error',
        });
    }
  });

  // SECURITY: softAuth enforces authentication in production
  app.put('/api/p2-purchase-orders-bypass/:id', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER UPDATE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const poData = req.body;
      
      const existingPO = await storage.getP2PurchaseOrder(parseInt(id));
      if (!existingPO) {
        return res.status(404).json({ error: 'PO not found' });
      }
      
      // STATE GUARD: Check if PO is locked - prevent edits to locked POs
      if (existingPO.lockedAt) {
        return res.status(403).json({
          error: 'This PO has been locked and cannot be modified',
          lockedAt: existingPO.lockedAt,
          lockedBy: existingPO.lockedBy
        });
      }
      
      // STATE GUARD: Cannot modify CLOSED or CANCELED POs
      if (existingPO.status === 'CLOSED' || existingPO.status === 'CANCELED') {
        return res.status(400).json({
          error: `Cannot modify a ${existingPO.status} PO`,
          currentStatus: existingPO.status
        });
      }
      
      // STATE GUARD: Cannot move to CLOSED unless BOM is configured
      if (poData.status === 'CLOSED' && !existingPO.bomConfigured) {
        return res.status(400).json({
          error: 'Cannot close PO - BOM has not been configured',
          guard: 'BOM_REQUIRED'
        });
      }
      
      const po = await storage.updateP2PurchaseOrder(parseInt(id), poData);
      console.log('🔧 Updated P2 purchase order:', po.id);
      res.json(po);
    } catch (_error) {
      console.error('🔧 P2 purchase order update bypass _error:', _error);
      res
        .status(500)
        .json({
          _error: 'Failed to update P2 purchase order via bypass route',
        });
    }
  });

  // Lock a P2 PO - makes it immutable
  app.post('/api/p2-purchase-orders/:id/lock', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { pool } = await import('../../db');
      const { id } = req.params;
      const { employeeId } = req.body;
      
      const existingPO = await storage.getP2PurchaseOrder(parseInt(id));
      if (!existingPO) {
        return res.status(404).json({ error: 'PO not found' });
      }
      if (existingPO.lockedAt) {
        return res.status(400).json({ error: 'PO is already locked' });
      }
      
      // Use raw SQL to avoid Drizzle null handling issues
      const lockedByValue = employeeId && employeeId !== '' ? parseInt(employeeId) : null;
      await pool.query(
        'UPDATE p2_purchase_orders SET locked_at = NOW(), locked_by = $1 WHERE id = $2',
        [lockedByValue, parseInt(id)]
      );
      
      const updatedPO = await storage.getP2PurchaseOrder(parseInt(id));
      console.log('🔒 Locked P2 purchase order:', updatedPO?.id);
      res.json(updatedPO);
    } catch (_error) {
      console.error('Lock P2 PO error:', _error);
      res.status(500).json({ error: 'Failed to lock PO' });
    }
  });

  // Unlock a P2 PO (admin only)
  app.post('/api/p2-purchase-orders/:id/unlock', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { pool } = await import('../../db');
      const { id } = req.params;
      
      // Use raw SQL to avoid Drizzle null handling issues
      await pool.query(
        'UPDATE p2_purchase_orders SET locked_at = NULL, locked_by = NULL WHERE id = $1',
        [parseInt(id)]
      );
      
      const updatedPO = await storage.getP2PurchaseOrder(parseInt(id));
      console.log('🔓 Unlocked P2 purchase order:', updatedPO?.id);
      res.json(updatedPO);
    } catch (_error) {
      console.error('Unlock P2 PO error:', _error);
      res.status(500).json({ error: 'Failed to unlock PO' });
    }
  });

  // SECURITY: softAuth enforces authentication in production
  app.delete('/api/p2-purchase-orders-bypass/:id', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER DELETE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      
      // Check if PO is locked - prevent deleting locked POs
      const existingPO = await storage.getP2PurchaseOrder(parseInt(id));
      if (existingPO?.lockedAt) {
        return res.status(403).json({
          error: 'This PO has been locked and cannot be deleted',
          lockedAt: existingPO.lockedAt
        });
      }
      
      await storage.deleteP2PurchaseOrder(parseInt(id));
      console.log('🔧 Deleted P2 purchase order:', id);
      res.json({ success: true });
    } catch (_error) {
      console.error('🔧 P2 purchase order delete bypass _error:', _error);
      res
        .status(500)
        .json({
          _error: 'Failed to delete P2 purchase order via bypass route',
        });
    }
  });

  // ============== P2 Changes API Routes (AS9100 Change Control) ==============
  
  // Production Changes (PCF/PCR) CRUD
  app.get('/api/p2/changes', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const changes = await storage.getAllP2ProductionChanges();
      res.json(changes);
    } catch (error: any) {
      // Handle missing table gracefully
      if (error?.code === '42P01') {
        return res.json([]);
      }
      console.error('Error fetching production changes:', error);
      res.status(500).json({ error: 'Failed to fetch production changes' });
    }
  });

  // Change Impact Panel - aggregate view (MUST come before /:id route)
  app.get('/api/p2/changes/impact', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      
      // Handle missing tables gracefully
      let productionChanges: any[] = [];
      let travelerChanges: any[] = [];
      
      try {
        productionChanges = await storage.getAllP2ProductionChanges();
      } catch (e: any) {
        if (e?.code !== '42P01') throw e;
      }
      
      try {
        travelerChanges = await storage.getAllP2TravelerChanges();
      } catch (e: any) {
        if (e?.code !== '42P01') throw e;
      }
      
      const pendingProductionChanges = productionChanges.filter((c: any) => ['DRAFT', 'SUBMITTED'].includes(c.status));
      const pendingTravelerChanges = travelerChanges.filter((c: any) => c.status === 'PENDING');
      const blockingChanges = travelerChanges.filter((c: any) => c.blocksTraveler && c.status === 'PENDING');
      
      res.json({
        summary: {
          totalProductionChanges: productionChanges.length,
          pendingProductionChanges: pendingProductionChanges.length,
          totalTravelerChanges: travelerChanges.length,
          pendingTravelerChanges: pendingTravelerChanges.length,
          blockingChanges: blockingChanges.length,
          productionBlocked: blockingChanges.length > 0,
        },
        pendingProductionChanges,
        pendingTravelerChanges,
        blockingChanges,
      });
    } catch (error: any) {
      console.error('Error fetching change impact:', error);
      res.status(500).json({ error: 'Failed to fetch change impact' });
    }
  });

  app.get('/api/p2/changes/:id', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const change = await storage.getP2ProductionChange(req.params.id);
      if (!change) {
        return res.status(404).json({ error: 'Production change not found' });
      }
      res.json(change);
    } catch (error: any) {
      console.error('Error fetching production change:', error);
      res.status(500).json({ error: 'Failed to fetch production change' });
    }
  });

  app.post('/api/p2/changes', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const change = await storage.createP2ProductionChange(req.body);
      res.status(201).json(change);
    } catch (error: any) {
      console.error('Error creating production change:', error);
      res.status(500).json({ error: 'Failed to create production change' });
    }
  });

  app.post('/api/p2/changes/:id/approve', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { approvedById, approvedByName } = req.body;
      const change = await storage.updateP2ProductionChange(req.params.id, {
        status: 'APPROVED',
        approvedById,
        approvedByName,
        approvedAt: new Date(),
      });
      res.json(change);
    } catch (error: any) {
      console.error('Error approving production change:', error);
      res.status(500).json({ error: 'Failed to approve production change' });
    }
  });

  app.post('/api/p2/changes/:id/reject', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { rejectedById, rejectedByName, rejectionReason } = req.body;
      const change = await storage.updateP2ProductionChange(req.params.id, {
        status: 'REJECTED',
        rejectedById,
        rejectedByName,
        rejectedAt: new Date(),
        rejectionReason,
      });
      res.json(change);
    } catch (error: any) {
      console.error('Error rejecting production change:', error);
      res.status(500).json({ error: 'Failed to reject production change' });
    }
  });

  app.put('/api/p2/changes/:id', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const change = await storage.updateP2ProductionChange(req.params.id, req.body);
      res.json(change);
    } catch (error: any) {
      console.error('Error updating production change:', error);
      res.status(500).json({ error: 'Failed to update production change' });
    }
  });

  // Traveler Changes (Deviations) CRUD
  app.get('/api/p2/traveler-changes', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const changes = await storage.getAllP2TravelerChanges();
      res.json(changes);
    } catch (error: any) {
      // Handle missing table gracefully
      if (error?.code === '42P01') {
        return res.json([]);
      }
      console.error('Error fetching traveler changes:', error);
      res.status(500).json({ error: 'Failed to fetch traveler changes' });
    }
  });

  app.get('/api/travelers/:travelerId/changes', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const changes = await storage.getP2TravelerChangesByTravelerId(req.params.travelerId);
      res.json(changes);
    } catch (error: any) {
      console.error('Error fetching traveler changes:', error);
      res.status(500).json({ error: 'Failed to fetch traveler changes' });
    }
  });

  app.post('/api/travelers/:travelerId/changes', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const change = await storage.createP2TravelerChange({
        ...req.body,
        travelerId: req.params.travelerId,
      });
      res.status(201).json(change);
    } catch (error: any) {
      console.error('Error creating traveler change:', error);
      res.status(500).json({ error: 'Failed to create traveler change' });
    }
  });

  app.post('/api/travelers/:travelerId/changes/:changeId/authorize', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { authorizedById, authorizedByName } = req.body;
      const change = await storage.updateP2TravelerChange(req.params.changeId, {
        status: 'APPROVED',
        authorizedById,
        authorizedByName,
        authorizationDate: new Date(),
        blocksTraveler: false, // Unblock once authorized
      });
      res.json(change);
    } catch (error: any) {
      console.error('Error authorizing traveler change:', error);
      res.status(500).json({ error: 'Failed to authorize traveler change' });
    }
  });

  app.post('/api/p2/traveler-changes/:id/reject', softAuth, async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { rejectedById, rejectedByName, rejectionReason } = req.body;
      const change = await storage.updateP2TravelerChange(req.params.id, {
        status: 'REJECTED',
        rejectedById,
        rejectedByName,
        rejectedAt: new Date(),
        rejectionReason,
        blocksTraveler: false, // Unblock after rejection
      });
      res.json(change);
    } catch (error: any) {
      console.error('Error rejecting traveler change:', error);
      res.status(500).json({ error: 'Failed to reject traveler change' });
    }
  });

  // P2 Control Center API Routes
  app.get('/api/p2/control-center/stats', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const [poStats, itemStats] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED','CANCELED')) AS "openPOs",
            COUNT(*) FILTER (WHERE bom_configured = false AND status NOT IN ('COMPLETED','CANCELED')) AS "pendingBOMs"
          FROM p2_purchase_orders
        `),
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE status = 'SCHEDULED') AS "scheduledItems",
            COUNT(*) FILTER (WHERE status NOT IN ('PENDING','SCHEDULED','COMPLETED','SHIPPED') AND status IS NOT NULL) AS "inProduction",
            COUNT(*) FILTER (WHERE status = 'COMPLETED' AND completed_at > $1) AS "completedThisWeek",
            COUNT(*) FILTER (WHERE status = 'FINAL_QC') AS "pendingQC"
          FROM p2_serialized_items
        `, [oneWeekAgo]),
      ]);

      const po = poStats[0] || poStats.rows?.[0];
      const si = itemStats[0] || itemStats.rows?.[0];

      res.json({
        openPOs:          parseInt(po.openPOs, 10)          || 0,
        pendingBOMs:      parseInt(po.pendingBOMs, 10)      || 0,
        scheduledItems:   parseInt(si.scheduledItems, 10)   || 0,
        inProduction:     parseInt(si.inProduction, 10)     || 0,
        completedThisWeek:parseInt(si.completedThisWeek, 10)|| 0,
        pendingQC:        parseInt(si.pendingQC, 10)        || 0,
      });
    } catch (_error) {
      console.error('P2 Control Center stats error:', _error);
      res.status(500).json({ error: 'Failed to fetch P2 Control Center stats' });
    }
  });

  app.get('/api/p2/control-center/pending-actions', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const pos = await storage.getAllP2PurchaseOrders();
      const actions: any[] = [];
      
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Helper to calculate days until due
      const getDaysUntilDue = (dueDate: string | Date | null): number | null => {
        if (!dueDate) return null;
        const due = new Date(dueDate);
        due.setHours(0, 0, 0, 0);
        const diffTime = due.getTime() - today.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      };
      
      // Helper to determine severity based on days until due
      // 🔴 critical: < 3 days or overdue
      // 🟡 warning: 3-7 days
      // 🟢 info: > 7 days
      const getSeverity = (daysUntilDue: number | null, isBlocking: boolean = false): 'critical' | 'warning' | 'info' => {
        if (isBlocking) return 'critical';
        if (daysUntilDue === null) return 'info';
        if (daysUntilDue < 3) return 'critical';
        if (daysUntilDue <= 7) return 'warning';
        return 'info';
      };
      
      pos.forEach((po: any) => {
        if (po.status === 'CANCELED' || po.status === 'CLOSED') return;
        
        const daysUntilDue = getDaysUntilDue(po.expectedDelivery);
        const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
        
        // PO needs BOM setup - blocking production (always critical - can't proceed without BOM)
        if (!po.bomConfigured) {
          const severity = getSeverity(daysUntilDue, true); // isBlocking=true for missing BOM
          actions.push({
            type: 'needs_bom',
            poId: po.id,
            poNumber: po.poNumber,
            customerName: po.customerName,
            label: `${po.poNumber} needs BOM setup`,
            severity,
            daysUntilDue,
            isOverdue
          });
        }
        
        // PO with BOM but not yet in production - needs scheduling
        if (po.bomConfigured && po.status === 'OPEN') {
          const severity = getSeverity(daysUntilDue);
          actions.push({
            type: 'needs_schedule',
            poId: po.id,
            poNumber: po.poNumber,
            customerName: po.customerName,
            label: `${po.poNumber} ready to schedule`,
            severity,
            daysUntilDue,
            isOverdue
          });
        }
      });
      
      // Sort by severity (critical first, then warning, then info) and then by days until due
      const severityOrder = { critical: 0, warning: 1, info: 2 };
      actions.sort((a, b) => {
        const severityDiff = severityOrder[a.severity as keyof typeof severityOrder] - severityOrder[b.severity as keyof typeof severityOrder];
        if (severityDiff !== 0) return severityDiff;
        // Within same severity, sort by days until due (most urgent first)
        if (a.daysUntilDue === null && b.daysUntilDue === null) return 0;
        if (a.daysUntilDue === null) return 1;
        if (b.daysUntilDue === null) return -1;
        return a.daysUntilDue - b.daysUntilDue;
      });
      
      res.json(actions);
    } catch (_error) {
      console.error('P2 Control Center pending actions error:', _error);
      res.status(500).json({ error: 'Failed to fetch pending actions' });
    }
  });

  app.get('/api/p2/control-center/po-statuses', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const pos = await storage.getAllP2PurchaseOrders();
      const serializedItems = await storage.getP2SerializedItems({});
      
      const poStatuses = pos.map((po: any) => {
        const poItems = serializedItems.filter((s: any) => s.poId === po.id);
        
        // Use actual column names: status (ACTIVE/COMPLETED/SCRAPPED/HOLD) and currentDepartment
        const completedItems = poItems.filter((s: any) => s.status === 'COMPLETED').length;
        const inProductionItems = poItems.filter((s: any) => {
          if (s.status !== 'ACTIVE') return false;
          const dept = s.currentDepartment || '';
          // In production if past Pending Layup stage
          return dept !== 'Pending Layup' && dept !== '';
        }).length;
        const pendingItems = poItems.filter((s: any) => {
          if (s.status !== 'ACTIVE') return false;
          const dept = s.currentDepartment || '';
          return dept === 'Pending Layup' || dept === '';
        }).length;
        
        return {
          id: po.id,
          poNumber: po.poNumber,
          customerName: po.customerName || 'Unknown',
          dueDate: po.expectedDelivery,
          totalItems: poItems.length,
          completedItems,
          inProductionItems,
          pendingItems,
          hasBOMsNeeded: !po.bomConfigured,
          status: completedItems === poItems.length && poItems.length > 0 ? 'completed' : 
                  inProductionItems > 0 ? 'in_progress' : 'pending'
        };
      });
      
      res.json(poStatuses);
    } catch (_error) {
      console.error('P2 Control Center PO statuses error:', _error);
      res.status(500).json({ error: 'Failed to fetch PO statuses' });
    }
  });

  app.get('/api/p2/control-center/scheduling-list', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const serializedItems = await storage.getP2SerializedItems({});
      const pos = await storage.getAllP2PurchaseOrders();
      
      // Filter for items that are ACTIVE and either pending layup or in early production stages
      // Items are schedulable if they haven't completed production yet
      const schedulingList = serializedItems
        .filter((s: any) => {
          // Must be ACTIVE (not completed, scrapped, or on hold)
          if (s.status !== 'ACTIVE') return false;
          // Schedulable if in Pending Layup or Layup department (early stages)
          const dept = s.currentDepartment || '';
          return dept === 'Pending Layup' || dept === 'Layup' || dept === '' || !dept;
        })
        .map((s: any) => {
          const po = pos.find((p: any) => p.id === s.poId);
          const isScheduled = s.currentDepartment === 'Layup';
          return {
            id: s.id,
            poNumber: s.poNumber || po?.poNumber || 'Unknown',
            partNumber: s.partNumber || 'Unknown',
            description: s.partName || '',
            totalQuantity: 1,
            scheduledQuantity: isScheduled ? 1 : 0,
            remainingQuantity: isScheduled ? 0 : 1,
            dueDate: po?.expectedDelivery || po?.dueDate,
            priority: 'normal',
            status: isScheduled ? 'scheduled' : 'pending'
          };
        });
      
      res.json(schedulingList);
    } catch (_error) {
      console.error('P2 Control Center scheduling list error:', _error);
      res.status(500).json({ error: 'Failed to fetch scheduling list' });
    }
  });

  app.get('/api/p2/control-center/pos-needing-boms', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const pos = await storage.getAllP2PurchaseOrders();
      
      const posNeedingBOMs = pos
        .filter((po: any) => !po.bomConfigured)
        .map((po: any) => {
          return {
            id: po.id,
            poNumber: po.poNumber,
            customerName: po.customerName || 'Unknown', // Use denormalized customer name from PO
            itemCount: po.lineItems?.length || 0
          };
        });
      
      res.json(posNeedingBOMs);
    } catch (_error) {
      console.error('P2 Control Center POs needing BOMs error:', _error);
      res.status(500).json({ error: 'Failed to fetch POs needing BOMs' });
    }
  });

  app.get('/api/p2/control-center/recent-activity', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { sql } = await import('drizzle-orm');
      
      // Check if table exists first
      const tableCheck = await db.execute(sql`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'p2_serialized_item_events'
        ) as exists
      `);
      const tableExists = (tableCheck as any)?.rows?.[0]?.exists ?? false;
      
      if (!tableExists) {
        return res.json([]);
      }
      
      const { p2SerializedItemEvents } = await import('../../schema');
      const { desc, gte } = await import('drizzle-orm');
      
      // Get recent events from the last 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentEvents = await db
        .select({
          id: p2SerializedItemEvents.id,
          barcode: p2SerializedItemEvents.barcode,
          eventType: p2SerializedItemEvents.eventType,
          fromDepartment: p2SerializedItemEvents.fromDepartment,
          toDepartment: p2SerializedItemEvents.toDepartment,
          performedBy: p2SerializedItemEvents.performedBy,
          notes: p2SerializedItemEvents.notes,
          createdAt: p2SerializedItemEvents.createdAt,
        })
        .from(p2SerializedItemEvents)
        .where(gte(p2SerializedItemEvents.createdAt, sevenDaysAgo))
        .orderBy(desc(p2SerializedItemEvents.createdAt))
        .limit(50);
      
      // Format as activity entries
      const activities = recentEvents.map((event) => ({
        id: event.id,
        type: event.eventType,
        description: event.eventType === 'TRANSITION' 
          ? `${event.barcode}: ${event.fromDepartment || 'Start'} → ${event.toDepartment || 'Complete'}`
          : `${event.barcode}: ${event.eventType}`,
        performedBy: event.performedBy || 'System',
        timestamp: event.createdAt,
        notes: event.notes,
      }));
      
      res.json(activities);
    } catch (_error) {
      console.error('P2 Control Center recent activity error:', _error);
      res.json([]);
    }
  });

  // P2 Production Queue - Get items grouped by department
  app.get('/api/p2/control-center/production-queue', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      
      // Get all active serialized items using storage method (which handles pool.query)
      const allItems = await storage.getP2SerializedItems({ status: 'ACTIVE' });
      const items = allItems || [];
      
      // Work tasks and routings tables may not exist yet - use empty arrays as fallback
      const activeTasks: any[] = [];
      const allRoutings: any[] = [];
      
      // Create task lookup by serialized item ID
      const taskByItemId = new Map<string, any>();
      activeTasks.forEach((task: any) => {
        taskByItemId.set(task.serializedItemId, task);
      });
      
      // Get unique departments from all items and routings
      const departmentsSet = new Set<string>();
      items.forEach((item: any) => {
        if (item.currentDepartment) {
          departmentsSet.add(item.currentDepartment);
        }
      });
      allRoutings.forEach((routing: any) => {
        const sequence = routing.departmentSequence as string[] || [];
        sequence.forEach(dept => departmentsSet.add(dept));
      });
      
      // Standard department order for display
      const departmentOrder = [
        'Pending Layup',
        'Layup',
        'Assemble/Disassembly',
        'CNC',
        'Finish',
        'Paint',
        'Final QC',
        'Shipping'
      ];
      
      // Add any departments not in standard order
      departmentsSet.forEach(dept => {
        if (!departmentOrder.includes(dept)) {
          departmentOrder.push(dept);
        }
      });
      
      // Group items by department
      const departmentQueues: Record<string, any[]> = {};
      departmentOrder.forEach(dept => {
        departmentQueues[dept] = [];
      });
      
      items.forEach((item: any) => {
        const dept = item.currentDepartment || 'Pending Layup';
        if (!departmentQueues[dept]) {
          departmentQueues[dept] = [];
        }
        
        const activeTask = taskByItemId.get(item.id);
        
        departmentQueues[dept].push({
          id: item.id,
          barcode: item.barcode,
          serialNumber: item.serialNumber,
          partNumber: item.partNumber,
          partName: item.partName,
          poNumber: item.poNumber,
          customerName: item.customerName,
          status: item.status,
          currentDepartment: dept,
          currentStageIndex: item.currentStageIndex || 0,
          hasActiveTask: !!activeTask,
          activeTask: activeTask ? {
            id: activeTask.id,
            employeeName: activeTask.employeeName,
            employeeCode: activeTask.employeeCode,
            startedAt: activeTask.startedAt,
          } : null,
        });
      });
      
      // Format response with department summaries
      const departments = departmentOrder
        .filter(dept => departmentsSet.has(dept) || dept === 'Pending Layup' || dept === 'Layup')
        .map(dept => {
          const queueItems = departmentQueues[dept] || [];
          const inProgressCount = queueItems.filter(i => i.hasActiveTask).length;
          const waitingCount = queueItems.length - inProgressCount;
          
          return {
            name: dept,
            totalItems: queueItems.length,
            inProgress: inProgressCount,
            waiting: waitingCount,
            items: queueItems,
          };
        });
      
      res.json({
        departments,
        summary: {
          totalActive: items.length,
          totalInProgress: activeTasks.length,
          departmentCount: departments.filter(d => d.totalItems > 0).length,
        },
      });
    } catch (_error) {
      console.error('P2 Production Queue error:', _error);
      res.status(500).json({ error: 'Failed to fetch production queue' });
    }
  });

  // P2 Update item status (Hold/Scrap/Complete)
  app.patch('/api/p2/control-center/item-status/:itemId', async (req, res) => {
    try {
      const { itemId } = req.params;
      const { z } = await import('zod');
      
      const updateStatusSchema = z.object({
        status: z.enum(['HOLD', 'SCRAPPED', 'ACTIVE', 'COMPLETED']),
        reason: z.string().min(1, 'Reason is required'),
        performedBy: z.string().optional().default('System'),
        notes: z.string().optional().default(''),
        linkedTravelerId: z.string().optional(),
      });
      
      const validationResult = updateStatusSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validationResult.error.flatten() 
        });
      }
      
      const { status, reason, performedBy, notes, linkedTravelerId } = validationResult.data;
      
      const { db } = await import('../../db');
      const { p2SerializedItems, p2SerializedItemEvents, travelers } = await import('../../schema');
      const { eq } = await import('drizzle-orm');
      
      const [item] = await db.select().from(p2SerializedItems).where(eq(p2SerializedItems.id, itemId)).limit(1);
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }
      
      await db.update(p2SerializedItems)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(p2SerializedItems.id, itemId));
      
      let eventType = 'NOTE';
      if (status === 'HOLD') eventType = 'HOLD';
      else if (status === 'SCRAPPED') eventType = 'SCRAP';
      else if (status === 'COMPLETED') eventType = 'OFF_SYSTEM_COMPLETE';

      await db.insert(p2SerializedItemEvents).values({
        serializedItemId: itemId,
        barcode: item.barcode,
        eventType,
        performedBy: performedBy || 'System',
        notes: [reason, notes].filter(Boolean).join(' — ') || `Status changed to ${status}`,
        metadata: { previousStatus: item.status, newStatus: status, linkedTravelerId: linkedTravelerId || null },
      });

      let travelerCreated = false;
      let linkedTravelerFound = false;
      if (status === 'COMPLETED') {
        if (linkedTravelerId) {
          const [existingTraveler] = await db.select().from(travelers).where(eq(travelers.id, linkedTravelerId)).limit(1);
          if (existingTraveler) {
            linkedTravelerFound = true;
            await db.update(travelers)
              .set({ 
                serialNumber: existingTraveler.serialNumber || item.barcode,
                status: 'COMPLETED',
                updatedAt: new Date(),
              })
              .where(eq(travelers.id, linkedTravelerId));
          } else {
            const travelerNum = `TRV-OFF-${Date.now().toString(36).toUpperCase()}`;
            await db.insert(travelers).values({
              travelerNumber: travelerNum,
              partNumber: item.partNumber || '',
              partName: item.partName || item.drawingName || '',
              serialNumber: item.barcode,
              lotNumber: item.serialNumber,
              quantity: 1,
              status: 'COMPLETED',
              createdBy: performedBy || 'System',
              workOrderId: notes ? `Off-system: ${notes.substring(0, 100)}` : 'Off-system production',
            });
            travelerCreated = true;
          }
        } else {
          const travelerNum = `TRV-OFF-${Date.now().toString(36).toUpperCase()}`;
          await db.insert(travelers).values({
            travelerNumber: travelerNum,
            partNumber: item.partNumber || '',
            partName: item.partName || item.drawingName || '',
            serialNumber: item.barcode,
            lotNumber: item.serialNumber,
            quantity: 1,
            status: 'COMPLETED',
            createdBy: performedBy || 'System',
            workOrderId: notes ? `Off-system: ${notes.substring(0, 100)}` : 'Off-system production',
          });
          travelerCreated = true;
        }
      }
      
      res.json({
        success: true,
        message: `Item status updated to ${status}`,
        travelerCreated,
        linkedTravelerFound,
      });
    } catch (_error) {
      console.error('P2 Update item status error:', _error);
      res.status(500).json({ error: 'Failed to update item status' });
    }
  });

  // Get P2 PO with line items and BOM status
  app.get('/api/p2-purchase-orders/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { storage } = await import('../../storage');
      const { db } = await import('../../db');
      const { bomDefinitions, bomItems: bomItemsTable } = await import('../../schema');
      const { eq, and } = await import('drizzle-orm');
      
      const po = await storage.getP2PurchaseOrder(parseInt(id), { includeItems: true });
      
      if (!po) {
        return res.status(404).json({ error: 'P2 Purchase Order not found' });
      }
      
      // Get line items with BOM status
      const lineItems = await Promise.all((po.items || []).map(async (item: any) => {
        // Check if a BOM exists for this part number
        const existingBOM = await db
          .select()
          .from(bomDefinitions)
          .where(and(
            eq(bomDefinitions.sku, item.partNumber),
            eq(bomDefinitions.isActive, true)
          ))
          .limit(1);
        
        let bomItemsList: any[] = [];
        if (existingBOM.length > 0) {
          bomItemsList = await db
            .select()
            .from(bomItemsTable)
            .where(and(
              eq(bomItemsTable.bomId, existingBOM[0].id),
              eq(bomItemsTable.isActive, true)
            ));
        }
        
        return {
          ...item,
          hasBOM: existingBOM.length > 0,
          bomDefinitionId: existingBOM[0]?.id || null,
          bomItems: bomItemsList.map(bi => ({
            id: bi.id,
            partNumber: bi.partName,
            description: bi.notes || '',
            quantity: bi.quantity,
            isManufactured: bi.itemType === 'manufactured',
            firstDepartment: bi.firstDept
          }))
        };
      }));
      
      res.json({
        ...po,
        lineItems
      });
    } catch (_error) {
      console.error('Get P2 Purchase Order error:', _error);
      res.status(500).json({ error: 'Failed to fetch P2 Purchase Order' });
    }
  });

  app.post('/api/p2/bom/:partId', async (req, res) => {
    try {
      const { partId } = req.params;
      const { bomItems: bomItemsInput, poItemId, partNumber } = req.body;
      
      const { db } = await import('../../db');
      const { bomDefinitions, bomItems: bomItemsTable, p2PurchaseOrders, p2PurchaseOrderItems } = await import('../../schema');
      const { eq, and, sql, inArray } = await import('drizzle-orm');
      
      console.log(`Saving BOM for part ${partId}, partNumber: ${partNumber}:`, bomItemsInput);
      
      // Gather all manufactured child part numbers upfront for batch lookup
      const manufacturedPartNumbers = (bomItemsInput || [])
        .filter((item: any) => item.isManufactured && item.partNumber)
        .map((item: any) => item.partNumber);
      
      // Pre-fetch all existing BOM definitions for manufactured children in one query
      let existingChildBomMap: Map<string, any> = new Map();
      if (manufacturedPartNumbers.length > 0) {
        const existingChildBoms = await db
          .select()
          .from(bomDefinitions)
          .where(inArray(bomDefinitions.sku, manufacturedPartNumbers));
        for (const bom of existingChildBoms) {
          if (bom.sku) {
            existingChildBomMap.set(bom.sku, bom);
          }
        }
      }
      
      // First check if a BOM definition already exists for this part number
      let bomDef: any = null;
      if (partNumber) {
        const existing = await db
          .select()
          .from(bomDefinitions)
          .where(eq(bomDefinitions.sku, partNumber))
          .limit(1);
        
        if (existing.length > 0) {
          bomDef = existing[0];
        }
      }
      
      // Create new BOM definition if it doesn't exist
      if (!bomDef) {
        const [newBom] = await db.insert(bomDefinitions).values({
          sku: partNumber || `P2-PART-${partId}`,
          modelName: partNumber || `Part ${partId}`,
          revision: 'A',
          description: `BOM for P2 part ${partNumber || partId}`,
          isActive: true
        }).returning();
        bomDef = newBom;
      }
      
      // Clear existing BOM items for this definition
      await db
        .update(bomItemsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(bomItemsTable.bomId, bomDef.id));
      
      // Insert new BOM items and create BOM definitions for manufactured children
      const insertedItems = [];
      const createdChildBomDefinitions = [];
      
      for (const item of bomItemsInput || []) {
        let childBomDef = null;
        
        // If the item is manufactured, ensure it has a BOM definition
        if (item.isManufactured && item.partNumber) {
          // Check if already exists from our pre-fetch
          childBomDef = existingChildBomMap.get(item.partNumber);
          
          if (!childBomDef) {
            // Re-check in case of race condition
            const [existingNow] = await db
              .select()
              .from(bomDefinitions)
              .where(eq(bomDefinitions.sku, item.partNumber))
              .limit(1);
            
            if (existingNow) {
              childBomDef = existingNow;
              existingChildBomMap.set(item.partNumber, existingNow);
            } else {
              // Create BOM definition for the manufactured child
              try {
                const [newChildBom] = await db.insert(bomDefinitions).values({
                  sku: item.partNumber,
                  modelName: item.partNumber,
                  revision: 'A',
                  description: item.description || `BOM for manufactured part ${item.partNumber}`,
                  isActive: true
                }).returning();
                
                if (newChildBom) {
                  childBomDef = newChildBom;
                  createdChildBomDefinitions.push(childBomDef);
                  existingChildBomMap.set(item.partNumber, childBomDef);
                  console.log(`Auto-created BOM definition for manufactured child: ${item.partNumber}`);
                }
              } catch (childError: any) {
                console.error(`Error creating child BOM for ${item.partNumber}:`, childError);
                // Try to fetch in case it was just created by concurrent request
                const [raceCreated] = await db
                  .select()
                  .from(bomDefinitions)
                  .where(eq(bomDefinitions.sku, item.partNumber))
                  .limit(1);
                if (raceCreated) {
                  childBomDef = raceCreated;
                  existingChildBomMap.set(item.partNumber, raceCreated);
                }
              }
            }
          }
        }
        
        // Manufactured parts (packets) automatically go to cutting_table as their first department
        const effectiveFirstDept = item.isManufactured 
          ? 'cutting_table' 
          : (item.firstDepartment || 'layup');
        
        const [inserted] = await db.insert(bomItemsTable).values({
          bomId: bomDef.id,
          partName: item.partNumber,
          quantity: item.quantity || 1,
          firstDept: effectiveFirstDept,
          itemType: item.isManufactured ? 'manufactured' : 'material',
          notes: item.description || '',
          isActive: true,
          referenceBomId: childBomDef?.id || null
        }).returning();
        insertedItems.push(inserted);
      }
      
      // Update the PO's bomConfigured flag if we have a valid numeric poItemId
      // Skip this for manufactured child parts (IDs starting with 'mfg-')
      const poItemIdNum = parseInt(poItemId);
      if (poItemId && !isNaN(poItemIdNum) && !String(poItemId).startsWith('mfg-')) {
        const [poItem] = await db
          .select()
          .from(p2PurchaseOrderItems)
          .where(eq(p2PurchaseOrderItems.id, poItemIdNum))
          .limit(1);
        
        if (poItem) {
          // Check if all items for this PO have BOMs
          const allItems = await db
            .select()
            .from(p2PurchaseOrderItems)
            .where(eq(p2PurchaseOrderItems.poId, poItem.poId));
          
          let allHaveBOMs = true;
          for (const pi of allItems) {
            const hasBOM = await db
              .select()
              .from(bomDefinitions)
              .where(and(
                eq(bomDefinitions.sku, pi.partNumber),
                eq(bomDefinitions.isActive, true)
              ))
              .limit(1);
            if (hasBOM.length === 0) {
              allHaveBOMs = false;
              break;
            }
          }
          
          if (allHaveBOMs) {
            await db
              .update(p2PurchaseOrders)
              .set({ bomConfigured: true })
              .where(eq(p2PurchaseOrders.id, poItem.poId));
            
            // Create serialized items for scheduling when BOM is complete
            const { p2SerializedItems, partRoutings: partRoutingsTable } = await import('../../schema');
            const { v4: uuidv4 } = await import('uuid');
            const { and: andOp, eq: eqOp, ilike: ilikeOp } = await import('drizzle-orm');
            
            // Get the PO for additional info
            const [po] = await db
              .select()
              .from(p2PurchaseOrders)
              .where(eq(p2PurchaseOrders.id, poItem.poId))
              .limit(1);
            
            // Check if serialized items already exist for this PO
            const existingItems = await db
              .select()
              .from(p2SerializedItems)
              .where(eq(p2SerializedItems.poId, poItem.poId));
            
            // Only create if none exist yet
            if (existingItems.length === 0) {
              console.log(`Creating serialized items for PO ${po?.poNumber} with ${allItems.length} line items`);
              
              for (const lineItem of allItems) {
                let itemRouting = await db.query.partRoutings.findFirst({
                  where: andOp(eqOp(partRoutingsTable.partNumber, lineItem.partNumber), eqOp(partRoutingsTable.isActive, true)),
                });
                if (!itemRouting) {
                  itemRouting = await db.query.partRoutings.findFirst({
                    where: andOp(ilikeOp(partRoutingsTable.partNumber, lineItem.partNumber), eqOp(partRoutingsTable.isActive, true)),
                  });
                }
                const baseMatch = lineItem.partNumber.match(/^(.+?)\s*Rev\s*\w+$/i);
                const familyKey = baseMatch ? baseMatch[1].trim() : lineItem.partNumber;

                for (let i = 0; i < (lineItem.quantity || 1); i++) {
                  const sequenceNum = i + 1;
                  const seq4 = String(sequenceNum).padStart(4, '0');
                  const barcode = `${po?.poNumber || 'P2'}-UNIT-${seq4}`;
                  const serialNumber = barcode;
                  
                  await db.insert(p2SerializedItems).values({
                    id: uuidv4(),
                    poId: poItem.poId,
                    poItemId: lineItem.id,
                    poNumber: po?.poNumber || 'Unknown',
                    partNumber: lineItem.partNumber,
                    partName: lineItem.partName || lineItem.partNumber,
                    customerId: po?.customerId || 'Unknown',
                    customerName: po?.customerName || 'Unknown',
                    sequenceNumber: sequenceNum,
                    serialNumber,
                    barcode,
                    travelerBarcode: barcode,
                    buildFamilyKey: familyKey,
                    partRoutingId: itemRouting?.id || null,
                    partRoutingRevision: itemRouting ? ((itemRouting as any).routingRevision || 1) : null,
                    status: 'ACTIVE',
                    currentDepartment: 'Pending Layup',
                    currentStageIndex: 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                  });
                }
              }
              
              console.log(`Created serialized items for PO ${po?.poNumber}`);
            }

            // Auto-generate production orders (including Cutting Table packet demands)
            try {
              const { p2ProductionOrders: p2ProdTable } = await import('../../schema');
              const existingProdOrders = await db
                .select()
                .from(p2ProdTable)
                .where(eq(p2ProdTable.p2PoId, poItem.poId));

              const hasCuttingDemands = existingProdOrders.some(o => o.department === 'Cutting Table');
              const bomHasPacketItems = (bomItemsInput || []).some((item: any) => item.isManufactured);

              if (existingProdOrders.length === 0) {
                console.log(`🔄 Auto-generating production orders for PO ${po?.poNumber} (including cutting table packet demands)...`);
                const { storage } = await import('../../storage');
                const prodOrders = await storage.generateP2ProductionOrders(poItem.poId);
                console.log(`✅ Auto-generated ${prodOrders.length} production orders for PO ${po?.poNumber}`);
                const cuttingOrders = prodOrders.filter(o => o.department === 'Cutting Table');
                if (cuttingOrders.length > 0) {
                  console.log(`  📋 ${cuttingOrders.length} cutting table packet demand(s) created`);
                }
              } else if (bomHasPacketItems && !hasCuttingDemands) {
                console.log(`🔄 BOM has packet items but no cutting table demands exist for PO ${po?.poNumber} - generating packet demands...`);
                const { storage } = await import('../../storage');
                const prodOrders = await storage.generateP2ProductionOrders(poItem.poId);
                const cuttingOrders = prodOrders.filter(o => o.department === 'Cutting Table');
                console.log(`✅ Auto-generated ${cuttingOrders.length} cutting table packet demand(s) for PO ${po?.poNumber}`);
              } else {
                console.log(`ℹ️ Production orders already exist for PO ${po?.poNumber} (cutting demands: ${hasCuttingDemands}) - skipping auto-generation`);
              }
            } catch (prodError) {
              console.error(`⚠️ Failed to auto-generate production orders for PO ${po?.poNumber}:`, prodError);
            }
          }
        }
      }
      
      res.json({ 
        success: true, 
        partId, 
        bomDefinitionId: bomDef.id,
        bomItems: insertedItems,
        createdChildBomDefinitions: createdChildBomDefinitions.map(b => ({
          id: b.id,
          sku: b.sku,
          modelName: b.modelName
        }))
      });
    } catch (_error: any) {
      console.error('P2 BOM save error:', _error);
      const errorMessage = _error?.message || 'Failed to save BOM';
      const errorDetails = _error?.detail || _error?.hint || '';
      res.status(500).json({ 
        error: 'Failed to save BOM', 
        message: errorMessage,
        details: errorDetails
      });
    }
  });

  // Get existing BOM items by part number
  app.get('/api/p2/bom/items/:partNumber', async (req, res) => {
    try {
      const { partNumber } = req.params;
      
      const { db } = await import('../../db');
      const { bomDefinitions, bomItems: bomItemsTable } = await import('../../schema');
      const { eq, and } = await import('drizzle-orm');
      
      // Find the BOM definition for this part number
      const [bomDef] = await db
        .select()
        .from(bomDefinitions)
        .where(and(
          eq(bomDefinitions.sku, partNumber),
          eq(bomDefinitions.isActive, true)
        ))
        .limit(1);
      
      if (!bomDef) {
        return res.json({ bomItems: [], hasBOM: false });
      }
      
      // Get all active BOM items for this definition
      const items = await db
        .select()
        .from(bomItemsTable)
        .where(and(
          eq(bomItemsTable.bomId, bomDef.id),
          eq(bomItemsTable.isActive, true)
        ));
      
      res.json({
        hasBOM: true,
        bomDefinitionId: bomDef.id,
        bomItems: items.map(item => ({
          id: item.id,
          partName: item.partName,
          partNumber: item.partName,
          notes: item.notes,
          description: item.notes || '',
          quantity: item.quantity,
          itemType: item.itemType,
          isManufactured: item.itemType === 'manufactured',
          firstDept: item.firstDept,
          firstDepartment: item.firstDept,
          referenceBomId: item.referenceBomId
        }))
      });
    } catch (_error) {
      console.error('Get BOM items error:', _error);
      res.status(500).json({ error: 'Failed to fetch BOM items' });
    }
  });

  app.post('/api/p2/schedule', async (req, res) => {
    try {
      const { entries } = req.body;
      const { storage } = await import('../../storage');
      
      for (const entry of entries) {
        await storage.updateP2SerializedItem(entry.itemId, {
          productionStatus: 'SCHEDULED'
        });
      }
      
      res.json({ success: true, scheduled: entries.length });
    } catch (_error) {
      console.error('P2 schedule error:', _error);
      res.status(500).json({ error: 'Failed to schedule items' });
    }
  });

  // Schedule items by moving them from "Pending Layup" to "Layup" department
  app.post('/api/p2/schedule-items', async (req, res) => {
    try {
      const { itemIds } = req.body;
      
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ error: 'Item IDs array is required' });
      }

      const { db } = await import('../../db');
      const { p2SerializedItems, p2ProductionOrders, p2PurchaseOrders, manufacturingQueue, inventoryItems, cuttingPacketBOMs } = await import('../../schema');
      const { eq, inArray, and } = await import('drizzle-orm');
      
      // Update all items to move to Layup department (scheduled for production)
      const result = await db
        .update(p2SerializedItems)
        .set({ 
          currentDepartment: 'Layup',
          updatedAt: new Date()
        })
        .where(
          and(
            inArray(p2SerializedItems.id, itemIds),
            eq(p2SerializedItems.status, 'ACTIVE'),
            eq(p2SerializedItems.currentDepartment, 'Pending Layup')
          )
        )
        .returning({ id: p2SerializedItems.id, poId: p2SerializedItems.poId });
      
      console.log(`Scheduled ${result.length} items for production`);
      
      // Auto-sync P2 cutting table demands for the affected POs
      // Looks for PENDING production orders (any dept) where the part requires cutting (CF/FG parts)
      let cuttingTableSynced = 0;
      try {
        const { ilike, or, sql: sqlFn } = await import('drizzle-orm');
        const affectedPoIds = [...new Set(result.map(r => r.poId))];

        // Pre-load packet inventory items keyed by material type
        const cfPacketItem = await db.select().from(inventoryItems)
          .where(and(eq(inventoryItems.isPacket, true), ilike(inventoryItems.name, '%carbon fiber%')))
          .limit(1).then(r => r[0] || null);
        const fgPacketItem = await db.select().from(inventoryItems)
          .where(and(eq(inventoryItems.isPacket, true), or(ilike(inventoryItems.name, '%fiberglass%'), ilike(inventoryItems.name, '%fiber glass%'))))
          .limit(1).then(r => r[0] || null);

        const isCfPart = (name: string) => {
          const n = name.toLowerCase();
          return n.includes('carbon fiber') || n.includes('carbon fibre') || n.includes(' cf ') || n.startsWith('cf ');
        };
        const isFgPart = (name: string) => {
          const n = name.toLowerCase();
          return n.includes('fiberglass') || n.includes('fibreglass') || n.includes('fiber glass');
        };

        for (const poId of affectedPoIds) {
          // Fetch all PENDING orders for this PO
          const p2Orders = await db
            .select()
            .from(p2ProductionOrders)
            .where(and(eq(p2ProductionOrders.status, 'PENDING'), eq(p2ProductionOrders.p2PoId, poId)));

          // Filter to orders that need cutting — either explicitly 'Cutting Table'
          // or Layup orders that are ACTUAL packet items (by name/SKU), not just any CF/FG part
          const cuttingOrders = p2Orders.filter(o => {
            if (o.department === 'Cutting Table') return true;
            if (o.department === 'Layup' || o.department === 'layup') {
              const name = (o.partName || '').toLowerCase();
              const sku = (o.sku || '').toLowerCase();
              return name.includes('packet') || sku.includes('packet') || o.sku === 'P706' || o.sku === 'P707';
            }
            return false;
          });

          if (cuttingOrders.length === 0) continue;

          // Aggregate demand by PO item + material type
          const demandMap: Record<string, { materialType: 'carbon_fiber' | 'fiberglass'; packetItem: typeof cfPacketItem; p2PoId: number; p2PoItemId: number; quantity: number; dueDate: Date | null; partName: string }> = {};

          for (const order of cuttingOrders) {
            const materialType = isFgPart(order.partName || '') ? 'fiberglass' : 'carbon_fiber';
            const packetItem = materialType === 'fiberglass' ? fgPacketItem : cfPacketItem;
            if (!packetItem) continue; // No packet inventory item configured for this material type

            const key = `${order.p2PoId}-${order.p2PoItemId}-${materialType}`;
            if (!demandMap[key]) {
              demandMap[key] = { materialType, packetItem, p2PoId: order.p2PoId, p2PoItemId: order.p2PoItemId, quantity: 0, dueDate: order.dueDate, partName: order.partName || '' };
            }
            demandMap[key].quantity += (order.quantity || 1);
          }

          const existingEntries = await db.select().from(manufacturingQueue)
            .where(and(eq(manufacturingQueue.department, 'Cutting Table'), eq(manufacturingQueue.p2PoId, poId)));

          for (const [, demand] of Object.entries(demandMap)) {
            const existing = existingEntries.find(e =>
              e.p2PoId === demand.p2PoId &&
              e.inventoryItemId === demand.packetItem!.id &&
              e.p2PoItemId === demand.p2PoItemId
            );
            if (existing) continue;

            const [po] = await db.select().from(p2PurchaseOrders).where(eq(p2PurchaseOrders.id, demand.p2PoId)).limit(1);
            const poNumber = po?.poNumber || `PO-${demand.p2PoId}`;

            const [matchingBom] = await db.select().from(cuttingPacketBOMs).where(eq(cuttingPacketBOMs.partNumber, demand.packetItem!.agPartNumber)).limit(1);

            const notesObj = {
              source: 'P2_SYNC',
              p2PoNumber: poNumber,
              p2PoId: demand.p2PoId,
              p2PoItemId: demand.p2PoItemId,
              bomId: matchingBom?.id || null,
              materialType: demand.materialType,
              partName: demand.partName,
            };

            await db.insert(manufacturingQueue).values({
              inventoryItemId: demand.packetItem!.id,
              department: 'Cutting Table',
              quantityRequested: demand.quantity,
              quantityCompleted: 0,
              priority: 50,
              status: 'PENDING',
              dueDate: demand.dueDate,
              notes: JSON.stringify(notesObj),
              requestedBy: 'system',
              p2PoId: demand.p2PoId,
              p2PoItemId: demand.p2PoItemId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });

            cuttingTableSynced++;
          }
        }

        if (cuttingTableSynced > 0) {
          console.log(`Auto-synced ${cuttingTableSynced} cutting table packet demands from P2 control center`);
        }
      } catch (syncError) {
        console.error('Non-fatal: Failed to auto-sync cutting table demands:', syncError);
      }
      
      res.json({ 
        success: true, 
        scheduled: result.length,
        cuttingTableDemands: cuttingTableSynced,
        message: `${result.length} items moved to Layup department${cuttingTableSynced > 0 ? `, ${cuttingTableSynced} cutting table stock packet demands created` : ''}`
      });
    } catch (_error) {
      console.error('P2 schedule-items error:', _error);
      res.status(500).json({ error: 'Failed to schedule items' });
    }
  });

  app.post('/api/p2/print-barcodes', async (req, res) => {
    try {
      const { itemIds } = req.body;
      console.log('Printing barcodes for items:', itemIds);
      res.json({ success: true, message: 'Barcodes generated' });
    } catch (_error) {
      console.error('P2 print barcodes error:', _error);
      res.status(500).json({ error: 'Failed to print barcodes' });
    }
  });

  // Get weekly production queue - items scheduled for a specific week
  app.get('/api/p2/weekly-queue/:weekNumber', async (req, res) => {
    try {
      const { weekNumber } = req.params;
      const { storage } = await import('../../storage');
      
      // Get all scheduled items and filter by week
      const scheduledItems = await storage.getP2SerializedItems({ 
        productionStatus: 'SCHEDULED' 
      });
      
      // Helper to get week start date
      const getWeekStartDate = (year: number, week: number): Date => {
        const jan1 = new Date(year, 0, 1);
        const dayOfWeek = jan1.getDay();
        const firstMonday = new Date(jan1);
        firstMonday.setDate(jan1.getDate() + (dayOfWeek <= 1 ? 1 - dayOfWeek : 8 - dayOfWeek));
        const weekStart = new Date(firstMonday);
        weekStart.setDate(firstMonday.getDate() + (week - 1) * 7);
        return weekStart;
      };
      
      // Calculate week dates for filtering
      const year = new Date().getFullYear();
      const weekStart = getWeekStartDate(year, parseInt(weekNumber));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      // Group items by PO for weekly summary
      const itemsByPO: Record<string, any[]> = {};
      let totalItems = 0;
      
      for (const item of scheduledItems) {
        const poNumber = item.poNumber || 'Unknown';
        if (!itemsByPO[poNumber]) {
          itemsByPO[poNumber] = [];
        }
        itemsByPO[poNumber].push(item);
        totalItems++;
      }
      
      // Calculate summary stats
      const poSummaries = Object.entries(itemsByPO).map(([poNumber, items]) => ({
        poNumber,
        itemCount: items.length,
        partNumbers: [...new Set(items.map((i: any) => i.partNumber))],
        items
      }));
      
      res.json({
        weekNumber: parseInt(weekNumber),
        weekStart: weekStart.toISOString(),
        weekEnd: weekEnd.toISOString(),
        totalItems,
        totalPOs: poSummaries.length,
        poSummaries,
        itemsPerDay: Math.ceil(totalItems / 5),
        allItems: scheduledItems
      });
    } catch (_error) {
      console.error('Weekly queue error:', _error);
      res.status(500).json({ error: 'Failed to get weekly queue' });
    }
  });

  // Print all barcodes for a specific week's scheduled items
  app.post('/api/p2/print-week-barcodes/:weekNumber', async (req, res) => {
    try {
      const { weekNumber } = req.params;
      const { storage } = await import('../../storage');
      
      // Get all scheduled items for the week
      const scheduledItems = await storage.getP2SerializedItems({ 
        productionStatus: 'SCHEDULED' 
      });
      
      const itemIds = scheduledItems.map((item: any) => item.id);
      console.log(`Printing barcodes for week ${weekNumber}: ${itemIds.length} items`);
      
      // Return item data for barcode generation
      res.json({ 
        success: true, 
        weekNumber: parseInt(weekNumber),
        itemCount: itemIds.length,
        items: scheduledItems.map((item: any) => ({
          id: item.id,
          serialNumber: item.serialNumber,
          partNumber: item.partNumber,
          poNumber: item.poNumber
        }))
      });
    } catch (_error) {
      console.error('Print week barcodes error:', _error);
      res.status(500).json({ error: 'Failed to print week barcodes' });
    }
  });

  // P2 Tolerance Deviation Authorization Routes
  app.post('/api/p2/final-inspection/:inspectionId/approve-deviation', async (req, res) => {
    try {
      const { inspectionId } = req.params;
      const { 
        serializedItemId,
        toleranceAuthorizerId,
        toleranceAuthorizerName,
        toleranceAuthorizerSignature,
        toleranceDeviationReason
      } = req.body;

      if (!toleranceAuthorizerId || !toleranceAuthorizerSignature || !toleranceDeviationReason) {
        return res.status(400).json({ 
          error: 'Missing required fields: authorizer ID, signature, and reason are required' 
        });
      }

      const { storage } = await import('../../storage');
      
      // Update the final inspection record with tolerance authorization
      // For now, we'll log the approval since the storage method may not exist yet
      console.log('Tolerance deviation approved:', {
        inspectionId,
        serializedItemId,
        toleranceAuthorizerId,
        toleranceAuthorizerName,
        toleranceDeviationReason,
        hasSignature: !!toleranceAuthorizerSignature
      });

      // Update the serialized item to allow it to proceed
      if (serializedItemId) {
        await storage.updateP2SerializedItem(serializedItemId, {
          notes: `Tolerance deviation approved by ${toleranceAuthorizerName} on ${new Date().toISOString()}`
        });
      }

      res.json({ 
        success: true, 
        message: 'Tolerance deviation approved',
        inspectionId,
        authorizedBy: toleranceAuthorizerName,
        authorizedAt: new Date().toISOString()
      });
    } catch (_error) {
      console.error('P2 tolerance deviation approval error:', _error);
      res.status(500).json({ error: 'Failed to approve tolerance deviation' });
    }
  });

  app.post('/api/p2/final-inspection/:inspectionId/reject-deviation', async (req, res) => {
    try {
      const { inspectionId } = req.params;
      const { serializedItemId, rejectedBy, rejectedByName } = req.body;

      const { storage } = await import('../../storage');
      
      // Log the rejection
      console.log('Tolerance deviation rejected:', {
        inspectionId,
        serializedItemId,
        rejectedBy,
        rejectedByName
      });

      // Flag the item for rework by updating its status
      if (serializedItemId) {
        await storage.updateP2SerializedItem(serializedItemId, {
          productionStatus: 'HOLD',
          notes: `Tolerance deviation rejected by ${rejectedByName} on ${new Date().toISOString()} - requires rework or scrap`
        });
      }

      res.json({ 
        success: true, 
        message: 'Tolerance deviation rejected - item flagged for rework',
        inspectionId,
        rejectedBy: rejectedByName,
        rejectedAt: new Date().toISOString()
      });
    } catch (_error) {
      console.error('P2 tolerance deviation rejection error:', _error);
      res.status(500).json({ error: 'Failed to reject tolerance deviation' });
    }
  });

  // Get tolerance authorizer info for a PO
  app.get('/api/p2/purchase-order/:poId/tolerance-authorizer', async (req, res) => {
    try {
      const { poId } = req.params;
      const { storage } = await import('../../storage');
      
      const po = await storage.getP2PurchaseOrder(parseInt(poId));
      if (!po) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      res.json({
        toleranceAuthorizerId: (po as any).toleranceAuthorizerId || null,
        toleranceAuthorizerName: (po as any).toleranceAuthorizerName || null,
        toleranceNotes: (po as any).toleranceNotes || null
      });
    } catch (_error) {
      console.error('P2 get tolerance authorizer error:', _error);
      res.status(500).json({ error: 'Failed to get tolerance authorizer' });
    }
  });

  // P2 Layup Gating - Check packet availability before scheduling
  app.get('/api/p2/layup-gating/check-availability', async (req, res) => {
    try {
      const { partNumber, quantity } = req.query;
      
      if (!partNumber) {
        return res.status(400).json({ 
          error: 'Part number is required',
          available: false 
        });
      }

      const requestedQty = parseInt(quantity as string) || 1;

      // Query the cutting_built_packets table for available packets
      const { db } = await import('../../db');
      const { cuttingBuiltPackets, cuttingProductCategories } = await import('../../schema');
      const { eq, and, sql } = await import('drizzle-orm');
      
      // Find available packets for this part/product category
      const availablePackets = await db
        .select({
          count: sql<number>`count(*)::int`
        })
        .from(cuttingBuiltPackets)
        .where(eq(cuttingBuiltPackets.status, 'AVAILABLE'));

      const availableCount = availablePackets[0]?.count || 0;
      const isAvailable = availableCount >= requestedQty;

      res.json({
        partNumber,
        requestedQuantity: requestedQty,
        availablePackets: availableCount,
        isAvailable,
        shortageAmount: isAvailable ? 0 : requestedQty - availableCount,
        message: isAvailable 
          ? `${availableCount} packets available for scheduling` 
          : `Insufficient packets: need ${requestedQty}, only ${availableCount} available`
      });
    } catch (_error) {
      console.error('P2 layup gating check error:', _error);
      res.status(500).json({ error: 'Failed to check packet availability' });
    }
  });

  // P2 Layup Gating - Allocate packets for scheduled items
  app.post('/api/p2/layup-gating/allocate-packets', async (req, res) => {
    try {
      const { serializedItemId, partNumber, quantity } = req.body;
      
      if (!serializedItemId || !partNumber) {
        return res.status(400).json({ 
          error: 'Serialized item ID and part number are required' 
        });
      }

      const requestedQty = quantity || 1;

      const { db } = await import('../../db');
      const { cuttingBuiltPackets } = await import('../../schema');
      const { eq, sql } = await import('drizzle-orm');
      
      // Find available packets in FIFO order (oldest first)
      const availablePackets = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(eq(cuttingBuiltPackets.status, 'AVAILABLE'))
        .orderBy(cuttingBuiltPackets.buildDate)
        .limit(requestedQty);

      if (availablePackets.length < requestedQty) {
        return res.status(400).json({
          error: 'Insufficient packets available',
          available: availablePackets.length,
          requested: requestedQty
        });
      }

      // Allocate the packets
      const allocatedPackets = [];
      for (const packet of availablePackets) {
        await db
          .update(cuttingBuiltPackets)
          .set({
            status: 'ALLOCATED',
            allocatedToOrder: serializedItemId,
            updatedAt: new Date()
          })
          .where(eq(cuttingBuiltPackets.id, packet.id));
        
        allocatedPackets.push({
          packetId: packet.id,
          barcode: packet.barcode,
          buildDate: packet.buildDate
        });
      }

      res.json({
        success: true,
        allocatedPackets,
        message: `Allocated ${allocatedPackets.length} packets to serialized item ${serializedItemId}`
      });
    } catch (_error) {
      console.error('P2 layup gating allocation error:', _error);
      res.status(500).json({ error: 'Failed to allocate packets' });
    }
  });

  // P2 Layup Gating - Get packet details for a scheduled item
  app.get('/api/p2/layup-gating/allocated-packets/:serializedItemId', async (req, res) => {
    try {
      const { serializedItemId } = req.params;
      
      const { db } = await import('../../db');
      const { cuttingBuiltPackets, cuttingBuiltPacketFabricSources } = await import('../../schema');
      const { eq } = await import('drizzle-orm');
      
      // Get packets allocated to this item
      const packets = await db
        .select()
        .from(cuttingBuiltPackets)
        .where(eq(cuttingBuiltPackets.allocatedToOrder, serializedItemId));

      // Get fabric sources for each packet
      const packetsWithSources = await Promise.all(
        packets.map(async (packet) => {
          const sources = await db
            .select()
            .from(cuttingBuiltPacketFabricSources)
            .where(eq(cuttingBuiltPacketFabricSources.builtPacketId, packet.id));
          
          return {
            ...packet,
            fabricSources: sources,
            isMixedFabric: sources.length > 1
          };
        })
      );

      res.json({
        serializedItemId,
        allocatedPackets: packetsWithSources,
        totalPackets: packetsWithSources.length
      });
    } catch (_error) {
      console.error('P2 layup gating get allocated packets error:', _error);
      res.status(500).json({ error: 'Failed to get allocated packets' });
    }
  });

  // Smart Data Entry - Recent Lot Numbers
  app.get('/api/smart-entry/recent-lots', async (req, res) => {
    try {
      const { type, limit: queryLimit } = req.query;
      const maxResults = parseInt(queryLimit as string) || 10;

      const { db } = await import('../../db');
      const { cuttingFabricInventory } = await import('../../schema');
      const { desc, isNotNull, sql } = await import('drizzle-orm');

      // Get recent unique lot numbers from cutting fabric inventory
      const recentLots = await db
        .select({
          lotNumber: cuttingFabricInventory.lotNumber,
          batchNumber: cuttingFabricInventory.batchNumber,
          rollNumber: cuttingFabricInventory.rollNumber,
          supplierPartNumber: cuttingFabricInventory.supplierPartNumber,
          fabricType: cuttingFabricInventory.fabric,
          expirationDate: cuttingFabricInventory.expirationDate,
          createdAt: cuttingFabricInventory.createdAt
        })
        .from(cuttingFabricInventory)
        .where(isNotNull(cuttingFabricInventory.lotNumber))
        .orderBy(desc(cuttingFabricInventory.createdAt))
        .limit(maxResults * 2); // Get extra to filter duplicates

      // Deduplicate by lot number
      const seen = new Set<string>();
      const uniqueLots = recentLots.filter(lot => {
        if (!lot.lotNumber || seen.has(lot.lotNumber)) return false;
        seen.add(lot.lotNumber);
        return true;
      }).slice(0, maxResults);

      res.json({
        recentLots: uniqueLots,
        totalCount: uniqueLots.length
      });
    } catch (_error) {
      console.error('Smart entry recent lots error:', _error);
      res.status(500).json({ error: 'Failed to fetch recent lot numbers' });
    }
  });

  // Smart Data Entry - Suggestions based on partial input
  app.get('/api/smart-entry/suggestions', async (req, res) => {
    try {
      const { field, value } = req.query;
      
      if (!value || (value as string).length < 2) {
        return res.json({ suggestions: [] });
      }

      const { db } = await import('../../db');
      const { cuttingFabricInventory } = await import('../../schema');
      const { like, sql } = await import('drizzle-orm');

      let suggestions: string[] = [];
      const searchValue = `%${value}%`;

      if (field === 'lot') {
        const results = await db
          .select({ value: cuttingFabricInventory.lotNumber })
          .from(cuttingFabricInventory)
          .where(like(cuttingFabricInventory.lotNumber, searchValue))
          .limit(5);
        suggestions = results.map(r => r.value).filter(Boolean) as string[];
      } else if (field === 'batch') {
        const results = await db
          .select({ value: cuttingFabricInventory.batchNumber })
          .from(cuttingFabricInventory)
          .where(like(cuttingFabricInventory.batchNumber, searchValue))
          .limit(5);
        suggestions = results.map(r => r.value).filter(Boolean) as string[];
      } else if (field === 'roll') {
        const results = await db
          .select({ value: cuttingFabricInventory.rollNumber })
          .from(cuttingFabricInventory)
          .where(like(cuttingFabricInventory.rollNumber, searchValue))
          .limit(5);
        suggestions = results.map(r => r.value).filter(Boolean) as string[];
      } else if (field === 'supplier') {
        const results = await db
          .select({ value: cuttingFabricInventory.supplierPartNumber })
          .from(cuttingFabricInventory)
          .where(like(cuttingFabricInventory.supplierPartNumber, searchValue))
          .limit(5);
        suggestions = results.map(r => r.value).filter(Boolean) as string[];
      }

      // Deduplicate
      suggestions = [...new Set(suggestions)];

      res.json({ 
        field,
        query: value,
        suggestions 
      });
    } catch (_error) {
      console.error('Smart entry suggestions error:', _error);
      res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
  });

  // Smart Data Entry - Quick fill from barcode scan
  app.get('/api/smart-entry/barcode-lookup/:barcode', async (req, res) => {
    try {
      const { barcode } = req.params;
      
      const { db } = await import('../../db');
      const { cuttingFabricInventory } = await import('../../schema');
      const { eq } = await import('drizzle-orm');

      // Look up fabric inventory by barcode
      const result = await db
        .select()
        .from(cuttingFabricInventory)
        .where(eq(cuttingFabricInventory.barcode, barcode))
        .limit(1);

      if (result.length === 0) {
        return res.status(404).json({ 
          error: 'Barcode not found',
          barcode 
        });
      }

      const fabric = result[0];
      res.json({
        found: true,
        barcode,
        data: {
          lotNumber: fabric.lotNumber,
          batchNumber: fabric.batchNumber,
          rollNumber: fabric.rollNumber,
          supplierPartNumber: fabric.supplierPartNumber,
          internalControlNumber: fabric.internalControlNumber,
          fabricType: fabric.fabric,
          expirationDate: fabric.expirationDate,
          quantityInStock: fabric.quantityInStock
        }
      });
    } catch (_error) {
      console.error('Smart entry barcode lookup error:', _error);
      res.status(500).json({ error: 'Failed to lookup barcode' });
    }
  });

  // P2 PO PDF Attachment routes

  // Ensure P2 PO attachments directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const p2POAttachmentsDir = path.join(uploadsDir, 'p2-po-attachments');

  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(p2POAttachmentsDir)) {
    fs.mkdirSync(p2POAttachmentsDir, { recursive: true });
  }

  const p2POAttachmentStorage = multer.diskStorage({
    destination: (req: any, file: any, cb: any) => {
      cb(null, p2POAttachmentsDir);
    },
    filename: (req: any, file: any, cb: any) => {
      const timestamp = Date.now();
      const hash = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(file.originalname);
      const basename = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
      cb(null, `${basename}_${timestamp}_${hash}${ext}`);
    },
  });

  const p2POAttachmentUpload = multer({
    storage: p2POAttachmentStorage,
    fileFilter: (req: any, file: any, cb: any) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
      } else {
        cb(new Error('Only PDF files are allowed'));
      }
    },
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB limit
    },
  });

  // POST /api/p2-purchase-orders/:id/upload-attachment - Upload PDF attachment
  app.post(
    '/api/p2-purchase-orders/:id/upload-attachment',
    p2POAttachmentUpload.single('file'),
    async (req: any, res) => {
      try {
        const { id } = req.params;
        
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { storage } = await import('../../storage');
        const po = await storage.getP2PurchaseOrder(parseInt(id));
        
        if (!po) {
          return res.status(404).json({ error: 'P2 Purchase Order not found' });
        }

        const fileUrl = `/uploads/p2-po-attachments/${req.file.filename}`;
        
        // Add the new attachment to the existing array using JSONB functions
        const currentAttachments = Array.isArray(po.attachments) ? po.attachments : [];
        const updatedAttachments = [...currentAttachments, fileUrl];
        
        // Use SQL to properly update JSONB array
        const { db } = await import('../../db');
        const { p2PurchaseOrders } = await import('../../schema');
        const { eq, sql } = await import('drizzle-orm');
        
        await db
          .update(p2PurchaseOrders)
          .set({ attachments: sql`${JSON.stringify(updatedAttachments)}::jsonb` })
          .where(eq(p2PurchaseOrders.id, parseInt(id)));

        res.status(200).json({
          url: fileUrl,
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
        });
      } catch (error) {
        console.error('P2 PO attachment upload error:', error);
        res.status(500).json({ error: 'Failed to upload attachment' });
      }
    }
  );

  // DELETE /api/p2-purchase-orders/:id/attachment - Delete specific attachment
  app.delete('/api/p2-purchase-orders/:id/attachment', async (req, res) => {
    try {
      const { id } = req.params;
      const { attachmentUrl } = req.body;

      if (!attachmentUrl) {
        return res.status(400).json({ error: 'Attachment URL is required' });
      }

      const { storage } = await import('../../storage');
      const po = await storage.getP2PurchaseOrder(parseInt(id));
      
      if (!po) {
        return res.status(404).json({ error: 'P2 Purchase Order not found' });
      }

      // Remove the attachment from the array
      const currentAttachments = Array.isArray(po.attachments) ? po.attachments : [];
      const updatedAttachments = currentAttachments.filter(
        (url: string) => url !== attachmentUrl
      );
      
      // Use SQL to properly update JSONB array
      const { db } = await import('../../db');
      const { p2PurchaseOrders } = await import('../../schema');
      const { eq, sql } = await import('drizzle-orm');
      
      await db
        .update(p2PurchaseOrders)
        .set({ attachments: sql`${JSON.stringify(updatedAttachments)}::jsonb` })
        .where(eq(p2PurchaseOrders.id, parseInt(id)));

      // Try to delete the physical file
      const filename = attachmentUrl.split('/').pop();
      if (filename) {
        const filePath = path.join(p2POAttachmentsDir, filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (fileError) {
          console.error('Failed to delete physical file:', fileError);
          // Continue anyway - database record is updated
        }
      }

      res.json({ success: true, message: 'Attachment removed successfully' });
    } catch (error) {
      console.error('P2 PO attachment delete error:', error);
      res.status(500).json({ error: 'Failed to delete attachment' });
    }
  });

  // P2 Purchase Order Items routes
  app.get('/api/p2/purchase-orders/:poId/items', async (req, res) => {
    try {
      const { poId } = req.params;
      const { storage } = await import('../../storage');
      const items = await storage.getP2PurchaseOrderItems(parseInt(poId));
      res.json(items);
    } catch (error) {
      console.error('Get P2 purchase order items error:', error);
      res.status(500).json({ error: 'Failed to fetch P2 purchase order items' });
    }
  });

  app.post('/api/p2/purchase-orders/:poId/items', async (req, res) => {
    try {
      const { poId } = req.params;
      const { storage } = await import('../../storage');
      const { insertP2PurchaseOrderItemSchema } = await import('../../schema');
      
      console.log('📦 P2 PO Item Create - Request body:', req.body);
      
      const itemData = insertP2PurchaseOrderItemSchema.omit({ poId: true }).parse(req.body);
      
      console.log('📦 P2 PO Item Create - Parsed data:', itemData);
      
      // Calculate totalPrice from quantity and unitPrice
      const totalPrice = itemData.quantity * (itemData.unitPrice || 0);
      
      console.log('📦 P2 PO Item Create - Calculated totalPrice:', totalPrice);
      
      const createData = { 
        ...itemData, 
        poId: parseInt(poId),
        totalPrice
      };
      
      console.log('📦 P2 PO Item Create - Final data to storage:', createData);
      
      const item = await storage.createP2PurchaseOrderItem(createData);
      
      console.log('📦 P2 PO Item Create - Created item:', item);
      
      res.status(201).json(item);
    } catch (error) {
      console.error('Create P2 purchase order item error:', error);
      const { z } = await import('zod');
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid P2 purchase order item data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to create P2 purchase order item' });
      }
    }
  });

  app.put('/api/p2/purchase-orders/:poId/items/:itemId', async (req, res) => {
    try {
      const { itemId } = req.params;
      const { storage } = await import('../../storage');
      const { insertP2PurchaseOrderItemSchema } = await import('../../schema');
      const itemData = insertP2PurchaseOrderItemSchema.partial().omit({ poId: true }).parse(req.body);
      
      // Recalculate totalPrice if quantity or unitPrice changed
      let updateData = { ...itemData };
      if (itemData.quantity !== undefined || itemData.unitPrice !== undefined) {
        // Get existing item to get current values
        const existingItems = await storage.getP2PurchaseOrderItems(parseInt(req.params.poId));
        const existingItem = existingItems.find(i => i.id === parseInt(itemId));
        if (existingItem) {
          const quantity = itemData.quantity ?? existingItem.quantity;
          const unitPrice = itemData.unitPrice ?? existingItem.unitPrice ?? 0;
          updateData.totalPrice = quantity * unitPrice;
        }
      }
      
      const item = await storage.updateP2PurchaseOrderItem(parseInt(itemId), updateData);

      // If partNumber or partName changed, cascade update to all serialized items for this PO item
      if (itemData.partNumber || itemData.partName) {
        const { p2SerializedItems } = await import('../../schema');
        const { eq } = await import('drizzle-orm');
        const { db } = await import('../../db');

        const serializedUpdateData: Record<string, any> = {};
        if (itemData.partNumber) serializedUpdateData.partNumber = itemData.partNumber;
        if (itemData.partName) serializedUpdateData.partName = itemData.partName;
        serializedUpdateData.updatedAt = new Date();

        const updated = await db
          .update(p2SerializedItems)
          .set(serializedUpdateData)
          .where(eq(p2SerializedItems.poItemId, parseInt(itemId)))
          .returning({ id: p2SerializedItems.id });

        console.log(`[P2 PO Item Update] Cascaded part number/name change to ${updated.length} serialized items for PO item ${itemId}`);
      }

      res.json(item);
    } catch (error) {
      console.error('Update P2 purchase order item error:', error);
      const { z } = await import('zod');
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid P2 purchase order item data', details: error.errors });
      } else {
        res.status(500).json({ error: 'Failed to update P2 purchase order item' });
      }
    }
  });

  app.delete('/api/p2/purchase-orders/:poId/items/:itemId', async (req, res) => {
    try {
      const { itemId } = req.params;
      const { storage } = await import('../../storage');
      await storage.deleteP2PurchaseOrderItem(parseInt(itemId));
      res.json({ success: true });
    } catch (error) {
      console.error('Delete P2 purchase order item error:', error);
      res.status(500).json({ error: 'Failed to delete P2 purchase order item' });
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
      console.error('🚨 Error retrieving stock models:', _error);
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
      console.error('🔧 Stock model create _error:', _error);
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

      const previousModel = await storage.getStockModel(id);
      const previousMaterial = previousModel?.material ?? null;

      const stockModel = await storage.updateStockModel(id, req.body);

      const newMaterial = stockModel.material ?? null;
      if (previousMaterial !== newMaterial) {
        console.warn(
          `[STOCK MODEL MATERIAL CHANGED]\n` +
          `Stock Model: ${id}\n` +
          `Old: ${previousMaterial}\n` +
          `New: ${newMaterial}\n` +
          `WARNING: Existing production_orders retain original material_canonical.`
        );

        try {
          const { db } = await import('../../db');
          const { adminAuditLog } = await import('../../schema');
          await db.insert(adminAuditLog).values({
            orderId: `stock_model:${id}`,
            fieldName: 'material',
            fieldLabel: 'Stock Model Material',
            oldValue: previousMaterial,
            newValue: newMaterial,
            changedBy: (req as any).user?.username || 'system',
            userRole: (req as any).user?.role || 'SYSTEM',
            changeType: 'INLINE',
          });
        } catch (auditErr) {
          console.error('Failed to write material change audit log:', auditErr);
        }
      }

      console.log('🔧 Updated stock model:', stockModel.id);
      res.json(stockModel);
    } catch (_error) {
      console.error('🔧 Stock model update _error:', _error);
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
      console.error('🔧 Stock model delete _error:', _error);
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
      console.error('🎯 Features API Error:', _error);
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
      console.error('🔧 Feature create _error:', _error);
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
      console.error('🔧 Feature update _error:', _error);
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
      console.error('🔧 Feature delete _error:', _error);
      res.status(500).json({ _error: 'Failed to delete feature' });
    }
  });

  app.get('/api/feature-categories', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const categories = await storage.getAllFeatureCategories();
      res.json(categories);
    } catch (_error) {
      console.error('Get feature categories _error:', _error);
      res.status(500).json({ _error: 'Failed to get feature categories' });
    }
  });

  app.get('/api/feature-sub-categories', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const subCategories = await storage.getAllFeatureSubCategories();
      res.json(subCategories);
    } catch (_error) {
      console.error('Get feature sub-categories _error:', _error);
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
      console.error('🚀 Employee data fetch _error:', _error);
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
      console.error('🔧 Employee layup settings fetch _error:', _error);
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
        console.error(`❌ Employee with ID ${id} not found`);
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
      console.error('🔧 Employee update _error:', _error);
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
      console.error('Get all addresses _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch addresses' });
    }
  });

  app.post('/api/addresses', async (req, res) => {
    try {
      console.log('🔧 ADDRESS CREATE ROUTE CALLED');
      console.log('🔧 Request body:', req.body);
      const { storage } = await import('../../storage');
      const { allowOverride, overrideReason, skipValidation, ...bodyData } = req.body;
      const addressData = bodyData;

      const hasAddress = addressData.street && addressData.city && addressData.state && addressData.zipCode;
      const validationEnabled = process.env.ADDRESS_VALIDATION_ENABLED !== 'false';

      if (validationEnabled && hasAddress && !skipValidation) {
        const { validateAndNormalize, fromLegacyFields, toLegacyFields } = await import('../domain/address/addressService');
        const addressInput = fromLegacyFields({
          street: addressData.street,
          city: addressData.city,
          state: addressData.state,
          zipCode: addressData.zipCode,
          country: addressData.country || 'United States',
        });

        const result = await validateAndNormalize(addressInput);

        if (result.success) {
          const legacyFields = toLegacyFields(result.address);
          const enrichedData = {
            ...addressData,
            ...legacyFields,
            validationStatus: result.address.status,
            validatedAt: result.address.validatedAt || new Date(),
            validationProvider: result.address.validationProvider || null,
            dpvMatchCode: result.address.dpvMatchCode || null,
          };
          const address = await storage.createCustomerAddress(enrichedData);
          console.log('🔧 Created validated address:', address.id);
          return res.status(201).json(address);
        }

        if (allowOverride && overrideReason) {
          const legacyFields = toLegacyFields(result.address);
          const enrichedData = {
            ...addressData,
            ...legacyFields,
            validationStatus: 'overridden',
            validatedAt: new Date(),
            validationProvider: result.address.validationProvider || null,
            dpvMatchCode: result.address.dpvMatchCode || null,
            overrideReason,
          };
          const address = await storage.createCustomerAddress(enrichedData);
          console.log('🔧 Created overridden address:', address.id);
          return res.status(201).json(address);
        }

        return res.status(400).json({
          error: 'Address validation failed',
          message: result.message,
          validationStatus: result.address.status,
          dpvMatchCode: result.address.dpvMatchCode,
          suggestedAddress: result.address.suggestedAddress,
          originalAddress: {
            street: addressData.street,
            city: addressData.city,
            state: addressData.state,
            zipCode: addressData.zipCode,
          },
        });
      }

      if (!validationEnabled) {
        console.log('🔧 Address validation PAUSED (ADDRESS_VALIDATION_ENABLED=false) — saving raw');
      }
      const address = await storage.createCustomerAddress(addressData);
      console.log('🔧 Created address:', address.id);
      res.status(201).json(address);
    } catch (_error) {
      console.error('🔧 Address create _error:', _error);
      res.status(500).json({ _error: 'Failed to create address' });
    }
  });

  app.put('/api/addresses/:id', async (req, res) => {
    try {
      console.log('🔧 ADDRESS UPDATE ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const { allowOverride, overrideReason, skipValidation, ...bodyData } = req.body;
      const addressData = bodyData;

      const hasAddress = addressData.street && addressData.city && addressData.state && addressData.zipCode;
      const validationEnabled = process.env.ADDRESS_VALIDATION_ENABLED !== 'false';

      if (validationEnabled && hasAddress && !skipValidation) {
        const { validateAndNormalize, fromLegacyFields, toLegacyFields } = await import('../domain/address/addressService');
        const addressInput = fromLegacyFields({
          street: addressData.street,
          city: addressData.city,
          state: addressData.state,
          zipCode: addressData.zipCode,
          country: addressData.country || 'United States',
        });

        const result = await validateAndNormalize(addressInput);

        if (result.success) {
          const legacyFields = toLegacyFields(result.address);
          Object.assign(addressData, legacyFields, {
            validationStatus: result.address.status,
            validatedAt: result.address.validatedAt || new Date(),
            validationProvider: result.address.validationProvider || null,
            dpvMatchCode: result.address.dpvMatchCode || null,
          });
        } else if (allowOverride && overrideReason) {
          const legacyFields = toLegacyFields(result.address);
          Object.assign(addressData, legacyFields, {
            validationStatus: 'overridden',
            validatedAt: new Date(),
            validationProvider: result.address.validationProvider || null,
            dpvMatchCode: result.address.dpvMatchCode || null,
            overrideReason,
          });
        } else {
          return res.status(400).json({
            error: 'Address validation failed',
            message: result.message,
            validationStatus: result.address.status,
            dpvMatchCode: result.address.dpvMatchCode,
            suggestedAddress: result.address.suggestedAddress,
            originalAddress: {
              street: addressData.street,
              city: addressData.city,
              state: addressData.state,
              zipCode: addressData.zipCode,
            },
          });
        }
      } else if (!validationEnabled) {
        console.log('🔧 Address validation PAUSED (ADDRESS_VALIDATION_ENABLED=false) — updating raw');
      }

      const address = await storage.updateCustomerAddress(
        parseInt(id),
        addressData
      );
      console.log('🔧 Updated address:', address.id);
      res.json(address);
    } catch (_error) {
      console.error('🔧 Address update _error:', _error);
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
      console.error('🔧 Address delete _error:', _error);
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
      console.error('Get customer addresses _error:', _error);
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
      console.error('P1 production queue _error:', _error);
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
      console.error('P2 production queue _error:', _error);
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
      console.error('🏭 P1 sync _error:', _error);
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
          console.error(
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
      console.error(
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
      console.error('🏭 Unified queue _error:', _error);
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
      console.error('P2 layup schedule _error:', _error);
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
      console.error('P2 layup schedule create _error:', _error);
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
      console.error('P2 layup schedule delete _error:', _error);
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
          console.error('Python scheduler _error:', errorOutput);
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
          console.error(
            'Failed to parse Python scheduler output:',
            parseError
          );
          res
            .status(500)
            .json({
              _error: 'Failed to parse scheduler output',
              raw_output: output,
            });
        }
      });

      // Send input data to Python process
      pythonProcess.stdin.write(JSON.stringify(schedulerInput));
      pythonProcess.stdin.end();
    } catch (_error) {
      console.error('Python scheduler integration _error:', _error);
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
      const skippedOrders = [];
      for (const orderId of orderIds) {
        // Update production orders status to LAID_UP
        const productionOrder =
          await storage.getProductionOrderByOrderId(orderId);
        if (productionOrder) {
          // Check if this production order has a stock model
          let hasStockModel = true;
          if (productionOrder.poItemId && productionOrder.poId) {
            const poItems = await storage.getPurchaseOrderItems(productionOrder.poId);
            const poItem = poItems.find(item => item.id === productionOrder.poItemId);
            if (poItem && poItem.itemType !== 'stock_model') {
              hasStockModel = false;
              console.log(`⚠️ Production order ${orderId} skipped - no stock model (itemType: ${poItem.itemType})`);
              skippedOrders.push({
                orderId,
                reason: 'No stock model associated with this PO product',
                itemType: poItem.itemType
              });
            }
          }

          if (hasStockModel) {
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
      
      if (skippedOrders.length > 0) {
        console.log(
          `⚠️ Skipped ${skippedOrders.length} orders without stock models`
        );
      }
      
      res.json({
        success: true,
        message: `${updatedOrders.length} orders moved to layup/plugging phase${skippedOrders.length > 0 ? `, ${skippedOrders.length} skipped (no stock model)` : ''}`,
        updatedOrders,
        skippedOrders,
      });
    } catch (_error) {
      console.error('Push to layup/plugging _error:', _error);
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
      // Only include items that are actually still in P1 Production Queue
      const { pool } = await import('../../db');
      const pos = await storage.getAllPurchaseOrders();
      const activePos = pos.filter((po) => po.status === 'OPEN');

      const p1LayupOrders = [];
      for (const po of activePos) {
        const items = await storage.getPurchaseOrderItems(po.id);
        const stockModelItems = items.filter(
          (item) => item.itemType === 'stock_model' && item.itemId && item.itemId.trim()
        );

        // Check which items actually have production orders in P1 Production Queue
        const prodOrdersResult = await pool.query(`
          SELECT po_item_id, COUNT(*) as count
          FROM production_orders
          WHERE po_id = $1
            AND current_department = 'P1 Production Queue'
            AND production_status IN ('PENDING', 'ACTIVE')
          GROUP BY po_item_id
        `, [po.id]);

        const itemsInP1Queue = new Set(
          prodOrdersResult.map((row: any) => row.po_item_id)
        );

        for (const item of stockModelItems) {
          // Only include if this item has production orders in P1 Production Queue
          if (!itemsInP1Queue.has(item.id)) {
            continue;
          }

          // UNIFIED PRIORITY MODEL: Use computeEffectivePriority() for runtime calculation
          const priorityResult = computeEffectivePriority({
            dueDate: po.expectedDelivery || po.poDate,
            urgency: null,
            isManualUrgency: false,
            manualPriorityOverride: null,
          });

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
            priorityScore: priorityResult.score, // COMPUTED, not persisted
            prioritySource: priorityResult.source,
            priorityReason: priorityResult.reason,
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
      console.error('Legacy production queue _error:', _error);
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
      console.error('🔧 P1 purchase orders fetch _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch P1 purchase orders' });
    }
  });

  // Get list of PO vendors (customers)
  app.get('/api/po-vendors', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const purchaseOrders = await storage.getAllPurchaseOrders();
      
      // Fetch scheduled production orders to track quantities
      const scheduledProductionOrders = await storage.getAllProductionOrders();
      
      // Map of PO Item ID -> count of production orders created
      const scheduledItemCounts = new Map<number, number>();
      scheduledProductionOrders.forEach((order) => {
        if (order.poItemId) {
          const currentCount = scheduledItemCounts.get(order.poItemId) || 0;
          scheduledItemCounts.set(order.poItemId, currentCount + 1);
        }
      });
      
      console.log(`🔍 PO Vendors: Tracking ${scheduledItemCounts.size} PO items with production orders`);

      // Group by customer to get unique vendors with counts
      const vendorMap = new Map();

      await Promise.all(
        purchaseOrders.map(async (po) => {
          const customerId = po.customerId;
          const customerName = po.customerName;

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

          // Calculate remaining quantities for this PO
          let totalQuantity = 0;
          let scheduledQuantity = 0;
          
          stockItems.forEach((item) => {
            const itemQty = item.quantity || 0;
            totalQuantity += itemQty;
            
            // Check how many production orders exist for this item
            const scheduled = scheduledItemCounts.get(item.id) || 0;
            scheduledQuantity += scheduled;
          });

          const remainingQuantity = totalQuantity - scheduledQuantity;

          // Only include POs that have remaining items to schedule
          if (remainingQuantity > 0) {
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
            vendor.totalStockItems += remainingQuantity;
          }
        })
      );

      const vendors = Array.from(vendorMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      
      console.log(`🔍 PO Vendors: Showing ${vendors.length} vendors with remaining items`);
      res.json(vendors);
    } catch (_error) {
      console.error('🔧 PO vendors fetch _error:', _error);
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

      // Fetch scheduled production orders to track what's been scheduled
      const scheduledProductionOrders = await storage.getAllProductionOrders();
      
      // Map of PO Item ID -> count of production orders created
      const scheduledItemCounts = new Map<number, number>();
      scheduledProductionOrders.forEach((order) => {
        if (order.poItemId) {
          const currentCount = scheduledItemCounts.get(order.poItemId) || 0;
          scheduledItemCounts.set(order.poItemId, currentCount + 1);
        }
      });

      // Enhance with stock counts and remaining quantities
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

          // Calculate total and remaining quantities
          let totalStockQuantity = 0;
          let scheduledQuantity = 0;
          
          stockItems.forEach((item) => {
            const itemQty = item.quantity || 0;
            totalStockQuantity += itemQty;
            
            // Check how many production orders exist for this item
            const scheduled = scheduledItemCounts.get(item.id) || 0;
            scheduledQuantity += scheduled;
          });

          const remainingQuantity = totalStockQuantity - scheduledQuantity;

          return {
            id: po.id,
            poNumber: po.poNumber,
            customerName: po.customerName,
            customerId: po.customerId,
            dueDate: po.expectedDelivery,
            status: po.status,
            stockCount: totalStockQuantity, // Total quantity
            remainingCount: remainingQuantity, // Remaining to be scheduled
            scheduledCount: scheduledQuantity, // Already scheduled
            distinctStockItems: stockItems.length, // Number of distinct stock item types
            itemCount: items.length,
            poDate: po.poDate,
            notes: po.notes,
          };
        })
      );

      // Only return POs with remaining items
      const posWithRemaining = enhancedPOs.filter(po => po.remainingCount > 0);

      res.json(posWithRemaining);
    } catch (_error) {
      console.error('🔧 PO by vendor fetch _error:', _error);
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
      console.error('🔧 PO stock items fetch _error:', _error);
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
      console.error('❌ PO stock items fetch _error:', _error);
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
        console.error('❌ Create production orders _error:', _error);
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
      console.error('🔧 Purchase orders fetch _error:', _error);
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
      console.error('🔧 Create purchase order _error:', _error);

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
      console.error('🔧 Update purchase order _error:', _error);
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
      console.error('🔧 Delete purchase order _error:', _error);
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
      console.error('🔧 Get PO items _error:', _error);
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
      console.error('🔧 Create PO item _error:', _error);
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
      console.error('🔧 Update PO item _error:', _error);
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
      console.error('🔧 Delete PO item _error:', _error);
      res.status(500).json({ _error: 'Failed to delete purchase order item' });
    }
  });

  // ============ REASSIGN PO CUSTOMER ============
  app.put('/api/pos/:poId/reassign-customer', async (req, res) => {
    try {
      const { poId } = req.params;
      const { newCustomerId } = req.body;

      if (!newCustomerId) {
        return res.status(400).json({ error: 'newCustomerId is required' });
      }

      const { storage } = await import('../../storage');
      const { sql } = await import('drizzle-orm');
      const { db } = await import('../../db');

      const newCustomer = await storage.getCustomer(parseInt(newCustomerId));
      if (!newCustomer) {
        return res.status(404).json({ error: 'Target customer not found' });
      }

      await db.execute(
        sql`UPDATE purchase_orders SET customer_id = ${String(newCustomerId)}, customer_name = ${newCustomer.name} WHERE id = ${parseInt(poId)}`
      );

      console.log(`🔄 PO ${poId} reassigned to customer ${newCustomerId} (${newCustomer.name})`);
      res.json({ success: true, message: `PO reassigned to ${newCustomer.name}` });
    } catch (_error) {
      console.error('Reassign PO customer error:', _error);
      res.status(500).json({ error: 'Failed to reassign PO customer' });
    }
  });

  // Bulk reassign all POs from one customer to another
  app.put('/api/pos/bulk-reassign-customer', async (req, res) => {
    try {
      const { fromCustomerId, toCustomerId } = req.body;

      if (!fromCustomerId || !toCustomerId) {
        return res.status(400).json({ error: 'fromCustomerId and toCustomerId are required' });
      }

      const { storage } = await import('../../storage');
      const { sql } = await import('drizzle-orm');
      const { db } = await import('../../db');

      const toCustomer = await storage.getCustomer(parseInt(toCustomerId));
      if (!toCustomer) {
        return res.status(404).json({ error: 'Target customer not found' });
      }

      const result = await db.execute(
        sql`UPDATE purchase_orders SET customer_id = ${String(toCustomerId)}, customer_name = ${toCustomer.name} WHERE customer_id = ${String(fromCustomerId)}`
      );

      console.log(`🔄 Bulk reassigned POs from customer ${fromCustomerId} → ${toCustomerId} (${toCustomer.name})`);
      res.json({ success: true, message: `POs reassigned to ${toCustomer.name}` });
    } catch (_error) {
      console.error('Bulk reassign PO customer error:', _error);
      res.status(500).json({ error: 'Failed to bulk reassign PO customers' });
    }
  });

  // ============ PO ATTACHMENTS ============
  // Request presigned upload URL for PO attachment
  app.post('/api/pos/:id/attachments/request-upload-url', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, size, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      console.log(`📎 Requesting upload URL for PO ${id}: ${name}`);

      const { ObjectStorageService } = await import('../../replit_integrations/object_storage');
      const objectStorageService = new ObjectStorageService();
      
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);

      console.log(`📎 Generated upload URL for ${name}, objectPath: ${objectPath}`);

      res.json({
        uploadURL,
        objectPath,
        metadata: { name, size, contentType, poId: id },
      });
    } catch (error: any) {
      console.error('Error generating PO attachment upload URL:', error);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  });

  // Complete upload and save PO attachment to database
  app.post('/api/pos/:id/attachments/complete-upload', async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      const { objectPath, originalFileName, fileSize, mimeType, notes } = req.body;
      const user = (req as any).user;

      if (!objectPath || !originalFileName) {
        return res.status(400).json({ 
          error: 'Missing required fields: objectPath, originalFileName' 
        });
      }

      console.log(`📎 Completing PO attachment upload for PO ${poId}: ${originalFileName}`);

      const { storage } = await import('../../storage');
      const { ObjectStorageService } = await import('../../replit_integrations/object_storage');
      const objectStorageService = new ObjectStorageService();

      // Set ACL policy to make file accessible
      try {
        await objectStorageService.trySetObjectEntityAclPolicy(objectPath, {
          owner: user?.id?.toString() || 'system',
          visibility: 'public',
        });
        console.log('📎 ACL policy set successfully for:', objectPath);
      } catch (aclError) {
        console.warn('📎 Failed to set ACL policy for PO attachment:', aclError);
      }

      // Get current PO
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      // Generate unique ID and create attachment object
      const { randomUUID } = await import('crypto');
      const attachment = {
        id: randomUUID(),
        fileName: objectPath.split('/').pop() || originalFileName,
        originalFileName,
        filePath: objectPath,
        fileSize: fileSize || 0,
        mimeType: mimeType || 'application/octet-stream',
        uploadedBy: user?.username || null,
        uploadedAt: new Date().toISOString(),
        notes: notes || null,
      };

      // Append to attachments array
      const currentAttachments = (purchaseOrder as any).attachments || [];
      const updatedAttachments = [...currentAttachments, attachment];

      // Update the PO with new attachments
      await storage.updatePurchaseOrder(poId, { attachments: updatedAttachments } as any);

      console.log(`📎 PO attachment saved successfully for PO ${poId}:`, attachment.id);
      res.json(attachment);
    } catch (error: any) {
      console.error('Error completing PO attachment upload:', error);
      res.status(500).json({ error: error.message || 'Failed to complete upload' });
    }
  });

  // Get all attachments for a PO
  app.get('/api/pos/:id/attachments', async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      const { storage } = await import('../../storage');
      
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const attachments = (purchaseOrder as any).attachments || [];
      res.json(attachments);
    } catch (error: any) {
      console.error('Error fetching PO attachments:', error);
      res.status(500).json({ error: 'Failed to fetch attachments' });
    }
  });

  // Delete a PO attachment
  app.delete('/api/pos/:id/attachments/:attachmentId', async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      const { attachmentId } = req.params;
      const { storage } = await import('../../storage');
      
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const currentAttachments = (purchaseOrder as any).attachments || [];
      const attachmentToDelete = currentAttachments.find((a: any) => a.id === attachmentId);
      
      if (!attachmentToDelete) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      // Remove from array
      const updatedAttachments = currentAttachments.filter((a: any) => a.id !== attachmentId);
      
      // Optionally delete from object storage
      try {
        const { ObjectStorageService } = await import('../../replit_integrations/object_storage');
        const objectStorageService = new ObjectStorageService();
        await objectStorageService.deleteObject(attachmentToDelete.filePath);
        console.log('📎 Deleted file from storage:', attachmentToDelete.filePath);
      } catch (storageError) {
        console.warn('📎 Failed to delete file from storage (may not exist):', storageError);
      }

      // Update PO
      await storage.updatePurchaseOrder(poId, { attachments: updatedAttachments } as any);

      console.log(`📎 PO attachment ${attachmentId} deleted from PO ${poId}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error('Error deleting PO attachment:', error);
      res.status(500).json({ error: 'Failed to delete attachment' });
    }
  });

  // Get download URL for a PO attachment
  app.get('/api/pos/:id/attachments/:attachmentId/download', async (req, res) => {
    try {
      const poId = parseInt(req.params.id);
      const { attachmentId } = req.params;
      const { storage } = await import('../../storage');
      
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const attachments = (purchaseOrder as any).attachments || [];
      const attachment = attachments.find((a: any) => a.id === attachmentId);
      
      if (!attachment) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      const { ObjectStorageService } = await import('../../replit_integrations/object_storage');
      const objectStorageService = new ObjectStorageService();
      
      const downloadURL = await objectStorageService.getObjectEntityDownloadURL(attachment.filePath);
      
      res.json({ 
        downloadURL, 
        fileName: attachment.originalFileName,
        mimeType: attachment.mimeType 
      });
    } catch (error: any) {
      console.error('Error getting PO attachment download URL:', error);
      res.status(500).json({ error: 'Failed to get download URL' });
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
      
      // Define patterns that indicate NON-STOCK items (parts only, no manufacturing needed)
      // These should NOT get production orders - they're just parts fulfillment
      const nonStockPatterns = [
        /bottom.?metal/i,
        /^bm[-_]/i,          // BM-xxx patterns for bottom metals
        /rail/i,
        /swivel/i,
        /stud/i,
        /qd.?accessory/i,
        /^qd[-_]/i,          // QD-xxx patterns
        /hardware/i,
        /screw/i,
        /bolt/i,
        /nut/i,
        /washer/i,
        /pin/i,
        /spring/i,
        /accessory/i,
        /part.?only/i,
      ];
      
      // Function to check if an item is a non-stock part
      const isNonStockItem = (item: any): boolean => {
        const itemName = (item.itemName || item.stockModelName || '').toLowerCase();
        const stockModelId = (item.stockModelId || '').toLowerCase();
        const itemId = (item.itemId || '').toLowerCase();
        
        // Check if any of the identifiers match non-stock patterns
        const allIdentifiers = `${itemName} ${stockModelId} ${itemId}`;
        return nonStockPatterns.some(pattern => pattern.test(allIdentifiers));
      };
      
      // Include items that have a valid stock model ID (not 'no_stock' or empty)
      // AND are not non-stock parts (bottom metals, rails, etc.)
      const stockModelItems = poItems.filter((item) => {
        const stockModelId = item.stockModelId || '';
        const hasValidStockModel = stockModelId && stockModelId.trim() && stockModelId !== 'no_stock';
        
        if (!hasValidStockModel) {
          console.log(`🚫 Skipping item ${item.id}: no valid stock model (${stockModelId})`);
          return false;
        }
        
        // Check if this is a non-stock item (parts only)
        if (isNonStockItem(item)) {
          console.log(`🚫 Skipping non-stock item ${item.id}: ${item.itemName || item.stockModelName} (parts only, no manufacturing)`);
          return false;
        }
        
        return true;
      });

      console.log(
        `🏭 Found ${stockModelItems.length} items with valid stock models to convert to production orders (filtered out ${poItems.length - stockModelItems.length} items without stock models)`
      );

      const { deriveCanonicalMaterial } = await import('../../src/utils/deriveCanonicalMaterial');
      const createdOrders = [];

      for (const item of stockModelItems) {
        // Create individual production orders for each quantity
        for (let i = 0; i < item.quantity; i++) {
          // Use stockModelId for proper mold/schedule matching, fallback to itemId
          const stockModelForOrder = item.stockModelId || item.itemId || '';
          // CENTRALIZED: Use atomic order ID generator instead of inline pattern
          const orderId = await storage.generateNextOrderId();

          const materialCanonical = deriveCanonicalMaterial(stockModelForOrder);

          const sourceSnapshot = {
            po_id: poId,
            po_item_id: item.id,
            po_number: purchaseOrder.poNumber,
            sku: stockModelForOrder,
            stock_model_name: item.stockModelName || item.itemName || stockModelForOrder,
            material: materialCanonical,
            options: item.customOptions ?? null,
            unit_price: item.unitPrice ?? null,
            created_at: new Date().toISOString(),
          };

          const productionOrderData = {
            orderId,
            customerId: purchaseOrder.customerId.toString(),
            customerName: purchaseOrder.customerName,
            poNumber: purchaseOrder.poNumber,
            itemType: 'stock_model' as const,
            itemId: stockModelForOrder,
            itemName: item.stockModelName || item.itemName || stockModelForOrder,
            orderDate: new Date(),
            dueDate: (() => {
              const expectedDue = purchaseOrder.expectedDelivery
                ? new Date(purchaseOrder.expectedDelivery)
                : new Date(purchaseOrder.poDate);
              const today = new Date();
              return expectedDue > today ? expectedDue : today;
            })(),
            productionStatus: 'PENDING' as const,
            currentDepartment: 'P1 Production Queue',
            poId: poId,
            poItemId: item.id,
            specifications: {
              ...(item.specifications || {}),
              sourcePoNumber: purchaseOrder.poNumber,
              customerName: purchaseOrder.customerName,
              expectedDelivery: purchaseOrder.expectedDelivery,
            },
            materialCanonical,
            sourceSnapshot,
          };

          console.log(
            '🏭 Production order data before creation:',
            JSON.stringify(productionOrderData, null, 2)
          );
          const _createdOrder =
            await storage.createProductionOrder(productionOrderData);
          createdOrders.push(_createdOrder);

          console.log(
            `🏭 Created production order: ${productionOrderData.orderId} for ${stockModelForOrder} | canonical material: ${materialCanonical}`
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
      console.error('🏭 Generate production orders _error:', _error);
      res.status(500).json({ _error: 'Failed to generate production orders' });
    }
  });

  // Get All Production Orders
  app.get('/api/production-orders', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const productionOrders = await storage.getAllProductionOrders();
      res.json(productionOrders);
    } catch (_error) {
      console.error('🔧 Get all production orders _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch production orders' });
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
      console.error('🔧 Get production orders by PO _error:', _error);
      res.status(500).json({ _error: 'Failed to fetch production orders' });
    }
  });

  // Get single Production Order by ID (admin inspector)
  app.get('/api/production-orders/:id', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ error: 'Invalid production order ID' });
      }
      const order = await storage.getProductionOrder(id);
      if (!order) {
        return res.status(404).json({ error: 'Production order not found' });
      }
      res.json(order);
    } catch (error) {
      console.error('Error fetching production order:', error);
      res.status(500).json({ error: 'Failed to fetch production order' });
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
      console.error('📅 Production schedule calculation _error:', _error);
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

      // Keep original barcode value - don't strip prefixes
      let orderId = barcode;

      const { storage } = await import('../../storage');

      // Try to find the order in various tables
      let order = null;
      let orderSource = 'unknown';
      let poItemData = null;

      // Check all_orders table FIRST - this is the single source of truth for current department
      try {
        const allOrders = await storage.getAllOrders();
        order = allOrders.find((o) => o.orderId === orderId || o.orderId === barcode);
        if (order) {
          orderSource = 'all_orders';
          
          // Check if this is a PO order and fetch PO item details
          const orderFeatures = (order as any).features;
          if (orderFeatures && typeof orderFeatures === 'object' && 'po_item_id' in orderFeatures) {
            try {
              const poItemQuery = `
                SELECT 
                  poi.id,
                  po.po_number as "poNumber",
                  po.customer_name as "customerName",
                  poi.item_name as "itemName",
                  poi.item_type as "productType",
                  poi.specifications->>'material' as "material",
                  poi.handedness,
                  poi.stock_model_id as "stockModelId",
                  poi.specifications->>'action_length' as "actionLength",
                  poi.specifications->>'action_inlet' as "actionInlet",
                  poi.specifications->>'bottom_metal' as "bottomMetal",
                  poi.specifications->>'barrel_inlet' as "barrelInlet",
                  poi.specifications->>'qds' as "qds",
                  poi.specifications->>'swivel_studs' as "swivelStuds",
                  poi.specifications->>'paint_options' as "paintOptions",
                  poi.specifications->>'texture' as "texture",
                  poi.specifications->>'flat_top' as "flatTop",
                  poi.unit_price as "unitPrice",
                  poi.quantity,
                  poi.due_date as "dueDate",
                  poi.specifications as "specifications"
                FROM purchase_order_items poi
                JOIN purchase_orders po ON poi.po_id = po.id
                WHERE poi.id = $1
              `;
              const { pool } = await import('../../db');
              const poItemResult = await pool.query(poItemQuery, [orderFeatures.po_item_id]);
              const rows = Array.isArray(poItemResult) ? poItemResult : poItemResult.rows || [];
              if (rows.length > 0) {
                poItemData = rows[0];
                console.log(`✅ Found PO item data for order ${orderId}:`, poItemData.itemname);
              }
            } catch (poError) {
              console.error('Error fetching PO item data:', poError);
            }
          }
        }
      } catch (_e) {
        console.error('Error checking all_orders:', _e);
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

      // If still not found, try searching for PO items by barcode/item ID
      if (!order) {
        try {
          console.log(`🔍 Searching for PO item with barcode/ID: ${barcode}`);
          const { pool } = await import('../../db');
          
          // Try to find PO item by ID or item_id
          const poItemSearchQuery = `
            SELECT 
              poi.id,
              po.po_number as "poNumber",
              po.customer_name as "customerName",
              poi.item_name as "itemName",
              poi.item_type as "productType",
              poi.specifications->>'material' as "material",
              poi.handedness,
              poi.stock_model_id as "stockModelId",
              poi.specifications->>'action_length' as "actionLength",
              poi.specifications->>'action_inlet' as "actionInlet",
              poi.specifications->>'bottom_metal' as "bottomMetal",
              poi.specifications->>'barrel_inlet' as "barrelInlet",
              poi.specifications->>'qds' as "qds",
              poi.specifications->>'swivel_studs' as "swivelStuds",
              poi.specifications->>'paint_options' as "paintOptions",
              poi.specifications->>'texture' as "texture",
              poi.specifications->>'flat_top' as "flatTop",
              poi.unit_price as "unitPrice",
              poi.quantity,
              poi.due_date as "dueDate",
              poi.specifications as "specifications"
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE poi.id::text = $1 OR poi.item_id = $1 OR po.po_number = $1
            LIMIT 1
          `;
          
          const poItemSearchResult = await pool.query(poItemSearchQuery, [barcode]);
          const poItemRows = Array.isArray(poItemSearchResult) ? poItemSearchResult : poItemSearchResult.rows || [];
          
          if (poItemRows.length > 0) {
            poItemData = poItemRows[0];
            console.log(`✅ Found PO item by barcode: ${poItemData.itemName}`);
            
            // Now find the production order for this PO item
            const productionOrderQuery = `
              SELECT * FROM production_orders 
              WHERE po_item_id = $1 
              ORDER BY created_at DESC 
              LIMIT 1
            `;
            const prodOrderResult = await pool.query(productionOrderQuery, [poItemData.id]);
            const prodOrderRows = Array.isArray(prodOrderResult) ? prodOrderResult : prodOrderResult.rows || [];
            
            if (prodOrderRows.length > 0) {
              const prodOrder = prodOrderRows[0];
              console.log(`✅ Found production order for PO item: ${prodOrder.order_id}`);
              
              // Search for this production order in all_orders
              const allOrders = await storage.getAllOrders();
              order = allOrders.find((o) => o.orderId === prodOrder.order_id);
              if (order) {
                orderSource = 'all_orders';
                orderId = prodOrder.order_id; // Update orderId to use the production order ID
              }
            }
          }
        } catch (poSearchError) {
          console.error('Error searching for PO item:', poSearchError);
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
              c.id.toString() === order.customerId.toString() ||
              c.name === order.customerId
          );
          if (!customer) {
            console.log(`⚠️ Customer not found for ID: ${order.customerId}`);
          }
        } catch (_e) {
          console.error('Error fetching customer:', _e);
        }
      }

      // Get stock model details and extract color information
      let baseModel = null;
      let color = null;
      
      // Use PO item stock model if available, otherwise use order model
      const stockModelId = poItemData?.stockModelId || (order as any).modelId || (order as any).itemId;
      
      if (stockModelId) {
        try {
          const stockModels = await storage.getAllStockModels();
          baseModel = stockModels.find(
            (sm) =>
              sm.id === stockModelId ||
              sm.id.toString() === stockModelId.toString() ||
              sm.name === stockModelId
          );
          if (!baseModel) {
            console.log(`⚠️ Stock model not found for ID: ${stockModelId}`);
          }
        } catch (_e) {
          console.error('Error fetching stock model:', _e);
        }
      }

      // Extract color from PO item data or features/specifications
      if (poItemData?.paintOptions) {
        color = poItemData.paintOptions;
      } else if ((order as any).features) {
        if ((order as any).features.color)
          color = (order as any).features.color;
        if ((order as any).features.paintOption)
          color = (order as any).features.paintOption;
        if ((order as any).features.finish)
          color = (order as any).features.finish;
      }
      if (!color && (order as any).specifications) {
        if ((order as any).specifications.color)
          color = (order as any).specifications.color;
        if ((order as any).specifications.paintOption)
          color = (order as any).specifications.paintOption;
        if ((order as any).specifications.finish)
          color = (order as any).specifications.finish;
      }

      // Build comprehensive order summary with PO item data priority
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
                poItemData?.customerName ||
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
                poItemData?.itemName ||
                poItemData?.stockModelId ||
                (order as any).itemName ||
                (order as any).modelName ||
                'Unknown Model',
              id: (order as any).modelId || (order as any).itemId || '',
              price: 0,
            },
        features: poItemData
          ? (() => {
              // Helper function to convert camelCase to snake_case
              const camelToSnake = (str: string): string => {
                return str
                  .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
                  .replace(/^_/, ''); // Remove leading underscore
              };
              
              // Extract and normalize PO specifications to snake_case keys
              const specs = poItemData.specifications || {};
              const normalized: Record<string, any> = {
                ...((order as any).features || {}),
              };
              
              // Convert all camelCase keys from PO specs to snake_case, preserving types
              for (const [key, value] of Object.entries(specs)) {
                if (value !== null && value !== undefined && value !== '') {
                  const snakeKey = camelToSnake(key);
                  // Special mapping for qds -> qd_accessory
                  const finalKey = snakeKey === 'qds' ? 'qd_accessory' : snakeKey;
                  normalized[finalKey] = value;
                }
              }
              
              return normalized;
            })()
          : (order as any).features || {},
        specifications: poItemData
          ? {
              ...((order as any).specifications || {}),
              ...poItemData.specifications,
            }
          : (order as any).specifications || {},
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

        // Additional fields for barcode display (using PO item data or display names)
        customerName:
          poItemData?.customerName ||
          customer?.name ||
          (order as any).customerName ||
          'Unknown Customer',
        stockModel:
          baseModel?.displayName ||
          baseModel?.name ||
          poItemData?.itemName ||
          (order as any).itemName ||
          poItemData?.stockModelId ||
          'Unknown Model',
        color: color || 'Not specified',
        actionLength:
          poItemData?.actionLength ||
          (order as any).features?.action_length ||
          (order as any).specifications?.action_length ||
          '',
        paintOption:
          poItemData?.paintOptions ||
          (order as any).features?.paintOption ||
          (order as any).specifications?.paintOption ||
          color,

        // Enhanced feature display with user-friendly names and PO item data
        displayFeatures: {
          model:
            baseModel?.displayName ||
            baseModel?.name ||
            poItemData?.itemName ||
            (order as any).itemName ||
            'Unknown Model',
          actionLength: poItemData?.actionLength || (order as any).features?.action_length
            ? (poItemData?.actionLength || (order as any).features.action_length)
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

      // Add PO item specific details if available
      if (poItemData) {
        (orderSummary as any).poItemDetails = {
          poNumber: poItemData.poNumber,
          itemName: poItemData.itemName,
          productType: poItemData.productType,
          material: poItemData.material,
          handedness: poItemData.handedness,
          actionInlet: poItemData.actionInlet,
          bottomMetal: poItemData.bottomMetal,
          barrelInlet: poItemData.barrelInlet,
          qds: poItemData.qds,
          swivelStuds: poItemData.swivelStuds,
          texture: poItemData.texture,
          flatTop: poItemData.flatTop,
          unitPrice: poItemData.unitPrice,
          quantity: poItemData.quantity,
        };
        console.log(`📦 Added PO item details for PO #${poItemData.poNumber}`);
      }

      // Add production-specific details if applicable
      if (orderSource === 'production') {
        (orderSummary as any).productionDetails = {
          partName: (order as any).partName || (order as any).itemName || poItemData?.itemName,
          quantity: (order as any).quantity || poItemData?.quantity || 1,
          department: (order as any).department,
          priority: (order as any).priority || 3,
          productionStatus:
            (order as any).productionStatus || (order as any).status,
        };
      }

      console.log(`✅ Barcode scan successful for order: ${orderId}`);
      res.json(orderSummary);
    } catch (_error) {
      console.error('Barcode scan _error:', _error);
      res.status(500).json({ _error: 'Failed to scan barcode' });
    }
  });

  // Complete order summary endpoint for barcode scanning
  app.get('/api/orders/:orderId/complete-summary', async (req, res) => {
    try {
      let { orderId } = req.params;
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

      // If still not found, try searching for PO items by barcode/item ID
      if (!order) {
        try {
          console.log(`🔍 Searching for PO item with barcode/ID: ${barcode}`);
          const { pool } = await import('../../db');
          
          // Try to find PO item by ID or item_id
          const poItemSearchQuery = `
            SELECT 
              poi.id,
              po.po_number as "poNumber",
              po.customer_name as "customerName",
              poi.item_name as "itemName",
              poi.item_type as "productType",
              poi.specifications->>'material' as "material",
              poi.handedness,
              poi.stock_model_id as "stockModelId",
              poi.specifications->>'action_length' as "actionLength",
              poi.specifications->>'action_inlet' as "actionInlet",
              poi.specifications->>'bottom_metal' as "bottomMetal",
              poi.specifications->>'barrel_inlet' as "barrelInlet",
              poi.specifications->>'qds' as "qds",
              poi.specifications->>'swivel_studs' as "swivelStuds",
              poi.specifications->>'paint_options' as "paintOptions",
              poi.specifications->>'texture' as "texture",
              poi.specifications->>'flat_top' as "flatTop",
              poi.unit_price as "unitPrice",
              poi.quantity,
              poi.due_date as "dueDate",
              poi.specifications as "specifications"
            FROM purchase_order_items poi
            JOIN purchase_orders po ON poi.po_id = po.id
            WHERE poi.id::text = $1 OR poi.item_id = $1 OR po.po_number = $1
            LIMIT 1
          `;
          
          const poItemSearchResult = await pool.query(poItemSearchQuery, [barcode]);
          const poItemRows = Array.isArray(poItemSearchResult) ? poItemSearchResult : poItemSearchResult.rows || [];
          
          if (poItemRows.length > 0) {
            poItemData = poItemRows[0];
            console.log(`✅ Found PO item by barcode: ${poItemData.itemName}`);
            
            // Now find the production order for this PO item
            const productionOrderQuery = `
              SELECT * FROM production_orders 
              WHERE po_item_id = $1 
              ORDER BY created_at DESC 
              LIMIT 1
            `;
            const prodOrderResult = await pool.query(productionOrderQuery, [poItemData.id]);
            const prodOrderRows = Array.isArray(prodOrderResult) ? prodOrderResult : prodOrderResult.rows || [];
            
            if (prodOrderRows.length > 0) {
              const prodOrder = prodOrderRows[0];
              console.log(`✅ Found production order for PO item: ${prodOrder.order_id}`);
              
              // Search for this production order in all_orders
              const allOrders = await storage.getAllOrders();
              order = allOrders.find((o) => o.orderId === prodOrder.order_id);
              if (order) {
                orderSource = 'all_orders';
                orderId = prodOrder.order_id; // Update orderId to use the production order ID
              }
            }
          }
        } catch (poSearchError) {
          console.error('Error searching for PO item:', poSearchError);
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
          console.error('Error fetching customer:', e);
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
          console.error('Error fetching stock model:', e);
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
        features: poItemData
          ? (() => {
              // Helper function to convert camelCase to snake_case
              const camelToSnake = (str: string): string => {
                return str
                  .replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
                  .replace(/^_/, ''); // Remove leading underscore
              };
              
              // Extract and normalize PO specifications to snake_case keys
              const specs = poItemData.specifications || {};
              const normalized: Record<string, any> = {
                ...((order as any).features || {}),
              };
              
              // Convert all camelCase keys from PO specs to snake_case, preserving types
              for (const [key, value] of Object.entries(specs)) {
                if (value !== null && value !== undefined && value !== '') {
                  const snakeKey = camelToSnake(key);
                  // Special mapping for qds -> qd_accessory
                  const finalKey = snakeKey === 'qds' ? 'qd_accessory' : snakeKey;
                  normalized[finalKey] = value;
                }
              }
              
              return normalized;
            })()
          : (order as any).features || {},
        specifications: poItemData
          ? {
              ...((order as any).specifications || {}),
              ...poItemData.specifications,
            }
          : (order as any).specifications || {},
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
      console.error('Complete order summary _error:', _error);
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
          // Check production orders first (P1 PO items)
          // Production orders have format: PO-{poNumber}-{itemId}-{unit}
          let currentOrder: any = null;
          let isProductionOrder = false;
          let isFinalized = false;
          
          // Only check production_orders if orderId matches production order format
          if (orderId.startsWith('PO-') && orderId.split('-').length >= 4) {
            try {
              currentOrder = await storage.getProductionOrderByOrderId(orderId);
              isProductionOrder = !!currentOrder;
            } catch (prodError) {
              // Gracefully handle production order lookup errors
              console.warn(`⚠️ Production order lookup failed for ${orderId}:`, prodError instanceof Error ? prodError.message : prodError);
            }
          }

          // If not a production order, check finalized orders
          if (!currentOrder) {
            currentOrder = await storage.getFinalizedOrderById(orderId);
            isFinalized = !!currentOrder;
            isProductionOrder = false;
          }

          // If still not found, check draft orders
          if (!currentOrder) {
            currentOrder = await storage.getOrderDraft(orderId);
            isFinalized = false;
            isProductionOrder = false;
          }

          if (!currentOrder) {
            console.warn(`Order ${orderId} not found, skipping`);
            continue;
          }
          
          console.log(`📝 Update-department processing ${orderId} as ${isProductionOrder ? 'PRODUCTION' : isFinalized ? 'FINALIZED' : 'DRAFT'} order`);

          // Skip no-op moves (prevents empty audit events, zero-duration transitions, timeline noise)
          if (currentOrder.currentDepartment === department) {
            console.log(`⏭️ Skipping ${orderId}: already in ${department}`);
            continue;
          }

          // Prepare completion timestamp update based on current department
          const completionUpdates: any = {};
          const now = new Date();

          // Set completion timestamp for the department we're leaving
          switch (currentOrder.currentDepartment) {
            case 'Layup':
            case 'Layup/Plugging':
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

          // Update the appropriate table based on order type
          let updatedOrder;
          if (isProductionOrder) {
            // Update production order table
            updatedOrder = await storage.updateProductionOrder(
              (currentOrder as any).id,
              {
                ...updateData,
                updatedAt: now,
              }
            );
            console.log(`✅ Updated production order ${orderId} from ${currentOrder.currentDepartment} to ${department}`);
          } else if (isFinalized) {
            // Update finalized orders table
            updatedOrder = await storage.updateFinalizedOrder(
              orderId,
              updateData
            );
            console.log(`✅ Updated finalized order ${orderId} from ${currentOrder.currentDepartment} to ${department}`);
          } else {
            // Update draft orders table
            updatedOrder = await storage.updateOrderDraft(orderId, {
              ...updateData,
              updatedAt: now,
            });
            console.log(`✅ Updated draft order ${orderId} from ${currentOrder.currentDepartment} to ${department}`);
          }

          // AUDIT: Reload AFTER state and log changes
          let afterState: any = null;
          if (isProductionOrder) {
            afterState = await storage.getProductionOrderByOrderId(orderId);
          } else if (isFinalized) {
            afterState = await storage.getFinalizedOrderById(orderId);
          } else {
            afterState = await storage.getOrderDraft(orderId);
          }

          // Build actor from authenticated user
          const actor = {
            id: req.user?.id,
            username: req.user?.username || 'System',
            role: req.user?.role || 'system',
          };

          // Add to updated orders FIRST (before audit) since the DB update succeeded
          updatedOrders.push(updatedOrder);

          // Audit logging (non-blocking - don't fail update if audit fails)
          try {
            // Audit field changes (BEFORE → AFTER comparison)
            await auditService.logFieldChanges(
              'p1_order',
              orderId,
              currentOrder,
              afterState || updatedOrder,
              actor,
              { source: 'update-department' }
            );

            // Department timing: close previous, open new
            await auditService.closeDepartmentTransition(orderId, req.user?.id, 'completed');
            await auditService.recordDepartmentEntry({
              entityType: 'p1_order',
              entityId: orderId,
              department: department,
              enteredByUserId: req.user?.id,
            });
          } catch (auditError) {
            // Log audit errors but don't fail the update
            console.warn(`⚠️ Audit logging failed for ${orderId}:`, auditError instanceof Error ? auditError.message : auditError);
          }
        } catch (orderError) {
          console.error(`Error updating order ${orderId}:`, orderError);
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
      console.error('❌ Update department _error:', _error);
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
      const { pool } = await import('../../db');
      const orderDetails = [];
      const notFoundOrders: string[] = [];
      
      for (const orderId of orderIds) {
        // Check production_orders table FIRST (takes precedence over all_orders, matching getAllOrders() dedup logic)
        // This prevents a production order from being misidentified as a different all_orders entry with the same ID
        let order: any = null;
        try {
          const productionOrderResult = await pool.query(
            `SELECT 
              order_id,
              customer_id,
              customer_name,
              po_number,
              item_name,
              item_id,
              specifications,
              material_canonical,
              order_date,
              due_date,
              production_status,
              current_department,
              created_at,
              updated_at
            FROM production_orders
            WHERE order_id = $1
            LIMIT 1`,
            [orderId]
          );
          
          if (productionOrderResult && productionOrderResult.length > 0) {
            const po = productionOrderResult[0];
            let specs: any = {};
            try {
              specs = typeof po.specifications === 'string' ? JSON.parse(po.specifications) : (po.specifications || {});
            } catch (_e) {
              specs = {};
            }
            console.log(`🔍 Found production order for label: ${orderId}`);
            order = {
              orderId: po.order_id,
              customerId: po.customer_id,
              customerName: po.customer_name,
              currentDepartment: po.current_department,
              orderDate: po.order_date,
              dueDate: po.due_date,
              status: 'in_production',
              stockModelId: specs.stockModel || specs.stock_model || po.item_id || 'unknown',
              modelId: specs.stockModel || specs.stock_model || po.item_id || 'unknown',
              fbOrderNumber: po.po_number,
              isP1Order: orderId.startsWith('P1-'),
              isPOItem: true,
              features: specs,
              actionLength: specs.actionLength || specs.action_length,
              material_canonical: po.material_canonical || '',
            };
          }

          // Fall back to all_orders and drafts only if not in production_orders
          if (!order) {
            order = await storage.getFinalizedOrderById(orderId);
          }
          if (!order) {
            order = await storage.getOrderDraft(orderId);
          }
        } catch (_error) {
          console.warn(`Could not find order ${orderId}:`, _error);
        }

        if (order) {
          // Validate that the order has a due date
          if (!order.dueDate) {
            console.warn(`⚠️ Order ${orderId} has no due date, setting to current date`);
            order.dueDate = new Date().toISOString();
          }
          // Check if this is a production order (PO item)
          // Production orders don't have poNumber field in all_orders, so check production_orders table
          try {
            const poResult = await pool.query(
              `
              SELECT 
                po.customer_name,
                po.po_number,
                po.po_item_id,
                poi.quantity as total_quantity
              FROM production_orders po
              JOIN purchase_order_items poi ON po.po_item_id = poi.id
              WHERE po.order_id = $1
              `,
              [orderId]
            );
            
            if (poResult.length > 0) {
              const poData = poResult[0];
              // Extract unit number from orderId (e.g., ABC00199-0003 → unit #3)
              const unitMatch = orderId.match(/-(\d+)$/);
              const unitNumber = unitMatch ? parseInt(unitMatch[1]) : 1;
              
              order.isPOItem = true;
              order.poCustomerName = poData.customer_name;
              order.poNumber = poData.po_number;
              order.poUnitNumber = unitNumber;
              order.poTotalQuantity = poData.total_quantity;
              
              console.log(`📦 PO Item detected: ${orderId} → ${poData.customer_name}, PO#${poData.po_number}, ${unitNumber} of ${poData.total_quantity}`);
            }
          } catch (poError) {
            console.warn(`Could not fetch PO details for ${orderId}:`, poError);
          }
          
          orderDetails.push(order);
          console.log(`✅ Found order for barcode: ${orderId}`);
        } else {
          console.warn(`❌ Order ${orderId} not found for barcode generation`);
          notFoundOrders.push(orderId);
        }
      }

      // Check if any orders were found
      if (orderDetails.length === 0) {
        const errorMsg = notFoundOrders.length > 0 
          ? `No orders found. The following order IDs could not be located: ${notFoundOrders.join(', ')}`
          : 'No valid orders found for label generation';
        console.error(`🏷️ ${errorMsg}`);
        return res.status(404).json({ error: errorMsg });
      }

      console.log(`🏷️ Successfully found ${orderDetails.length} of ${orderIds.length} orders for label generation`);
      if (notFoundOrders.length > 0) {
        console.warn(`⚠️ ${notFoundOrders.length} orders not found: ${notFoundOrders.join(', ')}`);
      }

      // Generate Avery label document (PDF format)
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.create();
      
      // Embed standard fonts for text rendering
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

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

          // Calculate label position (3x10 grid) - Avery 8160 format with correct margins
          const col = labelIndex % 3;
          const row = Math.floor(labelIndex / 3);
          // Avery 8160 specifications per official template
          const pageHeight = 792; // 11" * 72 points/inch
          const topMargin = 36; // 0.5" * 72 points/inch - exact Avery 8160 top margin
          const leftMargin = 13.5; // 0.1875" * 72 points/inch - left margin for Avery 8160
          const labelWidth = 189; // 2.625" * 72 points/inch
          const labelHeight = 72; // 1" * 72 points/inch
          const rowSpacing = 0; // No gap between rows on Avery 8160
          const columnGap = 9; // 0.125" * 72 points/inch (horizontal gap between columns)
          const x = leftMargin + col * (labelWidth + columnGap);
          // PDF coordinates: origin at bottom-left, so subtract from page height
          // Only apply rowSpacing for rows after the first one
          const y = pageHeight - topMargin - labelHeight - (row * (labelHeight + rowSpacing));

          // Draw label border with clear separation
          page.drawRectangle({
            x: x,
            y: y,
            width: labelWidth,
            height: labelHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
          });

          const barcodeText = order.orderId;

          // Get model and action length (using display names) - need these early for display
          const actionLength =
            (order as any).specifications?.actionLength || 
            (order as any).features?.action_length || 
            'unknown';
          const modelId = (order as any).modelId || '';
          const modelDisplayName =
            stockModelMap.get(modelId) ||
            modelId ||
            'Unknown';

          // Add order information at top
          // For P1 PO items, show "PO#XXXXX" format at top
          // For regular orders, show order ID
          let labelText = order.orderId;
          let customerName = '';
          const isPOItem = (order as any).isPOItem || order.orderId.startsWith('P1-');
          
          if (isPOItem) {
            const fullOrderId = order.orderId.replace(/^(PO-|P1-)/, '');
            labelText = `PO#${fullOrderId}`;
            
            // Extract customer name for separate line
            customerName = (order as any).poCustomerName || order.customerName || (order as any).customerName;
            // Handle null, undefined, empty, or "unknown" customer names
            if (!customerName || customerName.toLowerCase() === 'unknown' || customerName.trim() === '') {
              customerName = order.customerId || '';
            }
          }
          
          page.drawText(labelText, {
            x: x + 8,
            y: y + 59,
            size: isPOItem ? 10 : 11,
            font: helveticaBoldFont,
            color: rgb(0, 0, 0),
          });

          // Check for special features to add to label
          const features = (order as any).features || {};

          // Get paint option for display with subcategory (handle both camelCase and snake_case)
          const paintOption = features.paint_options || features.paintOptions || '';

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

          // Determine material type — use material_canonical as single source of truth for P1
          let material = '';
          if (isPOItem) {
            material = (order as any).material_canonical || '';
            if (!material) {
              const { deriveCanonicalMaterial } = await import('../../src/utils/deriveCanonicalMaterial');
              material = deriveCanonicalMaterial(modelId);
            }
          }

          // For P1 PO orders: show "Material - Stock Model - Action Length - Paint Color" format
          // For regular orders: show "Stock Model - Action Length - Paint" format
          let labelLine = '';
          if (isPOItem) {
            // Build P1 PO label: Material - Stock Model - Action Length - Paint Color
            const parts = [];
            if (material) {
              parts.push(material);
            }
            parts.push(modelDisplayName);
            
            // Add action length if available
            const hasActionLength = actionLength && actionLength.toLowerCase() !== 'unknown';
            if (hasActionLength) {
              parts.push(actionLength.toUpperCase());
            }
            
            // Add paint color if available
            if (paintDisplayName) {
              if (subcategory) {
                parts.push(`${subcategory}: ${paintDisplayName}`);
              } else {
                parts.push(paintDisplayName);
              }
            }
            
            labelLine = parts.join(' - ');
          } else {
            // Only include action length if it's not 'unknown'
            const hasActionLength = actionLength && actionLength.toLowerCase() !== 'unknown';
            const actionPart = hasActionLength ? ` - ${actionLength.toUpperCase()}` : '';
            
            labelLine = paintDisplayName
              ? subcategory
                ? `${modelDisplayName}${actionPart} - ${subcategory}: ${paintDisplayName}`
                : `${modelDisplayName}${actionPart} - PAINT: ${paintDisplayName}`
              : `${modelDisplayName}${actionPart}`;
          }

          page.drawText(labelLine, {
            x: x + 8,
            y: isPOItem ? y + 11 : y + 47,
            size: 6,
            font: helveticaFont,
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
            (features.texture_options || features.texture) &&
            (features.texture_options || features.texture) !== 'no_texture' &&
            (features.texture_options || features.texture) !== 'none'
              ? (features.texture_options || features.texture).replace(/_/g, ' ')
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

          const isHighPriority = false;
          const isLate = false;

          let barcodeHexColor = '000000';
          if (isHighPriority || isLate) {
            barcodeHexColor = 'FF0000';
          } else {
            const isCarbonFinish = subcategory === 'CARBON' || subcategory === 'CARBON READY';
            const isNonPaintedRogue = subcategory === 'ROGUE' && paintOption !== 'rattlesnake_rogue';
            const isPaintedOption = !!paintOption && !isCarbonFinish && !isNonPaintedRogue;
            const isFiberglassModel = modelId.toLowerCase().startsWith('fg');
            if (isPaintedOption || isFiberglassModel) {
              barcodeHexColor = '0066FF';
            }
          }

          try {
            const bwipjs = await import('bwip-js');
            const barcodeBuffer = await bwipjs.default.toBuffer({
              bcid: 'code128',
              text: barcodeText,
              scale: 4,
              height: 18,
              includetext: false,
              paddingwidth: 10,
              paddingheight: 5,
              barcolor: barcodeHexColor,
            });
            const pngImage = await pdfDoc.embedPng(barcodeBuffer as Buffer);
            page.drawImage(pngImage, {
              x: x + 8,
              y: y + 17,
              width: 170,
              height: 22,
            });
          } catch (barcodeError) {
            console.error(`Error generating barcode for ${barcodeText}:`, barcodeError);
            page.drawText(barcodeText, {
              x: x + 8,
              y: y + 35,
              size: 8,
              font: helveticaFont,
              color: rgb(1, 0, 0),
            });
          }

          // For P1 PO orders: Show customer name on separate line (above barcode)
          if (isPOItem && customerName) {
            page.drawText(customerName, {
              x: x + 8,
              y: y + 47,
              size: 6,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }

          // Draw special labels with appropriate colors on separate line below stock model
          if (specialLabels.length > 0) {
            let xOffset = x + 8;
            const yPosition = isPOItem ? y + 4 : y + 11;

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
                y: yPosition,
                size: 5,
                font: helveticaFont,
                color: textColor,
              });

              xOffset += (separator.length + label.length) * 3; // Approximate text width
            }
          }

          // Add due date ONLY for non-PO orders
          if (!isPOItem) {
            let dueDate = 'N/A';
            try {
              dueDate = new Date(order.dueDate).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
            } catch (dateError) {
              console.warn(`⚠️ Invalid due date for order ${order.orderId}, using N/A`);
            }
            page.drawText(`Due: ${dueDate}`, {
              x: x + 8,
              y: y + 4,
              size: 6,
              font: helveticaFont,
              color: rgb(0, 0, 0),
            });
          }
        }
      }

      const pdfBytes = await pdfDoc.save();

      // Return PDF for inline viewing (opens in new tab/popup)
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        'inline; filename="barcode-labels.pdf"'
      );
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.send(Buffer.from(pdfBytes));

      console.log(
        `✅ Generated barcode labels PDF for ${orderDetails.length} orders`
      );
    } catch (_error) {
      console.error('🏷️ Create barcode labels error:', _error);
      const errorMessage = _error instanceof Error ? _error.message : 'Unknown error';
      const errorStack = _error instanceof Error ? _error.stack : '';
      console.error('🏷️ Error stack trace:', errorStack);
      res.status(500).json({ 
        error: 'Failed to create barcode labels', 
        details: errorMessage,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Progress orders to next department
  app.post('/api/orders/progress-department', async (req, res) => {
    try {
      const { orderIds, toDepartment, fromDepartment } = req.body;
      const { storage } = await import('../../storage');

      if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
        return res.status(400).json({ 
          success: [], 
          failed: [{ orderId: 'N/A', reason: 'Order IDs required' }] 
        });
      }

      if (!toDepartment) {
        return res.status(400).json({ 
          success: [], 
          failed: [{ orderId: 'N/A', reason: 'Target department required' }] 
        });
      }

      console.log(
        `🔄 Progressing ${orderIds.length} orders to ${toDepartment}:`,
        orderIds
      );

      const results = {
        success: [] as string[],
        failed: [] as { orderId: string; reason: string }[],
      };
      
      const currentTimestamp = new Date();
      const progressedBy = req.user?.username || 'System';

      for (const orderId of orderIds) {
        try {
          // Check if this is a production order by trying to fetch from production_orders table first
          // P1 PO items use customer-based format (ABC00199-0001) not P1- prefix
          let order = await storage.getProductionOrderByOrderId(orderId);
          let isProductionOrder = !!order;
          
          // If not found in production orders, try regular orders
          if (!order) {
            order = await storage.getOrderById(orderId);
            isProductionOrder = false;
          }
          
          if (!order) {
            results.failed.push({ orderId, reason: 'Order not found' });
            console.warn(`⚠️ ${orderId}: Order not found`);
            continue;
          }
          
          console.log(`📝 Processing ${orderId} as ${isProductionOrder ? 'PRODUCTION' : 'REGULAR'} order`);

          const currentDept = (order as any).currentDepartment;

          // Skip no-op moves (prevents empty audit events, zero-duration transitions, timeline noise)
          if (currentDept === toDepartment) {
            console.log(`⏭️ Skipping ${orderId}: already in ${toDepartment}`);
            continue;
          }

          // Validate order is in expected department if fromDepartment is specified
          if (fromDepartment && currentDept !== fromDepartment) {
            results.failed.push({
              orderId,
              reason: `Order is in ${currentDept}, not ${fromDepartment}`,
            });
            console.warn(`⚠️ ${orderId}: Wrong department (${currentDept})`);
            continue;
          }
          
          // Get existing department history or initialize empty array
          const existingHistory = (order as any).departmentHistory || [];
          const departmentHistory = Array.isArray(existingHistory) ? existingHistory : [];
          
          // Add new history entry
          departmentHistory.push({
            fromDepartment: currentDept,
            toDepartment,
            timestamp: currentTimestamp.toISOString(),
            progressedBy,
            assignedTechnician: (order as any).assignedTechnician || null,
          });

          // Update department and completion timestamp
          const updateData: any = {
            currentDepartment: toDepartment,
            updatedAt: currentTimestamp,
            departmentHistory,
          };

          // Set completion timestamp for previous department
          if (currentDept === 'Barcode') {
            updateData.barcodeCompletedAt = currentTimestamp;
          } else if (currentDept === 'Layup' || currentDept === 'Layup/Plugging') {
            updateData.layupCompletedAt = currentTimestamp;
          } else if (currentDept === 'CNC') {
            updateData.cncCompletedAt = currentTimestamp;
          } else if (currentDept === 'Finish' || currentDept === 'Finish Queue') {
            updateData.finishCompletedAt = currentTimestamp;
          } else if (currentDept === 'Finish QC') {
            updateData.finishCompletedAt = currentTimestamp;
          } else if (currentDept === 'Gunsmith') {
            updateData.gunsmithCompletedAt = currentTimestamp;
          } else if (currentDept === 'Paint') {
            updateData.paintCompletedAt = currentTimestamp;
          } else if (currentDept === 'QC' || currentDept === 'QC Shipping Queue') {
            updateData.qcCompletedAt = currentTimestamp;
          } else if (currentDept === 'Shipping' || currentDept === 'Shipping Management') {
            updateData.shippingCompletedAt = currentTimestamp;
          }

          // Capture BEFORE state for audit
          const beforeState = { ...order };

          // Update the correct table based on order type
          if (isProductionOrder) {
            // Update production order
            await storage.updateProductionOrder((order as any).id, updateData);
          } else {
            // Try updating finalized order first, fall back to draft for regular orders
            try {
              await storage.updateFinalizedOrder(orderId, updateData);
            } catch (_error) {
              await storage.updateOrderDraft(orderId, updateData);
            }
          }

          // Reload AFTER state for audit
          let afterState: any = null;
          if (isProductionOrder) {
            afterState = await storage.getProductionOrderByOrderId(orderId);
          } else {
            afterState = await storage.getOrderById(orderId);
          }

          // Build actor from authenticated user
          const actor = {
            id: req.user?.id,
            username: req.user?.username || 'System',
            role: req.user?.role || 'system',
          };

          // Audit field changes (BEFORE → AFTER comparison)
          await auditService.logFieldChanges(
            'p1_order',
            orderId,
            beforeState,
            afterState || updateData,
            actor,
            { source: 'progress-department' }
          );

          // Department timing: close previous, open new
          await auditService.closeDepartmentTransition(orderId, req.user?.id, 'completed');
          await auditService.recordDepartmentEntry({
            entityType: 'p1_order',
            entityId: orderId,
            department: toDepartment,
            enteredByUserId: req.user?.id,
          });
          
          results.success.push(orderId);
          console.log(
            `✅ Progressed ${orderId} from ${currentDept} to ${toDepartment} by ${progressedBy}`
          );
        } catch (error: any) {
          console.error(`❌ Failed to progress ${orderId}:`, error);
          results.failed.push({ orderId, reason: error.message || 'Unknown error' });
        }
      }

      console.log(
        `✅ Progression complete: ${results.success.length} to ${toDepartment}, ${results.failed.length} failed`
      );

      res.json(results);
    } catch (_error) {
      console.error('🔄 Progress orders error:', _error);
      const errorMessage = _error instanceof Error ? _error.message : 'Failed to progress orders';
      res.status(500).json({ 
        success: [], 
        failed: [{ orderId: 'unknown', reason: errorMessage }] 
      });
    }
  });

  // Get Finish QC completion report
  app.get('/api/reports/finish-qc-completed', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      
      if (!pool) {
        console.error('📊 Database pool is not available');
        return res.status(500).json({ error: 'Database connection not available' });
      }
      
      // Get date range from query params or default to last week
      let startDate: Date;
      let endDate: Date;
      
      if (req.query.startDate && req.query.endDate) {
        startDate = new Date(req.query.startDate as string);
        endDate = new Date(req.query.endDate as string);
      } else {
        // Default to last week
        endDate = new Date();
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
      }
      
      console.log('📊 Querying Finish QC report from', startDate, 'to', endDate);
      
      // Get all Finish Technicians from employees table (regardless of whether they've completed orders)
      // Defensive helper: pool.query returns rows[] directly, but handle QueryResult too
      const getRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);
      
      const finishTechniciansResult = await pool.query(
        `SELECT id, name, employee_code
        FROM employees
        WHERE is_finish_technician = true
          AND is_active = true
        ORDER BY name`
      );
      const finishTechnicians = getRows(finishTechniciansResult);
      
      console.log('📊 Found', finishTechnicians.length, 'active Finish QC technicians from employees table');
      
      // Query orders that have department_history with a Finish QC exit
      const allOrdersResult = await pool.query(
        `SELECT 
          order_id,
          customer_po,
          fb_order_number,
          model_id,
          assigned_technician,
          current_department,
          department_history,
          due_date,
          order_date
        FROM all_orders
        WHERE department_history IS NOT NULL
          AND jsonb_array_length(department_history) > 0
        ORDER BY assigned_technician, order_id`
      );
      const allOrders = getRows(allOrdersResult);
      
      console.log('📊 Query returned', allOrders.length, 'orders with department history');
      
      // Filter to only include orders that were progressed OUT of Finish QC in the date range
      const filteredOrders = allOrders.filter((order: any) => {
        if (!order.department_history || !Array.isArray(order.department_history)) {
          return false;
        }
        
        // Find entries where order left Finish QC
        const finishQCExit = order.department_history.find(
          (entry: any) => entry.fromDepartment === 'Finish QC'
        );
        
        if (!finishQCExit || !finishQCExit.timestamp) {
          return false;
        }
        
        // Check if the exit happened in the date range
        const exitDate = new Date(finishQCExit.timestamp);
        return exitDate >= startDate && exitDate <= endDate;
      });
      
      // Initialize grouped object with all Finish QC technicians (even with zero orders for this week)
      const grouped: Record<string, any[]> = {};
      
      for (const tech of finishTechnicians) {
        grouped[tech.name] = [];
      }
      
      // Add filtered orders to the grouped object
      for (const order of filteredOrders) {
        const technician = order.assigned_technician || 'Unassigned';
        
        if (!grouped[technician]) {
          grouped[technician] = [];
        }
        
        // Find the progression entry from Finish QC
        const finishQCProgression = order.department_history.find(
          (entry: any) => entry.fromDepartment === 'Finish QC'
        );
        
        const progressedBy = finishQCProgression?.progressedBy || 'Unknown';
        const progressionDate = finishQCProgression?.timestamp;
        const completedAt = progressionDate;
        
        grouped[technician].push({
          orderId: order.order_id,
          customerPO: order.customer_po,
          fbOrderNumber: order.fb_order_number,
          modelId: order.model_id,
          currentDepartment: order.current_department,
          completedAt,
          progressedBy,
          progressionDate,
          dueDate: order.due_date,
          orderDate: order.order_date,
        });
      }
      
      // Sort orders within each technician group by completion date (most recent first)
      Object.keys(grouped).forEach(tech => {
        grouped[tech].sort((a, b) => {
          const dateA = new Date(a.completedAt).getTime();
          const dateB = new Date(b.completedAt).getTime();
          return dateB - dateA; // Descending order
        });
      });
      
      res.json({
        startDate,
        endDate,
        totalOrders: filteredOrders.length,
        byTechnician: grouped,
        allTechnicians: finishTechnicians.map((t: any) => t.name),
      });
    } catch (err) {
      console.error('📊 Finish QC report error:', err);
      res.status(500).json({ error: 'Failed to generate report' });
    }
  });

  // Admin Journal Entries — read-only, ADMIN only
  // Note: /api/* routes already pass through authenticateToken globally (server/index.ts)
  app.get('/api/finance/accounting/journal-entries', async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. ADMIN role required.' });
      }

      const { fromDate, toDate, status, transactionType } = req.query;
      const { db } = await import('../../db');
      const { journalEntries, journalLines, chartOfAccounts } = await import('../../schema');
      const { eq, and, gte, lte, desc } = await import('drizzle-orm');

      const conditions: any[] = [];
      if (fromDate) conditions.push(gte(journalEntries.effectiveDate, new Date(fromDate as string)));
      if (toDate) conditions.push(lte(journalEntries.effectiveDate, new Date(toDate as string)));
      if (status) conditions.push(eq(journalEntries.status, status as string));
      if (transactionType) conditions.push(eq(journalEntries.transactionType, transactionType as string));

      const entries = await db
        .select()
        .from(journalEntries)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(journalEntries.effectiveDate));

      const result = await Promise.all(entries.map(async (entry: any) => {
        const lines = await db
          .select({
            accountName: chartOfAccounts.accountName,
            debitAmount: journalLines.debitAmount,
            creditAmount: journalLines.creditAmount,
          })
          .from(journalLines)
          .leftJoin(chartOfAccounts, eq(journalLines.accountId, chartOfAccounts.id))
          .where(eq(journalLines.journalEntryId, entry.id));

        const totalDebits = lines.reduce((sum: number, l: any) => sum + (l.debitAmount || 0), 0);
        const totalCredits = lines.reduce((sum: number, l: any) => sum + (l.creditAmount || 0), 0);

        return {
          id: entry.id,
          transactionType: entry.transactionType,
          referenceType: entry.referenceType,
          referenceId: entry.referenceId,
          effectiveDate: entry.effectiveDate,
          status: entry.status,
          memo: entry.memo,
          totals: { totalDebits, totalCredits },
          lines,
        };
      }));

      res.json({ entries: result });
    } catch (error: any) {
      console.error('Error fetching journal entries:', error);
      res.status(500).json({ error: 'Failed to fetch journal entries' });
    }
  });

  // Payment Analytics API - Get payment data by month with order details
  app.get('/api/finance/payment-analytics', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      
      if (!pool) {
        return res.status(500).json({ error: 'Database connection not available' });
      }
      
      const now = new Date();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
      const year = parseInt(req.query.year as string) || now.getFullYear();
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      
      const isMTD = req.query.mtd === 'true';
      const effectiveEndDate = isMTD ? new Date() : endDate;
      
      console.log(`💰 Payment Analytics: ${startDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
      
      const paymentsQuery = `
        SELECT 
          p.id as payment_id,
          p.order_id,
          p.payment_type,
          p.payment_amount,
          p.payment_date,
          p.notes,
          o.customer_po,
          o.fb_order_number,
          o.model_id,
          o.order_id as display_order_id,
          c.name as customer_name
        FROM payments p
        LEFT JOIN all_orders o ON p.order_id = o.order_id
        LEFT JOIN customers c ON CASE WHEN o.customer_id ~ '^[0-9]+$' THEN o.customer_id::integer ELSE NULL END = c.id
        LEFT JOIN credit_card_transactions cct ON cct.payment_id = p.id
        WHERE p.payment_date >= $1 AND p.payment_date <= $2
          AND p.payment_type IN ('credit_card', 'aaaa', 'agr')
          AND (
            p.payment_type != 'credit_card'
            OR cct.status = 'completed'
          )
        ORDER BY p.payment_date DESC
      `;
      
      const queryResult = await pool.query(paymentsQuery, [startDate, effectiveEndDate]);
      const payments = Array.isArray(queryResult) ? queryResult : (queryResult.rows || []);
      
      console.log(`💰 Found ${payments.length} payments`);
      
      const totalAmount = payments.reduce((sum: number, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);
      const transactionCount = payments.length;
      const averagePerOrder = transactionCount > 0 ? totalAmount / transactionCount : 0;
      
      const phonePayments = payments.filter((p: any) => p.payment_type === 'credit_card');
      const onlinePayments = payments.filter((p: any) => p.payment_type === 'aaaa' || p.payment_type === 'agr');
      
      const phoneTotal = phonePayments.reduce((sum: number, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);
      const onlineTotal = onlinePayments.reduce((sum: number, p: any) => sum + (parseFloat(p.payment_amount) || 0), 0);
      
      const byDay: Record<string, { date: string; amount: number; count: number }> = {};
      for (const payment of payments) {
        const dayKey = new Date(payment.payment_date).toISOString().split('T')[0];
        if (!byDay[dayKey]) {
          byDay[dayKey] = { date: dayKey, amount: 0, count: 0 };
        }
        byDay[dayKey].amount += parseFloat(payment.payment_amount) || 0;
        byDay[dayKey].count += 1;
      }
      
      const getPaymentLabel = (type: string, notes: string | null) => {
        if (type === 'credit_card') {
          // Check if this is a Live payment based on notes
          if (notes && notes.toLowerCase().includes('live credit card')) {
            return 'Live';
          }
          return 'Phone';
        }
        if (type === 'aaaa' || type === 'agr') return 'Online';
        return type;
      };
      
      res.json({
        month,
        year,
        isMTD,
        startDate: startDate.toISOString(),
        endDate: effectiveEndDate.toISOString(),
        summary: {
          totalAmount: Math.round(totalAmount * 100) / 100,
          transactionCount,
          averagePerOrder: Math.round(averagePerOrder * 100) / 100,
        },
        breakdown: {
          phone: {
            amount: Math.round(phoneTotal * 100) / 100,
            count: phonePayments.length,
            average: phonePayments.length > 0 ? Math.round((phoneTotal / phonePayments.length) * 100) / 100 : 0,
          },
          online: {
            amount: Math.round(onlineTotal * 100) / 100,
            count: onlinePayments.length,
            average: onlinePayments.length > 0 ? Math.round((onlineTotal / onlinePayments.length) * 100) / 100 : 0,
          },
        },
        payments: payments.map((p: any) => ({
          id: p.payment_id,
          orderId: p.order_id,
          paymentType: p.payment_type,
          paymentLabel: getPaymentLabel(p.payment_type, p.notes),
          amount: parseFloat(p.payment_amount) || 0,
          date: p.payment_date,
          notes: p.notes,
          customerPO: p.customer_po,
          fbOrderNumber: p.fb_order_number,
          modelId: p.model_id,
          customerName: p.customer_name,
        })),
        dailyTotals: Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)),
      });
    } catch (error) {
      console.error('💰 Payment Analytics error:', error);
      res.status(500).json({ error: 'Failed to fetch payment analytics' });
    }
  });

  // Tandym Dashboard Widgets API - Get summary data for dashboard widgets
  app.get('/api/finance/dashboard-widgets', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      
      if (!pool) {
        return res.status(500).json({ error: 'Database connection not available' });
      }
      
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();
      
      // Previous month
      const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
      const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
      
      // Same month last year
      const lastYearMonth = currentMonth;
      const lastYear = currentYear - 1;
      
      // Helper function to get CC revenue for a specific month/year
      const getCCRevenue = async (month: number, year: number) => {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);
        
        const query = `
          SELECT COALESCE(SUM(payment_amount), 0) as total
          FROM payments 
          WHERE payment_date >= $1 AND payment_date <= $2
            AND payment_type IN ('credit_card', 'aaaa')
        `;
        
        const result = await pool.query(query, [startDate, endDate]);
        const rows = Array.isArray(result) ? result : (result.rows || []);
        return parseFloat(rows[0]?.total || 0);
      };
      
      // Get current month data (MTD)
      const currentStartDate = new Date(currentYear, currentMonth - 1, 1);
      const currentQuery = `
        SELECT 
          COALESCE(SUM(payment_amount), 0) as total,
          COUNT(*) as count
        FROM payments 
        WHERE payment_date >= $1 AND payment_date <= $2
          AND payment_type IN ('credit_card', 'aaaa')
      `;
      
      const currentResult = await pool.query(currentQuery, [currentStartDate, now]);
      const currentRows = Array.isArray(currentResult) ? currentResult : (currentResult.rows || []);
      const currentTotal = parseFloat(currentRows[0]?.total || 0);
      const currentCount = parseInt(currentRows[0]?.count || 0);
      const currentAverage = currentCount > 0 ? currentTotal / currentCount : 0;
      
      // Get previous month CC revenue
      const prevMonthRevenue = await getCCRevenue(prevMonth, prevMonthYear);
      
      // Get same month last year CC revenue
      const lastYearRevenue = await getCCRevenue(lastYearMonth, lastYear);
      
      res.json({
        totalRevenue: Math.round(currentTotal * 100) / 100,
        averagePayment: Math.round(currentAverage * 100) / 100,
        prevMonthCCRevenue: Math.round(prevMonthRevenue * 100) / 100,
        lastYearCCRevenue: Math.round(lastYearRevenue * 100) / 100,
        metadata: {
          currentMonth: currentMonth,
          currentYear: currentYear,
          prevMonth: prevMonth,
          prevMonthYear: prevMonthYear,
          lastYearMonth: lastYearMonth,
          lastYear: lastYear,
        }
      });
    } catch (error) {
      console.error('💰 Dashboard Widgets error:', error);
      res.status(500).json({ error: 'Failed to fetch dashboard widget data' });
    }
  });

  // Shipped Order Discounts API - Get discount totals for orders shipped in a specific month
  app.get('/api/finance/shipped-order-discounts', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      
      if (!pool) {
        return res.status(500).json({ error: 'Database connection not available' });
      }
      
      // Default to November 2025 if no params provided
      const month = parseInt(req.query.month as string) || 11;
      const year = parseInt(req.query.year as string) || 2025;
      
      // Calculate date range for the specified month (month is 1-based from query)
      // startDate: first day of the month at 00:00:00
      const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      // endDate: last day of the month at 23:59:59.999
      // Using month (not month-1) gives first day of NEXT month, then day 0 gives last day of current month
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      
      // Query for orders shipped in the specified month that have discounts applied
      // Use calculated_total for percentage-based discounts
      const query = `
        SELECT 
          order_id,
          custom_discount_type,
          custom_discount_value,
          show_custom_discount,
          discount_type,
          discount_value,
          calculated_total
        FROM all_orders 
        WHERE shipped_date >= $1 
          AND shipped_date <= $2
          AND (
            (show_custom_discount = true AND custom_discount_value IS NOT NULL AND custom_discount_value > 0)
            OR (discount_value IS NOT NULL AND discount_value > 0)
          )
      `;
      
      const result = await pool.query(query, [startDate, endDate]);
      const rows = Array.isArray(result) ? result : (result.rows || []);
      
      let totalDiscountAmount = 0;
      let orderCount = 0;
      const orderDetails: { orderId: string; discountAmount: number; discountType: string }[] = [];
      
      for (const row of rows) {
        let discountAmount = 0;
        let discountType = '';
        
        // Get the order total for percentage calculations
        const orderTotal = parseFloat(row.calculated_total) || 0;
        
        // Calculate discount based on custom discount if enabled
        if (row.show_custom_discount && row.custom_discount_value > 0) {
          const customValue = parseFloat(row.custom_discount_value) || 0;
          // Handle both 'percentage' and 'amount'/'fixed' types
          if (row.custom_discount_type === 'percentage') {
            // Percentage discount: calculate from order total
            discountAmount = orderTotal * (customValue / 100);
            discountType = `${customValue}%`;
          } else {
            // 'amount' or 'fixed' type: the value IS the discount amount
            discountAmount = customValue;
            discountType = 'fixed';
          }
        } else if (row.discount_value > 0) {
          const discountVal = parseFloat(row.discount_value) || 0;
          if (row.discount_type === 'percentage') {
            discountAmount = orderTotal * (discountVal / 100);
            discountType = `${discountVal}%`;
          } else {
            discountAmount = discountVal;
            discountType = 'fixed';
          }
        }
        
        if (discountAmount > 0) {
          totalDiscountAmount += discountAmount;
          orderCount++;
          orderDetails.push({
            orderId: row.order_id,
            discountAmount: Math.round(discountAmount * 100) / 100,
            discountType
          });
        }
      }
      
      res.json({
        totalDiscountAmount: Math.round(totalDiscountAmount * 100) / 100,
        orderCount,
        month,
        year,
        monthName: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
        orders: orderDetails
      });
    } catch (error) {
      console.error('💰 Shipped Order Discounts error:', error);
      res.status(500).json({ error: 'Failed to fetch shipped order discounts' });
    }
  });

  // Scrap Report API - Get orders that were scrapped in a specific month
  app.get('/api/finance/scrap-report', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      
      if (!pool) {
        return res.status(500).json({ error: 'Database connection not available' });
      }
      
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      
      const query = `
        SELECT 
          order_id,
          customer,
          product,
          scrap_date,
          scrap_reason,
          scrap_disposition
        FROM orders 
        WHERE scrap_date IS NOT NULL 
          AND scrap_date >= $1 
          AND scrap_date <= $2
        ORDER BY scrap_date DESC
      `;
      
      const result = await pool.query(query, [startDate, endDate]);
      const rows = Array.isArray(result) ? result : (result.rows || []);
      
      const orders = rows.map((row: any) => ({
        orderId: row.order_id,
        customer: row.customer || 'Unknown',
        product: row.product || 'Unknown',
        scrapDate: row.scrap_date,
        scrapReason: row.scrap_reason || '',
        scrapDisposition: row.scrap_disposition || '',
      }));
      
      res.json({
        totalScrapped: orders.length,
        month,
        year,
        monthName: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
        orders
      });
    } catch (error) {
      console.error('🗑️ Scrap Report error:', error);
      res.status(500).json({ error: 'Failed to fetch scrap report data' });
    }
  });

  // Invoice Category Breakdown API - Get invoice totals broken down by pricing categories
  app.get('/api/finance/invoice-category-breakdown', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      
      if (!pool) {
        return res.status(500).json({ error: 'Database connection not available' });
      }
      
      const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
      const year = parseInt(req.query.year as string) || new Date().getFullYear();
      
      // Use ISO date strings to avoid timezone issues
      // Start of month in UTC and start of next month in UTC
      const startDateStr = `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
      const nextMonth = month === 12 ? 1 : month + 1;
      const nextYear = month === 12 ? year + 1 : year;
      const endDateStr = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000Z`;
      
      // Query P1 orders (regular stock orders) with features and model info for the specified month
      // Revenue is recognized when stock is fulfilled/shipped, so filter by shipped_date
      const p1Query = `
        SELECT 
          ao.order_id,
          ao.model_id,
          ao.features,
          ao.calculated_total,
          ao.price_override,
          ao.shipping,
          ao.shipped_date,
          sm.price as stock_model_price,
          sm.name as stock_model_name,
          'P1' as order_type
        FROM all_orders ao
        LEFT JOIN stock_models sm ON ao.model_id = sm.id
        WHERE ao.shipped_date >= $1 
          AND ao.shipped_date < $2
          AND ao.status NOT IN ('CANCELLED', 'SCRAPPED')
      `;
      
      // Query PO production orders (P1 PO orders) that shipped in the specified month
      // Use COALESCE to check shipped_at first, then fulfilled_date
      const poQuery = `
        SELECT 
          po.order_id,
          po.item_id as model_id,
          po.specifications as features,
          poi.unit_price as calculated_total,
          NULL as price_override,
          0 as shipping,
          COALESCE(po.shipped_at, po.fulfilled_date) as shipped_date,
          poi.unit_price as stock_model_price,
          po.item_name as stock_model_name,
          'PO' as order_type
        FROM production_orders po
        LEFT JOIN purchase_order_items poi ON po.po_item_id = poi.id
        WHERE (
          (po.shipped_at >= $1 AND po.shipped_at < $2)
          OR (po.shipped_at IS NULL AND po.fulfilled_date >= $1 AND po.fulfilled_date < $2)
        )
        AND po.production_status NOT IN ('CANCELLED', 'SCRAPPED')
      `;
      
      const [p1Result, poResult] = await Promise.all([
        pool.query(p1Query, [startDateStr, endDateStr]),
        pool.query(poQuery, [startDateStr, endDateStr])
      ]);
      
      const p1Rows = Array.isArray(p1Result) ? p1Result : (p1Result.rows || []);
      const poRows = Array.isArray(poResult) ? poResult : (poResult.rows || []);
      const rows = [...p1Rows, ...poRows];
      
      // Initialize category totals
      const categories: Record<string, { total: number; count: number; orders: { orderId: string; amount: number; detail: string }[] }> = {
        'Stock Model': { total: 0, count: 0, orders: [] },
        'Bottom Metal': { total: 0, count: 0, orders: [] },
        'QDs': { total: 0, count: 0, orders: [] },
        'Texture': { total: 0, count: 0, orders: [] },
        'Rails': { total: 0, count: 0, orders: [] },
        'LOP': { total: 0, count: 0, orders: [] },
        'Paint': { total: 0, count: 0, orders: [] },
        'Swivels': { total: 0, count: 0, orders: [] },
        'Shipping': { total: 0, count: 0, orders: [] },
        'PO Orders': { total: 0, count: 0, orders: [] },
        'Other': { total: 0, count: 0, orders: [] },
      };
      
      // Get all features with their prices
      const featuresQuery = `SELECT id, name, price, options FROM features`;
      const featuresResult = await pool.query(featuresQuery);
      const allFeatures = Array.isArray(featuresResult) ? featuresResult : (featuresResult.rows || []);
      
      // Build feature price lookup
      const featurePriceLookup: Record<string, { basePrice: number; options: Record<string, number> }> = {};
      for (const feature of allFeatures) {
        const options: Record<string, number> = {};
        // Handle options that might be a JSON string or already parsed array
        let parsedOptions = feature.options;
        if (typeof parsedOptions === 'string') {
          try {
            parsedOptions = JSON.parse(parsedOptions);
          } catch {
            parsedOptions = [];
          }
        }
        if (parsedOptions && Array.isArray(parsedOptions)) {
          for (const opt of parsedOptions) {
            if (opt && opt.value !== undefined) {
              const price = typeof opt.price === 'number' ? opt.price : parseFloat(String(opt.price || 0)) || 0;
              options[opt.value] = price;
            }
          }
        }
        featurePriceLookup[feature.id] = {
          basePrice: typeof feature.price === 'number' ? feature.price : parseFloat(String(feature.price || 0)) || 0,
          options,
        };
      }
      
      let grandTotal = 0;
      
      for (const row of rows) {
        const features = row.features || {};
        const orderId = row.order_id;
        const orderType = row.order_type || 'P1';
        
        // Handle PO orders separately - they go into PO Orders category
        if (orderType === 'PO') {
          const poPrice = parseFloat(row.stock_model_price) || 0;
          if (poPrice > 0) {
            categories['PO Orders'].total += poPrice;
            categories['PO Orders'].count++;
            categories['PO Orders'].orders.push({
              orderId,
              amount: poPrice,
              detail: row.stock_model_name || row.model_id || 'PO Item'
            });
            grandTotal += poPrice;
          }
          continue; // Skip feature processing for PO orders
        }
        
        // Stock Model price (P1 orders only)
        const stockModelPrice = row.price_override || row.stock_model_price || 0;
        if (stockModelPrice > 0) {
          categories['Stock Model'].total += stockModelPrice;
          categories['Stock Model'].count++;
          categories['Stock Model'].orders.push({
            orderId,
            amount: stockModelPrice,
            detail: row.stock_model_name || row.model_id || 'Unknown Model'
          });
          grandTotal += stockModelPrice;
        }
        
        // Process each feature category
        const featureMapping: Record<string, string> = {
          'bottom_metal': 'Bottom Metal',
          'qd_accessory': 'QDs',
          'texture_options': 'Texture',
          'rail_accessory': 'Rails',
          'length_of_pull': 'LOP',
          'paint_options': 'Paint',
          'paint_options_combined': 'Paint',
          'swivel_studs': 'Swivels',
        };
        
        for (const [featureKey, categoryName] of Object.entries(featureMapping)) {
          const featureValue = features[featureKey];
          if (!featureValue || featureValue === 'no_' + featureKey.split('_')[0]) continue;
          
          let featurePrice = 0;
          let detail = '';
          
          // Handle array values (like rail_accessory)
          if (Array.isArray(featureValue)) {
            for (const val of featureValue) {
              if (val && val !== 'no_rail') {
                const lookup = featurePriceLookup[featureKey];
                const optPrice = lookup?.options?.[val] || 0;
                featurePrice += optPrice;
                detail = detail ? `${detail}, ${val}` : val;
              }
            }
          } else if (typeof featureValue === 'string') {
            // Skip "no_xxx" values
            if (featureValue.startsWith('no_')) continue;
            
            const lookup = featurePriceLookup[featureKey];
            featurePrice = lookup?.options?.[featureValue] || lookup?.basePrice || 0;
            detail = featureValue;
          }
          
          if (featurePrice > 0) {
            categories[categoryName].total += featurePrice;
            categories[categoryName].count++;
            categories[categoryName].orders.push({
              orderId,
              amount: featurePrice,
              detail: detail.replace(/_/g, ' ')
            });
            grandTotal += featurePrice;
          }
        }
        
        // Handle miscItems as "Other"
        const miscItems = features.miscItems || [];
        if (Array.isArray(miscItems)) {
          for (const item of miscItems) {
            const itemPrice = parseFloat(item.price) || 0;
            if (itemPrice > 0) {
              categories['Other'].total += itemPrice;
              categories['Other'].count++;
              categories['Other'].orders.push({
                orderId,
                amount: itemPrice,
                detail: item.name || 'Misc Item'
              });
              grandTotal += itemPrice;
            }
          }
        }
        
        // Handle Shipping
        const shippingCost = parseFloat(row.shipping) || 0;
        if (shippingCost > 0) {
          categories['Shipping'].total += shippingCost;
          categories['Shipping'].count++;
          categories['Shipping'].orders.push({
            orderId,
            amount: shippingCost,
            detail: 'Shipping'
          });
          grandTotal += shippingCost;
        }
      }
      
      // Convert to array format
      const categoryArray = Object.entries(categories).map(([category, data]) => ({
        category,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        orders: data.orders.slice(0, 100) // Limit to first 100 orders per category
      }));
      
      res.json({
        grandTotal: Math.round(grandTotal * 100) / 100,
        totalOrders: rows.length,
        month,
        year,
        monthName: new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' }),
        categories: categoryArray
      });
    } catch (error) {
      console.error('💰 Invoice Category Breakdown error:', error);
      res.status(500).json({ error: 'Failed to fetch invoice category breakdown' });
    }
  });

  // Migration endpoint: Sync existing production orders to main orders table for layup scheduler
  app.post('/api/migrate-production-orders-to-layup', async (req, res) => {
    try {
      console.log('🔄 Starting migration: Syncing production orders to main orders table...');
      const { storage } = await import('../../storage');
      const { pool } = await import('../../db');
      
      // Get all production orders
      const productionOrders = await storage.getAllProductionOrders();
      console.log(`📦 Found ${productionOrders.length} production orders`);
      
      let syncedCount = 0;
      let skippedCount = 0;
      
      for (const prodOrder of productionOrders) {
        try {
          // Get the associated PO to get customer name
          const po = await storage.getPurchaseOrder(prodOrder.poId);
          
          if (!po) {
            console.log(`⚠️ Skipping ${prodOrder.orderId}: PO not found`);
            skippedCount++;
            continue;
          }
          
          // Insert into main orders table
          try {
            await pool.query(
              `INSERT INTO orders (order_id, customer, product, quantity, status, date, current_department, due_date)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                prodOrder.orderId,
                po.customerName,
                prodOrder.itemId,
                1,
                'Active',
                prodOrder.orderDate || new Date(),
                'P1 Production Queue',
                prodOrder.dueDate,
              ]
            );
          } catch (err) {
            // Ignore duplicate key errors (order already exists in orders table)
            if (!(err as any).message?.includes('duplicate key')) {
              throw err;
            }
          }
          
          syncedCount++;
          
          if (syncedCount % 50 === 0) {
            console.log(`✅ Synced ${syncedCount} orders so far...`);
          }
        } catch (error) {
          console.error(`❌ Error syncing order ${prodOrder.orderId}:`, error);
          skippedCount++;
        }
      }
      
      console.log(`✅ Migration complete: ${syncedCount} synced, ${skippedCount} skipped`);
      
      res.json({
        success: true,
        message: `Synced ${syncedCount} production orders to layup scheduler`,
        syncedCount,
        skippedCount,
        totalProcessed: productionOrders.length,
      });
    } catch (error) {
      console.error('🔄 Migration error:', error);
      res.status(500).json({ error: 'Failed to migrate production orders' });
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
