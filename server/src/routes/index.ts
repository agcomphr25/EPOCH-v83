/* eslint-disable prettier/prettier -- Legacy aggregate route registry is not Prettier-clean; avoid an unrelated whole-file rewrite. */
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
import { buildP2SerializedUnitLedger } from '../lib/p2SerializedUnitLedger';
import {
  P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL,
  indexP2ShippedSerializedItemIds,
} from '../lib/p2ShipmentEvidence';
import {
  countDistinctP2DemandUnits,
  partitionP2PendingRmaReplacements,
  p2PendingUnitDeficit,
} from '../lib/p2SchedulingReconciliation';
import {
  countDistinctP2PendingUnits,
  isP2PhysicalProjectWorkOrder,
  p2PhysicalSerializedIdentity,
  takeP2PriorRevisionPendingForLine,
} from '../lib/p2ControlCenterReconciliation';
import { softAuth, authenticateToken, sessionAwareAuth, requireAdminOrOwner } from '../../middleware/auth';
import { computeEffectivePriority, getEffectivePriorityScore } from '../../../shared/utils/computeEffectivePriority';
import employeesRoutes from './employees';
import operatorAuthRoutes from './operatorAuth';
import employeeQualificationsRoutes from './employeeQualifications';
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
import qmsDesignControlRoutes from './qmsDesignControl';
import auditReadinessRoutes from './auditReadiness';
import epochSoftwareValidationRoutes from './epochSoftwareValidation';
import engineeringReleasesRoutes from './engineeringReleases';
import postReleaseEngineeringReleasesRoutes from './postReleaseEngineeringReleases';
import documentsRoutes from './documents';
import moldsRoutes from './molds';
import layupPdfRoute from './layupPdfRoute';
import shippingPdfRoute from './shippingPdf';
import shippingRoutes from './shipping';
import p1FulfillmentRoutes from './p1Fulfillment';
import shippingTestRoutes from './shipping-test';
import orderAttachmentsRoutes from './orderAttachments';
import storageUploadRoutes from './storageUpload';
import vendorPoAttachmentsRoutes from './vendorPoAttachments';
import discountsRoutes from './discounts';
// import bomsRoutes from './boms'; // Legacy BOM routes - replaced by Robust BOM system
import robustBomsRoutes from './robustBoms';
import communicationsRoutes from './communications';
import marketingRoutes from './marketing';
import internalMessagesRoutes from './internalMessages';
import nonconformanceRoutes from '../../routes/nonconformance';
import nonConformingItemsRoutes from './nonConformingItems';
import paymentsRoutes from './payments';
import algorithmicSchedulerRoutes from './algorithmicScheduler';
import productionQueueRoutes from './productionQueue';
import layupScheduleRoutes from './layupSchedule';
import gatewayReportsRoutes from './gatewayReports';
import customerSatisfactionRoutes from './customerSatisfaction';
import surveyEngineRoutes from './surveyEngine';
import poProductsRoutes from './poProducts';
import p1POQueueRoutes from './p1POQueue';
import p1POQuantityAdjustmentsRoutes from './p1POQuantityAdjustments';
import p1CustomerPoImportsRoutes from './p1CustomerPoImports';
import p2DemandQuantityRoutes from './p2DemandQuantity';
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
  import certificationAuthorizationRoutes from './certificationAuthorizations';
import magicLinkRoutes from './magicLink';
import certificationsRoutes from './certifications';
import globalSearchRoutes from './globalSearch';
import linkedOrdersRoutes from './linkedOrders';
import googleOAuthRoutes from './googleOAuth';
import microsoftAuthRoutes from './microsoftAuth';
import gmailRoutes from './gmail';
import cuttingTableRoutes from './cuttingTable';
import controlledDocumentsRoutes from './controlledDocuments';
import controlledDocumentReconciliationRoutes from './controlledDocumentReconciliation';
import designControlFormTemplatesRoutes from './designControlFormTemplates';
import projectFormsRoutes, {
  designControlProjectFormsRouter,
} from './projectForms';
import engineeringChangeRequestsRoutes from './engineeringChangeRequests';
import changeControlRoutes from './changeControl';
import engineeringChangeNoticesRoutes from './engineeringChangeNotices';
import controlledPrintedCopiesRoutes, {
  controlledCopyScopeRouter,
} from './controlledPrintedCopies';
import designHistoryFilesRoutes from './designHistoryFiles';
import vaultRoutes from './vault';
import adminRoutes from './admin';
import policiesRoutes from './policies';
import quotesRoutes from './quotes';
import costCentersRoutes from './costCenters';
import costAccountingRoutes from './costAccounting';
import payrollControlRoutes from './payrollControl';
import employeeBadgesRoutes from './employeeBadges';
import manufacturingQueueRoutes from './manufacturingQueue';
import cuttingTableManufacturingQueueRoutes from './cuttingTableManufacturingQueue';
import cuttingDocumentsRoutes from './cuttingDocuments';
import allocationRequirementsRoutes from './allocationRequirements';
import allocationControlRoutes from './allocationControl';

import watchRulesRoutes from './watchRules';
import creditMemosRoutes from './creditMemos';
import websiteOrderImportRoutes from './websiteOrderImport';


import p2TravelerRoutes from './p2Traveler';
import p2TravelerViewerRoutes from './p2TravelerViewer';
import p2ProductionQueueRoutes from './p2ProductionQueue';
import p2SerializedItemsRoutes from './p2SerializedItems';
import partRoutingsRoutes from './partRoutings';
import routingTemplatesRoutes from './routingTemplates';
import engineeringControlRoutes from './engineeringControl';
import anodizeJobsRoutes from './anodizeJobs';
import travelersRoutes, { travelerComponentAssociationsRouter } from './travelers';
import materialLotsRoutes from './materialLots';
import routingDocumentsRoutes from './routingDocuments';
import mrpRoutes from './mrp';

import pdfSettingsRoutes from './pdfSettings';
import p2LayupSchedulesRoutes from './p2LayupSchedules';
import { dailyThroughputBoardHandler } from './dailyThroughputBoard';
import p2ShippingRoutes from './p2Shipping';
import p2RmasRoutes from './p2Rmas';
import preproductionChecklistsRoutes from './preproductionChecklists';
import checklistManagementRoutes from './checklistManagement';
import checklistInstancesRoutes from './checklistInstances';
import forecastRoutes from './forecast';
import healthChecksRoutes from './healthChecks';
import monitoredLinksRoutes from './monitoredLinks';
import projectsRoutes from './projects';
import projectStepAttachmentsRoutes from './projectStepAttachments';
import projectClosingsRoutes from './projectClosings';
import pmDashboardRoutes from './pmDashboard';
import programManufacturingRoutes from './programManufacturing';
import quoteFeedbackRoutes from './quoteFeedback';
import modelAnalyticsRoutes from './modelAnalytics';
import aqlSamplingRoutes from './aqlSampling';
import auditRoutes from './audit';
import auditLedgerRoutes from './auditLedger';
import inventoryTransactionLedgerRoutes from './inventoryTransactionLedger';
import inventoryAnomaliesRoutes from './inventoryAnomalies';
import digitalSignaturesRoutes from './digitalSignatures';
import traceabilityRoutes from './traceability';
import cycleCountsRoutes from './cycleCounts';
import { auditService } from '../services/auditService';
import {
  deriveP1ProductionStatus,
  isClosedP1PurchaseOrderStatus,
} from '../utils/p1ProductionStatus';
import mediaRoutes from './media';
import voiceNotesRoutes from './voiceNotes';
import epochCopilotRoutes from './epochCopilot';
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
import { storage } from '../../storage';
import { registerCodebaseChatRoutes } from '../../replit_integrations/chat/codebase-chat-routes';
import { getAccessToken } from '../utils/upsShipping';
import punchesRoutes from './punches';
import laborRoutes from './labor';
import burdenRatesRoutes from './burdenRates';
import timekeepingRoutes from './timekeeping';
import tkPunchesRoutes from './timekeeping/punches';
import tkTimesheetsRoutes from './timekeeping/timesheets';
import tkEmployeesRoutes from './timekeeping/employees';
import tkDashboardRoutes from './timekeeping/dashboard';
import tkDailyCertificationRoutes from './timekeeping/daily-certification';
import tkTimeOffRoutes from './timekeeping/timeoff';
import tkSalariedTimesheetsRoutes from './timekeeping/salariedTimesheets';
import tkLaborEntryDraftsRoutes from './timekeeping/laborEntryDrafts';
import tkLaborApprovalsRoutes from './timekeeping/laborApprovals';
import tkLaborCaptureRoutes from './timekeeping/laborCapture';
import tkCorrectionsRoutes from './timekeeping/corrections';
import tkPolicySettingsRoutes from './timekeeping/policySettings';
import tkPtoCommandCenterRoutes from './timekeeping/ptoCommandCenter';
import tkPayrollExportRoutes from './timekeeping/payrollExport';
import tkMyTasksRoutes from './timekeeping/myTasks';
import historicalDataRoutes from './historicalData';
import fillablePdfTemplatesRoutes from './fillablePdfTemplates';
import pdfFormsRoutes from './pdfForms';
import accountingPrepRoutes from './accountingPrep';
import accountingControlRoutes from './accountingControl';
import accountingEventMatrixRoutes from './accountingEventMatrix';
import chartOfAccountsRoutes from './chartOfAccounts';
import improvementNotesRoutes from './improvementNotes';
import { qrResolverRouter, qrAdminRouter } from './qrCodes';
import onboardingRoutes from './onboarding';
import assetManagementRoutes from './assetManagement';
import workOrdersRoutes from './workOrders';
import wadRevisionsRoutes from './wadRevisions';
import productionControlTemplatesRoutes from './productionControlTemplates';
import productLabelsRoutes from './productLabels';
import executiveRundownRoutes from './executiveRundown';
import metricsRoutes from './metrics';
import { widgetTypesRouter, dashboardsRouter } from './widgets';
import unitsRouter from './units';
import materialIntelligenceRoutes from './materialIntelligence';
import emailTemplatesRoutes from './emailTemplates';
import arInvoicesRoutes from './arInvoices';
import arPaymentsRoutes from './arPayments';
import paymentSettlementsRoutes from './paymentSettlements';
import arPaymentAttachmentsRoutes from './arPaymentAttachments';
import apBillsRoutes from './apBills';
import permissionsRoutes from './permissions';
import offlineReplayRoutes from './offlineReplay';
import controlTowerRoutes from './controlTower';
import financialReviewRoutes from './financialReview';
import quickNotesRoutes from './quickNotes';
import moveForwardRoutes from './moveForward';
import governanceRoutes from './governance';
import { requireExecutiveAccess } from '../middleware/requireExecutiveAccess';
import {
  getFileStorageProvider,
  getFileStorageProviderForObjectPath,
  getStorageErrorResponse,
} from '../services/fileStorageProvider';
import cncDashboardRoutes from './cncDashboard';
import receivingRoutes from './receiving';
import estimatingRoutes from './estimating';
import draftBomDraftsRoutes from './draftBomDrafts';
import rdProjectsRoutes from './rdProjects';
import rfqRiskSessionsRoutes from './rfqRiskSessions';
import auditsRoutes from './audits';
import commandCenterRoutes from './commandCenter';
import edriRoutes from './edri';
import chargeCodeUsageReportRoutes from './chargeCodeUsageReport';
import laborDistributionReportRoutes from './laborDistributionReport';
import transactionEvidenceMapRoutes from './transactionEvidenceMap';
import supervisorApprovalExceptionReportRoutes from './supervisorApprovalExceptionReport';
import timesheetCorrectionLogReportRoutes from './timesheetCorrectionLogReport';
import payrollExportReconciliationReportRoutes from './payrollExportReconciliationReport';
import indirectCostBurdenRateReportRoutes from './indirectCostBurdenRateReport';
import unallowableCostReviewReportRoutes from './unallowableCostReviewReport';
import procurementComplianceReportRoutes from './procurementComplianceReport';
import inventoryTraceabilityReportRoutes from './inventoryTraceabilityReport';
import auditLedgerIntegrityReportRoutes from './auditLedgerIntegrityReport';
import policyTrainingAcknowledgmentReportRoutes from './policyTrainingAcknowledgmentReport';
import forensicAuditRoutes from './forensicAudit';
import cmmcRoutes from './cmmc';
import chargeCodesRoutes from './chargeCodes';
import purchaseRequisitionsRoutes from './purchaseRequisitions';
import farFlowdownClausesRoutes from './farFlowdownClauses';
import vendorDebarmentChecksRoutes from './vendorDebarmentChecks';
import contractReviewRoutes from './contractReview';
import continuityRoutes from './continuity';
import proteusLabsRoutes from './proteusLabs';
import devSeedPunchesRoutes from './timekeeping/devSeedPunches';
import p2ScheduleItemsRoutes from './p2ScheduleItems';
import { approvalsRouter, escalationPoliciesRouter } from './approvals';

export function registerRoutes(app: Express, existingServer?: Server): Server {
  // Debug routes — not mounted in production
  if (process.env.NODE_ENV !== 'production') {
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

    app.use('/api/dev/timekeeping/seed-punches', devSeedPunchesRoutes);
  }

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

  // Operator badge auth (Task #143 Phase 2) — issues short-lived shop-floor
  // session tokens distinct from web JWTs, used by MaterialIssueService to
  // prove WHO is physically scanning material at a workstation.
  app.use('/api/operator-auth', operatorAuthRoutes);
  app.use('/api/employees/:employeeId/qualifications', employeeQualificationsRoutes);

  // Punch events routes (IC-7) - Read-only mirror from Time Clock
  app.use('/api/punches', punchesRoutes);

  // Labor summary routes (IC-F1) - Derived insights from punch events
  app.use('/api/labor', laborRoutes);

  // Native EPOCH timekeeping — punch_events as source of truth
  app.use('/api/timekeeping', timekeepingRoutes);

  // Absorbed standalone timekeeping routes (Tier 1 — punches, timesheets, employees, dashboard)
  // These coexist with the existing timekeepingRoutes above. Each file owns its own path segments.
  app.use('/api/timekeeping', tkPunchesRoutes);
  app.use('/api/timekeeping', tkTimesheetsRoutes);
  app.use('/api/timekeeping', tkEmployeesRoutes);
  app.use('/api/timekeeping', tkDashboardRoutes);
  // Tier 2 — DCAA daily certification flow (TK-006)
  app.use('/api/timekeeping', tkDailyCertificationRoutes);
  // Tier 3 — Time-off request & approval workflow
  app.use('/api/timekeeping', tkTimeOffRoutes);
  // Tier 4 — Salaried timesheet system (Phase 1: read-only, feature-flagged)
  app.use('/api/timekeeping', tkSalariedTimesheetsRoutes);
  // Tier 4b — Salaried manual draft time entry (Phase 3, feature-flagged)
  app.use('/api/timekeeping', tkLaborEntryDraftsRoutes);
  app.use('/api/timekeeping', tkLaborApprovalsRoutes);
  // Tier 5 — Labor Capture AI Suggestion engine (Phase B Prompt 1)
  app.use('/api/timekeeping', tkLaborCaptureRoutes);
  // Tier 6 — DCAA Timesheet Correction Approval Chain
  app.use('/api/timekeeping', tkCorrectionsRoutes);
  // Tier 7 — Timekeeping Policy Settings (runtime-configurable compliance rules)
  app.use('/api/timekeeping', tkPolicySettingsRoutes);
  // Tier 8 — PTO Command Center (admin aggregation dashboard)
  app.use('/api/timekeeping', tkPtoCommandCenterRoutes);
  // Tier 9 — Payroll Export (Phase 1: stored CSV batches with SHA-256 evidence)
  app.use('/api/timekeeping', tkPayrollExportRoutes);
  app.use('/api/timekeeping', tkMyTasksRoutes);

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
  
  // Daily throughput board — registered as a direct app.get with the full explicit path
  // to prevent any /api/p2 sub-router from intercepting this route via /:id patterns.
  app.get('/api/p2/daily-throughput-board', dailyThroughputBoardHandler);

  // P2 Layup Schedule routes (MUST come before P2 customer routes to avoid /:id catch-all)
  app.use('/api/p2', p2LayupSchedulesRoutes);
  app.use('/api/p2', p2ShippingRoutes);
  app.use('/api/p2', p2RmasRoutes);
  
  // P2 Production Queue routes
  app.use('/api/p2-production-queue', p2ProductionQueueRoutes);
  
  // P2 Serialized Items - open nonconforming list (inline to avoid router mount ordering issues)
  app.get('/api/p2/serialized-items/scrapped', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { p2SerializedItems, p2NonconformingDispositions } = await import('../../schema');
      const { eq, desc, inArray } = await import('drizzle-orm');
      const units = await db.query.p2SerializedItems.findMany({
        where: eq(p2SerializedItems.status, 'SCRAPPED'),
        orderBy: (t: any, { desc: d }: any) => [d(t.scrapAt)],
      });

      // Enrich with the latest disposition and return only open NCR items.
      // The serialized item status is still SCRAPPED for compatibility, but
      // operationally this endpoint is the open nonconforming attention queue.
      const itemIds = units.map((u: any) => u.id);
      let dispositions: any[] = [];
      if (itemIds.length > 0) {
        dispositions = await db
          .select()
          .from(p2NonconformingDispositions)
          .where(inArray(p2NonconformingDispositions.serializedItemId, itemIds))
          .orderBy(desc(p2NonconformingDispositions.createdAt));
      }
      const dispositionMap = new Map();
      dispositions.forEach((d: any) => {
        if (!dispositionMap.has(d.serializedItemId)) {
          dispositionMap.set(d.serializedItemId, d);
        }
      });
      const enriched = units
        .map((u: any) => ({
          ...u,
          disposition: dispositionMap.get(u.id) || null,
        }))
        .filter((u: any) => !u.disposition || u.disposition.resolved !== true);
      res.json(enriched);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch open nonconforming items' });
    }
  });

  // P2 Serialized Items - closed NCR history
  app.get('/api/p2/serialized-items/closed-ncr', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { p2SerializedItems, p2NonconformingDispositions } = await import('../../schema');
      const { eq, desc } = await import('drizzle-orm');

      const rows = await db
        .select({
          item: p2SerializedItems,
          disposition: p2NonconformingDispositions,
        })
        .from(p2NonconformingDispositions)
        .innerJoin(
          p2SerializedItems,
          eq(p2NonconformingDispositions.serializedItemId, p2SerializedItems.id),
        )
        .where(eq(p2NonconformingDispositions.resolved, true))
        .orderBy(
          desc(p2NonconformingDispositions.resolvedAt),
          desc(p2NonconformingDispositions.createdAt),
        );

      res.json(rows.map((row: any) => ({
        ...row.item,
        disposition: row.disposition,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch closed NCR items' });
    }
  });

  // P2 Nonconforming Dispositions - GET all dispositions for an item
  app.get('/api/p2/nonconforming-dispositions/:serializedItemId', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { p2NonconformingDispositions } = await import('../../schema');
      const { eq } = await import('drizzle-orm');
      const rows = await db
        .select()
        .from(p2NonconformingDispositions)
        .where(eq(p2NonconformingDispositions.serializedItemId, req.params.serializedItemId));
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch dispositions' });
    }
  });

  // P2 Nonconforming Dispositions - POST create a new disposition
  app.post('/api/p2/nonconforming-dispositions', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { pool } = await import('../../db');
      const {
        p2NonconformingDispositions,
        p2Rmas,
        p2SerializedItems,
        p2SerializedItemEvents,
        travelers,
        travelerSteps,
        p2PurchaseOrders,
        inventoryItems,
        inventoryBalances,
        inventoryTransactions,
        insertP2NonconformingDispositionSchema,
        P2_DEPARTMENT_STAGES,
      } = await import('../../schema');
      const { eq, sql } = await import('drizzle-orm');

      const parsed = insertP2NonconformingDispositionSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
      }

      const data = parsed.data;
      const useAsIsDestination = req.body?.useAsIsDestination === 'production'
        ? 'production'
        : 'inventory';
      const returnProjectId = typeof req.body?.returnProjectId === 'string' && req.body.returnProjectId.trim()
        ? req.body.returnProjectId.trim()
        : null;
      const returnDepartment = typeof req.body?.returnDepartment === 'string' && req.body.returnDepartment.trim()
        ? req.body.returnDepartment.trim()
        : null;

      if (data.dispositionType === 'Use as Is' && useAsIsDestination === 'production') {
        if (!returnProjectId || !returnDepartment) {
          return res.status(400).json({
            error: 'Use as Is return-to-production requires project and department',
          });
        }
      }

      // Resolve instantly for dispositions that don't require further action
      // Use as Is → inventory added, then resolved; Repair → stays open until RMA complete
      const autoResolvedTypes = ['Scrap', 'Use as Is', 'Use for Reference', 'Return to Vendor'];
      const isAutoResolved = autoResolvedTypes.includes(data.dispositionType);

      const [disposition] = await db
        .insert(p2NonconformingDispositions)
        .values({
          ...data,
          resolved: isAutoResolved ? true : false,
          resolvedAt: isAutoResolved ? new Date() : null,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      // Side effects based on disposition type
      if (data.dispositionType === 'Scrap') {
        // Increment scrap count and recalculate scrap rate percentage on the PO
        if (data.poId) {
          try {
            // Count total serialized items on this PO (used as denominator for rate)
            const totalResult = await pool.query<{ total: string }>(
              `SELECT COUNT(*) AS total FROM p2_serialized_items WHERE po_id = $1`,
              [data.poId]
            );
            const total = parseInt(totalResult.rows[0]?.total || '0', 10) || 1;

            await pool.query(
              `UPDATE p2_purchase_orders
               SET scrapped_item_count = COALESCE(scrapped_item_count, 0) + 1,
                   scrap_rate_percent = ROUND(((COALESCE(scrapped_item_count, 0) + 1)::real / $1::real * 100)::numeric, 2),
                   notes = CONCAT(COALESCE(notes, ''), E'\n[SCRAP] Disposition #', $2::text, ' filed for S/N ', $3::text, ' on ', $4::text),
                   updated_at = NOW()
               WHERE id = $5`,
              [total, disposition.id, data.serialNumber, new Date().toISOString().slice(0, 10), data.poId]
            );
          } catch (e) {
            console.error('Failed to update PO scrap rate:', e);
          }
        }
      } else if (data.dispositionType === 'Use as Is') {
        // Use as Is can either capture the serial as inventory-on-hand or
        // return it to production at the selected project/department.
        try {
          const [item] = await db
            .select()
            .from(p2SerializedItems)
            .where(eq(p2SerializedItems.id, data.serializedItemId))
            .limit(1);
          if (item) {
            const metadata = (item.metadata as Record<string, unknown> | null) || {};

            if (useAsIsDestination === 'inventory') {
              // Check if inventory item exists for this part number
              const [invItem] = await db
                .select()
                .from(inventoryItems)
                .where(eq(inventoryItems.agPartNumber, item.partNumber))
                .limit(1);
              // Ensure an inventory_items record exists for this part
              const effectiveInvItem = invItem || await db
                .insert(inventoryItems)
                .values({
                  agPartNumber: item.partNumber,
                  name: item.partName || item.partNumber,
                  source: 'P2 Nonconforming (Use as Is)',
                  notes: `Created by nonconforming disposition for S/N ${data.serialNumber}`,
                  isActive: true,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
                .returning()
                .then(([r]) => r);

              if (effectiveInvItem) {
                // Upsert inventory balance in WAREHOUSE-MAIN location
                const [existingBalance] = await db
                  .select()
                  .from(inventoryBalances)
                  .where(eq(inventoryBalances.agPartNumber, item.partNumber))
                  .limit(1);
                if (existingBalance) {
                  await db
                    .update(inventoryBalances)
                    .set({
                      quantityOnHand: existingBalance.quantityOnHand + 1,
                      quantityAvailable: existingBalance.quantityAvailable + 1,
                      updatedAt: new Date(),
                    })
                    .where(eq(inventoryBalances.id, existingBalance.id));
                } else {
                  await db
                    .insert(inventoryBalances)
                    .values({
                      agPartNumber: item.partNumber,
                      locationId: 'WAREHOUSE-MAIN',
                      quantityOnHand: 1,
                      quantityAllocated: 0,
                      quantityAvailable: 1,
                      createdAt: new Date(),
                      updatedAt: new Date(),
                    });
                }

                await db
                  .update(inventoryItems)
                  .set({
                    quantityInStock: sql`COALESCE(${inventoryItems.quantityInStock}, 0) + 1`,
                    onHand: sql`COALESCE(${inventoryItems.onHand}, 0) + 1`,
                    available: sql`COALESCE(${inventoryItems.available}, 0) + 1`,
                    lastUpdated: new Date(),
                    updatedAt: new Date(),
                  })
                  .where(eq(inventoryItems.id, effectiveInvItem.id));

                await db.insert(inventoryTransactions).values({
                  agPartNumber: item.partNumber,
                  transactionType: 'return',
                  quantity: 1,
                  unitOfMeasure: 'EA',
                  fromLocation: 'P2 Nonconforming',
                  toLocation: 'WAREHOUSE-MAIN',
                  referenceType: 'P2_NCR_USE_AS_IS',
                  referenceId: String(disposition.id),
                  notes: `Use As Is inventory capture for serialized item ${item.serialNumber}`,
                  performedBy: data.authorization,
                  metadata: {
                    serializedItemId: item.id,
                    serialNumber: item.serialNumber,
                    travelerBarcode: item.travelerBarcode,
                    dispositionId: disposition.id,
                    poId: item.poId,
                    poNumber: item.poNumber,
                    reasonType: data.reasonType,
                    reasonOther: data.reasonOther,
                  },
                });
              }

              await db.update(p2SerializedItems)
                .set({
                  status: 'COMPLETED',
                  currentDepartment: 'Inventory',
                  metadata: {
                    ...metadata,
                    useAsIsDisposition: {
                      destination: 'inventory',
                      dispositionId: disposition.id,
                      inventoryPartNumber: item.partNumber,
                      locationId: 'WAREHOUSE-MAIN',
                      reasonType: data.reasonType,
                      reasonOther: data.reasonOther,
                      recordedAt: new Date().toISOString(),
                    },
                  },
                  updatedAt: new Date(),
                })
                .where(eq(p2SerializedItems.id, item.id));

              await db.insert(p2SerializedItemEvents).values({
                serializedItemId: item.id,
                barcode: item.barcode,
                eventType: 'NCR_USE_AS_IS_INVENTORY',
                fromDepartment: item.currentDepartment,
                toDepartment: 'Inventory',
                toStageIndex: item.currentStageIndex,
                performedBy: data.authorization,
                notes: `Use As Is disposition sent to inventory under ${item.partNumber}`,
                metadata: {
                  dispositionId: disposition.id,
                  serialNumber: item.serialNumber,
                  travelerBarcode: item.travelerBarcode,
                  locationId: 'WAREHOUSE-MAIN',
                  reasonType: data.reasonType,
                  reasonOther: data.reasonOther,
                },
              });
            } else {
              const p2Stages = ['Pending Layup', ...P2_DEPARTMENT_STAGES] as string[];
              const nextDepartment = returnDepartment || 'Pending Layup';
              const stageIndex = Math.max(0, p2Stages.indexOf(nextDepartment));

              await db.update(p2SerializedItems)
                .set({
                  status: 'ACTIVE',
                  currentDepartment: nextDepartment,
                  currentStageIndex: stageIndex,
                  scrapReason: null,
                  scrapBy: null,
                  scrapAt: null,
                  metadata: {
                    ...metadata,
                    useAsIsDisposition: {
                      destination: 'production',
                      dispositionId: disposition.id,
                      returnProjectId,
                      returnDepartment: nextDepartment,
                      reasonType: data.reasonType,
                      reasonOther: data.reasonOther,
                      recordedAt: new Date().toISOString(),
                    },
                  },
                  updatedAt: new Date(),
                })
                .where(eq(p2SerializedItems.id, item.id));

              await db.insert(p2SerializedItemEvents).values({
                serializedItemId: item.id,
                barcode: item.barcode,
                eventType: 'NCR_USE_AS_IS_PRODUCTION',
                fromDepartment: item.currentDepartment,
                fromStageIndex: item.currentStageIndex,
                toDepartment: nextDepartment,
                toStageIndex: stageIndex,
                performedBy: data.authorization,
                notes: `Use As Is disposition returned to production at ${nextDepartment}`,
                metadata: {
                  dispositionId: disposition.id,
                  serialNumber: item.serialNumber,
                  travelerBarcode: item.travelerBarcode,
                  returnProjectId,
                  returnDepartment: nextDepartment,
                  reasonType: data.reasonType,
                  reasonOther: data.reasonOther,
                },
              });
            }
          }
        } catch (e) {
          console.error('Failed to apply Use as Is disposition:', e);
        }
      } else if (data.dispositionType === 'Repair') {
        // Create an open repair RMA and return the original serial to a Repair queue.
        try {
          const now = new Date();
          const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
          // Count existing P2 RMAs today for sequence number
          const existingRmas = await pool.query(
            `SELECT rma_number FROM p2_rmas WHERE rma_number LIKE $1`,
            [`RMA-P2-${dateStr}-%`]
          );
          let maxSeq = 0;
          for (const row of existingRmas.rows) {
            const match = (row.rma_number as string).match(/-(\d+)$/);
            if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
          }
          const rmaNumber = `RMA-P2-${dateStr}-${maxSeq + 1}`;

          const [rma] = await db
            .insert(p2Rmas)
            .values({
              dispositionId: disposition.id,
              serializedItemId: data.serializedItemId,
              rmaNumber,
              status: 'open',
              traceableMaterials: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning();

          const [item] = await db
            .select()
            .from(p2SerializedItems)
            .where(eq(p2SerializedItems.id, data.serializedItemId))
            .limit(1);

          if (item) {
            const metadata = (item.metadata as Record<string, unknown> | null) || {};
            const [activeTraveler] = item.serialNumber
              ? await db
                  .select()
                  .from(travelers)
                  .where(eq(travelers.serialNumber, item.serialNumber))
                  .orderBy(sql`${travelers.updatedAt} DESC NULLS LAST`, sql`${travelers.createdAt} DESC NULLS LAST`)
                  .limit(1)
              : [];

            await db.update(p2SerializedItems)
              .set({
                status: 'ACTIVE',
                currentDepartment: 'Repair',
                metadata: {
                  ...metadata,
                  repairDisposition: {
                    dispositionId: disposition.id,
                    rmaId: rma.id,
                    rmaNumber,
                    reasonType: data.reasonType,
                    reasonOther: data.reasonOther,
                    routedAt: new Date().toISOString(),
                  },
                },
                updatedAt: new Date(),
              })
              .where(eq(p2SerializedItems.id, item.id));

            let repairStepId: string | null = null;
            if (activeTraveler) {
              const [maxStepRow] = await db
                .select({ maxStep: sql<number>`COALESCE(MAX(${travelerSteps.stepNumber}), 0)` })
                .from(travelerSteps)
                .where(eq(travelerSteps.travelerId, activeTraveler.id));
              const nextStepNumber = Number(maxStepRow?.maxStep || 0) + 1;
              const [repairStep] = await db.insert(travelerSteps)
                .values({
                  travelerId: activeTraveler.id,
                  departmentName: 'Repair',
                  stepNumber: nextStepNumber,
                  status: 'NOT_STARTED',
                  notes: `Repair step created from NCR disposition ${disposition.id} / ${rmaNumber}`,
                })
                .returning({ id: travelerSteps.id });
              repairStepId = repairStep?.id ?? null;
            }

            await db.insert(p2SerializedItemEvents).values({
              serializedItemId: item.id,
              barcode: item.barcode,
              eventType: 'NCR_DISPOSITION_REPAIR',
              fromDepartment: item.currentDepartment,
              fromStageIndex: item.currentStageIndex,
              toDepartment: 'Repair',
              toStageIndex: item.currentStageIndex,
              performedBy: data.authorization,
              notes: `Repair disposition opened as ${rmaNumber}`,
              metadata: {
                dispositionId: disposition.id,
                rmaId: rma.id,
                rmaNumber,
                travelerId: activeTraveler?.id ?? null,
                travelerNumber: activeTraveler?.travelerNumber ?? null,
                repairStepId,
                reasonType: data.reasonType,
                reasonOther: data.reasonOther,
              },
            });
          }
        } catch (e) {
          console.error('Failed to create RMA for disposition:', e);
        }
      }

      res.status(201).json(disposition);
    } catch (err: any) {
      console.error('Error creating disposition:', err);
      res.status(500).json({ error: err?.message || 'Failed to create disposition' });
    }
  });

  // P2 Nonconforming Dispositions - PATCH mark as resolved
  app.patch('/api/p2/nonconforming-dispositions/:id/resolve', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { p2NonconformingDispositions } = await import('../../schema');
      const { eq } = await import('drizzle-orm');
      const [updated] = await db
        .update(p2NonconformingDispositions)
        .set({ resolved: true, resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(p2NonconformingDispositions.id, parseInt(req.params.id)))
        .returning();
      if (!updated) return res.status(404).json({ error: 'Disposition not found' });
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to resolve disposition' });
    }
  });

  // P2 Nonconforming RMAs - production repair RMAs from P2 NCR dispositions.
  // Keep this path separate from /api/p2/rmas, which is used for customer shipping RMAs.
  app.get('/api/p2/nonconforming-rmas', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { p2Rmas, p2NonconformingDispositions, p2SerializedItems } = await import('../../schema');
      const { eq, desc, ne } = await import('drizzle-orm');
      const rmas = await db
        .select({
          rma: p2Rmas,
          disposition: p2NonconformingDispositions,
          item: p2SerializedItems,
        })
        .from(p2Rmas)
        .leftJoin(p2NonconformingDispositions, eq(p2Rmas.dispositionId, p2NonconformingDispositions.id))
        .leftJoin(p2SerializedItems, eq(p2Rmas.serializedItemId, p2SerializedItems.id))
        .orderBy(desc(p2Rmas.createdAt));
      res.json(rmas);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to fetch RMAs' });
    }
  });

  // P2 Nonconforming RMAs - PATCH add materials and/or mark shipped/complete
  app.patch('/api/p2/nonconforming-rmas/:id', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { p2Rmas, p2SerializedItems, p2SerializedItemEvents, inventoryTransactions, travelers, travelerSteps } = await import('../../schema');
      const { and, eq, sql } = await import('drizzle-orm');
      const { traceableMaterials, status, notes } = req.body;

      const updateData: any = { updatedAt: new Date() };
      if (traceableMaterials !== undefined) updateData.traceableMaterials = traceableMaterials;
      if (notes !== undefined) updateData.notes = notes;
      if (status === 'shipped') {
        updateData.status = 'shipped';
        updateData.shippedAt = new Date();
      } else if (status === 'complete') {
        updateData.status = 'complete';
        updateData.completedAt = new Date();
      } else if (status) {
        updateData.status = status;
      }

      const [existingRma] = await db
        .select()
        .from(p2Rmas)
        .where(eq(p2Rmas.id, parseInt(req.params.id)))
        .limit(1);
      if (!existingRma) return res.status(404).json({ error: 'RMA not found' });

      const [updated] = await db
        .update(p2Rmas)
        .set(updateData)
        .where(eq(p2Rmas.id, parseInt(req.params.id)))
        .returning();
      if (!updated) return res.status(404).json({ error: 'RMA not found' });

      if (traceableMaterials !== undefined) {
        const [item] = await db
          .select()
          .from(p2SerializedItems)
          .where(eq(p2SerializedItems.id, updated.serializedItemId))
          .limit(1);

        if (item) {
          const [activeTraveler] = item.serialNumber
            ? await db
                .select()
                .from(travelers)
                .where(eq(travelers.serialNumber, item.serialNumber))
                .orderBy(sql`${travelers.updatedAt} DESC NULLS LAST`, sql`${travelers.createdAt} DESC NULLS LAST`)
                .limit(1)
            : [];
          const [repairStep] = activeTraveler
            ? await db
                .select()
                .from(travelerSteps)
                .where(and(eq(travelerSteps.travelerId, activeTraveler.id), eq(travelerSteps.departmentName, 'Repair')))
                .orderBy(sql`${travelerSteps.stepNumber} DESC`)
                .limit(1)
            : [];
          const materialSummary = (traceableMaterials as Array<{ name?: string; partNumber?: string; lot?: string; qty?: string }>)
            .map((material) => {
              const label = [material.partNumber, material.name].filter(Boolean).join(' - ');
              return [label, material.lot ? `lot ${material.lot}` : null, material.qty ? `qty ${material.qty}` : null]
                .filter(Boolean)
                .join(', ');
            })
            .filter(Boolean)
            .join('; ');

          if (repairStep && materialSummary) {
            const existingNotes = String(repairStep.notes || '')
              .split('\n')
              .filter((line) => !line.startsWith('Repair materials:'))
              .join('\n')
              .trim();
            await db.update(travelerSteps)
              .set({
                notes: [existingNotes, `Repair materials: ${materialSummary}`].filter(Boolean).join('\n'),
              })
              .where(eq(travelerSteps.id, repairStep.id));
          }

          await db.insert(p2SerializedItemEvents).values({
            serializedItemId: item.id,
            barcode: item.barcode,
            eventType: 'NCR_REPAIR_MATERIAL_USED',
            toDepartment: 'Repair',
            toStageIndex: item.currentStageIndex,
            performedBy: 'Repair',
            notes: `Repair material traceability updated for RMA ${updated.rmaNumber}`,
            metadata: {
              rmaId: updated.id,
              rmaNumber: updated.rmaNumber,
              traceableMaterials,
            },
          });

          const previousMaterials = Array.isArray(existingRma.traceableMaterials)
            ? existingRma.traceableMaterials as Array<{ name?: string; partNumber?: string; lot?: string; qty?: string }>
            : [];
          const previousKeys = new Set(previousMaterials.map((material) =>
            [
              String(material.partNumber || '').trim(),
              String(material.name || '').trim(),
              String(material.lot || '').trim(),
              String(material.qty || '').trim(),
            ].join('|')
          ));

          for (const material of traceableMaterials as Array<{ name?: string; partNumber?: string; lot?: string; qty?: string }>) {
            const partNumber = String(material.partNumber || '').trim();
            if (!partNumber) continue;
            const materialKey = [
              partNumber,
              String(material.name || '').trim(),
              String(material.lot || '').trim(),
              String(material.qty || '').trim(),
            ].join('|');
            if (previousKeys.has(materialKey)) continue;
            const quantity = Number(material.qty || 0);
            await db.insert(inventoryTransactions).values({
              agPartNumber: partNumber,
              transactionType: 'issue',
              quantity: Number.isFinite(quantity) && quantity > 0 ? -quantity : 0,
              unitOfMeasure: 'EA',
              fromLocation: 'Inventory',
              toLocation: 'P2 Repair',
              referenceType: 'P2_NCR_REPAIR',
              referenceId: String(updated.id),
              notes: `Repair material used for ${item.serialNumber}: ${material.name || partNumber}`,
              performedBy: 'Repair',
              metadata: {
                rmaId: updated.id,
                rmaNumber: updated.rmaNumber,
                serializedItemId: item.id,
                serialNumber: item.serialNumber,
                materialName: material.name || null,
                materialPartNumber: partNumber,
                lot: material.lot || null,
                qty: material.qty || null,
              },
            });
          }
        }
      }

      // When RMA is marked complete, resolve the linked disposition
      if (status === 'complete' && updated.dispositionId) {
        const { p2NonconformingDispositions } = await import('../../schema');
        await db
          .update(p2NonconformingDispositions)
          .set({ resolved: true, resolvedAt: new Date(), updatedAt: new Date() })
          .where(eq(p2NonconformingDispositions.id, updated.dispositionId));
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update RMA' });
    }
  });

  // P2 Serialized Items routes (finalize, batch assign SKU/drawing)
  app.use('/api/p2/serialized-items', p2SerializedItemsRoutes);
  
  // Part routing management routes
  app.use('/api/part-routings', partRoutingsRoutes);
  app.use('/api/routing-templates', routingTemplatesRoutes);
  app.use('/api/engineering-control', engineeringControlRoutes);

  // Anodize job tracking (outside process)
  app.use('/api/anodize-jobs', anodizeJobsRoutes);

  // Routing operation sub-resources
  app.get('/api/routing-operations/:id/anodize-jobs', async (req: any, res: any) => {
    try {
      const jobs = await storage.getRoutingOperationAnodizeJobs(Number(req.params.id));
      res.json(jobs);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to get routing operation anodize jobs', message: err.message });
    }
  });

  // Travelers management routes (AS9100-compliant traveler execution)
  app.use('/api/travelers', travelersRoutes);
  // Traveler component associations standalone DELETE endpoint
  app.use('/api/traveler-component-associations', travelerComponentAssociationsRouter);
  
  // Material Lot management routes (AS9100-compliant material traceability)
  app.use('/api/material-lots', materialLotsRoutes);

  // MRP / Material Planning Engine
  app.use('/api/mrp', mrpRoutes);
  
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
  // Task #83 — Purchasing Controls
  app.use('/api/purchase-requisitions', purchaseRequisitionsRoutes);
  app.use('/api/far-flowdown-clauses', farFlowdownClausesRoutes);
  app.use('/api/vendor-debarment-checks', vendorDebarmentChecksRoutes);
  app.use('/api/contract-review', contractReviewRoutes);

  // Quote management routes
  app.use(quotesRoutes);

  // Cost Center management routes
  app.use(costCentersRoutes);

  // Cost Accounting routes
  app.use('/api/cost-accounting', costAccountingRoutes);
  app.use('/api/accounting/coa', chartOfAccountsRoutes);
  app.use('/api/accounting/event-matrix', accountingEventMatrixRoutes);
  app.use('/api/burden-rates', burdenRatesRoutes);
  app.use('/api/payroll-control', payrollControlRoutes);

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
  app.use('/api/qms/design-control', qmsDesignControlRoutes);
  app.use('/api/engineering-releases', postReleaseEngineeringReleasesRoutes);
  app.use('/api/qms/as9100-audit-readiness', auditReadinessRoutes);
  app.use('/api/qms/epoch-software-validation', epochSoftwareValidationRoutes);
  app.use('/api/engineering-releases', engineeringReleasesRoutes);

  // Asset Management routes
  app.use('/api/assets', assetManagementRoutes);

  // Work Orders — Consolidated: maintenance events + production WADs (EPOCH v9 spine)
  app.use('/api/work-orders', workOrdersRoutes);
  app.use('/api', wadRevisionsRoutes);

  // Production Control Templates — WAD Step 6 Template Library
  app.use('/api/production-control-templates', productionControlTemplatesRoutes);

  // AQL Sampling Chart routes
  app.use('/api/aql-sampling', aqlSamplingRoutes);

  // Audit System routes
  app.use('/api/audit', auditRoutes);
  app.use('/api/audit-ledger', auditLedgerRoutes);

  // Task #148 — Approval escalation engine
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/escalation-policies', escalationPoliciesRouter);
  app.use('/api/inventory-transaction-ledger', inventoryTransactionLedgerRoutes);
  app.use('/api/inventory-anomalies', inventoryAnomaliesRoutes);
  app.use('/api/digital-signatures', digitalSignaturesRoutes);
  app.use('/api/traceability', traceabilityRoutes);
  app.use('/api/inventory/cycle-counts', cycleCountsRoutes);

  // Media Library routes
  app.use('/api/media', mediaRoutes);

  // Generic object-storage upload endpoint (used by CNC dashboard for photos/tool images)
  {
    const cncUploadStorage = multer.memoryStorage();
    const cncUpload = multer({ storage: cncUploadStorage, limits: { fileSize: 20 * 1024 * 1024 } });
    app.post('/api/object-storage/upload', authenticateToken, cncUpload.single('file'), async (req: any, res: any) => {
      try {
        if (!req.file) return res.status(400).json({ error: 'No file received' });
        const provider = getFileStorageProvider();
        const objectPath = await provider.uploadBuffer({
          buffer: req.file.buffer,
          fileName: req.file.originalname || req.file.filename || 'upload',
          contentType: req.file.mimetype || 'application/octet-stream',
          scope: 'cnc-dashboard',
        });
        try {
          await provider.setPublicReadPolicy(objectPath, String(req.user?.id ?? 'system'));
        } catch (aclErr) {
          console.warn('[CNC Upload] ACL set failed (non-fatal):', aclErr);
        }
        res.json({ url: objectPath, key: objectPath, provider: provider.name });
      } catch (err: any) {
        console.error('[CNC Upload] Error:', err);
        res.status(500).json({ error: err.message || 'Upload failed' });
      }
    });
  }

  // Voice notes routes (uses sessionAwareAuth to preserve real user sessions over bypass)
  app.use('/api/voice-notes', sessionAwareAuth, voiceNotesRoutes);

  // EPOCH Copilot routes (ADMIN/OWNER only in Phase 1)
  app.use('/api/epoch-copilot', requireAdminOrOwner, epochCopilotRoutes);

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
  app.use('/api/storage', storageUploadRoutes);

  // Codebase chat routes - AI chat with codebase context
  registerCodebaseChatRoutes(app);

  // Process Runner integration routes - external timer app events
  registerProcessRunnerRoutes(app);

  // Time Clock integration routes - labor/time event ingestion
  registerTimeClockRoutes(app);

  // Customer Outreach Engine routes - deterministic coverage-based outreach
  registerOutreachEngineRoutes(app);

  // Controlled Documents (Master Document Register) routes
  app.use('/api/controlled-documents', controlledDocumentsRoutes);
  app.use('/api/controlled-document-reconciliation', controlledDocumentReconciliationRoutes);
  app.use('/api/design-control-form-templates', designControlFormTemplatesRoutes);
  app.use('/api/design-control', designControlProjectFormsRouter);
  app.use('/api/project-forms', projectFormsRoutes);
  app.use('/api', engineeringChangeRequestsRoutes);
  app.use('/api', changeControlRoutes);
  app.use('/api', engineeringChangeNoticesRoutes);
  app.use('/api/controlled-copies', controlledPrintedCopiesRoutes);
  app.use('/api', controlledCopyScopeRouter);
  app.use('/api', designHistoryFilesRoutes);

  // CMMC Secure Vault — classification management + immutable access audit log
  app.use('/api/vault', vaultRoutes);

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
  app.use('/api/p1-fulfillment', p1FulfillmentRoutes);
  if (process.env.NODE_ENV !== 'production') {
    app.use('/api/shipping-test', shippingTestRoutes);
  }

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

  // Marketing communications routes
  app.use('/api/marketing', marketingRoutes);

  // Internal messaging routes
  app.use('/api/internal-messages', internalMessagesRoutes);

  // Nonconformance tracking routes
  app.use('/api/nonconformance', nonconformanceRoutes);
  app.use('/api/non-conforming-items', nonConformingItemsRoutes);

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
  app.use('/api/pos', p1POQuantityAdjustmentsRoutes);
  app.use('/api/p1-customer-po-imports', p1CustomerPoImportsRoutes);
  app.use('/api/p2-demand', p2DemandQuantityRoutes);

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

  // Checklist Instance routes (KENTRO-pattern engine)
  app.use('/api/checklist-instances', checklistInstancesRoutes);

  // Production Forecast Engine routes (read-only)
  app.use('/api/forecast', forecastRoutes);

  // PM Control Center dashboard routes
  app.use('/api/pm-dashboard', pmDashboardRoutes);

  // Program Manufacturing Orchestration routes
  app.use('/api/program-manufacturing', programManufacturingRoutes);

  // P2 Projects routes
  app.use('/api/projects', projectsRoutes);

  // Project Closing (Lessons Learned) routes
  app.use('/api/projects/:projectId/closing', projectClosingsRoutes);

  // Quote Execution Feedback routes
  app.use('/api', quoteFeedbackRoutes);

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
  app.use('/api/training/certification-authorizations', certificationAuthorizationRoutes);

  // Certifications management routes
  app.use('/api/certifications', certificationsRoutes);

  // Global search routes
  app.use('/api', globalSearchRoutes);

  // Linked orders management routes
  app.use('/api/linked-orders', linkedOrdersRoutes);

  // Follow-up orders routes

  // Fillable PDF Templates routes
  app.use('/api/fillable-pdf-templates', fillablePdfTemplatesRoutes);

  // PDF Forms module routes (general-purpose fillable PDF forms)
  app.use('/api/pdf-forms', pdfFormsRoutes);

  // Accounting Prep routes (Phase 0 - QuickBooks Journal Entry Prep)
  app.use('/api/accounting-prep', accountingPrepRoutes);

  // Accounting Control Center - reimbursements, petty cash, owner expenses
  app.use('/api/accounting-control', accountingControlRoutes);

  // Improvement Notes - workflow improvement capture (DB-backed)
  app.use('/api/improvement-notes', authenticateToken, improvementNotesRoutes);

  // Cutting Table routes
  app.use('/api/cutting-table', cuttingTableRoutes);

  // Manufacturing Queue routes
  app.use('/api/manufacturing-queue', manufacturingQueueRoutes);

  // Allocation Requirements routes
  app.use('/api/allocation-requirements', allocationRequirementsRoutes);

  // Allocation Control routes (allocate from balance, reserve lot)
  app.use('/api/allocation-control', allocationControlRoutes);
  
  // Cutting Table Manufacturing Queue routes
  app.use('/api/cutting-table-mfg-queue', cuttingTableManufacturingQueueRoutes);

  // Cutting Documents routes
  app.use('/api/cutting-documents', cuttingDocumentsRoutes);

  // Executive Rundown routes (Glenn-only, access-restricted)
  app.use('/api/executive/rundown', executiveRundownRoutes);
  app.use('/api/move-forward', moveForwardRoutes);
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/widgets', widgetTypesRouter);
  app.use('/api/dashboards', dashboardsRouter);
  app.use('/api/units', unitsRouter);
  app.use('/api/material-intelligence', materialIntelligenceRoutes);
  app.use('/api/ar-invoices', arInvoicesRoutes);
  app.use('/api/ar-payments', arPaymentsRoutes);
  app.use('/api/payment-settlements', paymentSettlementsRoutes);
  app.use('/api/ar-payment-attachments', arPaymentAttachmentsRoutes);
  app.use('/api/ap-bills', apBillsRoutes);
  app.use('/api/permissions', permissionsRoutes);

  app.use('/api/control-tower', controlTowerRoutes);

  // Financial Review routes (monthly business review slide navigator)
  app.use('/api/financial-review', financialReviewRoutes);

  // Offline mutation replay endpoint
  app.use('/api/offline', offlineReplayRoutes);

  // Written Policies Library (DCAA acknowledgments + drift detection)
  app.use('/api/policies', policiesRoutes);

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
      const { testDatabaseConnection, getDatabaseTargetInfo } = await import('../../db');
      const { checkCriticalSchemaHealth } = await import('../../utils/schemaHealth');

      const dbConnected = await testDatabaseConnection();
      const schemaHealth = dbConnected ? await checkCriticalSchemaHealth() : null;
      const status = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        database: dbConnected ? 'connected' : 'disconnected',
        databaseTarget: getDatabaseTargetInfo(),
        criticalSchema: schemaHealth,
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

  // Legacy placeholder retained off the public route so the real handler below is reachable.
  app.post('/api/internal/legacy/push-to-layup-plugging-placeholder', async (req, res) => {
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
               quantity, due_date as "dueDate", unit_price as "unitPrice", total_price as "totalPrice",
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
        assignedToId, assignedToName, productionLeadId, productionLeadName,
        customerName: bodyCustomerName, poDate: bodyPoDate, status: bodyStatus,
        sourceQuoteId, projectId, projectName, contractReviewRole,
      } = req.body;
      
      // Use the customer-provided PO number — accept either field name
      const poNumber = customerPONumber || req.body.poNumber;
      if (!poNumber) {
        return res.status(400).json({ error: 'PO number is required' });
      }

      // Accept either dueDate (wizard) or expectedDelivery (manager form)
      const resolvedExpectedDelivery = dueDate || req.body.expectedDelivery || null;

      // Get customer info — may not exist when submitted from manager with customerId + customerName inline
      let customer = await storage.getP2CustomerByCustomerId(customerId);
      const resolvedCustomerName = customer?.customerName || bodyCustomerName || customerId;
      
      // Build the complete PO data with all required fields
      const poData = {
        poNumber,
        customerId: customer?.customerId || customerId,
        customerName: resolvedCustomerName,
        poDate: bodyPoDate || new Date().toISOString().split('T')[0],
        expectedDelivery: resolvedExpectedDelivery,
        status: bodyStatus || 'OPEN',
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
        sourceQuoteId: sourceQuoteId || null,
        contractReviewRole: contractReviewRole === 'primary' ? 'primary' : 'secondary',
        projectId: projectId || null,
        projectName: projectName || null,
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
            inventoryItemId: item.inventoryItemId || null,
            partNumber: item.partNumber,
            partName: item.description || item.partName || item.partNumber,
            quantity: item.quantity,
            dueDate: item.dueDate || null,
            unitPrice: item.unitPrice || 0,
            specifications: item.description || item.specifications || null,
            notes: item.notes || null,
          });
        }
      }

      let quoteReconciliation = null;
      if (sourceQuoteId) {
        const { reconcileCustomerPoToQuote } = await import('../services/quoteContractService');
        quoteReconciliation = await reconcileCustomerPoToQuote(po.id);
      }
      
      res.status(201).json({ ...po, quoteReconciliation });
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
      console.log('P2 PURCHASE ORDER UPDATE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      const poId = parseInt(id, 10);
      const body = req.body || {};

      if (body.contractReviewRole && !['primary', 'secondary'].includes(body.contractReviewRole)) {
        return res.status(400).json({
          error: 'contractReviewRole must be primary or secondary',
        });
      }

      const existingPO = await storage.getP2PurchaseOrder(poId);
      if (!existingPO) {
        return res.status(404).json({ error: 'PO not found' });
      }

      // STATE GUARD: Superseded revisions are permanent audit history - read-only
      if (existingPO.isCurrentRevision === false) {
        return res.status(403).json({
          error: 'This PO has been superseded by a newer revision and cannot be modified',
          isCurrentRevision: false,
        });
      }

      // STATE GUARD: Check if PO is locked - prevent edits to locked POs
      if (existingPO.lockedAt && body.isRevisionUpdate !== true) {
        return res.status(403).json({
          error: 'This PO has been locked and cannot be modified',
          lockedAt: existingPO.lockedAt,
          lockedBy: existingPO.lockedBy,
        });
      }

      // STATE GUARD: Cannot modify CLOSED or CANCELED POs
      if (existingPO.status === 'CLOSED' || existingPO.status === 'CANCELED') {
        return res.status(400).json({
          error: `Cannot modify a ${existingPO.status} PO`,
          currentStatus: existingPO.status,
        });
      }

      // STATE GUARD: Cannot move to CLOSED unless BOM is configured
      if (body.status === 'CLOSED' && !existingPO.bomConfigured) {
        return res.status(400).json({
          error: 'Cannot close PO - BOM has not been configured',
          guard: 'BOM_REQUIRED',
        });
      }

      const customerId = body.customerId || existingPO.customerId;
      const customer = customerId ? await storage.getP2CustomerByCustomerId(customerId) : null;
      const poData = {
        poNumber: body.customerPONumber || body.poNumber || existingPO.poNumber,
        customerId: customer?.customerId || customerId,
        customerName: customer?.customerName || body.customerName || existingPO.customerName,
        poDate: body.poDate || existingPO.poDate || new Date().toISOString().split('T')[0],
        expectedDelivery: body.dueDate || body.expectedDelivery || existingPO.expectedDelivery || null,
        status: body.status || existingPO.status || 'OPEN',
        notes: body.notes ?? body.toleranceNotes ?? existingPO.notes ?? null,
        toleranceAuthorizerId: body.toleranceAuthorizerId || null,
        toleranceAuthorizerName: body.toleranceAuthorizerName || null,
        toleranceNotes: body.toleranceNotes ?? body.notes ?? null,
        assignedToId: body.assignedToId && body.assignedToId !== 'none' ? parseInt(String(body.assignedToId)) : null,
        assignedToName: body.assignedToName || null,
        productionLeadId: body.productionLeadId && body.productionLeadId !== 'none' ? parseInt(String(body.productionLeadId)) : null,
        productionLeadName: body.productionLeadName || null,
        sourceQuoteId: body.sourceQuoteId || existingPO.sourceQuoteId || null,
        contractReviewRole: body.contractReviewRole === 'primary' ? 'primary' : 'secondary',
        projectId: body.projectId || null,
        projectName: body.projectName || null,
      };

      const po = await storage.updateP2PurchaseOrder(poId, poData);

      if (Array.isArray(body.lineItems)) {
        const existingItems = await storage.getP2PurchaseOrderItems(poId);
        const existingById = new Map(existingItems.map((item: any) => [Number(item.id), item]));
        const seenItemIds = new Set<number>();

        for (const item of body.lineItems) {
          const itemId = Number(item.id);
          const itemData = {
            poId,
            inventoryItemId: item.inventoryItemId || null,
            partNumber: item.partNumber,
            partName: item.description || item.partName || item.partNumber,
            quantity: Number(item.quantity) || 1,
            dueDate: item.dueDate || null,
            unitPrice: Number(item.unitPrice) || 0,
            specifications: item.description || item.specifications || null,
            notes: item.notes || null,
          };

          if (itemId && existingById.has(itemId)) {
            seenItemIds.add(itemId);
            await storage.updateP2PurchaseOrderItem(itemId, itemData);
          } else {
            const created = await storage.createP2PurchaseOrderItem(itemData);
            seenItemIds.add(created.id);
          }
        }

        for (const existingItem of existingItems) {
          if (!seenItemIds.has(Number(existingItem.id))) {
            try {
              await storage.deleteP2PurchaseOrderItem(existingItem.id);
            } catch (deleteError) {
              console.warn('Skipped deleting revised PO item with downstream references:', existingItem.id, deleteError);
            }
          }
        }
      }

      if (body.isRevisionUpdate === true) {
        const revisionProjectId = body.projectId || existingPO.projectId || null;
        const revisionLineItems = Array.isArray(body.lineItems) ? body.lineItems : [];
        if (revisionProjectId && revisionLineItems.length > 0) {
          const { pool: dbPool } = await import('../../db');
          const firstLine = revisionLineItems[0] || {};
          const revisedPartNumber = String(firstLine.partNumber || firstLine.sku || '').trim() || existingPO.poNumber;
          const revisedDescription = String(firstLine.description || firstLine.partName || revisedPartNumber).trim();
          const revisedQuantity = revisionLineItems.reduce(
            (sum: number, item: any) => sum + (Number(item.quantity) || 0),
            0
          ) || 1;
          const revisedDueDate = body.dueDate || body.expectedDelivery || null;
          const revisedPartNumbers = Array.from(new Set(
            revisionLineItems
              .map((item: any) => String(item.partNumber || item.sku || '').trim())
              .filter(Boolean)
          ));

          const canonicalRows = await dbPool.query(
            `SELECT
               wo.id::text AS id,
               wo.work_order_number AS "workOrderNumber",
               wo.status,
               COUNT(t.id)::int AS "travelerCount"
             FROM production_work_orders wo
             LEFT JOIN travelers t ON t.production_work_order_id = wo.id
             WHERE wo.project_id = $1::uuid
             GROUP BY wo.id
             ORDER BY
               (COUNT(t.id) > 0) DESC,
               (COALESCE(UPPER(wo.status), '') NOT IN ('CANCELLED', 'CANCELED', 'COMPLETE', 'COMPLETED', 'CLOSED')) DESC,
               wo.updated_at DESC NULLS LAST,
               wo.created_at DESC NULLS LAST
             LIMIT 1`,
            [revisionProjectId]
          );
          const canonicalWad = canonicalRows.rows[0];

          if (canonicalWad?.id) {
            await dbPool.query(
              `UPDATE production_work_orders
               SET part_number = $2,
                   description = $3,
                   quantity = $4,
                   due_date = $5::date,
                   wizard_data = jsonb_set(
                     COALESCE(wizard_data, '{}'::jsonb),
                     '{poRevisionSync}',
                     jsonb_build_object(
                       'poId', $6::int,
                       'poNumber', $7::text,
                       'syncedAt', NOW()
                     ),
                     true
                   ),
                   updated_at = NOW()
               WHERE id = $1::uuid`,
              [
                canonicalWad.id,
                revisedPartNumber,
                revisedDescription,
                revisedQuantity,
                revisedDueDate,
                poId,
                po.poNumber,
              ]
            );

            if (revisedPartNumbers.length > 0) {
              const duplicateRows = await dbPool.query(
                `UPDATE production_work_orders wo
                 SET status = 'CANCELLED',
                     wizard_data = jsonb_set(
                       COALESCE(wizard_data, '{}'::jsonb),
                       '{cancelledByPoRevisionSync}',
                       jsonb_build_object(
                         'canonicalWorkOrderId', $1::text,
                         'poId', $3::int,
                         'syncedAt', NOW()
                       ),
                       true
                     ),
                     updated_at = NOW()
                 WHERE wo.project_id = $2::uuid
                   AND wo.id <> $1::uuid
                   AND TRIM(wo.part_number) = ANY($4::text[])
                   AND COALESCE(UPPER(wo.status), '') NOT IN ('CANCELLED', 'CANCELED', 'COMPLETE', 'COMPLETED', 'CLOSED')
                   AND NOT EXISTS (
                     SELECT 1 FROM travelers t WHERE t.production_work_order_id = wo.id
                   )
                 RETURNING wo.id::text AS id`,
                [canonicalWad.id, revisionProjectId, poId, revisedPartNumbers]
              );
              const duplicateWadIds = duplicateRows.rows.map((row: any) => String(row.id)).filter(Boolean);
              if (duplicateWadIds.length > 0) {
                await dbPool.query(
                  `UPDATE manufacturing_queue
                   SET source_id = $1,
                       updated_at = NOW()
                   WHERE source_type = 'production_work_order'
                     AND source_id = ANY($2::text[])`,
                  [canonicalWad.id, duplicateWadIds]
                );
              }
            }
          }
        }
      }

      console.log('Updated P2 purchase order:', po.id);
      res.json(po);
    } catch (_error) {
      console.error('P2 purchase order update bypass error:', _error);
      res.status(500).json({
        _error: 'Failed to update P2 purchase order via bypass route',
        message: _error instanceof Error ? _error.message : 'Unknown error',
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

      // STATE GUARD: Superseded revisions are permanent audit history — cannot be unlocked
      const poToUnlock = await storage.getP2PurchaseOrder(parseInt(id));
      if (poToUnlock && poToUnlock.isCurrentRevision === false) {
        return res.status(403).json({
          error: 'This PO has been superseded by a newer revision and cannot be unlocked',
          isCurrentRevision: false,
        });
      }
      
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

  // Create a formal revision of a locked P2 PO
  // Validates source is locked & not cancelled, creates new PO row with revision tracking,
  // marks previous PO as not-current, copies wizard-submitted line items, returns new PO.
  app.post('/api/p2-purchase-orders-bypass/:id/revise', softAuth, async (req, res) => {
    try {
      const { pool } = await import('../../db');
      const { storage } = await import('../../storage');
      const sourceId = parseInt(req.params.id);

      // 1. Load source PO — all further logic uses its fields as defaults
      const sourcePO = await storage.getP2PurchaseOrder(sourceId);
      if (!sourcePO) {
        return res.status(404).json({ error: 'P2 Purchase Order not found' });
      }
      if (!sourcePO.lockedAt) {
        return res.status(400).json({ error: 'Only locked POs can be revised. Lock the PO first.' });
      }
      if (sourcePO.status === 'CANCELED' || sourcePO.status === 'CANCELLED') {
        return res.status(400).json({ error: 'Cannot revise a cancelled PO' });
      }
      if (sourcePO.isCurrentRevision === false) {
        return res.status(400).json({ error: 'Cannot revise a superseded PO — revise the current revision instead.' });
      }

      const {
        customerId, customerPONumber, dueDate,
        toleranceAuthorizerId, toleranceAuthorizerName, toleranceNotes, notes, lineItems,
        assignedToId, assignedToName, productionLeadId, productionLeadName,
        customerName: bodyCustomerName, poDate: bodyPoDate,
        sourceQuoteId, projectId, projectName, contractReviewRole,
      } = req.body;

      const poNumber = customerPONumber || req.body.poNumber || sourcePO.poNumber;
      const resolvedExpectedDelivery = dueDate || req.body.expectedDelivery || sourcePO.expectedDelivery || null;

      // Resolve customer — fall back to source PO when wizard didn't change it
      const resolvedCustomerId = customerId || sourcePO.customerId;
      const resolvedCustomerName = bodyCustomerName || sourcePO.customerName;

      // 2. Chain back to root of revision family
      const rootParentId = sourcePO.parentPoId || sourcePO.id;

      // 3. Obtain a single dedicated client so BEGIN/COMMIT are on the same connection
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Lock all family rows first (FOR UPDATE on non-aggregate is valid),
        // then compute max revision number from the now-locked set.
        await client.query(
          `SELECT id FROM p2_purchase_orders WHERE id = $1 OR parent_po_id = $1 FOR UPDATE`,
          [rootParentId]
        );
        const familyResult = await client.query(
          `SELECT COALESCE(MAX(revision_number), 0) AS max_rev
           FROM p2_purchase_orders
           WHERE id = $1 OR parent_po_id = $1`,
          [rootParentId]
        );
        const nextRevisionNumber = parseInt(familyResult.rows[0]?.max_rev || '0') + 1;

        // New PO number: strip any existing -RX suffix then append next letter (A=1, B=2, …)
        const basePONumber = poNumber.replace(/-R[A-Z]+$/, '');
        const revisionLetter = String.fromCharCode(64 + nextRevisionNumber);
        const newPONumber = `${basePONumber}-R${revisionLetter}`;

        // Mark all family POs as superseded
        await client.query(
          `UPDATE p2_purchase_orders
           SET is_current_revision = false, updated_at = NOW()
           WHERE id = $1 OR parent_po_id = $1`,
          [rootParentId]
        );

        // 4. Insert new revision: start from source PO fields, overlay wizard edits
        const resolvedNotes = notes !== undefined ? notes : sourcePO.notes;
        const resolvedToleranceAuthorizerId = toleranceAuthorizerId !== undefined ? (toleranceAuthorizerId || null) : (sourcePO.toleranceAuthorizerId || null);
        const resolvedToleranceAuthorizerName = toleranceAuthorizerName !== undefined ? (toleranceAuthorizerName || null) : (sourcePO.toleranceAuthorizerName || null);
        const resolvedToleranceNotes = toleranceNotes !== undefined ? (toleranceNotes || null) : (sourcePO.toleranceNotes || null);
        const resolvedSourceQuoteId = sourceQuoteId !== undefined ? (sourceQuoteId || null) : (sourcePO.sourceQuoteId || null);
        const resolvedContractReviewRole = contractReviewRole === 'primary' ? 'primary' : (contractReviewRole === 'secondary' ? 'secondary' : (sourcePO.contractReviewRole || 'secondary'));
        const resolvedAssignedToId = assignedToId !== undefined
          ? (assignedToId && assignedToId !== 'none' ? parseInt(String(assignedToId)) : null)
          : (sourcePO.assignedToId || null);
        const resolvedAssignedToName = assignedToName !== undefined ? (assignedToName || null) : (sourcePO.assignedToName || null);
        const resolvedProductionLeadId = productionLeadId !== undefined
          ? (productionLeadId && productionLeadId !== 'none' ? parseInt(String(productionLeadId)) : null)
          : (sourcePO.productionLeadId || null);
        const resolvedProductionLeadName = productionLeadName !== undefined ? (productionLeadName || null) : (sourcePO.productionLeadName || null);
        const resolvedProjectId = projectId !== undefined ? (projectId || null) : (sourcePO.projectId || null);
        const resolvedProjectName = projectName !== undefined ? (projectName || null) : (sourcePO.projectName || null);

        const insertResult = await client.query(`
          INSERT INTO p2_purchase_orders (
            po_number, customer_id, customer_name, po_date, expected_delivery,
            status, notes, attachments,
            tolerance_authorizer_id, tolerance_authorizer_name, tolerance_notes,
            bom_configured, source_quote_id, contract_review_role,
            created_by_id, created_by_name,
            assigned_to_id, assigned_to_name,
            bom_owner_id, bom_owner_name,
            scheduled_by_id, scheduled_by_name,
            production_lead_id, production_lead_name,
            project_id, project_name,
            revision_number, parent_po_id, is_current_revision, revised_at,
            security_classification, cui_category, itar_category,
            export_control_jurisdiction, customer_file_access_rule
          ) VALUES (
            $1, $2, $3, $4, $5,
            'OPEN', $6, '[]'::jsonb,
            $7, $8, $9,
            false, $10, $11,
            $12, $13,
            $14, $15,
            $16, $17,
            $18, $19,
            $20, $21,
            $22, $23,
            $24, $25, true, NOW(),
            $26, $27, $28,
            $29, $30
          )
          RETURNING id, po_number AS "poNumber"
        `, [
          newPONumber,
          resolvedCustomerId,
          resolvedCustomerName,
          bodyPoDate || sourcePO.poDate || new Date().toISOString().split('T')[0],
          resolvedExpectedDelivery,
          resolvedNotes,
          resolvedToleranceAuthorizerId,
          resolvedToleranceAuthorizerName,
          resolvedToleranceNotes,
          resolvedSourceQuoteId,
          resolvedContractReviewRole,
          sourcePO.createdById || null,
          sourcePO.createdByName || null,
          resolvedAssignedToId,
          resolvedAssignedToName,
          sourcePO.bomOwnerId || null,
          sourcePO.bomOwnerName || null,
          sourcePO.scheduledById || null,
          sourcePO.scheduledByName || null,
          resolvedProductionLeadId,
          resolvedProductionLeadName,
          resolvedProjectId,
          resolvedProjectName,
          nextRevisionNumber,
          rootParentId,
          sourcePO.securityClassification || 'internal',
          sourcePO.cuiCategory || null,
          sourcePO.itarCategory || null,
          sourcePO.exportControlJurisdiction || null,
          sourcePO.customerFileAccessRule || 'authenticated',
        ]);

        const newPO = insertResult.rows[0];

        // 5. Determine line items: use wizard payload if provided, otherwise copy source items.
        // Preserve the source item id when possible so existing P2 production rows
        // move to the new revision instead of looking "missing" and being generated again.
        let itemsToInsert: Array<{
          sourceItemId: number | null;
          demandLineIdentity: string | null;
          partNumber: string;
          partName: string;
          quantity: number;
          dueDate: string | null;
          unitPrice: number;
          inventoryItemId: number | null;
        }> = [];
        const sourceItemsResult = await client.query(
          `SELECT id, part_number, part_name, quantity, due_date, unit_price, inventory_item_id, demand_line_identity
           FROM p2_purchase_order_items WHERE po_id = $1
           ORDER BY id`,
          [sourceId]
        );
        const sourceItems = sourceItemsResult.rows;
        if (lineItems && Array.isArray(lineItems) && lineItems.length > 0) {
          const takeSourceMatch = (item: any) => {
            const explicitId = Number(item.sourceItemId ?? item.source_item_id ?? item.id);
            if (Number.isInteger(explicitId) && sourceItems.some((source: any) => Number(source.id) === explicitId)) {
              return explicitId;
            }
            return null;
          };

          itemsToInsert = lineItems.map((item: any) => {
            const sourceItemId = takeSourceMatch(item);
            const sourceItem = sourceItems.find((source: any) => Number(source.id) === sourceItemId);
            return {
              sourceItemId,
              demandLineIdentity: sourceItem?.demand_line_identity ?? null,
              partNumber: item.partNumber,
              partName: item.description || item.partName || item.partNumber,
              quantity: item.quantity,
              dueDate: item.dueDate || null,
              unitPrice: item.unitPrice || 0,
              inventoryItemId: item.inventoryItemId || null,
            };
          });
        } else {
          // Fall back to copying source PO's items exactly
          itemsToInsert = sourceItems.map((row: any) => ({
            sourceItemId: Number(row.id),
            demandLineIdentity: row.demand_line_identity,
            partNumber: row.part_number,
            partName: row.part_name,
            quantity: row.quantity,
            dueDate: row.due_date || null,
            unitPrice: parseFloat(row.unit_price) || 0,
            inventoryItemId: row.inventory_item_id || null,
          }));
        }

        // Insert line items within the same transaction using the dedicated client
        const itemIdMap = new Map<number, number>();
        for (const item of itemsToInsert) {
          const totalPrice = item.quantity * item.unitPrice;
          const insertedItem = await client.query(
            `INSERT INTO p2_purchase_order_items (po_id, part_number, part_name, quantity, due_date, unit_price, total_price, inventory_item_id, demand_line_identity)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::uuid,gen_random_uuid()))
             RETURNING id`,
            [newPO.id, item.partNumber, item.partName, item.quantity, item.dueDate || null, item.unitPrice, totalPrice, item.inventoryItemId, item.demandLineIdentity]
          );
          const newItemId = Number(insertedItem.rows[0]?.id);
          if (item.sourceItemId && Number.isInteger(newItemId)) {
            itemIdMap.set(item.sourceItemId, newItemId);
          }
        }

        for (const [oldItemId, newItemId] of itemIdMap.entries()) {
          await client.query(
            `UPDATE p2_production_orders
                SET p2_po_id = $1,
                    p2_po_item_id = $2,
                    updated_at = NOW()
              WHERE p2_po_id = $3
                AND p2_po_item_id = $4`,
            [newPO.id, newItemId, sourcePO.id, oldItemId]
          );

          await client.query(
            `UPDATE p2_serialized_items
                SET po_id = $1,
                    po_item_id = $2,
                    po_number = $3,
                    updated_at = NOW()
              WHERE po_id = $4
                AND po_item_id = $5`,
            [newPO.id, newItemId, newPONumber, sourcePO.id, oldItemId]
          );

          await client.query(
            `UPDATE manufacturing_queue
                SET p2_po_id = $1,
                    p2_po_item_id = $2,
                    updated_at = NOW()
              WHERE p2_po_id = $3
                AND p2_po_item_id = $4`,
            [newPO.id, newItemId, sourcePO.id, oldItemId]
          );
        }

        if (resolvedProjectId) {
          await client.query(
            `UPDATE projects
                SET po_id = $1,
                    updated_at = NOW()
              WHERE id = $2::uuid
                AND (po_id = $3 OR po_id IS NULL)`,
            [newPO.id, resolvedProjectId, sourcePO.id]
          );

          await client.query(
            `UPDATE project_steps
                SET linked_p2_order_id = $1,
                    updated_at = NOW()
              WHERE project_id = $2::uuid
                AND step_type = 'p2_order'
                AND (linked_p2_order_id = $3 OR linked_p2_order_id IS NULL)`,
            [newPO.id, resolvedProjectId, sourcePO.id]
          );
        }

        await client.query('COMMIT');

        const finalPO = await storage.getP2PurchaseOrder(newPO.id);
        console.log(`✏️ Created P2 PO revision: ${newPONumber} (Rev ${nextRevisionNumber}) from PO #${sourceId}`);
        res.status(201).json(finalPO);
      } catch (txErr: any) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error('P2 PO revise error:', error);
      res.status(500).json({ error: 'Failed to create PO revision', message: error?.message });
    }
  });

  // List all revisions in a PO's family (same root parentPoId)
  app.get('/api/p2-purchase-orders-bypass/:id/revisions', softAuth, async (req, res) => {
    try {
      const { pool } = await import('../../db');
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.id);

      const po = await storage.getP2PurchaseOrder(poId);
      if (!po) {
        return res.status(404).json({ error: 'P2 Purchase Order not found' });
      }

      const rootParentId = po.parentPoId || po.id;
      const result = await pool.query(`
        SELECT id, po_number as "poNumber", revision_number as "revisionNumber",
               parent_po_id as "parentPoId", is_current_revision as "isCurrentRevision",
               status, locked_at as "lockedAt", revised_at as "revisedAt",
               revised_by as "revisedBy", created_at as "createdAt"
        FROM p2_purchase_orders
        WHERE id = $1 OR parent_po_id = $1
        ORDER BY revision_number ASC
      `, [rootParentId]);

      res.json(result.rows);
    } catch (error: any) {
      console.error('P2 PO revisions error:', error);
      res.status(500).json({ error: 'Failed to fetch PO revisions' });
    }
  });

  // SECURITY: softAuth enforces authentication in production
  app.delete('/api/p2-purchase-orders-bypass/:id', softAuth, async (req, res) => {
    try {
      console.log('🔧 P2 PURCHASE ORDER DELETE BYPASS ROUTE CALLED');
      const { storage } = await import('../../storage');
      const { id } = req.params;
      
      // Check if PO is locked or superseded - prevent deleting
      const existingPO = await storage.getP2PurchaseOrder(parseInt(id));
      if (existingPO?.isCurrentRevision === false) {
        return res.status(403).json({
          error: 'This PO has been superseded by a newer revision and cannot be deleted',
          isCurrentRevision: false,
        });
      }
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
      const { db } = await import('../../db');
      const { approvalRequestHistory, approvalRequests, employees, p2ProductionChanges, users } = await import('../../schema');
      const { and, eq } = await import('drizzle-orm');
      const { cancel, openRequest } = await import('../services/escalationService');
      const { notificationManager } = await import('../services/notificationManager');
      const roleLabels: Record<string, string> = {
        BUSINESS_MANAGER: 'Business Manager',
        PURCHASING_QUALITY_MANAGER: 'Purchasing / Quality Manager',
        PRODUCTION_MANAGER: 'Production Manager',
        CUSTOMER: 'Customer',
      };
      const rawAssignments = Array.isArray(req.body?.approvalAssignments)
        ? req.body.approvalAssignments
        : [];
      const requiredRawAssignments = rawAssignments.filter((assignment: any) => assignment?.required === true);

      if (requiredRawAssignments.length === 0) {
        return res.status(400).json({ error: 'At least one required signer must be selected for a production change form.' });
      }

      const normalizedAssignments: Array<{
        roleKey: string;
        roleLabel: string;
        required: boolean;
        employeeId: number | null;
        employeeName: string | null;
        userId: number | null;
      }> = [];

      for (const raw of rawAssignments) {
        const roleKey = String(raw?.roleKey ?? '').trim();
        if (!roleLabels[roleKey]) continue;
        const employeeId = raw?.employeeId == null ? null : Number(raw.employeeId);
        const normalized = {
          roleKey,
          roleLabel: roleLabels[roleKey],
          required: raw?.required === true,
          employeeId: Number.isInteger(employeeId) && employeeId > 0 ? employeeId : null,
          employeeName: null as string | null,
          userId: null as number | null,
        };

        if (normalized.required && normalized.employeeId == null) {
          return res.status(400).json({ error: `${normalized.roleLabel} must be assigned to an active EPOCH user.` });
        }

        if (normalized.employeeId != null) {
          const [assignee] = await db
            .select({
              employeeId: employees.id,
              employeeName: employees.name,
              userId: users.id,
            })
            .from(employees)
            .leftJoin(users, and(eq(users.employeeId, employees.id), eq(users.isActive, true)))
            .where(eq(employees.id, normalized.employeeId))
            .limit(1);

          if (!assignee) {
            return res.status(404).json({ error: `${normalized.roleLabel} assignee not found.` });
          }
          if (normalized.required && assignee.userId == null) {
            return res.status(400).json({ error: `${normalized.roleLabel} assignee does not have an active EPOCH user account.` });
          }
          normalized.employeeName = assignee.employeeName;
          normalized.userId = assignee.userId ?? null;
        }

        normalizedAssignments.push(normalized);
      }

      const requiredAssignments = normalizedAssignments.filter((assignment) => assignment.required);
      if (requiredAssignments.length === 0) {
        return res.status(400).json({ error: 'At least one valid required signer must be selected for a production change form.' });
      }
      const primaryApprover = requiredAssignments[0];
      const actor = (req as any).user;
      const requestedByDisplayName =
        actor?.username ||
        actor?.email ||
        req.body?.submittedByName ||
        'P2 Control Center';

      const change = await storage.createP2ProductionChange({
        ...req.body,
        approverEmployeeId: primaryApprover.employeeId,
        approverEmployeeName: primaryApprover.employeeName,
        approvalAssignments: normalizedAssignments,
      });

      const approvalIdsToCancel: string[] = [];
      try {
        const requiredActions = Array.isArray((change as any).requiredActions) ? (change as any).requiredActions : [];
        const assignedApprovals = [];

        for (const assignment of requiredAssignments) {
          if (assignment.userId == null) {
            throw new Error(`${assignment.roleLabel} must be assigned to an active EPOCH user.`);
          }
          const approval = await openRequest({
            requestType: 'PRODUCTION_CHANGE_FORM',
            payload: {
              changeId: change.id,
              changeNumber: change.changeNumber,
              changeType: change.changeType,
              scope: change.scope,
              partNumber: change.partNumber,
              poId: change.poId,
              routingId: change.routingId,
              currentRevision: change.currentRevision,
              proposedRevision: (change as any).proposedRevision,
              proposedChange: change.proposedChange,
              reason: change.reason,
              riskAssessment: change.riskAssessment,
              affectedDocuments: (change as any).affectedDocuments ?? [],
              requiredActions,
              approvalRoleKey: assignment.roleKey,
              approvalRoleLabel: assignment.roleLabel,
              approvalAssignments: normalizedAssignments,
              requiresCustomerApproval: change.requiresCustomerApproval,
              implementationRequired: (change as any).implementationRequired ?? false,
            },
            subjectType: 'p2_production_change',
            subjectId: change.id,
            requestedByUserId: actor?.id ?? null,
            requestedByDisplayName,
            summary: `${change.changeNumber} ${assignment.roleLabel} signature review needed.`,
          });
          approvalIdsToCancel.push(approval.id);

          const [assignedApproval] = await db
            .update(approvalRequests)
            .set({
              currentApproverUserId: assignment.userId,
              updatedAt: new Date(),
            })
            .where(eq(approvalRequests.id, approval.id))
            .returning();
          assignedApprovals.push(assignedApproval);

          await db.insert(approvalRequestHistory).values({
            approvalRequestId: approval.id,
            event: 'ASSIGNED',
            fromLevel: approval.escalationLevel,
            toLevel: approval.escalationLevel,
            fromStatus: approval.status,
            toStatus: approval.status,
            actorUserId: actor?.id ?? null,
            actorDisplayName: requestedByDisplayName,
            notes: `${assignment.roleLabel} production change signature assigned to ${assignment.employeeName}`,
            metadata: {
              roleKey: assignment.roleKey,
              roleLabel: assignment.roleLabel,
              assignedEmployeeId: assignment.employeeId,
              assignedUserId: assignment.userId,
              assignedEmployeeName: assignment.employeeName,
              changeNumber: change.changeNumber,
            },
          });

          notificationManager.sendToUsers([assignment.userId], {
            type: 'APPROVAL_REQUEST',
            title: `${assignment.roleLabel} signature needed: ${change.changeNumber}`,
            message: `${requestedByDisplayName} assigned you to review and sign ${change.changeNumber}.`,
            data: {
              approvalRequestId: approval.id,
              requestType: 'PRODUCTION_CHANGE_FORM',
              subjectType: 'p2_production_change',
              subjectId: change.id,
              changeNumber: change.changeNumber,
              roleKey: assignment.roleKey,
              roleLabel: assignment.roleLabel,
            },
            timestamp: new Date().toISOString(),
          });
        }

        const updatedChange = await storage.updateP2ProductionChange(change.id, {
          approvalRequestId: approvalIdsToCancel[0] ?? null,
          approvalRequestIds: approvalIdsToCancel,
          status: 'SUBMITTED',
        } as any);
        return res.status(201).json({ ...updatedChange, approvalRequests: assignedApprovals });
      } catch (approvalError) {
        for (const approvalIdToCancel of approvalIdsToCancel) {
          try {
            await cancel(
              approvalIdToCancel,
              { userId: actor?.id ?? null, displayName: requestedByDisplayName, isPrivilegedOverride: true },
              `Cancelled because PCF ${change.changeNumber} creation did not complete.`,
            );
          } catch (cancelError: any) {
            console.warn('Failed to cancel incomplete PCF approval request:', cancelError?.message ?? cancelError);
          }
        }
        await db.delete(p2ProductionChanges).where(eq(p2ProductionChanges.id, change.id));
        throw approvalError;
      }
    } catch (error: any) {
      if (error?.code === 'NO_POLICY') {
        return res.status(500).json({ error: 'Production change approval policy is not installed. Run migrations and try again.' });
      }
      console.error('Error creating production change:', error);
      res.status(500).json({ error: 'Failed to create production change' });
    }
  });

  app.post('/api/p2/changes/:id/approve', softAuth, async (req, res) => {
    res.status(409).json({
      error: 'LEGACY_PCR_DECISION_DISABLED',
      message:
        'PCR approval requires the impact-based Quality Action workflow and cannot be completed through the legacy endpoint.',
      controlledEndpoint: `/api/change-control/pcrs/${req.params.id}/decisions`,
    });
  });

  app.post('/api/p2/changes/:id/reject', softAuth, async (req, res) => {
    res.status(409).json({
      error: 'LEGACY_PCR_DECISION_DISABLED',
      message:
        'PCR disposition requires an authenticated Quality Action transition with a reason.',
      controlledEndpoint: `/api/change-control/pcrs/${req.params.id}/actions/deny`,
    });
  });

  app.put('/api/p2/changes/:id', softAuth, async (req, res) => {
    res.status(409).json({
      error: 'LEGACY_PCR_MUTATION_DISABLED',
      message:
        'Controlled PCR fields and lifecycle state must be changed through the Quality Action workflow.',
      controlledEndpoint: `/api/change-control/pcrs/${req.params.id}/actions/:action`,
    });
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

  function normalizeP2ControlDepartment(department: unknown): string {
    const raw = String(department || '').trim();
    if (!raw) return '';

    const key = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
    const canonical: Record<string, string> = {
      'pending layup': 'Pending Layup',
      layup: 'Layup',
      'assemble disassembly': 'Assemble/Disassembly',
      'assembly disassembly': 'Assemble/Disassembly',
      assembly: 'Assemble/Disassembly',
      cnc: 'CNC',
      finish: 'Finish',
      paint: 'Paint',
      'final qc': 'Final QC',
      qc: 'Final QC',
      shipping: 'Shipping',
      completed: 'Completed',
      complete: 'Completed',
      'cutting table': 'Cutting Table',
    };

    return canonical[key] || raw;
  }

  async function applyTravelerStateToP2Items(items: any[]): Promise<any[]> {
    if (!items.length) return items;

    const getSerializedKeys = (item: any) => [
      item.serialNumber,
      item.serial_number,
      item.barcode,
      item.travelerBarcode,
      item.traveler_barcode,
    ]
      .map((value) => String(value ?? '').trim().toLowerCase())
      .filter(Boolean);

    const serials = [...new Set(
      items.flatMap(getSerializedKeys)
    )];
    if (!serials.length) return items;

    const { pool: dbPool } = await import('../../db');
    const travelerStateRows = await dbPool.query(
      `WITH traveler_keys AS (
         SELECT
           LOWER(TRIM(key_value)) AS serial,
           t.status,
           t.off_system_completion_link IS NOT NULL AS is_off_system_completion,
           t.traveler_number,
           t.updated_at,
           active_step.department_name,
           active_step.started_at
         FROM travelers t
         LEFT JOIN LATERAL (
           SELECT ts.department_name, ts.started_at
           FROM traveler_steps ts
           WHERE ts.traveler_id = t.id
             AND UPPER(ts.status) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED')
           ORDER BY ts.step_number ASC
           LIMIT 1
         ) active_step ON true
         CROSS JOIN LATERAL (
           VALUES (t.serial_number), (t.lot_number)
         ) AS key_values(key_value)
         WHERE key_value IS NOT NULL
           AND TRIM(key_value) <> ''
           AND LOWER(TRIM(key_value)) = ANY($1::text[])
           AND UPPER(t.status) IN ('IN_PROGRESS', 'COMPLETED')
       )
       SELECT DISTINCT ON (serial)
         serial,
         t.status,
         t.is_off_system_completion AS "isOffSystemCompletion",
         t.traveler_number AS "travelerNumber",
         t.updated_at AS "updatedAt",
         t.department_name AS "activeDepartment",
         t.started_at AS "startedAt"
       FROM traveler_keys t
       ORDER BY serial,
         CASE WHEN UPPER(t.status) = 'COMPLETED' AND t.is_off_system_completion THEN 0 ELSE 1 END,
         CASE WHEN UPPER(t.status) = 'IN_PROGRESS' THEN 0 ELSE 1 END,
         t.updated_at DESC NULLS LAST`,
      [serials]
    );
    const rows = (travelerStateRows as any).rows ?? travelerStateRows;
    const travelerBySerial = new Map<string, any>(
      rows.map((row: any) => [row.serial, row])
    );

    return items.map((item: any) => {
      const serializedStatus = String(item.status || item.productionStatus || item.production_status || '').toUpperCase();
      if (serializedStatus && serializedStatus !== 'ACTIVE') {
        return item;
      }

      const travelerState = getSerializedKeys(item)
        .map((key) => travelerBySerial.get(key))
        .find(Boolean);
      if (!travelerState) return item;

      const travelerStatus = String(travelerState.status || '').toUpperCase();
      if (travelerStatus === 'COMPLETED') {
        return {
          ...item,
          status: 'COMPLETED',
          completedAt: item.completedAt ?? item.completed_at ?? travelerState.updatedAt ?? new Date(),
          completed_at: item.completed_at ?? item.completedAt ?? travelerState.updatedAt ?? new Date(),
          activeTravelerNumber: travelerState.travelerNumber ?? item.activeTravelerNumber ?? null,
        };
      }

      const activeDepartment = normalizeP2ControlDepartment(travelerState.activeDepartment);
      return {
        ...item,
        status: 'ACTIVE',
        currentDepartment: activeDepartment || normalizeP2ControlDepartment(item.currentDepartment) || item.currentDepartment,
        current_department: activeDepartment || normalizeP2ControlDepartment(item.current_department) || item.current_department,
        activeTravelerNumber: travelerState.travelerNumber ?? item.activeTravelerNumber ?? null,
        activeTravelerStartedAt: travelerState.startedAt ?? item.activeTravelerStartedAt ?? null,
      };
    });
  }

  function p2ControlRows<T = any>(result: any): T[] {
    return Array.isArray(result) ? result : (result?.rows ?? []);
  }

  function normalizeP2ControlPartKey(value: unknown): string {
    return String(value || '').trim().toLowerCase();
  }

  function getP2ControlWadStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      WAD_READY: 'WAD ready',
      WAD_INCOMPLETE: 'WAD incomplete',
      WAD_MISSING: 'WAD missing',
      WAD_NOT_MATCHED: 'WAD not matched',
      NO_PROJECT_LINK: 'No project link',
    };
    return labels[status] || 'WAD unknown';
  }

  function buildP2ProjectWadContext(project: any, summary: any) {
    const linkedWadCount = Number(summary?.wadCount ?? 0);
    const approvedWadCount = Number(summary?.approvedWadCount ?? 0);
    const releasedWadCount = Number(summary?.releasedWadCount ?? 0);
    const status = !project?.projectId
      ? 'NO_PROJECT_LINK'
      : linkedWadCount === 0
        ? 'WAD_MISSING'
        : (approvedWadCount > 0 || releasedWadCount > 0)
          ? 'WAD_READY'
          : 'WAD_INCOMPLETE';

    return {
      linkedWadCount,
      approvedWadCount,
      releasedWadCount,
      wadNumbers: summary?.wadNumbers ?? null,
      p2WadConnectionStatus: status,
      p2WadConnectionLabel: getP2ControlWadStatusLabel(status),
    };
  }

  function buildP2ItemWadContext(
    project: any,
    partNumber: unknown,
    wadByProjectPart: Map<string, any>,
    wadSummaryByProject: Map<string, any>,
  ) {
    if (!project?.projectId) {
      const status = 'NO_PROJECT_LINK';
      return {
        linkedWadId: null,
        linkedWadNumber: null,
        linkedWadStatus: null,
        linkedWadWorkOrderStatus: null,
        p2WadConnectionStatus: status,
        p2WadConnectionLabel: getP2ControlWadStatusLabel(status),
      };
    }

    const projectId = String(project.projectId);
    const partKey = normalizeP2ControlPartKey(partNumber);
    const matchedWad = partKey ? wadByProjectPart.get(`${projectId}:${partKey}`) : null;
    const projectSummary = wadSummaryByProject.get(projectId);

    if (!matchedWad) {
      const status = Number(projectSummary?.wadCount ?? 0) > 0 ? 'WAD_NOT_MATCHED' : 'WAD_MISSING';
      return {
        linkedWadId: null,
        linkedWadNumber: null,
        linkedWadStatus: null,
        linkedWadWorkOrderStatus: null,
        p2WadConnectionStatus: status,
        p2WadConnectionLabel: getP2ControlWadStatusLabel(status),
      };
    }

    const wadStatus = String(matchedWad.wadStatus || '').toUpperCase();
    const workOrderStatus = String(matchedWad.status || '').toUpperCase();
    const status = wadStatus === 'APPROVED'
      || ['RELEASED', 'IN_PROGRESS', 'COMPLETE', 'COMPLETED', 'CLOSED'].includes(workOrderStatus)
      ? 'WAD_READY'
      : 'WAD_INCOMPLETE';

    return {
      linkedWadId: matchedWad.id ?? null,
      linkedWadNumber: matchedWad.workOrderNumber ?? null,
      linkedWadStatus: matchedWad.wadStatus ?? null,
      linkedWadWorkOrderStatus: matchedWad.status ?? null,
      p2WadConnectionStatus: status,
      p2WadConnectionLabel: getP2ControlWadStatusLabel(status),
    };
  }

  // P2 Control Center API Routes
  app.get('/api/p2/control-center/stats', async (req, res) => {
    try {
      const { ensureProductionWorkflowReadSchema } = await import('../lib/productionWorkflowReadiness');
      await ensureProductionWorkflowReadSchema();
      const { pool } = await import('../../db');
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const [poStats, itemStats, legacyStats] = await Promise.all([
        pool.query(`
          SELECT
            COUNT(*) FILTER (WHERE COALESCE(UPPER(status), '') NOT IN ('COMPLETED','CLOSED','CANCELED','CANCELLED')) AS "openPOs",
            COUNT(*) FILTER (
              WHERE bom_configured = false
                AND COALESCE(UPPER(status), '') NOT IN ('COMPLETED','CLOSED','CANCELED','CANCELLED')
            ) AS "pendingBOMs"
          FROM p2_purchase_orders
        `),
        pool.query(`
          WITH item_state AS (
            SELECT
              psi.*,
              EXISTS (
                SELECT 1
                FROM travelers t
                WHERE t.status = 'COMPLETED'
                  AND t.serial_number IS NOT NULL
                  AND LOWER(TRIM(t.serial_number)) = LOWER(TRIM(psi.serial_number))
              ) AS has_completed_traveler
            FROM p2_serialized_items psi
          )
          SELECT
            COUNT(*) FILTER (WHERE status = 'SCHEDULED' AND NOT has_completed_traveler) AS "scheduledItems",
            COUNT(*) FILTER (
              WHERE status NOT IN ('PENDING','SCHEDULED','COMPLETED','SHIPPED')
                AND status IS NOT NULL
                AND NOT has_completed_traveler
            ) AS "inProduction",
            COUNT(*) FILTER (
              WHERE (status = 'COMPLETED' OR has_completed_traveler)
                AND COALESCE(completed_at, updated_at) > $1
            ) AS "completedThisWeek",
            COUNT(*) FILTER (WHERE status = 'FINAL_QC' AND NOT has_completed_traveler) AS "pendingQC"
          FROM item_state
        `, [oneWeekAgo]),
        pool.query(`
          SELECT
            COALESCE(SUM(quantity) FILTER (
              WHERE scheduled_layup_date IS NOT NULL
                AND COALESCE(UPPER(status), '') NOT IN ('COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED')
            ), 0)::int AS "scheduledItems",
            COALESCE(SUM(quantity) FILTER (
              WHERE COALESCE(UPPER(status), '') = 'IN_PROGRESS'
            ), 0)::int AS "inProduction",
            COALESCE(SUM(quantity) FILTER (
              WHERE COALESCE(UPPER(status), '') IN ('COMPLETED', 'CLOSED')
                AND COALESCE(completed_at, updated_at) > $1
            ), 0)::int AS "completedThisWeek"
          FROM p2_production_orders
        `, [oneWeekAgo]),
      ]);

      const po = poStats[0] || poStats.rows?.[0];
      const si = itemStats[0] || itemStats.rows?.[0];
      const legacy = legacyStats[0] || legacyStats.rows?.[0];

      res.json({
        openPOs:          parseInt(po.openPOs, 10)          || 0,
        pendingBOMs:      parseInt(po.pendingBOMs, 10)      || 0,
        scheduledItems:   (parseInt(si.scheduledItems, 10)   || 0) + (parseInt(legacy.scheduledItems, 10) || 0),
        inProduction:     (parseInt(si.inProduction, 10)     || 0) + (parseInt(legacy.inProduction, 10) || 0),
        completedThisWeek:(parseInt(si.completedThisWeek, 10)|| 0) + (parseInt(legacy.completedThisWeek, 10) || 0),
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
    let p2StatusStage = 'initializing';
    try {
      p2StatusStage = 'ensuring production workflow schema';
      const { ensureProductionWorkflowReadSchema } = await import('../lib/productionWorkflowReadiness');
      await ensureProductionWorkflowReadSchema();
      p2StatusStage = 'loading storage modules';
      const { storage } = await import('../../storage');
      const { pool: dbPool } = await import('../../db');
      p2StatusStage = 'loading P2 purchase orders';
      const allPos = p2ControlRows(await storage.getAllP2PurchaseOrders());
      const optionalP2Rows = async <T = any>(
        label: string,
        query: Promise<any>,
      ): Promise<T[]> => {
        try {
          return p2ControlRows<T>(await query);
        } catch (error) {
          console.warn(`P2 Control Center optional ${label} lookup skipped:`, error);
          return [];
        }
      };
      // Surface POs that have cleared the P2 Release Gate. Status values have
      // existed in both legacy lowercase and current uppercase forms. Also
      // include any PO with serialized units: Pending Layup units are already
      // production work and must remain visible before their first department move.
      const normalizeP2Status = (status: unknown) =>
        String(status || '').trim().toUpperCase();
      const P2_GATED_STATUSES = new Set([
        'OPEN',
        'READY_FOR_P2_RELEASE',
        'READY_FOR_PRODUCTION',
        'IN_PRODUCTION',
      ]);
      let serializedItems: any[] = [];
      try {
        p2StatusStage = 'loading P2 serialized items';
        serializedItems = await applyTravelerStateToP2Items(
          p2ControlRows(await storage.getP2SerializedItems({}))
        );
      } catch (error) {
        console.warn('P2 Control Center optional serialized item lookup skipped:', error);
      }
      const allPoIds = allPos
        .map((po: any) => Number(po.id))
        .filter(Number.isFinite);
      const familyRootByPoId = new Map<number, number>();
      const currentPoIdByFamilyRoot = new Map<number, { poId: number; revisionNumber: number }>();
      for (const po of allPos as any[]) {
        const poId = Number(po.id);
        if (!Number.isFinite(poId)) continue;
        const rootId = Number(po.parentPoId ?? po.parent_po_id ?? po.id);
        const familyRootId = Number.isFinite(rootId) ? rootId : poId;
        familyRootByPoId.set(poId, familyRootId);
        if (po.isCurrentRevision === false) continue;
        const revisionNumber = Number(po.revisionNumber ?? po.revision_number ?? 0) || 0;
        const existing = currentPoIdByFamilyRoot.get(familyRootId);
        if (!existing || revisionNumber >= existing.revisionNumber) {
          currentPoIdByFamilyRoot.set(familyRootId, { poId, revisionNumber });
        }
      }
      const displayPoIdForPoId = (poId: number) => {
        const familyRootId = familyRootByPoId.get(poId) ?? poId;
        return currentPoIdByFamilyRoot.get(familyRootId)?.poId ?? poId;
      };

      const familyPoIdsByDisplayPoId = new Map<number, number[]>();
      for (const poId of allPoIds) {
        const displayPoId = displayPoIdForPoId(poId);
        const familyPoIds = familyPoIdsByDisplayPoId.get(displayPoId) ?? [];
        familyPoIds.push(poId);
        familyPoIdsByDisplayPoId.set(displayPoId, familyPoIds);
      }
      p2StatusStage = 'loading legacy project production rows';
      const legacyProductionRows = allPoIds.length > 0
        ? await optionalP2Rows(
            'P2 production orders',
            dbPool.query(
              `SELECT
                 p2_po_id AS "poId",
                 COALESCE(SUM(quantity), 0)::int AS "totalQty",
                 COALESCE(SUM(
                   CASE
                     WHEN COALESCE(UPPER(status), '') IN ('COMPLETE', 'COMPLETED', 'CLOSED') THEN quantity
                     ELSE LEAST(COALESCE(quantity_manufactured, 0), quantity)
                   END
                 ), 0)::int AS "completedQty",
                 COALESCE(SUM(
                   CASE
                     WHEN COALESCE(UPPER(status), '') NOT IN ('', 'PENDING', 'PLANNED', 'COMPLETE', 'COMPLETED', 'CLOSED', 'CANCELLED', 'CANCELED')
                     THEN GREATEST(quantity - LEAST(COALESCE(quantity_manufactured, 0), quantity), 0)
                     ELSE 0
                   END
                 ), 0)::int AS "inProductionQty"
               FROM p2_production_orders
               WHERE p2_po_id = ANY($1)
                 AND COALESCE(UPPER(status), '') NOT IN ('CANCELLED', 'CANCELED')
               GROUP BY p2_po_id`,
              [allPoIds]
            )
          )
        : [];
      const shippedVisibilityRows = allPoIds.length > 0
        ? await optionalP2Rows(
            'shipped lot visibility',
            dbPool.query(
              `SELECT po_id AS "poId"
               FROM p2_lot_numbers
               WHERE po_id = ANY($1)
                 AND (
                   COALESCE(UPPER(status), '') IN ('SHIPPED', 'CLOSED', 'COMPLETE', 'COMPLETED')
                   OR shipped_at IS NOT NULL
                   OR packing_slip_id IS NOT NULL
                 )
               GROUP BY po_id`,
              [allPoIds]
            )
          )
        : [];
      const legacyProjectProductionRows = await optionalP2Rows(
        'legacy project production',
        dbPool.query(
         `WITH project_po_link AS (
           SELECT p.id AS project_id, p.po_id AS po_id
           FROM projects p
           WHERE p.po_id IS NOT NULL
           UNION
           SELECT ps.project_id, ps.linked_p2_order_id AS po_id
           FROM project_steps ps
           WHERE ps.linked_p2_order_id IS NOT NULL
           UNION
           SELECT p.id AS project_id, po.id AS po_id
           FROM p2_purchase_orders po
           JOIN projects p ON LOWER(TRIM(po.project_name)) IN (
             LOWER(TRIM(p.project_code)),
             LOWER(TRIM(p.project_name)),
             LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
           )
           WHERE po.project_name IS NOT NULL
             AND TRIM(po.project_name) <> ''
             AND po.is_current_revision IS NOT FALSE
         ),
         work_order_quantities AS (
           SELECT
             ppl.po_id AS "poId",
             wo.id,
             COALESCE(wo.quantity, 1)::numeric AS quantity,
             COALESCE((
               SELECT COUNT(*)
               FROM travelers t
               WHERE t.production_work_order_id = wo.id
                 AND UPPER(t.status) IN ('COMPLETE', 'COMPLETED', 'CLOSED')
             ), 0)::numeric AS completed_travelers,
             EXISTS (
               SELECT 1
               FROM travelers t
               WHERE t.production_work_order_id = wo.id
                 AND UPPER(t.status) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED')
             ) AS has_active_traveler,
             UPPER(COALESCE(wo.status, '')) AS status
           FROM project_po_link ppl
           JOIN production_work_orders wo ON wo.project_id = ppl.project_id
           WHERE COALESCE(UPPER(wo.status), '') NOT IN ('CANCELLED', 'CANCELED')
             AND NOT (
               wo.work_order_number LIKE 'WAD-%'
               AND COALESCE(UPPER(wo.status), '') NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
               AND EXISTS (
                 SELECT 1
                 FROM p2_purchase_order_items poi
                 WHERE poi.po_id = ppl.po_id
                   AND poi.part_number IS NOT NULL
                   AND LOWER(TRIM(poi.part_number)) = LOWER(TRIM(wo.part_number))
               )
             )
         )
         SELECT
           "poId",
           COALESCE(SUM(quantity), 0)::int AS "totalQty",
           COALESCE(SUM(
             CASE
               WHEN status IN ('COMPLETE', 'COMPLETED', 'CLOSED') THEN quantity
               ELSE LEAST(completed_travelers, quantity)
             END
           ), 0)::int AS "completedQty",
           COALESCE(SUM(
             CASE
               WHEN status NOT IN ('', 'PLANNED', 'PLAN', 'DRAFT', 'PENDING', 'COMPLETE', 'COMPLETED', 'CLOSED')
                 OR has_active_traveler
               THEN GREATEST(quantity - LEAST(completed_travelers, quantity), 0)
               ELSE 0
             END
           ), 0)::int AS "inProductionQty"
         FROM work_order_quantities
         GROUP BY "poId"`
        )
      );
      const poIdsWithSerializedUnits = new Set<number>();
      for (const s of serializedItems as any[]) {
        const poId = s.poId ?? s.po_id;
        if (poId) {
          poIdsWithSerializedUnits.add(Number(poId));
        }
      }
      const legacyStatsByPoId = new Map<number, any>(
        legacyProductionRows.map((row: any) => [Number(row.poId), row])
      );
      const legacyProjectStatsByPoId = new Map<number, any>(
        legacyProjectProductionRows.map((row: any) => [Number(row.poId), row])
      );
      const poIdsWithLegacyProjectProduction = new Set<number>(legacyProjectStatsByPoId.keys());
      const poIdsWithShippedHistory = new Set<number>(
        shippedVisibilityRows.map((row: any) => Number(row.poId))
      );
      const projectVisibilityRows = allPoIds.length > 0
        ? await optionalP2Rows(
            'project visibility link',
            dbPool.query(
              `WITH project_po_link AS (
                 SELECT p.po_id AS linked_po_id
                 FROM projects p
                 WHERE p.po_id IS NOT NULL
                 UNION
                 SELECT ps.linked_p2_order_id AS linked_po_id
                 FROM project_steps ps
                 WHERE ps.step_type = 'p2_order'
                   AND ps.linked_p2_order_id IS NOT NULL
                 UNION
                 SELECT po.id AS linked_po_id
                 FROM p2_purchase_orders po
                 JOIN projects p ON LOWER(TRIM(po.project_name)) IN (
                   LOWER(TRIM(p.project_code)),
                   LOWER(TRIM(p.project_name)),
                   LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
                 )
                 WHERE po.project_name IS NOT NULL
                   AND TRIM(po.project_name) <> ''
                   AND po.is_current_revision IS NOT FALSE
               )
               SELECT DISTINCT linked_po_id AS "poId"
               FROM project_po_link
               WHERE linked_po_id = ANY($1)`,
              [allPoIds]
            )
          )
        : [];
      const poIdsWithProjectLink = new Set<number>(
        projectVisibilityRows.map((row: any) => Number(row.poId))
      );
      const pos = allPos.filter((po: any) => {
        const poId = Number(po.id);
        if (displayPoIdForPoId(poId) !== poId) return false;
        const hasProductionHistory = poIdsWithSerializedUnits.has(poId)
          || legacyStatsByPoId.has(poId)
          || poIdsWithLegacyProjectProduction.has(poId)
          || poIdsWithShippedHistory.has(poId);
        if (po.isCurrentRevision === false && !hasProductionHistory) return false;
        return (
          P2_GATED_STATUSES.has(normalizeP2Status(po.status)) ||
          hasProductionHistory ||
          poIdsWithProjectLink.has(poId)
        );
      });

      // Look up projects linked to these POs. PM Control Center resolves the
      // same relationship through either projects.po_id or the p2_order step.
      p2StatusStage = 'loading P2 project links';
      const poIds = pos.map((po: any) => Number(po.id)).filter(Number.isFinite);
      const projectRows = poIds.length > 0
        ? await optionalP2Rows(
            'project link',
            dbPool.query(
            `WITH project_po_link AS (
               SELECT
                 p.id,
                 p.project_code,
                 p.project_name,
                 p.updated_at,
                 COALESCE(
                   p.po_id,
                   (
                     SELECT ps.linked_p2_order_id
                     FROM project_steps ps
                     WHERE ps.project_id = p.id
                       AND ps.step_type = 'p2_order'
                       AND ps.linked_p2_order_id IS NOT NULL
                     ORDER BY ps.updated_at DESC NULLS LAST, ps.completed_at DESC NULLS LAST
                     LIMIT 1
                 )
               ) AS linked_po_id
               FROM projects p
               UNION
               SELECT
                 p.id,
                 p.project_code,
                 p.project_name,
                 p.updated_at,
                 po.id AS linked_po_id
               FROM p2_purchase_orders po
               JOIN projects p ON LOWER(TRIM(po.project_name)) IN (
                 LOWER(TRIM(p.project_code)),
                 LOWER(TRIM(p.project_name)),
                 LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
               )
               WHERE po.project_name IS NOT NULL
                 AND TRIM(po.project_name) <> ''
                 AND po.is_current_revision IS NOT FALSE
             )
             SELECT DISTINCT ON (linked_po_id)
               linked_po_id AS "poId",
               id AS "projectId",
               project_code AS "projectCode",
               project_name AS "projectName"
             FROM project_po_link
             WHERE linked_po_id = ANY($1)
             ORDER BY linked_po_id, updated_at DESC NULLS LAST`,
            [poIds]
          )
          )
        : [];
      const projectByPoId = new Map<number, any>(
        projectRows.map((r: any) => [Number(r.poId), r])
      );
      const projectIds = [...new Set(
        projectRows
          .map((row: any) => row.projectId)
          .filter(Boolean)
          .map((projectId: any) => String(projectId))
      )];
      const wadSummaryRows = projectIds.length > 0
        ? await optionalP2Rows(
            'WAD project summary',
            dbPool.query(
            `SELECT
               project_id::text AS "projectId",
               COUNT(*)::int AS "wadCount",
               COUNT(*) FILTER (WHERE COALESCE(UPPER(wad_status), '') = 'APPROVED')::int AS "approvedWadCount",
               COUNT(*) FILTER (
                 WHERE COALESCE(UPPER(wad_status), '') = 'APPROVED'
                    OR COALESCE(UPPER(status), '') IN ('RELEASED', 'IN_PROGRESS', 'COMPLETE', 'COMPLETED', 'CLOSED')
               )::int AS "releasedWadCount",
               STRING_AGG(work_order_number, ', ' ORDER BY created_at DESC NULLS LAST) AS "wadNumbers"
             FROM production_work_orders
             WHERE project_id = ANY($1::uuid[])
               AND COALESCE(UPPER(status), '') NOT IN ('CANCELLED', 'CANCELED')
               AND (work_order_number LIKE 'WAD-%' OR wad_status IS NOT NULL)
             GROUP BY project_id`,
            [projectIds]
          )
          )
        : [];
      const wadSummaryByProject = new Map<string, any>(
        wadSummaryRows.map((row: any) => [String(row.projectId), row])
      );
      const travelerProjectRows = projectIds.length > 0
        ? await optionalP2Rows(
            'traveler project truth',
            dbPool.query(
            `SELECT
               project_id::text AS "projectId",
               COALESCE(SUM(COALESCE(quantity, 1)), 0)::int AS "totalQty",
               COALESCE(SUM(
                 CASE
                   WHEN COALESCE(UPPER(status), '') IN ('COMPLETE', 'COMPLETED', 'CLOSED')
                     OR completed_at IS NOT NULL
                   THEN COALESCE(quantity, 1)
                   ELSE 0
                 END
               ), 0)::int AS "completedQty",
               COALESCE(SUM(
                 CASE
                   WHEN COALESCE(UPPER(status), '') IN ('ACTIVE', 'IN_PROGRESS', 'STARTED')
                     AND completed_at IS NULL
                   THEN COALESCE(quantity, 1)
                   ELSE 0
                 END
               ), 0)::int AS "inProductionQty"
             FROM travelers
             WHERE project_id = ANY($1::uuid[])
               AND COALESCE(UPPER(status), '') NOT IN ('CANCELLED', 'CANCELED', 'VOID')
             GROUP BY project_id`,
            [projectIds]
          )
          )
        : [];
      const travelerStatsByProject = new Map<string, any>(
        travelerProjectRows.map((row: any) => [String(row.projectId), row])
      );

      // Sum ordered quantities from all PO line items, grouped by po_id.
      // This ensures PO lines that haven't had serialized items generated yet
      // are still counted in totalItems rather than being invisible on the dashboard.
      const orderedQtyRows = poIds.length > 0
        ? await optionalP2Rows(
            'ordered quantity',
            dbPool.query(
            `SELECT po_id AS "poId", COALESCE(SUM(quantity), 0)::int AS "orderedQty"
             FROM p2_purchase_order_items
             WHERE po_id = ANY($1)
             GROUP BY po_id`,
            [poIds]
          )
          )
        : [];
      const orderedQtyByPoId = new Map<number, number>(
        orderedQtyRows.map((r: any) => [Number(r.poId), Number(r.orderedQty) || 0])
      );
      const shippedSerializedItemRows = allPoIds.length > 0
        ? await optionalP2Rows(
            'shipped serialized-unit membership',
            dbPool.query(P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL, [allPoIds])
          )
        : [];
      const shippedSerializedItemIdsByPoId = indexP2ShippedSerializedItemIds(
        shippedSerializedItemRows
      );
      
      p2StatusStage = 'building P2 status response';
      const poStatuses = pos.map((po: any) => {
        const poId = Number(po.id);
        const familyPoIds = familyPoIdsByDisplayPoId.get(poId) ?? [poId];
        const familyPoIdSet = new Set<number>(familyPoIds);
        const poItems = serializedItems.filter((s: any) => familyPoIdSet.has(Number(s.poId ?? s.po_id)));
        const linkedProject = projectByPoId.get(poId);
        const travelerProjectStats = linkedProject?.projectId
          ? travelerStatsByProject.get(String(linkedProject.projectId))
          : null;
        const travelerTotalItems = Number(travelerProjectStats?.totalQty ?? 0);
        const scrappedItems = poItems.filter((s: any) => {
          const status = String(s.status || '').trim().toUpperCase();
          return status === 'SCRAPPED' || status === 'SCRAP';
        }).length;

        // totalItems is the sum of ordered quantities across all line items so that
        // lines without serialized items generated yet are still reflected on the card.
        const currentPoOrderedQty = orderedQtyByPoId.get(poId) ?? 0;
        const familyOrderedQty = familyPoIds.reduce(
          (sum, familyPoId) => sum + (orderedQtyByPoId.get(familyPoId) ?? 0),
          0
        );
        const totalItems = currentPoOrderedQty > 0
          ? currentPoOrderedQty
          : Math.max(familyOrderedQty, travelerTotalItems, poItems.length);
        const shippedSerializedItemIds = new Set<string>();
        for (const familyPoId of familyPoIds) {
          for (const id of shippedSerializedItemIdsByPoId.get(familyPoId) ?? []) {
            shippedSerializedItemIds.add(id);
          }
        }
        const ledger = buildP2SerializedUnitLedger(
          totalItems,
          poItems,
          shippedSerializedItemIds,
        );
        const completedItems = ledger.shipped;
        const scheduledItems = ledger.scheduled;
        const inProductionItems = ledger.activeProduction;
        const pendingSerializedItems = countDistinctP2PendingUnits(poItems);
        const pendingItems = pendingSerializedItems > 0
          ? Math.min(ledger.missing, pendingSerializedItems)
          : ledger.missing;
        
        const rawStatus = normalizeP2Status(po.status) || 'OPEN';

        const wadContext = buildP2ProjectWadContext(
          linkedProject,
          linkedProject?.projectId ? wadSummaryByProject.get(String(linkedProject.projectId)) : null
        );

        return {
          id: poId,
          poNumber: po.poNumber,
          customerName: po.customerName || 'Unknown',
          dueDate: po.expectedDelivery,
          totalItems,
          completedItems,
          shippedItems: ledger.shipped,
          needsFinalizationItems: ledger.finalization,
          scheduledItems,
          inProductionItems,
          productionPipelineItems: ledger.productionPipeline,
          missingItems: pendingItems,
          scrappedItems,
          pendingItems,
          hasBOMsNeeded: !po.bomConfigured,
          projectId: po.projectId ?? linkedProject?.projectId ?? null,
          projectCode: linkedProject?.projectCode ?? null,
          projectName: linkedProject?.projectName ?? po.projectName ?? null,
          ...wadContext,
          rawStatus,
          status: (completedItems + scrappedItems) >= totalItems && totalItems > 0 ? 'completed' :
                  inProductionItems > 0 ? 'in_progress' :
                  scheduledItems > 0 ? 'scheduled' : 'pending'
        };
      });
      
      res.json(poStatuses);
    } catch (_error) {
      console.error(`P2 Control Center PO statuses error during ${p2StatusStage}:`, _error);
      res.status(500).json({ error: 'Failed to fetch PO statuses' });
    }
  });

  app.get('/api/p2/control-center/scheduling-list', async (req, res) => {
    try {
      const { ensureProductionWorkflowReadSchema } = await import('../lib/productionWorkflowReadiness');
      await ensureProductionWorkflowReadSchema();
      const { storage } = await import('../../storage');
      const { pool: dbPool } = await import('../../db');
      const serializedItems = await applyTravelerStateToP2Items(
        await storage.getP2SerializedItems({})
      );

      const poFamilyResult = await dbPool.query(
        `SELECT
           id,
           parent_po_id AS "parentPoId",
           revision_number AS "revisionNumber",
           is_current_revision AS "isCurrentRevision"
         FROM p2_purchase_orders`
      );
      const poFamilyRows = p2ControlRows(poFamilyResult);
      const familyRootByPoId = new Map<number, number>();
      const currentPoIdByFamilyRoot = new Map<number, { poId: number; revisionNumber: number }>();
      for (const po of poFamilyRows as any[]) {
        const poId = Number(po.id);
        if (!Number.isFinite(poId)) continue;
        const rootId = Number(po.parentPoId ?? po.parent_po_id ?? po.id);
        const familyRootId = Number.isFinite(rootId) ? rootId : poId;
        familyRootByPoId.set(poId, familyRootId);
        if (po.isCurrentRevision === false) continue;
        const revisionNumber = Number(po.revisionNumber ?? po.revision_number ?? 0) || 0;
        const existing = currentPoIdByFamilyRoot.get(familyRootId);
        if (!existing || revisionNumber >= existing.revisionNumber) {
          currentPoIdByFamilyRoot.set(familyRootId, { poId, revisionNumber });
        }
      }
      const displayPoIdForPoId = (poId: number) => {
        const familyRootId = familyRootByPoId.get(poId) ?? poId;
        return currentPoIdByFamilyRoot.get(familyRootId)?.poId ?? poId;
      };

      const shippedMembershipRows = poFamilyRows.length > 0
        ? p2ControlRows(await dbPool.query(
            P2_SHIPPED_SERIALIZED_ITEM_MEMBERSHIP_SQL,
            [poFamilyRows.map((po: any) => Number(po.id)).filter(Number.isFinite)]
          ))
        : [];
      const shippedItemIdsByPoId = indexP2ShippedSerializedItemIds(shippedMembershipRows);
      const shippedItemIds = new Set<string>();
      for (const ids of shippedItemIdsByPoId.values()) {
        for (const id of ids) shippedItemIds.add(id);
      }

      const poItemResult = await dbPool.query(
        `SELECT
           poi.id AS "poItemId",
           poi.po_id AS "poId",
           poi.part_number AS "partNumber",
           poi.part_name AS "partName",
           poi.quantity AS "orderedQuantity",
           poi.created_at AS "createdAt",
           po.po_number AS "poNumber",
           po.expected_delivery AS "dueDate",
           po.status AS "poStatus"
         FROM p2_purchase_order_items poi
         JOIN p2_purchase_orders po ON po.id = poi.po_id
         WHERE COALESCE(UPPER(po.status), '') NOT IN ('COMPLETED', 'CANCELED', 'CANCELLED', 'CLOSED')
           AND po.is_current_revision IS NOT FALSE
         ORDER BY poi.po_id, poi.created_at, poi.id`
      );
      const poItems = Array.isArray(poItemResult)
        ? poItemResult
        : ((poItemResult as any)?.rows ?? []);
      const poItemById = new Map<number, any>(
        poItems.map((item: any) => [Number(item.poItemId), item])
      );

      const serializedByPoItemId = new Map<number, any[]>();
      const priorRevisionPendingByPoAndPart = new Map<string, any[]>();
      for (const item of serializedItems as any[]) {
        const poItemId = Number(item.poItemId);
        if (!poItemById.has(poItemId)) {
          const status = String(item.status ?? '').trim().toUpperCase();
          const department = String(
            item.currentDepartment ?? item.current_department ?? ''
          ).trim().toUpperCase();
          const sourcePoId = Number(item.poId ?? item.po_id);
          const partKey = normalizeP2ControlPartKey(
            item.partNumber ?? item.part_number
          );
          if (
            status === 'ACTIVE'
            && (department === '' || department === 'PENDING LAYUP')
            && Number.isFinite(sourcePoId)
            && partKey
          ) {
            const poolKey = `${displayPoIdForPoId(sourcePoId)}:${partKey}`;
            if (!priorRevisionPendingByPoAndPart.has(poolKey)) {
              priorRevisionPendingByPoAndPart.set(poolKey, []);
            }
            priorRevisionPendingByPoAndPart.get(poolKey)!.push(item);
          }
          continue;
        }
        if (!serializedByPoItemId.has(poItemId)) {
          serializedByPoItemId.set(poItemId, []);
        }
        serializedByPoItemId.get(poItemId)!.push(item);
      }

      const sortBySequence = (a: any, b: any) =>
        (Number(a.sequenceNumber) || 0) - (Number(b.sequenceNumber) || 0) ||
        String(a.id).localeCompare(String(b.id));

      const poItemsByDisplayPoId = new Map<number, any[]>();
      for (const poItem of poItems) {
        const displayPoId = displayPoIdForPoId(Number(poItem.poId));
        if (!poItemsByDisplayPoId.has(displayPoId)) {
          poItemsByDisplayPoId.set(displayPoId, []);
        }
        poItemsByDisplayPoId.get(displayPoId)!.push(poItem);
      }

      const consumedCapacityByPoItemId = new Map<number, number>();
      for (const [displayPoId, poLineItems] of poItemsByDisplayPoId.entries()) {
        const familyItems = (serializedItems as any[]).filter(
          (s: any) => displayPoIdForPoId(Number(s.poId)) === displayPoId
        );
        let consumedRevisionFamilyCount = countDistinctP2DemandUnits(
          familyItems,
          shippedItemIds
        );

        for (const poItem of poLineItems) {
          const poItemId = Number(poItem.poItemId);
          const orderedQuantity = Number(poItem.orderedQuantity) || 0;
          const consumedForLine = Math.min(orderedQuantity, consumedRevisionFamilyCount);
          consumedCapacityByPoItemId.set(poItemId, consumedForLine);
          consumedRevisionFamilyCount = Math.max(0, consumedRevisionFamilyCount - consumedForLine);
        }
      }

      const schedulingList: any[] = [];
      for (const poItem of poItems) {
        const poItemId = Number(poItem.poItemId);
        let items = (serializedByPoItemId.get(poItemId) ?? [])
          .sort(sortBySequence);

        const orderedQuantity = Number(poItem.orderedQuantity) || 0;
        const completedCount = consumedCapacityByPoItemId.get(poItemId) ?? 0;
        const earlyStageCapacity = Math.max(
          0,
          orderedQuantity - completedCount
        );

        const allPendingItems = items.filter((s: any) => {
          if (s.status !== 'ACTIVE') return false;
          const dept = String(s.currentDepartment || '').trim();
          return dept === '' || dept === 'Pending Layup';
        });
        // RMA remakes are additive manufacturing demand, not additional PO
        // quantity. Keep them outside the ordered-quantity capacity calculation
        // so a replacement remains visible after its scrapped predecessor has
        // already consumed the customer's original demand slot.
        const pendingPartition = partitionP2PendingRmaReplacements(allPendingItems);
        let pendingItems = pendingPartition.demandPending;
        const pendingRmaReplacements = pendingPartition.rmaReplacements;

        const priorRevisionPoolKey = `${displayPoIdForPoId(Number(poItem.poId))}:${normalizeP2ControlPartKey(poItem.partNumber)}`;
        const priorRevisionPending = (
          priorRevisionPendingByPoAndPart.get(priorRevisionPoolKey) ?? []
        ).sort(sortBySequence);
        const pooledPending = takeP2PriorRevisionPendingForLine(
          pendingItems,
          priorRevisionPending,
          earlyStageCapacity,
        );
        pendingItems = pooledPending.pendingItems.sort(sortBySequence);
        priorRevisionPendingByPoAndPart.set(
          priorRevisionPoolKey,
          pooledPending.remainingPriorRevisionPending,
        );

        const pendingDeficit = p2PendingUnitDeficit(
          orderedQuantity,
          completedCount,
          pendingItems.length,
        );
        if (pendingDeficit > 0) {
          const createdItems = await storage.addP2SerializedItemsForPoItem(poItemId, pendingDeficit);
          if (createdItems.length > 0) {
            items = [...items, ...createdItems].sort(sortBySequence);
            pendingItems = [...pendingItems, ...createdItems].sort(sortBySequence);
            serializedByPoItemId.set(poItemId, items);
          }
        }

        const pendingToShow = [
          ...pendingItems.slice(0, earlyStageCapacity),
          ...pendingRmaReplacements,
        ].sort(sortBySequence);

        for (const s of pendingToShow) {
          schedulingList.push({
            id: s.id,
            poId: poItem.poId,
            poItemId: poItem.poItemId,
            poNumber: poItem.poNumber || s.poNumber || 'Unknown',
            partNumber: poItem.partNumber || s.partNumber || 'Unknown',
            description: poItem.partName || s.partName || '',
            totalQuantity: 1,
            scheduledQuantity: 0,
            remainingQuantity: 1,
            dueDate: poItem.dueDate,
            priority: 'normal',
            status: 'pending'
          });
        }
      }

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
      const { ensureProductionWorkflowReadSchema } = await import('../lib/productionWorkflowReadiness');
      await ensureProductionWorkflowReadSchema();
      const { storage } = await import('../../storage');
      const { pool: dbPool } = await import('../../db');
      const optionalP2Rows = async <T = any>(
        label: string,
        query: Promise<any>,
      ): Promise<T[]> => {
        try {
          return p2ControlRows<T>(await query);
        } catch (error) {
          console.warn(`P2 Production Queue optional ${label} lookup skipped:`, error);
          return [];
        }
      };

      // Keep this tab focused on active WIP; completed/off-system units roll up
      // through PO status instead of remaining in the production queue.
      let allItems: any[] = [];
      try {
        allItems = await applyTravelerStateToP2Items(
          await storage.getP2SerializedItems({})
        );
      } catch (error) {
        console.warn('P2 Production Queue optional serialized item lookup skipped:', error);
      }
      const visibleStatuses = new Set(['ACTIVE']);
      const activeSerializedItems = (allItems || []).filter((item: any) => visibleStatuses.has(item.status));
      const shownPhysicalIdentities = new Set<string>();
      const items = activeSerializedItems.filter((item: any) => {
        const dept = normalizeP2ControlDepartment(item.currentDepartment);
        if (dept === '' || dept === 'Pending Layup') {
          return false;
        }

        const identity = p2PhysicalSerializedIdentity(item);
        if (!identity || shownPhysicalIdentities.has(identity)) return false;
        shownPhysicalIdentities.add(identity);
        return true;
      });
      const legacyProductionRows: any[] = [];
      const legacyProjectProductionRows = await optionalP2Rows(
        'legacy project production',
        dbPool.query(
         `WITH project_po_link AS (
           SELECT p.id AS project_id, p.po_id AS po_id
           FROM projects p
           WHERE p.po_id IS NOT NULL
           UNION
           SELECT ps.project_id, ps.linked_p2_order_id AS po_id
           FROM project_steps ps
           WHERE ps.linked_p2_order_id IS NOT NULL
           UNION
           SELECT p.id AS project_id, po.id AS po_id
           FROM p2_purchase_orders po
           JOIN projects p ON LOWER(TRIM(po.project_name)) IN (
             LOWER(TRIM(p.project_code)),
             LOWER(TRIM(p.project_name)),
             LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
           )
           WHERE po.project_name IS NOT NULL
             AND TRIM(po.project_name) <> ''
             AND po.is_current_revision IS NOT FALSE
         )
         SELECT DISTINCT ON (wo.id)
           wo.id,
           wo.work_order_number AS "workOrderNumber",
           wo.part_number AS "partNumber",
           wo.description,
           COALESCE(wo.quantity, 1)::int AS quantity,
           wo.status,
           wo.wad_status AS "wadStatus",
           wo.due_date AS "dueDate",
           wo.project_id AS "projectId",
           p.project_code AS "projectCode",
           p.project_name AS "projectName",
           wo.assigned_department AS "assignedDepartment",
           wo.queue_type AS "queueType",
           wo.dashboard_type AS "dashboardType",
           po.id AS "poId",
           po.po_number AS "poNumber",
           po.customer_name AS "customerName",
           (
             SELECT pl.department
             FROM punch_ledger pl
             WHERE pl.production_work_order_id = wo.id
               AND pl.clock_out IS NULL
             ORDER BY pl.clock_in DESC
             LIMIT 1
           ) AS "activeDepartment",
           (
             SELECT ts.department_name
             FROM traveler_steps ts
             JOIN travelers t ON t.id = ts.traveler_id
             WHERE t.production_work_order_id = wo.id
               AND UPPER(ts.status) IN ('IN_PROGRESS', 'ACTIVE', 'STARTED')
             ORDER BY ts.step_number ASC
             LIMIT 1
           ) AS "currentTravelerStep",
            (
              SELECT t.id
              FROM travelers t
              WHERE t.production_work_order_id = wo.id
                AND COALESCE(UPPER(t.status), '') NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED', 'SCRAPPED', 'CANCELLED', 'CANCELED')
              ORDER BY t.created_at DESC
              LIMIT 1
            ) AS "activeTravelerId",
            (
              SELECT t.traveler_number
              FROM travelers t
              WHERE t.production_work_order_id = wo.id
                AND COALESCE(UPPER(t.status), '') NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED', 'SCRAPPED', 'CANCELLED', 'CANCELED')
             ORDER BY t.created_at DESC
             LIMIT 1
           ) AS "activeTravelerNumber",
           (
             SELECT UPPER(t.status)
             FROM travelers t
             WHERE t.production_work_order_id = wo.id
               AND COALESCE(UPPER(t.status), '') NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED', 'SCRAPPED', 'CANCELLED', 'CANCELED')
             ORDER BY t.created_at DESC
             LIMIT 1
           ) AS "activeTravelerStatus"
         FROM project_po_link ppl
         JOIN production_work_orders wo ON wo.project_id = ppl.project_id
         JOIN projects p ON p.id = wo.project_id
         JOIN p2_purchase_orders po ON po.id = ppl.po_id
         WHERE COALESCE(UPPER(wo.status), '') NOT IN ('CANCELLED', 'CANCELED')
           AND NOT (
             wo.work_order_number LIKE 'WAD-%'
             AND COALESCE(UPPER(wo.status), '') NOT IN ('COMPLETE', 'COMPLETED', 'CLOSED')
             AND EXISTS (
               SELECT 1
               FROM p2_purchase_order_items poi
               WHERE poi.po_id = ppl.po_id
                 AND poi.part_number IS NOT NULL
                 AND LOWER(TRIM(poi.part_number)) = LOWER(TRIM(wo.part_number))
             )
           )
         ORDER BY wo.id, wo.due_date NULLS LAST, wo.work_order_number`
        )
      );
      const poIds = [...new Set([
        ...items.map((item: any) => item.poId ?? item.po_id).filter(Boolean),
        ...legacyProductionRows.map((row: any) => row.poId).filter(Boolean),
        ...legacyProjectProductionRows.map((row: any) => row.poId).filter(Boolean),
      ])];
      const poFamilyRows = poIds.length > 0
        ? await optionalP2Rows(
          'PO revision family display',
          dbPool.query(
            `SELECT
               po.id AS "poId",
               COALESCE(root.id, po.id) AS "displayPoId",
               COALESCE(root.po_number, po.po_number) AS "displayPoNumber",
               COALESCE(current_po.id, po.id) AS "currentRevisionPoId",
               COALESCE(current_po.po_number, po.po_number) AS "currentRevisionPoNumber"
             FROM p2_purchase_orders po
             LEFT JOIN p2_purchase_orders root ON root.id = po.parent_po_id
             LEFT JOIN LATERAL (
               SELECT family.id, family.po_number
               FROM p2_purchase_orders family
               WHERE COALESCE(family.parent_po_id, family.id) = COALESCE(po.parent_po_id, po.id)
               ORDER BY family.is_current_revision DESC, family.revision_number DESC, family.id DESC
               LIMIT 1
             ) current_po ON true
             WHERE po.id = ANY($1::int[])`,
            [poIds]
          )
        )
        : [];
      const poFamilyByPoId = new Map<number, any>(
        poFamilyRows.map((row: any) => [Number(row.poId), row])
      );
      const getProductionDisplayPoNumber = (poId: number | null, rawPoNumber: string | null | undefined) => {
        if (!poId) return rawPoNumber;
        return poFamilyByPoId.get(Number(poId))?.displayPoNumber || rawPoNumber;
      };
      const projectRows = poIds.length > 0
        ? await optionalP2Rows(
            'project link',
            dbPool.query(
            `WITH project_po_link AS (
               SELECT
                 p.id,
                 p.project_code,
                 p.project_name,
                 p.updated_at,
                 COALESCE(
                   p.po_id,
                   (
                     SELECT ps.linked_p2_order_id
                     FROM project_steps ps
                     WHERE ps.project_id = p.id
                       AND ps.step_type = 'p2_order'
                       AND ps.linked_p2_order_id IS NOT NULL
                     ORDER BY ps.updated_at DESC NULLS LAST, ps.completed_at DESC NULLS LAST
                     LIMIT 1
                 )
               ) AS linked_po_id
               FROM projects p
               UNION
               SELECT
                 p.id,
                 p.project_code,
                 p.project_name,
                 p.updated_at,
                 po.id AS linked_po_id
               FROM p2_purchase_orders po
               JOIN projects p ON LOWER(TRIM(po.project_name)) IN (
                 LOWER(TRIM(p.project_code)),
                 LOWER(TRIM(p.project_name)),
                 LOWER(TRIM(CONCAT_WS(' - ', NULLIF(p.project_code, ''), NULLIF(p.project_name, ''))))
               )
               WHERE po.project_name IS NOT NULL
                 AND TRIM(po.project_name) <> ''
                 AND po.is_current_revision IS NOT FALSE
             )
             SELECT DISTINCT ON (linked_po_id)
               linked_po_id AS "poId",
               id AS "projectId",
               project_code AS "projectCode",
               project_name AS "projectName"
             FROM project_po_link
             WHERE linked_po_id = ANY($1)
             ORDER BY linked_po_id, updated_at DESC NULLS LAST`,
            [poIds]
          )
          )
        : [];
      const projectByPoId = new Map<number, any>(
        projectRows.map((row: any) => [Number(row.poId), row])
      );
      const projectIds = [...new Set(
        projectRows
          .map((row: any) => row.projectId)
          .filter(Boolean)
          .map((projectId: any) => String(projectId))
      )];
      const wadRows = projectIds.length > 0
        ? await optionalP2Rows(
            'WAD item context',
            dbPool.query(
            `SELECT DISTINCT ON (project_id, LOWER(TRIM(COALESCE(part_number, ''))))
               id::text AS id,
               project_id::text AS "projectId",
               work_order_number AS "workOrderNumber",
               part_number AS "partNumber",
               status,
               wad_status AS "wadStatus",
               created_at AS "createdAt"
             FROM production_work_orders
             WHERE project_id = ANY($1::uuid[])
               AND COALESCE(UPPER(status), '') NOT IN ('CANCELLED', 'CANCELED')
               AND (work_order_number LIKE 'WAD-%' OR wad_status IS NOT NULL)
             ORDER BY project_id, LOWER(TRIM(COALESCE(part_number, ''))), created_at DESC NULLS LAST`,
            [projectIds]
          )
          )
        : [];
      const wadByProjectPart = new Map<string, any>();
      const wadSummaryByProject = new Map<string, any>();
      wadRows.forEach((row: any) => {
        const projectId = String(row.projectId || '');
        if (!projectId) return;

        const summary = wadSummaryByProject.get(projectId) || { wadCount: 0 };
        summary.wadCount += 1;
        wadSummaryByProject.set(projectId, summary);

        const partKey = normalizeP2ControlPartKey(row.partNumber);
        const mapKey = partKey ? `${projectId}:${partKey}` : '';
        if (mapKey && !wadByProjectPart.has(mapKey)) {
          wadByProjectPart.set(mapKey, row);
        }
      });
      
      const serializedPoItemKeys = new Set(
        items
          .map((item: any) => {
            const poId = item.poId ?? item.po_id;
            const poItemId = item.poItemId ?? item.po_item_id;
            return poId && poItemId ? `${poId}:${poItemId}` : null;
          })
          .filter(Boolean)
      );
      const legacyProductionControlRows = p2ControlRows(legacyProductionRows).filter((row: any) => {
        if (row.poId) return false;
        const key = row.poId && row.poItemId ? `${row.poId}:${row.poItemId}` : null;
        const normalizedStatus = String(row.status || '').toUpperCase();
        const quantity = Math.max(1, Number(row.quantity || 1));
        const manufactured = Number(row.quantityManufactured || 0);
        const isComplete = ['COMPLETED', 'CLOSED'].includes(normalizedStatus) || manufactured >= quantity;
        return (!key || !serializedPoItemKeys.has(key)) && !isComplete;
      });
      const activeLegacyProjectProductionRows = legacyProjectProductionRows.filter((row: any) => {
        if (!isP2PhysicalProjectWorkOrder(row)) return false;
        const key = row.poId && row.poItemId ? `${row.poId}:${row.poItemId}` : null;
        const normalizedStatus = String(row.status || '').toUpperCase();
        return (!key || !serializedPoItemKeys.has(key))
          && !['COMPLETE', 'COMPLETED', 'CLOSED'].includes(normalizedStatus);
      });

      const itemIds = items.map((item: any) => item.id).filter(Boolean);
      let activeTasks: any[] = [];
      if (itemIds.length > 0) {
        try {
          activeTasks = await dbPool.query(
            `SELECT
               id::text AS id,
               serialized_item_id::text AS "serializedItemId",
               employee_name AS "employeeName",
               employee_code AS "employeeCode",
               started_at AS "startedAt"
             FROM p2_work_tasks
             WHERE serialized_item_id = ANY($1::uuid[])
               AND status = 'IN_PROGRESS'
             ORDER BY started_at DESC`,
            [itemIds]
          );
        } catch (taskError: any) {
          console.warn('P2 production queue active task lookup skipped:', taskError?.message);
        }
      }
      const allRoutings: any[] = [];
      
      // Create task lookup by serialized item ID
      const taskByItemId = new Map<string, any>();
      p2ControlRows(activeTasks).forEach((task: any) => {
        taskByItemId.set(task.serializedItemId, task);
      });
      
      // Get unique departments from all items and routings
      const departmentsSet = new Set<string>();
      items.forEach((item: any) => {
        const displayDepartment = item.status === 'COMPLETED'
          ? 'Completed'
          : normalizeP2ControlDepartment(item.currentDepartment);
        if (displayDepartment) departmentsSet.add(displayDepartment);
      });
      legacyProductionControlRows.forEach((row: any) => {
        const displayDepartment = ['COMPLETED', 'CLOSED'].includes(String(row.status || '').toUpperCase())
          ? 'Completed'
          : (normalizeP2ControlDepartment(row.department) || 'Pending Layup');
        departmentsSet.add(displayDepartment);
      });
      activeLegacyProjectProductionRows.forEach((row: any) => {
        const displayDepartment = ['COMPLETE', 'COMPLETED', 'CLOSED'].includes(String(row.status || '').toUpperCase())
          ? 'Completed'
          : (normalizeP2ControlDepartment(row.activeDepartment || row.currentTravelerStep || row.assignedDepartment || row.queueType || row.dashboardType) || 'Pending Layup');
        departmentsSet.add(displayDepartment);
      });
      allRoutings.forEach((routing: any) => {
        const sequence = routing.departmentSequence as string[] || [];
        sequence.forEach(dept => departmentsSet.add(dept));
      });
      
      // Standard department order for display
      const departmentOrder = [
        'Pending Layup',
        'Cutting Table',
        'Layup',
        'Assemble/Disassembly',
        'CNC',
        'Finish',
        'Paint',
        'Repair',
        'Final QC',
        'Shipping',
        'Completed'
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
        const dept = item.status === 'COMPLETED'
          ? 'Completed'
          : (normalizeP2ControlDepartment(item.currentDepartment) || 'Pending Layup');
        if (!departmentQueues[dept]) {
          departmentQueues[dept] = [];
        }
        
        const activeTask = taskByItemId.get(item.id);
        const activeTravelerNumber = item.activeTravelerNumber ?? item.active_traveler_number ?? null;
        const activeTravelerStartedAt = item.activeTravelerStartedAt ?? item.active_traveler_started_at ?? null;
        const poId = item.poId ?? item.po_id ?? null;
        const linkedProject = poId ? projectByPoId.get(Number(poId)) : null;
        const metadata = item.metadata || {};
        const wadContext = buildP2ItemWadContext(
          linkedProject,
          item.partNumber,
          wadByProjectPart,
          wadSummaryByProject
        );
        
        departmentQueues[dept].push({
          id: item.id,
          poId,
          barcode: item.barcode,
          serialNumber: item.serialNumber,
          partNumber: item.partNumber,
          partName: item.partName,
          poNumber: getProductionDisplayPoNumber(Number(poId), item.poNumber),
          rawPoNumber: item.poNumber,
          customerName: item.customerName,
          status: item.status,
          currentDepartment: dept,
          currentStageIndex: item.currentStageIndex || 0,
          projectId: linkedProject?.projectId ?? null,
          projectCode: linkedProject?.projectCode ?? null,
          projectName: linkedProject?.projectName ?? null,
          ...wadContext,
          isReplacement: metadata.isReplacement === true,
          replacementForSerializedItemId: metadata.replacementForSerializedItemId ?? null,
          replacementForSerialNumber: metadata.replacementForSerialNumber ?? null,
          replacementReason: metadata.replacementReason ?? null,
          hasActiveTask: !!activeTask || !!activeTravelerNumber,
          barcodePrintedAt: item.barcodePrintedAt || null,
          activeTask: activeTask ? {
            id: activeTask.id,
            employeeName: activeTask.employeeName,
            employeeCode: activeTask.employeeCode,
            startedAt: activeTask.startedAt,
          } : activeTravelerNumber ? {
            id: activeTravelerNumber,
            employeeName: activeTravelerNumber,
            employeeCode: '',
            startedAt: activeTravelerStartedAt,
          } : null,
        });
      });

      legacyProductionControlRows.forEach((row: any) => {
        const normalizedStatus = String(row.status || '').toUpperCase();
        const dept = ['COMPLETED', 'CLOSED'].includes(normalizedStatus)
          ? 'Completed'
          : (normalizeP2ControlDepartment(row.department) || 'Pending Layup');
        if (!departmentQueues[dept]) {
          departmentQueues[dept] = [];
        }

        const poId = row.poId ?? null;
        const linkedProject = row.projectId
          ? {
              projectId: row.projectId,
              projectCode: row.projectCode,
              projectName: row.projectName,
            }
          : (poId ? projectByPoId.get(Number(poId)) : null);
        const quantity = Math.max(1, Number(row.quantity || 1));
        const manufactured = Number(row.quantityManufactured || 0);
        const displayStatus = ['COMPLETED', 'CLOSED'].includes(normalizedStatus)
          || manufactured >= quantity
          ? 'COMPLETED'
          : 'ACTIVE';
        const wadContext = buildP2ItemWadContext(
          linkedProject,
          row.partNumber || row.orderId,
          wadByProjectPart,
          wadSummaryByProject
        );

        departmentQueues[dept].push({
          id: `legacy-p2-production-order-${row.id}`,
          poId,
          barcode: row.orderId,
          serialNumber: row.orderId,
          partNumber: row.partNumber || row.orderId,
          partName: row.partName || row.department || '',
          poNumber: getProductionDisplayPoNumber(Number(poId), row.poNumber),
          rawPoNumber: row.poNumber,
          customerName: row.customerName || 'Unknown',
          status: displayStatus,
          currentDepartment: dept,
          currentStageIndex: 0,
          projectId: linkedProject?.projectId ?? null,
          projectCode: linkedProject?.projectCode ?? null,
          projectName: linkedProject?.projectName ?? null,
          ...wadContext,
          isLegacyProductionOrder: true,
          hasActiveTask: normalizedStatus === 'IN_PROGRESS',
          barcodePrintedAt: null,
          activeTask: normalizedStatus === 'IN_PROGRESS' ? {
            id: row.id,
            employeeName: 'Legacy production order',
            employeeCode: '',
            startedAt: row.dueDate,
          } : null,
        });
      });

      activeLegacyProjectProductionRows.forEach((row: any) => {
        const normalizedStatus = String(row.status || '').toUpperCase();
        const dept = ['COMPLETE', 'COMPLETED', 'CLOSED'].includes(normalizedStatus)
          ? 'Completed'
          : (normalizeP2ControlDepartment(row.activeDepartment || row.currentTravelerStep || row.assignedDepartment || row.queueType || row.dashboardType) || 'Pending Layup');
        if (!departmentQueues[dept]) {
          departmentQueues[dept] = [];
        }

        const poId = row.poId ?? null;
        const linkedProject = row.projectId
          ? {
              projectId: row.projectId,
              projectCode: row.projectCode,
              projectName: row.projectName,
            }
          : (poId ? projectByPoId.get(Number(poId)) : null);
        const isComplete = ['COMPLETE', 'COMPLETED', 'CLOSED'].includes(normalizedStatus);
        const hasActiveTask = !isComplete && (
          !!row.activeDepartment ||
          ['IN_PROGRESS', 'ACTIVE', 'STARTED'].includes(String(row.activeTravelerStatus || '').toUpperCase()) ||
          ['IN_PROGRESS', 'ACTIVE', 'STARTED', 'RELEASED'].includes(normalizedStatus)
        );
        const wadContext = buildP2ItemWadContext(
          linkedProject,
          row.partNumber || row.workOrderNumber,
          wadByProjectPart,
          wadSummaryByProject
        );

        departmentQueues[dept].push({
          id: `legacy-project-work-order-${row.id}`,
          poId,
          productionWorkOrderId: row.id,
          workOrderNumber: row.workOrderNumber,
          barcode: row.activeTravelerNumber || row.workOrderNumber,
          serialNumber: row.activeTravelerNumber || row.workOrderNumber,
          partNumber: row.partNumber || row.workOrderNumber,
          partName: row.description || 'Legacy project work order',
          poNumber: getProductionDisplayPoNumber(Number(poId), row.poNumber),
          rawPoNumber: row.poNumber,
          customerName: row.customerName || 'Unknown',
          status: isComplete ? 'COMPLETED' : 'ACTIVE',
          currentDepartment: dept,
          currentStageIndex: 0,
          projectId: linkedProject?.projectId ?? null,
          projectCode: linkedProject?.projectCode ?? null,
          projectName: linkedProject?.projectName ?? null,
          ...wadContext,
          isLegacyProjectWorkOrder: true,
          activeTravelerId: row.activeTravelerId || null,
          activeTravelerNumber: row.activeTravelerNumber || null,
          hasActiveTask,
          barcodePrintedAt: null,
          activeTask: hasActiveTask ? {
            id: row.id,
            employeeName: 'Project work order',
            employeeCode: '',
            startedAt: row.dueDate,
          } : null,
        });
      });
      
      // Format response with department summaries
      const departments = departmentOrder
        .map(dept => {
          const queueItems = departmentQueues[dept] || [];
          const inProgressCount = queueItems.filter(i => i.hasActiveTask).length;
          const waitingCount = queueItems.filter(i => i.status === 'ACTIVE' && !i.hasActiveTask).length;
          
          return {
            name: dept,
            totalItems: queueItems.length,
            inProgress: inProgressCount,
            waiting: waitingCount,
            items: queueItems,
          };
        })
        .filter(dept => dept.totalItems > 0);
      
      res.json({
        departments,
        summary: {
          totalActive: items.filter((item: any) => item.status === 'ACTIVE').length
            + legacyProductionControlRows.filter((row: any) =>
              !['COMPLETED', 'CLOSED'].includes(String(row.status || '').toUpperCase())
            ).length
            + activeLegacyProjectProductionRows.filter((row: any) =>
              !['COMPLETE', 'COMPLETED', 'CLOSED'].includes(String(row.status || '').toUpperCase())
            ).length,
          totalInProgress: p2ControlRows(activeTasks).length
            + items.filter((item: any) =>
              (item.activeTravelerNumber || item.active_traveler_number) && !taskByItemId.has(item.id)
            ).length
            + legacyProductionControlRows.filter((row: any) =>
              String(row.status || '').toUpperCase() === 'IN_PROGRESS'
            ).length
            + activeLegacyProjectProductionRows.filter((row: any) =>
              ['IN_PROGRESS', 'ACTIVE', 'STARTED', 'RELEASED'].includes(String(row.status || '').toUpperCase())
              || !!row.activeDepartment
            ).length,
          departmentCount: departments.filter(d => d.totalItems > 0).length,
        },
      });
    } catch (_error) {
      console.error('P2 Production Queue error:', _error);
      res.status(500).json({ error: 'Failed to fetch production queue' });
    }
  });

  // P2 Stamp barcode print event — sets barcode_printed_at = now() if not already set
  app.patch('/api/p2/control-center/stamp-barcode-printed', async (req, res) => {
    try {
      const { z } = await import('zod');
      const schema = z.object({
        serialNumbers: z.array(z.string().min(1)).min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
      }
      const { serialNumbers } = parsed.data;
      const { pool } = await import('../../db');
      const result = await pool.query(
        `UPDATE p2_serialized_items
         SET barcode_printed_at = NOW(), updated_at = NOW()
         WHERE serial_number = ANY($1::text[])
           AND barcode_printed_at IS NULL`,
        [serialNumbers]
      );
      res.json({ ok: true, stamped: result.rowCount ?? 0 });
    } catch (err: any) {
      console.error('Stamp barcode print error:', err);
      res.status(500).json({ error: err?.message || 'Failed to stamp barcode print' });
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
        rmaRequired: z.boolean().optional().default(false),
      });
      
      const validationResult = updateStatusSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validationResult.error.flatten() 
        });
      }
      
      const { status, reason, performedBy, notes, linkedTravelerId, rmaRequired } = validationResult.data;
      
      const { db } = await import('../../db');
      const {
        p2NonconformingDispositions,
        p2Rmas,
        p2SerializedItems,
        p2SerializedItemEvents,
        travelers,
        auditEvents,
      } = await import('../../schema');
      const { and, eq, desc, ne, sql } = await import('drizzle-orm');

      
      const [item] = await db.select().from(p2SerializedItems).where(eq(p2SerializedItems.id, itemId)).limit(1);
      
      if (!item) {
        return res.status(404).json({ error: 'Item not found' });
      }

      // Fetch the currently linked travelers for this serial number (used for cycle sentinel events)
      const linkedTravelers = item.serialNumber
        ? await db.select().from(travelers)
            .where(eq(travelers.serialNumber, item.serialNumber))
            .orderBy(desc(travelers.createdAt))
            .limit(10)
        : [];
      const activeTraveler = linkedTravelers.find(t => t.status === 'IN_PROGRESS')
        || linkedTravelers.find(t => t.status === 'COMPLETED')
        || linkedTravelers[0]
        || null;
      
      const updateFields: any = {
        status,
        updatedAt: new Date(),
      };

      if (status === 'COMPLETED') {
        updateFields.completedAt = new Date();
      }

      if (status === 'SCRAPPED') {
        updateFields.scrapReason = reason;
        updateFields.scrapBy = performedBy || 'System';
        updateFields.scrapAt = new Date();
      } else if (status === 'HOLD') {
        updateFields.holdReason = reason;
        updateFields.holdBy = performedBy || 'System';
        updateFields.holdAt = new Date();
      } else if (status === 'ACTIVE') {
        updateFields.holdReason = null;
        updateFields.holdBy = null;
        updateFields.holdAt = null;
      }

      // SCRAPPED transitions are atomic. In this P2 flow, SCRAPPED means the
      // original serial has left active production and entered open NCR.
      // Final trash/scrap is recorded later by the disposition workflow.
      // If an RMA is required, the status
      // update, trace events, and parent PO line qty bump all commit or roll
      // back together. If not, the item simply becomes P2 nonconforming and
      // waits for disposition in the P2 Control Center tab.
      const isFirstScrapTransition = status === 'SCRAPPED' && item.status !== 'SCRAPPED';
      if (isFirstScrapTransition) {
        const { storage } = await import('../../storage');
        const { and, ne } = await import('drizzle-orm');
        let replacementItem: typeof p2SerializedItems.$inferSelect | null = null;
        try {
          await db.transaction(async (tx) => {
            // Conditional update enforces idempotency inside the transaction
            // so simultaneous duplicate scrap requests cannot both pass the
            // pre-transaction `item.status` guard and double-bump qty.
            const claimed = await tx.update(p2SerializedItems)
              .set(updateFields)
              .where(and(
                eq(p2SerializedItems.id, itemId),
                ne(p2SerializedItems.status, 'SCRAPPED'),
              ))
              .returning({ id: p2SerializedItems.id });
            if (claimed.length === 0) {
              // Lost the race: another request already scrapped this item.
              return;
            }

            await tx.insert(p2SerializedItemEvents).values({
              serializedItemId: itemId,
              barcode: item.barcode,
              eventType: 'SCRAP',
              performedBy: performedBy || 'System',
              notes: [reason, notes].filter(Boolean).join(' — ') || `Status changed to ${status}`,
              metadata: { previousStatus: item.status, newStatus: status, linkedTravelerId: linkedTravelerId || null, rmaRequired },
            });

            await tx.insert(p2SerializedItemEvents).values({
              serializedItemId: itemId,
              barcode: item.barcode,
              eventType: 'CYCLE_SCRAPPED',
              performedBy: performedBy || 'System',
              notes: `Production cycle scrapped — ${reason}`,
              metadata: {
                reason,
                rmaRequired,
                travelerId: activeTraveler?.id ?? null,
                travelerNumber: activeTraveler?.travelerNumber ?? null,
                serialNumber: item.serialNumber,
              },
            });

            if (activeTraveler) {
              await tx.insert(auditEvents).values({
                entityType: 'traveler',
                entityId: activeTraveler.id,
                action: 'CYCLE_SCRAPPED',
                actorName: performedBy || 'System',
                reason,
                meta: {
                  travelerId: activeTraveler.id,
                  travelerNumber: activeTraveler.travelerNumber,
                  serialNumber: item.serialNumber,
                  serializedItemId: itemId,
                  barcode: item.barcode,
                  rmaRequired,
                },
              });
            }

            if (rmaRequired) {
              const now = new Date();
              const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
              const existingRmasResult = await tx.execute(sql`
                SELECT rma_number AS "rmaNumber"
                FROM ${p2Rmas}
                WHERE rma_number LIKE ${`RMA-P2-${dateStr}-%`}
              `);
              const existingRmas = (Array.isArray(existingRmasResult) ? existingRmasResult : (existingRmasResult.rows ?? [])) as Array<{ rmaNumber: string }>;
              const maxRmaNumberSequence = existingRmas.reduce((maxSeq, row) => {
                const match = String(row.rmaNumber || '').match(/-(\d+)$/);
                return match ? Math.max(maxSeq, Number(match[1]) || 0) : maxSeq;
              }, 0);
              const rmaNumber = `RMA-P2-${dateStr}-${maxRmaNumberSequence + 1}`;

              const [disposition] = await tx.insert(p2NonconformingDispositions)
                .values({
                  serializedItemId: item.id,
                  dispositionType: 'Repair',
                  poId: item.poId,
                  poNumber: item.poNumber,
                  authorization: performedBy || 'System',
                  partNumber: item.partNumber || '',
                  serialNumber: item.serialNumber || item.barcode || '',
                  dispositionDate: now.toISOString().slice(0, 10),
                  reasonType: 'other',
                  reasonOther: reason,
                  notes: [notes, `Production RMA replacement requested for ${item.serialNumber || item.barcode}`]
                    .filter(Boolean)
                    .join('\n'),
                  resolved: false,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();

              const [rma] = await tx.insert(p2Rmas)
                .values({
                  dispositionId: disposition.id,
                  serializedItemId: item.id,
                  rmaNumber,
                  status: 'open',
                  traceableMaterials: [],
                  notes: `Production RMA created from scrap decision for ${item.serialNumber || item.barcode}`,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning();

              const replacementMetadata = {
                isReplacement: true,
                replacementForSerializedItemId: item.id,
                replacementForSerialNumber: item.serialNumber,
                replacementForBarcode: item.barcode,
                replacementReason: reason,
                nonconformingDispositionId: disposition.id,
                nonconformingRmaId: rma.id,
                nonconformingRmaNumber: rmaNumber,
                rmaRequired: true,
                generatedFromScrapAt: new Date().toISOString(),
                generatedWithoutPoQuantityIncrease: true,
              };

              if (!item.poItemId) {
                throw new Error(`Cannot allocate RMA replacement for ${item.serialNumber}: missing PO item link`);
              }

              const [allocatedReplacement] = await storage.addP2SerializedItemsForPoItem(item.poItemId, 1, tx);
              if (!allocatedReplacement) {
                throw new Error(`Failed to allocate replacement serial for scrapped serial ${item.serialNumber}`);
              }

              const [createdReplacement] = await tx
                .update(p2SerializedItems)
                .set({
                  metadata: {
                    ...((allocatedReplacement.metadata as Record<string, unknown> | null) || {}),
                    ...replacementMetadata,
                    replacementSerialNumber: allocatedReplacement.serialNumber,
                  },
                  partRoutingId: item.partRoutingId ?? allocatedReplacement.partRoutingId,
                  partRoutingRevision: item.partRoutingRevision ?? allocatedReplacement.partRoutingRevision,
                  sku: item.sku,
                  drawingName: item.drawingName,
                  buildFamilyKey: item.buildFamilyKey || allocatedReplacement.buildFamilyKey,
                  notes: `RMA replacement generated for scrapped serial ${item.serialNumber}`,
                  updatedAt: new Date(),
                })
                .where(eq(p2SerializedItems.id, allocatedReplacement.id))
                .returning();

              replacementItem = createdReplacement;

              await tx.insert(p2SerializedItemEvents).values({
                serializedItemId: createdReplacement.id,
                barcode: createdReplacement.barcode,
                eventType: 'REPLACEMENT_GENERATED',
                toDepartment: createdReplacement.currentDepartment,
                toStageIndex: createdReplacement.currentStageIndex,
                performedBy: performedBy || 'System',
                notes: `RMA replacement ${createdReplacement.serialNumber} generated for scrapped serial ${item.serialNumber}`,
                metadata: {
                  scrappedSerializedItemId: item.id,
                  scrappedSerialNumber: item.serialNumber,
                  scrappedBarcode: item.barcode,
                  dispositionId: disposition.id,
                  rmaId: rma.id,
                  rmaNumber,
                  replacementSerialNumber: createdReplacement.serialNumber,
                  rmaRequired: true,
                  scrapReason: reason,
                  generatedWithoutPoQuantityIncrease: true,
                },
              });

              await tx.insert(p2SerializedItemEvents).values({
                serializedItemId: item.id,
                barcode: item.barcode,
                eventType: 'NCR_RMA_OPENED',
                performedBy: performedBy || 'System',
                notes: `Production RMA ${rmaNumber} opened for scrapped serial ${item.serialNumber}`,
                metadata: {
                  dispositionId: disposition.id,
                  rmaId: rma.id,
                  rmaNumber,
                  replacementSerializedItemId: createdReplacement.id,
                  replacementSerialNumber: createdReplacement.serialNumber,
                  reason,
                },
              });
            }
          });
        } catch (scrapErr: unknown) {
          const code = (scrapErr as { code?: string } | null)?.code;
          const message = (scrapErr as Error)?.message || 'Failed to scrap item';
          console.error('P2 Scrap atomic transaction failed:', scrapErr);
          if (code === 'PO_ITEM_NOT_FOUND' || code === 'PO_NOT_FOUND' || code === 'ITEM_NOT_FOUND') {
            return res.status(404).json({ error: message });
          }
          if (code === 'PO_LOCKED' || code === 'IN_PROGRESS_BLOCKS_DECREASE') {
            return res.status(409).json({ error: message });
          }
          // Postgres deadlock_detected (40P01) and serialization_failure (40001)
          // are retryable by the caller — surface as 409 instead of 500.
          if (code === '40P01' || code === '40001') {
            return res.status(409).json({ error: `Scrap conflicted with a concurrent update — please retry: ${message}` });
          }
          return res.status(500).json({ error: `Failed to scrap item: ${message}` });
        }

        return res.json({
          success: true,
          message: replacementItem
            ? `NCR opened and RMA replacement ${replacementItem.serialNumber} generated for scheduling`
            : `Item status updated to ${status}`,
          travelerCreated: false,
          linkedTravelerFound: false,
          rmaRequired,
          replacementCreated: !!replacementItem,
          replacementItem,
        });
      }

      await db.update(p2SerializedItems)
        .set(updateFields)
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

      // Write cycle sentinel events to mark manufacturing cycle boundaries
      if (status === 'ACTIVE' && item.status === 'SCRAPPED') {
        // CYCLE_RESTARTED: marks the beginning of a new production cycle for this serial number
        await db.insert(p2SerializedItemEvents).values({
          serializedItemId: itemId,
          barcode: item.barcode,
          eventType: 'CYCLE_RESTARTED',
          performedBy: performedBy || 'System',
          notes: `Production cycle restarted — ${reason}`,
          metadata: {
            reason,
            previousTravelerId: activeTraveler?.id ?? null,
            previousTravelerNumber: activeTraveler?.travelerNumber ?? null,
            serialNumber: item.serialNumber,
          },
        });
        // Also write to the main audit events table
        if (activeTraveler) {
          await db.insert(auditEvents).values({
            entityType: 'traveler',
            entityId: activeTraveler.id,
            action: 'CYCLE_RESTARTED',
            actorName: performedBy || 'System',
            reason,
            meta: {
              previousTravelerId: activeTraveler.id,
              previousTravelerNumber: activeTraveler.travelerNumber,
              serialNumber: item.serialNumber,
              serializedItemId: itemId,
              barcode: item.barcode,
            },
          });
        }
      }

      let travelerCreated = false;
      let linkedTravelerFound = false;
      if (status === 'COMPLETED') {
        if (linkedTravelerId) {
          const [existingTraveler] = await db.select().from(travelers).where(eq(travelers.id, linkedTravelerId)).limit(1);
          if (existingTraveler) {
            linkedTravelerFound = true;
            const offSystemSummary = notes ? `Off-system: ${notes.substring(0, 100)}` : 'Off-system production';
            // Preserve a real (non-off-system) workOrderId if one was already
            // recorded against the existing traveler — only stamp the legacy
            // off-system summary when the field is empty or already off-system.
            const shouldStampWorkOrderId =
              !existingTraveler.workOrderId || existingTraveler.workOrderId.startsWith('Off-system');
            await db.update(travelers)
              .set({
                serialNumber: existingTraveler.serialNumber || item.barcode,
                status: 'COMPLETED',
                // Always store a non-null value so off-system completions are
                // reliably detectable even when the user provided no notes
                // and the existing traveler has a real (non-off-system)
                // workOrderId. Empty string is the off-system sentinel.
                offSystemCompletionLink: notes || existingTraveler.offSystemCompletionLink || '',
                ...(shouldStampWorkOrderId ? { workOrderId: offSystemSummary } : {}),
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
              offSystemCompletionLink: notes || '',
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
            offSystemCompletionLink: notes || '',
          });
          travelerCreated = true;
        }
      }

      // Note: the SCRAPPED-first-transition path is handled atomically above
      // and short-circuits with its own response. A repeat scrap on an
      // already-SCRAPPED item falls through to the legacy status update path
      // and is intentionally a no-op for the qty bump.

      res.json({
        success: true,
        message: `Item status updated to ${status}`,
        travelerCreated,
        linkedTravelerFound,
        replacementCreated: false,
        replacementItem: null,
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
      const { bomDefinitions, bomItems: bomItemsTable, inventoryItems } = await import('../../schema');
      const { eq, and, inArray } = await import('drizzle-orm');
      
      const po = await storage.getP2PurchaseOrder(parseInt(id), { includeItems: true });
      
      if (!po) {
        return res.status(404).json({ error: 'P2 Purchase Order not found' });
      }
      
      // Get line items with BOM status
      const lineItems = await Promise.all((po.items || []).map(async (item: any) => {
        const [linkedInventoryItem] = item.inventoryItemId
          ? await db
            .select({
              id: inventoryItems.id,
              agPartNumber: inventoryItems.agPartNumber,
              name: inventoryItems.name,
            })
            .from(inventoryItems)
            .where(eq(inventoryItems.id, item.inventoryItemId))
            .limit(1)
          : [];
        const internalPartNumber = linkedInventoryItem?.agPartNumber || null;
        const bomLookupKeys = [internalPartNumber, item.partNumber].filter(Boolean);

        // Check if a BOM exists for this part number
        const existingBOM = await db
          .select()
          .from(bomDefinitions)
          .where(and(
            bomLookupKeys.length > 1
              ? inArray(bomDefinitions.sku, bomLookupKeys)
              : eq(bomDefinitions.sku, bomLookupKeys[0] || item.partNumber),
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
          internalPartNumber,
          inventoryPartName: linkedInventoryItem?.name || null,
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

  app.post('/api/p2-purchase-orders/:id/reconcile-quote', async (req, res) => {
    try {
      const poId = parseInt(req.params.id, 10);
      if (!Number.isFinite(poId)) {
        return res.status(400).json({ error: 'Invalid PO ID' });
      }

      const { reconcileCustomerPoToQuote } = await import('../services/quoteContractService');
      const reconciliation = await reconcileCustomerPoToQuote(poId);
      if (!reconciliation) {
        return res.status(404).json({ error: 'P2 PO is not linked to a source quote' });
      }

      res.json(reconciliation);
    } catch (error) {
      console.error('P2 quote reconciliation error:', error);
      res.status(500).json({ error: 'Failed to reconcile P2 PO against source quote' });
    }
  });

  app.get('/api/p2/quote-po-reconciliations/latest', async (_req, res) => {
    try {
      const { getLatestQuotePoReconciliations } = await import('../services/quoteContractService');
      const reconciliations = await getLatestQuotePoReconciliations();
      res.json(reconciliations);
    } catch (error) {
      console.error('Get latest P2 quote reconciliations error:', error);
      res.status(500).json({ error: 'Failed to fetch latest quote reconciliations' });
    }
  });

  app.get('/api/p2-purchase-orders/:id/quote-reconciliation', async (req, res) => {
    try {
      const poId = parseInt(req.params.id, 10);
      if (!Number.isFinite(poId)) {
        return res.status(400).json({ error: 'Invalid PO ID' });
      }

      const { getLatestQuotePoReconciliation } = await import('../services/quoteContractService');
      const reconciliation = await getLatestQuotePoReconciliation(poId);
      if (!reconciliation) {
        return res.status(404).json({ error: 'No quote reconciliation found for this P2 PO' });
      }

      res.json(reconciliation);
    } catch (error) {
      console.error('Get P2 quote reconciliation error:', error);
      res.status(500).json({ error: 'Failed to fetch P2 quote reconciliation' });
    }
  });

  app.get('/api/p2/purchase-orders/:id/pdf', sessionAwareAuth, async (req, res) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required to access P2 purchase order documents' });
    }
    try {
      const poId = parseInt(req.params.id);
      if (isNaN(poId)) return res.status(400).json({ error: 'Invalid PO ID' });

      const { storage } = await import('../../storage');
      const po = await storage.getP2PurchaseOrder(poId, { includeItems: true });
      if (!po) return res.status(404).json({ error: 'Purchase order not found' });

      const { generateP2PurchaseOrderPdf } = await import('../../utils/pdf/p2PurchaseOrderPdf');
      const pdfBuffer = await generateP2PurchaseOrderPdf({
        poNumber: po.poNumber,
        customerName: po.customerName,
        customerId: po.customerId,
        poDate: po.poDate,
        expectedDelivery: po.expectedDelivery,
        status: po.status,
        notes: po.notes,
        projectName: po.projectName,
        lineItems: (po.items || []).map((item: any) => ({
          partNumber: item.partNumber,
          partName: item.partName,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          specifications: item.specifications,
          notes: item.notes,
        })),
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="PO-${po.poNumber}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);
      res.end(pdfBuffer);
    } catch (err: any) {
      console.error('[P2 PO PDF] Error generating PDF:', err);
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  });

  app.post('/api/p2/bom/:partId', async (req, res) => {
    try {
      const { partId } = req.params;
      const { bomItems: bomItemsInput, poItemId, partNumber } = req.body;
      
      const { db } = await import('../../db');
      const { bomDefinitions, bomItems: bomItemsTable, inventoryItems, p2PurchaseOrders, p2PurchaseOrderItems } = await import('../../schema');
      const { eq, and, sql, inArray } = await import('drizzle-orm');
      
      console.log(`Saving BOM for part ${partId}, partNumber: ${partNumber}:`, bomItemsInput);

      const poItemIdNum = parseInt(poItemId);
      const [linkedPoItem] = poItemId && !isNaN(poItemIdNum) && !String(poItemId).startsWith('mfg-')
        ? await db
          .select()
          .from(p2PurchaseOrderItems)
          .where(eq(p2PurchaseOrderItems.id, poItemIdNum))
          .limit(1)
        : [];
      const [linkedPoInventoryItem] = linkedPoItem?.inventoryItemId
        ? await db
          .select({
            id: inventoryItems.id,
            agPartNumber: inventoryItems.agPartNumber,
            name: inventoryItems.name,
          })
          .from(inventoryItems)
          .where(eq(inventoryItems.id, linkedPoItem.inventoryItemId))
          .limit(1)
        : [];

      const canonicalPartNumber = String(linkedPoInventoryItem?.agPartNumber || partNumber || linkedPoItem?.partNumber || `P2-PART-${partId}`).trim();
      const normalizedBomItems = await Promise.all((bomItemsInput || []).map(async (item: any) => {
        const quantity = Number.parseFloat(String(item.quantity ?? ''));
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Invalid BOM quantity for ${item.partNumber || 'component'}`);
        }

        const inventoryItemId = item.inventoryItemId ? Number.parseInt(String(item.inventoryItemId), 10) : null;
        const [linkedInventoryItem] = inventoryItemId
          ? await db
            .select({
              id: inventoryItems.id,
              agPartNumber: inventoryItems.agPartNumber,
              name: inventoryItems.name,
            })
            .from(inventoryItems)
            .where(eq(inventoryItems.id, inventoryItemId))
            .limit(1)
          : [];

        const componentPartNumber = String(linkedInventoryItem?.agPartNumber || item.partNumber || '').trim();
        if (!componentPartNumber) {
          throw new Error('BOM component part number is required');
        }

        return {
          ...item,
          quantity,
          partNumber: componentPartNumber,
          description: item.description || linkedInventoryItem?.name || '',
          inventoryItemId: linkedInventoryItem?.id ?? inventoryItemId ?? null,
        };
      }));
      
      // Gather all manufactured child part numbers upfront for batch lookup
      const manufacturedPartNumbers = normalizedBomItems
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
      if (canonicalPartNumber) {
        const existing = await db
          .select()
          .from(bomDefinitions)
          .where(eq(bomDefinitions.sku, canonicalPartNumber))
          .limit(1);
        
        if (existing.length > 0) {
          bomDef = existing[0];
        }
      }
      
      // Create new BOM definition if it doesn't exist
      if (!bomDef) {
        const [newBom] = await db.insert(bomDefinitions).values({
          sku: canonicalPartNumber,
          inventoryItemId: linkedPoInventoryItem?.id ?? null,
          modelName: linkedPoInventoryItem?.name || canonicalPartNumber,
          revision: 'A',
          description: `BOM for P2 part ${canonicalPartNumber}`,
          isActive: true
        }).returning();
        bomDef = newBom;
      } else if (linkedPoInventoryItem?.id && !bomDef.inventoryItemId) {
        const [updatedBom] = await db
          .update(bomDefinitions)
          .set({ inventoryItemId: linkedPoInventoryItem.id, updatedAt: new Date() })
          .where(eq(bomDefinitions.id, bomDef.id))
          .returning();
        bomDef = updatedBom || bomDef;
      }
      
      // Clear existing BOM items for this definition
      await db
        .update(bomItemsTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(bomItemsTable.bomId, bomDef.id));
      
      // Insert new BOM items and create BOM definitions for manufactured children
      const insertedItems = [];
      const createdChildBomDefinitions = [];
      
      for (const item of normalizedBomItems) {
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
                  inventoryItemId: item.inventoryItemId ?? null,
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
          quantity: item.quantity,
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
      if (linkedPoItem) {
        const poItem = linkedPoItem;
        
        if (poItem) {
          // Check if all items for this PO have BOMs
          const allItems = await db
            .select()
            .from(p2PurchaseOrderItems)
            .where(eq(p2PurchaseOrderItems.poId, poItem.poId));
          
          let allHaveBOMs = true;
          for (const pi of allItems) {
            const [piInventoryItem] = pi.inventoryItemId
              ? await db
                .select({
                  agPartNumber: inventoryItems.agPartNumber,
                })
                .from(inventoryItems)
                .where(eq(inventoryItems.id, pi.inventoryItemId))
                .limit(1)
              : [];
            const piBomKey = piInventoryItem?.agPartNumber || pi.partNumber;
            const hasBOM = await db
              .select()
              .from(bomDefinitions)
              .where(and(
                eq(bomDefinitions.sku, piBomKey),
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
            const { p2SerializedItems } = await import('../../schema');
            const { eq: eqOp } = await import('drizzle-orm');
            
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
                await storage.addP2SerializedItemsForPoItem(lineItem.id, lineItem.quantity || 1);
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
              const bomHasPacketItems = normalizedBomItems.some((item: any) => item.isManufactured);

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

  // Schedule items by moving them from "Pending Layup" to "Layup" department.
  // The handler lives in `./p2ScheduleItems` so it can be mounted independently
  // in tests without loading registerRoutes' full dependency graph.
  app.use(p2ScheduleItemsRoutes);

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

      // Log the rejection
      console.log('Tolerance deviation rejected:', {
        inspectionId,
        serializedItemId,
        rejectedBy,
        rejectedByName
      });

      // Move the serialized item into the same nonconforming/disposition flow
      // used by P2 Control Center scrap. The open disposition queue reads
      // p2_serialized_items.status = SCRAPPED, while production only shows ACTIVE.
      if (serializedItemId) {
        const { db } = await import('../../db');
        const { p2SerializedItems, p2SerializedItemEvents } = await import('../../schema');
        const { eq } = await import('drizzle-orm');

        const [item] = await db
          .select()
          .from(p2SerializedItems)
          .where(eq(p2SerializedItems.id, serializedItemId))
          .limit(1);

        if (!item) {
          return res.status(404).json({ error: 'Serialized item not found' });
        }

        const now = new Date();
        const actor = rejectedByName || rejectedBy || 'System';
        const reason = 'Tolerance deviation rejected - NCR/Scrap disposition required';
        const existingMetadata =
          item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)
            ? item.metadata
            : {};

        await db.update(p2SerializedItems)
          .set({
            status: 'SCRAPPED',
            scrapReason: reason,
            scrapBy: actor,
            scrapAt: now,
            notes: `Tolerance deviation rejected by ${actor} on ${now.toISOString()} - requires NCR/Scrap disposition`,
            metadata: {
              ...existingMetadata,
              hasToleranceDeviation: true,
              toleranceDeviationRejected: true,
              toleranceDeviationRejectedAt: now.toISOString(),
              toleranceDeviationRejectedBy: actor,
              finalInspectionId: inspectionId,
            },
            updatedAt: now,
          })
          .where(eq(p2SerializedItems.id, serializedItemId));

        await db.insert(p2SerializedItemEvents).values({
          serializedItemId,
          barcode: item.barcode,
          eventType: 'SCRAP',
          performedBy: actor,
          notes: reason,
          metadata: {
            source: 'final-inspection-reject-deviation',
            inspectionId,
            previousStatus: item.status,
            newStatus: 'SCRAPPED',
            dispositionRequired: true,
          },
        });
      }

      res.json({ 
        success: true, 
        message: 'Tolerance deviation rejected - item moved to NCR/Scrap open disposition',
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

  // GET unit counts for a P2 PO item (preview impact of qty edits in UI)
  app.get('/api/p2/purchase-orders/:poId/items/:itemId/unit-counts', async (req, res) => {
    try {
      const { itemId } = req.params;
      const { storage } = await import('../../storage');
      const counts = await storage.getP2PoItemUnitCounts(parseInt(itemId));
      res.json(counts);
    } catch (error) {
      console.error('Get P2 PO item unit counts error:', error);
      res.status(500).json({ error: 'Failed to fetch unit counts' });
    }
  });

  app.put('/api/p2/purchase-orders/:poId/items/:itemId', async (req, res) => {
    try {
      const { poId, itemId } = req.params;
      const poIdNum = parseInt(poId);
      const itemIdNum = parseInt(itemId);
      const { storage } = await import('../../storage');
      const { insertP2PurchaseOrderItemSchema } = await import('../../schema');

      const itemData = insertP2PurchaseOrderItemSchema
        .partial()
        .omit({ poId: true })
        .parse(req.body);

      const reqUser = (req as Express.Request & {
        user?: { username?: string; email?: string; role?: string };
      }).user;
      const actor = {
        username: reqUser?.username || reqUser?.email || 'system',
        role: reqUser?.role || 'SYSTEM',
        ipAddress: req.ip,
        userAgent: req.get('user-agent') || null,
      };

      const result = await storage.updateP2PoItemWithQtySync(
        poIdNum,
        itemIdNum,
        itemData,
        actor,
      );

      res.json({ ...result.item, sync: result.sync });
    } catch (error) {
      const { z } = await import('zod');
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid P2 purchase order item data',
          details: error.errors,
        });
      }

      const code = (error as Error & { code?: string }).code;
      if (code === 'PO_NOT_FOUND' || code === 'ITEM_NOT_FOUND') {
        return res.status(404).json({ error: (error as Error).message });
      }
      if (code === 'PO_LOCKED') {
        const lockedErr = error as Error & {
          lockedAt?: Date | null;
          lockedBy?: number | null;
        };
        return res.status(403).json({
          error: lockedErr.message,
          lockedAt: lockedErr.lockedAt ?? null,
          lockedBy: lockedErr.lockedBy ?? null,
        });
      }
      if (code === 'IN_PROGRESS_BLOCKS_DECREASE') {
        const conflictErr = error as Error & {
          minQuantity: number;
          inProgressCount: number;
          unstartedCount: number;
          currentQuantity: number;
          requestedQuantity: number;
        };
        return res.status(409).json({
          error: conflictErr.message,
          code,
          minQuantity: conflictErr.minQuantity,
          inProgressCount: conflictErr.inProgressCount,
          unstartedCount: conflictErr.unstartedCount,
          currentQuantity: conflictErr.currentQuantity,
          requestedQuantity: conflictErr.requestedQuantity,
        });
      }

      console.error('Update P2 purchase order item error:', error);
      res.status(500).json({ error: 'Failed to update P2 purchase order item' });
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

  // Legacy external Python scheduler handler retained off the public route.
  app.post('/api/internal/legacy/python-scheduler-external', async (req, res) => {
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

  // Legacy queue workflow retained off the public route so the department manager handler remains canonical.
  app.post('/api/internal/legacy/push-to-layup-plugging-queue', async (req, res) => {
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
        // Update production orders status to IN_PROGRESS
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
                productionStatus: 'IN_PROGRESS',
                laidUpAt: new Date(),
              }
            );
            updatedOrders.push(updated);
            console.log(`✅ Production order ${orderId} moved to IN_PROGRESS status`);
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
      const { pgPool: itemsPool } = await import('../../db');
      const { id } = req.params;
      const itemData = { ...req.body, poId: parseInt(id) };
      const validatedData = insertPurchaseOrderItemSchema.parse(itemData);

      // Server-side deduplication: if the exact same item (same po_id + item_id + unit_price)
      // was inserted within the last 10 seconds, return the existing row instead of inserting again.
      // This prevents multi-click / rapid-resubmit from creating duplicates even if the client
      // guard is somehow bypassed.
      const recentDupe = await itemsPool.query(`
        SELECT * FROM purchase_order_items
        WHERE po_id = $1
          AND item_id = $2
          AND unit_price = $3
          AND created_at > NOW() - INTERVAL '10 seconds'
        ORDER BY created_at DESC
        LIMIT 1
      `, [validatedData.poId, validatedData.itemId, validatedData.unitPrice]);

      if (recentDupe.rows.length > 0) {
        console.log(`🔧 Duplicate PO item suppressed (po_id=${validatedData.poId} item_id=${validatedData.itemId} within 10s)`);
        return res.status(201).json(recentDupe.rows[0]);
      }

      const newItem = await storage.createPurchaseOrderItem(validatedData);
      console.log('🔧 Created PO item:', newItem.id);

      // Re-open the parent PO if it is CLOSED (item added to a closed P1 customer PO).
      // Single atomic UPDATE — only touches the row when status is actually CLOSED.
      try {
        const reopenResult = await itemsPool.query(
          `UPDATE purchase_orders SET status = 'OPEN' WHERE id = $1 AND status = 'CLOSED' RETURNING id`,
          [validatedData.poId]
        );
        if (reopenResult.rowCount && reopenResult.rowCount > 0) {
          console.log(`🔧 Reopened CLOSED PO ${validatedData.poId} after new item was added`);
        }
      } catch (reopenError) {
        // Log as error so ops notices if the reopen fails (item was still created).
        console.error(`🔧 ALERT: Failed to reopen CLOSED PO ${validatedData.poId} after item add — manual intervention may be required:`, reopenError);
      }

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
    } catch (_error: any) {
      console.error('🔧 Update PO item _error:', _error);
      if (_error?.name === 'TransitionValidationError') {
        return res.status(422).json({ _error: _error.message, code: _error.code, context: _error.context });
      }
      res.status(500).json({ _error: 'Failed to update purchase order item' });
    }
  });

  // PATCH /api/pos/:poId/items/:itemId/stock-model — atomically update stockModelId, stockModelName, and specifications.stockModel
  app.patch('/api/pos/:poId/items/:itemId/stock-model', async (req, res) => {
    try {
      const { poId, itemId } = req.params;
      const { stockModelId } = req.body;

      if (!stockModelId || typeof stockModelId !== 'string') {
        return res.status(400).json({ error: 'stockModelId (string) is required' });
      }

      const { storage } = await import('../../storage');
      const { db } = await import('../../db');
      const { stockModels } = await import('../../schema');
      const { eq } = await import('drizzle-orm');

      const [stockModel] = await db.select().from(stockModels).where(eq(stockModels.id, stockModelId)).limit(1);
      if (!stockModel) {
        return res.status(404).json({ error: `Stock model '${stockModelId}' not found` });
      }

      const currentItem = await storage.getPurchaseOrderItem(parseInt(itemId));
      if (!currentItem) {
        return res.status(404).json({ error: `PO item ${itemId} not found` });
      }

      const updatedSpecs = {
        ...(currentItem.specifications as Record<string, any> || {}),
        stockModel: stockModel.id,
      };

      const updatedItem = await storage.updatePurchaseOrderItem(parseInt(itemId), {
        stockModelId: stockModel.id,
        stockModelName: stockModel.displayName || stockModel.name,
        specifications: updatedSpecs,
      });

      console.log(`🔧 PATCH stock-model: PO item ${itemId} → ${stockModel.id} (${stockModel.displayName})`);
      res.json(updatedItem);
    } catch (_error: any) {
      console.error('🔧 PATCH stock-model error:', _error);
      if (_error?.name === 'TransitionValidationError') {
        return res.status(422).json({ error: _error.message, code: _error.code, context: _error.context });
      }
      res.status(500).json({ error: 'Failed to update stock model on PO item' });
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
  const poAttachmentsDir = path.join(uploadsDir, 'po-attachments');

  if (!fs.existsSync(poAttachmentsDir)) {
    fs.mkdirSync(poAttachmentsDir, { recursive: true });
  }

  const poAttachmentUpload = multer({
    storage: multer.diskStorage({
      destination: (_req: any, _file: any, cb: any) => cb(null, poAttachmentsDir),
      filename: (_req: any, file: any, cb: any) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const basename = path
          .basename(file.originalname, ext)
          .replace(/[^a-zA-Z0-9-_]/g, '_')
          .slice(0, 90);
        cb(null, `${Date.now()}_${crypto.randomBytes(8).toString('hex')}_${basename}${ext}`);
      },
    }),
    fileFilter: (_req: any, file: any, cb: any) => {
      if (file.mimetype === 'application/pdf') {
        cb(null, true);
        return;
      }
      cb(new Error('Only PDF files are allowed'));
    },
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  });

  function isLocalPoAttachmentPath(filePath: string | null | undefined) {
    if (!filePath) return false;
    const resolvedFile = path.resolve(filePath);
    const resolvedDir = path.resolve(poAttachmentsDir);
    return resolvedFile.startsWith(resolvedDir + path.sep) || resolvedFile === resolvedDir;
  }

  // Request presigned upload URL for PO attachment
  app.post('/api/pos/:id/attachments/request-upload-url', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, size, contentType } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Missing required field: name' });
      }

      console.log(`📎 Requesting upload URL for PO ${id}: ${name}`);

      const uploadTarget = await getFileStorageProvider().createUploadTarget({
        fileName: name,
        contentType,
        scope: 'po-attachments',
        entityId: id,
      });

      console.log(`📎 Generated upload URL for ${name}, objectPath: ${uploadTarget.objectPath}`);

      res.json({
        uploadURL: uploadTarget.uploadURL,
        objectPath: uploadTarget.objectPath,
        provider: uploadTarget.provider,
        metadata: { name, size, contentType, poId: id },
      });
    } catch (error: any) {
      const { status, reason, message } = getStorageErrorResponse(error);
      console.error('Error generating PO attachment upload URL:', { status, reason, message });
      res.status(status).json({ error: 'Failed to generate upload URL', reason, details: message });
    }
  });

  // Server-mediated fallback for environments where object URL signing/direct upload is unavailable.
  app.post('/api/pos/:id/attachments/local-upload', poAttachmentUpload.single('file'), async (req: any, res) => {
    try {
      const poId = parseInt(req.params.id);
      const user = req.user;
      const file = req.file as Express.Multer.File | undefined;

      if (!file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const { storage } = await import('../../storage');
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        if (isLocalPoAttachmentPath(file.path) && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
        return res.status(404).json({ error: 'Purchase order not found' });
      }

      const { randomUUID } = await import('crypto');
      const attachment = {
        id: randomUUID(),
        fileName: file.filename,
        originalFileName: file.originalname,
        filePath: file.path,
        fileSize: file.size || 0,
        mimeType: file.mimetype || 'application/pdf',
        uploadedBy: user?.username || null,
        uploadedAt: new Date().toISOString(),
        notes: req.body?.notes || null,
      };

      const currentAttachments = (purchaseOrder as any).attachments || [];
      await storage.updatePurchaseOrder(poId, {
        attachments: [...currentAttachments, attachment],
      } as any);

      console.warn('[PO attachments] Saved through local fallback', {
        poId,
        attachmentId: attachment.id,
        fileName: attachment.originalFileName,
      });

      res.status(201).json(attachment);
    } catch (error: any) {
      const file = req.file as Express.Multer.File | undefined;
      if (file?.path && isLocalPoAttachmentPath(file.path) && fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
      console.error('Error uploading PO attachment through local fallback:', error);
      res.status(500).json({ error: error.message || 'Failed to upload attachment' });
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

      // Set ACL policy to make file accessible
      try {
        await getFileStorageProviderForObjectPath(objectPath).setPublicReadPolicy(
          objectPath,
          user?.id?.toString() || 'system',
        );
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
        const normalizedPath = attachmentToDelete.filePath?.startsWith('objects/')
          ? `/${attachmentToDelete.filePath}`
          : attachmentToDelete.filePath;
        if (normalizedPath?.startsWith('/objects/')) {
          await getFileStorageProviderForObjectPath(normalizedPath).deleteObject(normalizedPath);
          console.log('📎 Deleted file from storage:', attachmentToDelete.filePath);
        } else if (isLocalPoAttachmentPath(attachmentToDelete.filePath) && fs.existsSync(path.resolve(attachmentToDelete.filePath))) {
          fs.unlinkSync(path.resolve(attachmentToDelete.filePath));
          console.log('[PO attachments] Deleted local fallback file:', attachmentToDelete.filePath);
        }
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

      const forceDownload = req.query.download === 'true';

      const normalizedPath = attachment.filePath?.startsWith('objects/')
        ? `/${attachment.filePath}`
        : attachment.filePath;

      if (!normalizedPath) {
        return res.status(404).json({ error: 'File not found in storage' });
      }

      if (normalizedPath.startsWith('/objects/')) {
        res.setHeader(
          'Content-Disposition',
          `${forceDownload ? 'attachment' : 'inline'}; filename="${attachment.originalFileName}"`
        );
        res.setHeader('Content-Type', attachment.mimeType || 'application/pdf');
        await getFileStorageProviderForObjectPath(normalizedPath).downloadObject(normalizedPath, res);
        return;
      }

      if (isLocalPoAttachmentPath(normalizedPath) && fs.existsSync(path.resolve(normalizedPath))) {
        res.setHeader(
          'Content-Disposition',
          `${forceDownload ? 'attachment' : 'inline'}; filename="${attachment.originalFileName}"`
        );
        res.setHeader('Content-Type', attachment.mimeType || 'application/pdf');
        res.sendFile(path.resolve(normalizedPath));
        return;
      }

      res.status(404).json({
        error: 'File not available. It may have been stored locally and is not accessible in this environment.',
      });
    } catch (error: any) {
      const { status, reason, message } = getStorageErrorResponse(error);
      console.error('Error downloading PO attachment:', { status, reason, message });
      if (res.headersSent) {
        return res.end();
      }
      res.status(status).json({
        error: status === 404 ? 'File not found in storage' : 'Failed to download attachment',
        reason,
        details: message,
      });
    }
  });

  // Shared filtering helpers for production order generation
  const PO_NON_STOCK_PATTERNS = [
    /bottom.?metal/i,
    /^bm[-_]/i,          // BM-xxx patterns for bottom metals
    /\brail\b/i,
    /\bswivel\b/i,
    /\bstud\b/i,
    /qd.?accessory/i,
    /^qd[-_]/i,          // QD-xxx patterns
    /\bhardware\b/i,
    /\bscrew\b/i,
    /\bbolt\b/i,
    /\bnut\b/i,
    /\bwasher\b/i,
    /\bpin\b/i,
    /\bspring\b/i,
    /\baccessory\b/i,
    /part.?only/i,
  ];

  // Metal accessory prefixes — normalize hyphens/underscores before testing so both
  // hyphenated (AG-M5-*) and non-hyphenated (AGM5*) formats are detected.
  const METAL_ACCESSORY_NORMALIZED_PREFIXES = ['AGM5', 'AGMS5', 'AGBDL', 'AGBM', 'AGPIC', 'AGARCA'];

  const isMetalAccessorySku = (value: string): boolean => {
    if (!value) return false;
    const normalized = value.trim().toUpperCase().replace(/[-_]/g, '');
    return METAL_ACCESSORY_NORMALIZED_PREFIXES.some((p) => normalized.startsWith(p));
  };

  const isPOItemMetalAccessory = (item: any): boolean => [
    item.itemName,
    item.stockModelName,
    item.stockModelId,
    item.itemId,
  ].some((value) => isMetalAccessorySku(value || ''));

  // Returns a human-readable display name for known metal accessory SKU patterns.
  // Keeps the raw SKU in parentheses so operators can still identify the exact part.
  function deriveMetalAccessoryDisplayName(sku: string): string {
    const u = sku.toUpperCase();
    if (/^AGARCA/.test(u)) return `ARCA Rail Chassis (${sku})`;
    if (/^AGM5SA/.test(u)) return `M5 Bottom Metal – Short Action (${sku})`;
    if (/^AGM5LA/.test(u)) return `M5 Bottom Metal – Long Action (${sku})`;
    if (/^AGM5/.test(u))   return `M5 Bottom Metal (${sku})`;
    if (/^AGBDLSA/.test(u)) return `Detachable BDL Bottom Metal – Short Action (${sku})`;
    if (/^AGBDLLA/.test(u)) return `Detachable BDL Bottom Metal – Long Action (${sku})`;
    if (/^AGBDL/.test(u))  return `Detachable BDL Bottom Metal (${sku})`;
    if (/^AGBM/.test(u))   return `Bottom Metal (${sku})`;
    if (/^AGPIC/.test(u))  return `Picatinny Rail (${sku})`;
    return sku;
  }

  const isPOItemNonStock = (item: any): boolean => {
    const allIdentifiers = `${item.itemName || item.stockModelName || ''} ${item.stockModelId || ''} ${item.itemId || ''}`;
    return PO_NON_STOCK_PATTERNS.some(pattern => pattern.test(allIdentifiers));
  };

  // Returns the best available product identifier for a PO item.
  // Prefer stockModelId (canonical stock model slug) but fall back to itemName (AG part number)
  // or itemId when stockModelId is absent — common when POs are imported with part numbers only.
  const getPOItemProductId = (item: any): string =>
    (item.stockModelId && item.stockModelId.trim() && item.stockModelId !== 'no_stock'
      ? item.stockModelId
      : null) ||
    (item.itemName && item.itemName.trim() && item.itemName !== 'no_stock'
      ? item.itemName
      : null) ||
    item.itemId ||
    '';

  const isPOItemEligibleForProduction = (item: any): boolean => {
    const productId = getPOItemProductId(item);
    // Known AG metal accessories are production children that route directly
    // to Shipping QC. They remain eligible even when their description contains
    // generic non-stock words such as "bottom metal" or "rail".
    return !!productId && (
      isPOItemMetalAccessory(item) || !isPOItemNonStock(item)
    );
  };

  // Preview Production Orders (dry-run) from Purchase Order Items
  app.post('/api/pos/:id/preview-production-orders', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const poId = parseInt(req.params.id);

      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ _error: 'Purchase order not found' });
      }

      const [poItems, existingOrders] = await Promise.all([
        storage.getPurchaseOrderItems(poId),
        storage.getProductionOrdersByPoId(poId),
      ]);
      const { getP1POReconciliation } = await import(
        '../services/p1POReconciliationService'
      );
      const reconciliationByItemId = new Map(
        (await getP1POReconciliation(poId)).map((line) => [
          line.purchaseOrderItemId,
          line,
        ]),
      );

      // Build per-item existing count map using active poItemId children.
      // Cancelled rows are history and must not block a safe missing-line backfill.
      const existingByItemId = new Map<number, number>();
      for (const order of existingOrders) {
        if (order.poItemId && order.productionStatus !== 'CANCELLED') {
          existingByItemId.set(order.poItemId, (existingByItemId.get(order.poItemId) ?? 0) + 1);
        }
      }

      const willGenerate: { name: string; quantity: number; orderCount: number; alreadyGenerated?: number }[] = [];
      const willSkip: { name: string; quantity: number; reason: string }[] = [];

      for (const item of poItems) {
        const productId = getPOItemProductId(item);
        const name = item.stockModelName || item.itemName || item.stockModelId || 'Unknown';

        if (!productId) {
          willSkip.push({ name, quantity: item.quantity, reason: 'No product identifier' });
          continue;
        }

        if (!isPOItemEligibleForProduction(item)) {
          willSkip.push({ name, quantity: item.quantity, reason: 'Non-stock / hardware part' });
          continue;
        }

        const alreadyGenerated = existingByItemId.get(item.id) ?? 0;
        const activePoQuantity =
          reconciliationByItemId.get(item.id)?.activePoQuantity ?? item.quantity;
        const remaining = activePoQuantity - alreadyGenerated;

        if (remaining <= 0) {
          willSkip.push({ name, quantity: activePoQuantity, reason: `Already generated (${alreadyGenerated}/${activePoQuantity})` });
          continue;
        }

        willGenerate.push({ name, quantity: activePoQuantity, orderCount: remaining, alreadyGenerated });
      }

      const totalOrderCount = willGenerate.reduce((sum, i) => sum + i.orderCount, 0);

      res.json({ willGenerate, willSkip, totalOrderCount });
    } catch (error) {
      console.error('Preview production orders error:', error);
      res.status(500).json({ _error: 'Failed to preview production orders' });
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

      // Get the purchase order details
      const purchaseOrder = await storage.getPurchaseOrder(poId);
      if (!purchaseOrder) {
        return res.status(404).json({ _error: 'Purchase order not found' });
      }

      // Get all items and existing orders in parallel
      const [poItems, existingOrders] = await Promise.all([
        storage.getPurchaseOrderItems(poId),
        storage.getProductionOrdersByPoId(poId),
      ]);
      const { getP1POReconciliation: getGenerationReconciliation } = await import(
        '../services/p1POReconciliationService'
      );
      const generationReconciliationByItemId = new Map(
        (await getGenerationReconciliation(poId)).map((line) => [
          line.purchaseOrderItemId,
          line,
        ]),
      );

      // Build per-item existing count map from active production children.
      // Cancelled rows remain audit history and do not satisfy the PO line quantity.
      const existingByItemId = new Map<number, number>();
      for (const order of existingOrders) {
        if (order.poItemId && order.productionStatus !== 'CANCELLED') {
          existingByItemId.set(order.poItemId, (existingByItemId.get(order.poItemId) ?? 0) + 1);
        }
      }
      
      // Include items that have a valid product identifier.
      // Metal accessories (AGM5, AGARCA, AGBDL, etc.) are included — they route directly
      // to Shipping QC rather than the manufacturing P1 flow.
      // Truly non-stock items (no_stock, None, no identifier) are skipped.
      const stockModelItems = poItems.filter((item) => {
        const productId = getPOItemProductId(item);
        if (!productId) {
          console.log(`🚫 Skipping item ${item.id}: no valid product identifier`);
          return false;
        }
        // Metal accessories are eligible — just get a different initial department
        if (isPOItemMetalAccessory(item)) {
          console.log(`🔩 Including metal accessory item ${item.id}: ${productId} (will route to Shipping QC)`);
          return true;
        }
        if (!isPOItemEligibleForProduction(item)) {
          console.log(`🚫 Skipping non-stock item ${item.id}: ${item.itemName || item.stockModelName} (parts only, no manufacturing)`);
          return false;
        }
        return true;
      });

      console.log(
        `🏭 Found ${stockModelItems.length} eligible items to convert to production orders (filtered out ${poItems.length - stockModelItems.length} non-eligible items)`
      );

      const { deriveCanonicalMaterial } = await import('../../src/utils/deriveCanonicalMaterial');
      const createdOrders = [];

      for (const item of stockModelItems) {
        // Gap-fill: only create orders for units that haven't been generated yet
        const alreadyGenerated = existingByItemId.get(item.id) ?? 0;
        const activePoQuantity =
          generationReconciliationByItemId.get(item.id)?.activePoQuantity ??
          item.quantity;
        const remaining = activePoQuantity - alreadyGenerated;
        if (remaining <= 0) {
          console.log(`⏭ Skipping item ${item.id} (${item.itemName || item.stockModelId}): already generated ${alreadyGenerated}/${activePoQuantity}`);
          continue;
        }
        console.log(`🏭 Item ${item.id} (${item.itemName || item.stockModelId}): generating ${remaining} of ${activePoQuantity} active customer-demand units (${alreadyGenerated} already exist)`);
        for (let i = 0; i < remaining; i++) {
          // Use stockModelId for mold/schedule matching; fall back to itemName (AG part number)
          // or itemId for POs entered with product codes rather than stock model slugs
          const stockModelForOrder = getPOItemProductId(item);
          // CENTRALIZED: Use atomic order ID generator instead of inline pattern
          const orderId = await storage.generateNextOrderId();

          // Detect metal accessories by checking itemName and itemId independently
          // before falling back to stockModelId (which may be a fiberglass slug like 'mesa_universal')
          const isMetal =
            isMetalAccessorySku(item.itemName || '') ||
            isMetalAccessorySku(item.itemId || '') ||
            isMetalAccessorySku(stockModelForOrder);

          const materialCanonical = isMetal ? 'Metal Accessory' : deriveCanonicalMaterial(stockModelForOrder);

          // Metal accessories skip manufacturing and ship directly; all others enter P1 queue.
          const initialDepartment = isMetal ? 'Shipping QC' : 'P1 Production Queue';

          // Preserve the exact PO line identity. stockModelName can be stale after a line's
          // product code changes, which made the production child display another product.
          const resolvedItemName =
            item.itemName ||
            item.itemId ||
            (isMetal ? deriveMetalAccessoryDisplayName(stockModelForOrder) : null) ||
            item.stockModelName ||
            stockModelForOrder;

          const sourceSnapshot = {
            po_id: poId,
            po_item_id: item.id,
            po_number: purchaseOrder.poNumber,
            sku: stockModelForOrder,
            stock_model_name: resolvedItemName,
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
            itemName: resolvedItemName,
            orderDate: new Date(),
            dueDate: (() => {
              const expectedDue = purchaseOrder.expectedDelivery
                ? new Date(purchaseOrder.expectedDelivery)
                : new Date(purchaseOrder.poDate);
              const today = new Date();
              return expectedDue > today ? expectedDue : today;
            })(),
            productionStatus: deriveP1ProductionStatus({
              currentDepartment: initialDepartment,
            }),
            currentDepartment: initialDepartment,
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

  // Remediation: route existing PENDING metal accessory production orders to Shipping QC
  // and correct their material_canonical to 'Metal Accessory'. Also updates item_name to a
  // human-readable display name when it is currently just the raw SKU.
  // Safe to call multiple times (idempotent).
  app.post('/api/production-orders/remediate-metal-accessories', async (req, res) => {
    try {
      const { db } = await import('../../db');
      const { sql } = await import('drizzle-orm');

      const METAL_ACCESSORY_PATTERNS = [
        'AGM5%', 'AGMS5%', 'AGBDL%', 'AGBM%', 'AGPIC%', 'AGARCA%',
        'AG-M5-%', 'AG-BDL-%', 'AG-BM-%', 'AG-PIC-%', 'AG-ARCA-%',
      ];

      const likeConditions = METAL_ACCESSORY_PATTERNS.map(
        (p) => `UPPER(item_id) LIKE '${p}' OR UPPER(item_name) LIKE '${p}'`
      ).join(' OR ');

      const selectQuery = sql.raw(
        `SELECT id, order_id, item_id, item_name, production_status, material_canonical, current_department
         FROM production_orders
         WHERE (${likeConditions})
           AND production_status != 'CANCELLED'
           AND current_department NOT IN ('Shipping QC', 'Shipped', 'SHIPPED')`
      );

      const affected = await db.execute(selectQuery);
      const rows = affected.rows as Array<{ id: number; order_id: string; item_id: string; item_name: string; production_status: string; material_canonical: string; current_department: string }>;

      let productionOrdersFixed = 0;
      let orderIds: string[] = [];

      if (rows.length === 0) {
        console.log('[remediate-metal-accessories] No misclassified metal accessory production orders found.');
      } else {
        orderIds = rows.map((r) => r.order_id);
        console.log(`[remediate-metal-accessories] Fixing ${rows.length} metal accessory production order(s): ${orderIds.join(', ')}`);

        // Fix each order individually so we can derive display names per SKU
        for (const row of rows) {
          const sku = row.item_id || row.item_name || '';
          const displayName = deriveMetalAccessoryDisplayName(sku) !== sku
            ? deriveMetalAccessoryDisplayName(sku)
            : row.item_name; // keep existing name if no mapping
          const idVal = row.id;
          const updateQuery = sql.raw(
            `UPDATE production_orders
             SET material_canonical = 'Metal Accessory',
                 current_department = 'Shipping QC',
                 item_name = '${displayName.replace(/'/g, "''")}',
                 updated_at = NOW()
             WHERE id = ${idVal}`
          );
          await db.execute(updateQuery);
          productionOrdersFixed++;
        }

        console.log(`[remediate-metal-accessories] production_orders updated: ${productionOrdersFixed} row(s). Orders: ${orderIds.join(', ')}`);
      }

      // Sync all_orders: update current_department for PO_RELEASE orders whose model_id matches metal accessory patterns
      // This always runs regardless of whether production_orders had matches
      const allOrdersLikeConditions = METAL_ACCESSORY_PATTERNS.map(
        (p) => `UPPER(model_id) LIKE '${p}'`
      ).join(' OR ');

      const allOrdersUpdateQuery = sql.raw(
        `UPDATE all_orders
         SET current_department = 'Shipping QC',
             updated_at = NOW()
         WHERE source = 'PO_RELEASE'
           AND (${allOrdersLikeConditions})
           AND current_department NOT IN ('Shipping QC', 'Shipped', 'SHIPPED')
           AND status != 'CANCELLED'`
      );

      const allOrdersResult = await db.execute(allOrdersUpdateQuery);
      const allOrdersUpdated = allOrdersResult.rowCount ?? 0;
      console.log(`[remediate-metal-accessories] all_orders updated: ${allOrdersUpdated} row(s) set to Shipping QC`);

      return res.json({ fixed: productionOrdersFixed, orderIds, allOrdersFixed: allOrdersUpdated });
    } catch (_error) {
      console.error('[remediate-metal-accessories] Error:', _error);
      return res.status(500).json({ _error: 'Remediation failed', details: String(_error) });
    }
  });

  // Reactivate a cancelled production order into the status implied by its department.
  app.post('/api/production-orders/:orderId/reactivate', async (req, res) => {
    try {
      const { storage } = await import('../../storage');
      const { orderId } = req.params;

      const order = await storage.getProductionOrderByOrderId(orderId);
      if (!order) {
        return res.status(404).json({ _error: `Production order ${orderId} not found` });
      }
      if (order.productionStatus !== 'CANCELLED') {
        return res.status(400).json({ _error: `Order ${orderId} is not cancelled (current status: ${order.productionStatus})` });
      }

      const reactivatedDepartment = order.currentDepartment || 'P1 Production Queue';
      const reactivatedStatus = deriveP1ProductionStatus({
        currentDepartment: reactivatedDepartment,
        isFulfilled: (order as any).isFulfilled,
        currentStatus: order.productionStatus,
        preserveCancelled: false,
      });

      const updated = await storage.updateProductionOrder(order.id, {
        productionStatus: reactivatedStatus,
        currentDepartment: reactivatedDepartment,
      });

      let purchaseOrderReopened = false;
      if (order.poId) {
        const parentPO = await storage.getPurchaseOrder(order.poId);
        const parentStatus = parentPO?.status;
        if (isClosedP1PurchaseOrderStatus(parentStatus)) {
          await storage.updatePurchaseOrder(order.poId, { status: 'OPEN' });
          purchaseOrderReopened = true;
          console.log(`🔄 Reopened ${parentStatus} PO ${order.poId} after reactivating production order ${orderId}`);
        }
      }

      console.log(`🔄 Reactivated production order ${orderId} → ${reactivatedStatus}`);
      res.json({ success: true, order: updated, purchaseOrderReopened });
    } catch (_error) {
      console.error('🔄 Reactivate production order error:', _error);
      res.status(500).json({ _error: 'Failed to reactivate production order' });
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
      const { pool } = await import('../../db');
      const poId = parseInt(req.params.poId);

      if (!Number.isInteger(poId)) {
        return res.status(400).json({ _error: 'Invalid purchase order ID' });
      }

      // Existing PO production children may predate the metal-accessory routing
      // rules or may contain a stale fiberglass fallback. Reconcile active rows
      // from their linked PO line before returning this operational read model.
      // Terminal and cancelled history is intentionally left unchanged.
      const repairResult = await pool.query(`
        WITH repaired AS (
          UPDATE production_orders AS production
          SET item_id = COALESCE(
                NULLIF(TRIM(line.item_id), ''),
                NULLIF(TRIM(line.item_name), ''),
                production.item_id
              ),
              item_name = COALESCE(
                NULLIF(TRIM(line.item_name), ''),
                NULLIF(TRIM(line.item_id), ''),
                production.item_name
              ),
              material_canonical = 'Metal Accessory',
              current_department = 'Shipping QC',
              production_status = 'IN_PROGRESS',
              updated_at = NOW()
          FROM purchase_order_items AS line
          WHERE production.po_id = $1
            AND production.po_item_id = line.id
            AND production.current_department = 'P1 Production Queue'
            AND UPPER(COALESCE(production.production_status, '')) IN ('PENDING', 'ACTIVE', 'IN_PROGRESS')
            AND (
              REGEXP_REPLACE(UPPER(COALESCE(line.item_id, '')), '[-_[:space:]]', '', 'g')
                ~ '^(AGM5|AGMS5|AGBDL|AGBM|AGPIC|AGARCA)'
              OR REGEXP_REPLACE(UPPER(COALESCE(line.item_name, '')), '[-_[:space:]]', '', 'g')
                ~ '^(AGM5|AGMS5|AGBDL|AGBM|AGPIC|AGARCA)'
              OR REGEXP_REPLACE(UPPER(COALESCE(production.item_id, '')), '[-_[:space:]]', '', 'g')
                ~ '^(AGM5|AGMS5|AGBDL|AGBM|AGPIC|AGARCA)'
              OR REGEXP_REPLACE(UPPER(COALESCE(production.item_name, '')), '[-_[:space:]]', '', 'g')
                ~ '^(AGM5|AGMS5|AGBDL|AGBM|AGPIC|AGARCA)'
            )
          RETURNING production.order_id
        ), mirrored AS (
          UPDATE all_orders AS orders
          SET current_department = 'Shipping QC',
              status = 'IN_PROGRESS',
              updated_at = NOW()
          WHERE orders.current_department = 'P1 Production Queue'
            AND UPPER(COALESCE(orders.status, '')) NOT IN ('CANCELLED', 'SHIPPED', 'COMPLETED')
            AND orders.order_id IN (SELECT order_id FROM repaired)
          RETURNING orders.order_id
        )
        SELECT
          (SELECT COUNT(*)::int FROM repaired) AS repaired_count,
          (SELECT COUNT(*)::int FROM mirrored) AS mirrored_count
      `, [poId]);

      const repairedCount = Number(repairResult.rows?.[0]?.repaired_count || 0);
      if (repairedCount > 0) {
        console.log(
          `[production-orders/by-po] Routed ${repairedCount} active metal accessory order(s) for PO ${poId} to Shipping QC`,
        );
      }

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

      if (/^OPB-[A-Za-z0-9]+-\d+-\d+$/i.test(barcode)) {
        const { pool } = await import('../../db');
        const batchResult = await pool.query(
          `SELECT
             b.id AS "id",
             b.batch_code AS "batchCode",
             b.barcode_value AS "barcodeValue",
             b.batch_qty AS "batchQty",
             b.qty_completed AS "qtyCompleted",
             b.qty_scrapped AS "qtyScrapped",
             b.status AS "status",
             b.priority AS "priority",
             pwo.work_order_number AS "workOrderNumber",
             COALESCE(t.part_number, pwo.part_number) AS "partNumber",
             COALESCE(t.part_name, pwo.description) AS "partName",
             ts.step_number AS "stepNumber",
             ts.department_name AS "stepDepartment"
           FROM cnc_operation_batches b
           JOIN production_work_orders pwo ON pwo.id = b.work_order_id
           JOIN traveler_steps ts ON ts.id = b.traveler_step_id
           JOIN travelers t ON t.id = ts.traveler_id
           WHERE b.barcode_value = $1 OR b.batch_code = $1
           LIMIT 1`,
          [barcode],
        );
        const batchRows = Array.isArray(batchResult) ? batchResult : batchResult.rows ?? [];
        if (batchRows[0]) {
          return res.json({
            type: 'cnc_operation_batch',
            ...batchRows[0],
            qtyRemaining: Math.max(
              Number(batchRows[0].batchQty ?? 0) -
              Number(batchRows[0].qtyCompleted ?? 0) -
              Number(batchRows[0].qtyScrapped ?? 0),
              0,
            ),
          });
        }
        return res.status(404).json({ error: 'CNC operation batch barcode not found' });
      }

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

      // Last-resort: if barcode is a plain numeric string, search production_orders by integer id
      if (!order && /^\d+$/.test(barcode)) {
        try {
          const { pool } = await import('../../db');
          const numericId = parseInt(barcode, 10);
          const prodByIdResult = await pool.query(
            'SELECT order_id FROM production_orders WHERE id = $1 LIMIT 1',
            [numericId]
          );
          const prodRows = Array.isArray(prodByIdResult) ? prodByIdResult : prodByIdResult.rows || [];
          if (prodRows.length > 0) {
            const foundOrderId = prodRows[0].order_id;
            if (foundOrderId) {
              orderId = foundOrderId;
              console.log(`✅ Barcode numeric ${barcode} → production order ${foundOrderId}`);
              const allOrders = await storage.getAllOrders();
              order = allOrders.find((o) => o.orderId === foundOrderId);
              if (order) {
                orderSource = 'all_orders';
              } else {
                const productionOrders = await storage.getAllProductionOrders();
                const po = productionOrders.find((p) => p.orderId === foundOrderId);
                if (po) { order = po; orderSource = 'production'; }
              }
            }
          }
        } catch (numIdErr) {
          console.error('Error searching by numeric production order id:', numIdErr);
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

  // ── Finish QC Acceptance endpoint ──
  // POST /api/orders/:orderId/finish-accept
  // A Finish QC technician explicitly accepts ownership of their assigned work.
  // Only the assigned technician (or an admin override) may accept.
  // Sets finishAcceptedAt + finishAcceptedBy on the order, stamps the open
  // department-transition row metadata, and records an audit field-change.
  app.post('/api/orders/:orderId/finish-accept', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { technicianName } = req.body;

      if (!technicianName || typeof technicianName !== 'string' || !technicianName.trim()) {
        return res.status(400).json({ error: 'technicianName is required' });
      }

      const { storage } = await import('../../storage');

      // Locate the order across all three order types
      let currentOrder: any = null;
      let isProductionOrder = false;
      let isFinalized = false;

      const isProductionOrderId =
        (orderId.startsWith('PO-') || orderId.startsWith('P1-')) &&
        orderId.split('-').length >= 4;

      if (isProductionOrderId) {
        try {
          currentOrder = await storage.getProductionOrderByOrderId(orderId);
          isProductionOrder = !!currentOrder;
        } catch (_) {}
      }
      if (!currentOrder) {
        currentOrder = await storage.getFinalizedOrderById(orderId);
        isFinalized = !!currentOrder;
      }
      if (!currentOrder) {
        currentOrder = await storage.getOrderDraft(orderId);
      }

      if (!currentOrder) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Guard: order must be in Finish QC (not Finish)
      if (currentOrder.currentDepartment !== 'Finish QC') {
        return res.status(400).json({
          error: `Order is in ${currentOrder.currentDepartment || 'unknown'}, not Finish QC`,
        });
      }

      // Guard: prevent double-accept
      if (currentOrder.finishAcceptedAt) {
        return res.status(409).json({
          error: 'Order has already been accepted',
          acceptedAt: currentOrder.finishAcceptedAt,
          acceptedBy: currentOrder.finishAcceptedBy,
        });
      }

      // ── Ownership check ──────────────────────────────────────────────────
      // Admin users and agrace (production manager) can accept any order.
      // All other users may only accept orders assigned to them.
      const userRole = (req.user?.role || '').toUpperCase();
      const isAdminOverride =
        userRole === 'ADMIN' || req.user?.username === 'agrace';

      if (!isAdminOverride) {
        const assignedTo = currentOrder.assignedTechnician || null;
        if (!assignedTo) {
          return res.status(403).json({
            error: 'Order has no assigned technician — a production manager must assign it first',
          });
        }

        // Look up logged-in user's employee name to compare with stored technician name
        const { pool: poolInst } = await import('../../db');
        const empResult = await poolInst.query(
          'SELECT name FROM employees WHERE id = $1 LIMIT 1',
          [req.user?.employeeId]
        );
        const loggedInEmployeeName: string | null = empResult[0]?.name ?? null;

        if (!loggedInEmployeeName) {
          return res.status(403).json({
            error: 'Your account is not linked to an employee record',
          });
        }

        if (loggedInEmployeeName.toLowerCase() !== assignedTo.toLowerCase()) {
          return res.status(403).json({
            error: `This order is assigned to ${assignedTo} — you cannot accept someone else's work`,
            assignedTo,
          });
        }
      }

      const now = new Date();
      const acceptedBy = technicianName.trim();
      const updateData = { finishAcceptedAt: now, finishAcceptedBy: acceptedBy };

      // Persist to correct table
      let updatedOrder: any;
      if (isProductionOrder) {
        updatedOrder = await storage.updateProductionOrder((currentOrder as any).id, {
          ...updateData,
          updatedAt: now,
        } as any);
      } else if (isFinalized) {
        updatedOrder = await storage.updateFinalizedOrder(orderId, updateData);
      } else {
        updatedOrder = await storage.updateOrderDraft(orderId, { ...updateData, updatedAt: now });
      }

      // Stamp acceptance into the open department-transition row metadata
      try {
        const { db: dbInstance } = await import('../../db');
        const { sql: sqlTag, eq: eqOp, and: andOp, isNull: isNullOp } = await import('drizzle-orm');
        const { orderDepartmentTransitions: odt } = await import('../../schema');
        await dbInstance
          .update(odt)
          .set({
            metadata: sqlTag`COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              acceptedAt: now.toISOString(),
              acceptedByUserId: req.user?.id ?? null,
              acceptedByName: acceptedBy,
            })}::jsonb`,
          })
          .where(
            andOp(
              eqOp(odt.entityId, orderId),
              isNullOp(odt.exitedAt)
            )
          );
      } catch (transitionErr) {
        console.warn('[finish-accept] transition metadata update failed:', transitionErr);
      }

      // Audit field-change log
      try {
        const actor = {
          id: req.user?.id,
          username: req.user?.username || acceptedBy,
          role: req.user?.role || 'technician',
        };
        await auditService.logFieldChanges(
          'p1_order',
          orderId,
          currentOrder,
          updatedOrder || { ...currentOrder, ...updateData },
          actor,
          { source: 'finish-accept' }
        );
      } catch (auditErr) {
        console.warn('[finish-accept] audit log failed:', auditErr);
      }

      console.log(`✅ [finish-accept] ${orderId} accepted by ${acceptedBy}`);
      return res.json({
        success: true,
        orderId,
        finishAcceptedAt: now,
        finishAcceptedBy: acceptedBy,
      });
    } catch (err) {
      console.error('[finish-accept] error:', err);
      return res.status(500).json({ error: 'Failed to accept order' });
    }
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
      const failedOrders: { orderId: string; reason: string }[] = [];

      // Update each order individually with proper completion timestamps
      for (const orderId of orderIds) {
        try {
          // Check production orders first for all order ID formats
          // Production orders can have various ID formats (PO-*, P1-*, EL*, etc.)
          let currentOrder: any = null;
          let isProductionOrder = false;
          let isFinalized = false;

          try {
            currentOrder = await storage.getProductionOrderByOrderId(orderId);
            isProductionOrder = !!currentOrder;
            if (isProductionOrder) {
              console.log(`[PROGRESSION] Production order found: ${orderId}`);
            }
          } catch (prodError) {
            // Gracefully handle production order lookup errors
            console.warn(`⚠️ Production order lookup failed for ${orderId}:`, prodError instanceof Error ? prodError.message : prodError);
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
            console.error(`[PROGRESSION ERROR] Order not found: ${orderId}`);
            failedOrders.push({ orderId, reason: 'ORDER_NOT_FOUND' });
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

          // Departments that are initial queue placements — orders there can keep FINALIZED
          const INITIAL_QUEUE_DEPARTMENTS = ['P1 Production Queue'];

          // If the destination is a real production department (not an initial queue),
          // always force status to IN_PROGRESS regardless of what the caller sent.
          const completingShipping = currentOrder.currentDepartment === 'Shipping';
          const resolvedDepartment = completingShipping
            ? 'Shipping Management'
            : department;
          const resolvedStatus = completingShipping
            ? 'FULFILLED'
            : INITIAL_QUEUE_DEPARTMENTS.includes(department)
              ? (status || 'IN_PROGRESS')
              : 'IN_PROGRESS';

          // Prepare update data
          const updateData: any = {
            currentDepartment: resolvedDepartment,
            status: resolvedStatus,
            ...completionUpdates,
          };
          if (completingShipping) {
            updateData.shippingCompletedAt = now;
            if (!isProductionOrder) updateData.shippedDate = now;
          }

          // Add technician assignment if provided
          if (assignedTechnician) {
            updateData.assignedTechnician = assignedTechnician;
          }

          // Update the appropriate table based on order type
          let updatedOrder;
          if (isProductionOrder) {
            const productionStatus = deriveP1ProductionStatus({
              currentDepartment: resolvedDepartment,
              isFulfilled: completingShipping || (currentOrder as any).isFulfilled,
              currentStatus: (currentOrder as any).productionStatus,
            });
            const productionUpdateData = {
              ...updateData,
              productionStatus,
              ...(completingShipping
                ? { isFulfilled: true, shippedAt: now, fulfilledDate: now }
                : {}),
              updatedAt: now,
            };
            delete (productionUpdateData as any).status;

            // Update production order table
            updatedOrder = await storage.updateProductionOrder(
              (currentOrder as any).id,
              productionUpdateData
            );
            console.log(`[PROGRESSION SUCCESS] ${orderId} → ${department}`);
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
        success: failedOrders.length === 0,
        message: `Updated ${updatedOrders.length} orders to ${department} department`,
        updatedOrders: updatedOrders.length,
        totalRequested: orderIds.length,
        failedOrders,
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
              // Use dark navy instead of bright blue. Red-LED scanners are effectively
              // blind to mid/bright blue (0066FF) because the beam reflects off blue ink.
              // Dark navy (00004B) stays visually distinct from black while remaining
              // readable by both red-laser and white-LED scanners.
              barcodeHexColor = '00004B';
            }
          }

          try {
            const bwipjs = await import('bwip-js');
            // PO/P1 order IDs are ~3-4x longer strings than regular SO IDs.
            // Code128 bar count is proportional to text length, so at scale: 4
            // the generated PNG is ~4x wider for PO items. When both are drawn
            // at width: 170 in the PDF the PO bars compress to unscannably thin.
            // Use scale: 2 for PO/P1 items so bar density matches regular orders.
            const barcodeScale = isPOItem ? 2 : 4;
            const barcodeBuffer = await bwipjs.default.toBuffer({
              bcid: 'code128',
              text: barcodeText,
              scale: barcodeScale,
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
          if (isProductionOrder) {
            updateData.productionStatus = deriveP1ProductionStatus({
              currentDepartment: toDepartment,
              isFulfilled: (order as any).isFulfilled,
              currentStatus: (order as any).productionStatus,
            });
          }

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
            updateData.currentDepartment = 'Shipping Management';
            updateData.shippingCompletedAt = currentTimestamp;
            if (isProductionOrder) {
              updateData.productionStatus = 'SHIPPED';
              updateData.isFulfilled = true;
              updateData.shippedAt = currentTimestamp;
              updateData.fulfilledDate = currentTimestamp;
            } else {
              updateData.status = 'FULFILLED';
              updateData.shippedDate = currentTimestamp;
            }
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
      
      // Get all Finish Technicians from employees and explicitly marked user accounts.
      // Defensive helper: pool.query returns rows[] directly, but handle QueryResult too
      const getRows = (r: any) => Array.isArray(r) ? r : (r?.rows ?? []);
      
      const finishTechniciansResult = await pool.query(
        `WITH finish_technicians AS (
          SELECT
            id::text as id,
            name,
            employee_code,
            'employee' as source
          FROM employees
          WHERE is_finish_technician = true
            AND is_active = true

          UNION ALL

          SELECT
            ('user:' || u.id::text) as id,
            COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.username) as name,
            u.username as employee_code,
            'user' as source
          FROM users u
          LEFT JOIN employees e ON u.employee_id = e.id
          WHERE u.is_finish_technician = true
            AND u.is_active = true
            AND NOT COALESCE(e.is_finish_technician = true AND e.is_active = true, false)
        )
        SELECT DISTINCT ON (LOWER(name)) id, name, employee_code, source
        FROM finish_technicians
        ORDER BY LOWER(name), source`
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

      // Query P1 production orders that have department_history (these are not in all_orders)
      const productionOrdersResult = await pool.query(
        `SELECT 
          order_id,
          po_number,
          item_name,
          item_id,
          assigned_technician,
          current_department,
          department_history,
          due_date,
          order_date
        FROM production_orders
        WHERE department_history IS NOT NULL
          AND jsonb_array_length(department_history) > 0
        ORDER BY order_id`
      );
      const rawProductionOrders = getRows(productionOrdersResult);

      console.log('📊 Query returned', rawProductionOrders.length, 'production orders with department history');

      // Normalize production_orders rows to the same shape as all_orders rows.
      const normalizedProductionOrders = rawProductionOrders.map((po: any) => ({
        order_id: po.order_id,
        customer_po: po.po_number,
        fb_order_number: po.item_name,
        model_id: po.item_id,
        assigned_technician: po.assigned_technician,
        current_department: po.current_department,
        department_history: po.department_history,
        due_date: po.due_date,
        order_date: po.order_date,
        source: 'production_order',
      }));

      // Merge both arrays and deduplicate by order_id, preferring the all_orders version
      // if the same order_id appears in both (safety net for PO_RELEASE orders that exist in both tables).
      // Key is normalized to String to guard against numeric vs string type mismatches across sources.
      const allOrdersById = new Map<string, any>();
      for (const order of allOrders) {
        allOrdersById.set(String(order.order_id), order);
      }
      for (const order of normalizedProductionOrders) {
        if (!allOrdersById.has(String(order.order_id))) {
          allOrdersById.set(String(order.order_id), order);
        }
      }
      const allData = Array.from(allOrdersById.values());

      console.log('📊 Combined dataset has', allData.length, 'orders after deduplication');

      // Filter to only include orders that were progressed OUT of Finish QC in the date range
      const filteredOrders = allData.filter((order: any) => {
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
  app.get('/api/finance/accounting/journal-entries/:id/source-trace', async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. ADMIN role required.' });
      }

      const journalEntryId = Number(req.params.id);
      if (!Number.isInteger(journalEntryId) || journalEntryId <= 0) {
        return res.status(400).json({ error: 'Invalid journal entry ID' });
      }

      const { getJournalEntrySourceTrace } = await import('../services/accountingSourceTraceService');
      const trace = await getJournalEntrySourceTrace(journalEntryId);
      if (!trace) {
        return res.status(404).json({ error: 'Journal entry not found' });
      }

      res.json(trace);
    } catch (error: any) {
      console.error('Error fetching journal entry source trace:', error);
      res.status(500).json({ error: 'Failed to fetch journal entry source trace' });
    }
  });

  app.get('/api/finance/accounting/journal-entries', async (req, res) => {
    try {
      const user = (req as any).user;
      if (user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Access denied. ADMIN role required.' });
      }

      const { fromDate, toDate, status, transactionType, journalEntryId, journalEntryIds } = req.query;
      const { db } = await import('../../db');
      const { journalEntries, journalLines, chartOfAccounts } = await import('../../schema');
      const { eq, and, gte, lte, desc, inArray } = await import('drizzle-orm');

      const conditions: any[] = [];
      if (fromDate) conditions.push(gte(journalEntries.effectiveDate, new Date(fromDate as string)));
      if (toDate) conditions.push(lte(journalEntries.effectiveDate, new Date(toDate as string)));
      if (status) conditions.push(eq(journalEntries.status, status as string));
      if (transactionType) conditions.push(eq(journalEntries.transactionType, transactionType as string));
      const requestedJournalEntryIds = [
        journalEntryId,
        journalEntryIds,
      ]
        .flatMap((value) => Array.isArray(value) ? value : [value])
        .flatMap((value) => String(value ?? '').split(','))
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value > 0);
      if (requestedJournalEntryIds.length > 0) {
        conditions.push(inArray(journalEntries.id, Array.from(new Set(requestedJournalEntryIds))));
      }

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
      const mode = (req.query.mode as string) || (req.query.mtd === 'true' ? 'mtd' : 'full');
      
      let startDate: Date;
      let effectiveEndDate: Date;
      const isMTD = mode === 'mtd';
      
      if (mode === 'ytd') {
        startDate = new Date(year, 0, 1);
        effectiveEndDate = new Date();
      } else {
        startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);
        effectiveEndDate = mode === 'mtd' ? new Date() : endDate;
      }
      
      console.log(`💰 Payment Analytics (${mode}): ${startDate.toISOString()} to ${effectiveEndDate.toISOString()}`);
      
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

  // Payment Analytics: By Batch view
  app.get('/api/finance/payment-analytics/batches', async (req, res) => {
    try {
      const { pool } = await import('../../db');

      if (!pool) {
        return res.status(500).json({ error: 'Database connection not available' });
      }

      const now = new Date();
      const month = parseInt(req.query.month as string) || (now.getMonth() + 1);
      const year = parseInt(req.query.year as string) || now.getFullYear();
      const mode = (req.query.mode as string) || 'mtd';
      const typeFilter = (req.query.type as string) || 'all'; // all | phone | online

      let startDate: Date;
      let effectiveEndDate: Date;

      if (mode === 'ytd') {
        startDate = new Date(year, 0, 1);
        effectiveEndDate = new Date();
      } else {
        startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0, 23, 59, 59, 999);
        effectiveEndDate = mode === 'mtd' ? new Date() : endDate;
      }

      // Build payment method filter for the batch's payment_method column
      // bulk_payment_batches.payment_method stores the method used for the batch
      // We apply the same phone/online filter by mapping to payment types
      let batchMethodFilter = '';
      if (typeFilter === 'phone') {
        batchMethodFilter = `AND bpb.payment_method = 'credit_card'`;
      } else if (typeFilter === 'online') {
        batchMethodFilter = `AND bpb.payment_method IN ('aaaa', 'agr')`;
      }

      const batchesQuery = `
        SELECT
          bpb.id AS batch_id,
          bpb.created_at AS batch_date,
          bpb.customer_id,
          bpb.total_amount,
          bpb.payment_method,
          bpb.notes AS batch_notes,
          c.name AS customer_name,
          COUNT(p.id) AS order_count
        FROM bulk_payment_batches bpb
        LEFT JOIN customers c ON CASE WHEN bpb.customer_id ~ '^[0-9]+$' THEN bpb.customer_id::integer ELSE NULL END = c.id
        LEFT JOIN payments p ON p.batch_id = bpb.id
        WHERE bpb.created_at >= $1 AND bpb.created_at <= $2
        ${batchMethodFilter}
        GROUP BY bpb.id, bpb.created_at, bpb.customer_id, bpb.total_amount, bpb.payment_method, bpb.notes, c.name
        ORDER BY bpb.created_at DESC
      `;

      const queryResult = await pool.query(batchesQuery, [startDate, effectiveEndDate]);
      const batches = Array.isArray(queryResult) ? queryResult : (queryResult.rows || []);

      const getPaymentMethodLabel = (method: string) => {
        if (method === 'credit_card') return 'Phone';
        if (method === 'aaaa' || method === 'agr') return 'Online';
        return method;
      };

      res.json({
        month,
        year,
        startDate: startDate.toISOString(),
        endDate: effectiveEndDate.toISOString(),
        batches: batches.map((b: any) => ({
          batchId: b.batch_id,
          date: b.batch_date,
          customerId: b.customer_id,
          customerName: b.customer_name || 'N/A',
          paymentMethod: b.payment_method,
          paymentLabel: getPaymentMethodLabel(b.payment_method),
          orderCount: parseInt(b.order_count) || 0,
          totalAmount: parseFloat(b.total_amount) || 0,
          notes: b.batch_notes,
        })),
      });
    } catch (error) {
      console.error('💰 Payment Analytics Batches error:', error);
      res.status(500).json({ error: 'Failed to fetch batch analytics' });
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

  // AR Journal — orders invoiced/shipped within date range with payment status
  app.get('/api/finance/ar', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      if (!pool) return res.status(500).json({ error: 'Database connection not available' });

      const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
      const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = dateTo || new Date().toISOString().slice(0, 10);

      const rows = await pool.query(`
        SELECT
          ao.id,
          ao.order_id                                         AS "orderId",
          COALESCE(c.name, 'Unknown')                        AS "customerName",
          COALESCE(ao.price_override, ao.calculated_total, 0) AS amount,
          ao.shipped_date::date                              AS date,
          'prepaid'                                          AS terms,
          CASE
            WHEN COALESCE(SUM(p.payment_amount), 0) >=
                 COALESCE(ao.price_override, ao.calculated_total, 0) * 0.99 THEN 'paid'
            WHEN ao.shipped_date < NOW() - INTERVAL '30 days' THEN 'overdue'
            ELSE 'pending'
          END AS status
        FROM all_orders ao
        LEFT JOIN customers c
          ON c.id = (CASE WHEN ao.customer_id ~ '^[0-9]+$' THEN ao.customer_id::int ELSE NULL END)
        LEFT JOIN payments p ON p.order_id = ao.order_id
        WHERE ao.shipped_date::date BETWEEN $1 AND $2
          AND ao.status NOT IN ('CANCELLED', 'SCRAPPED')
        GROUP BY ao.id, ao.order_id, c.name,
                 ao.price_override, ao.calculated_total, ao.shipped_date
        ORDER BY date DESC
        LIMIT 500
      `, [from, to]) as any[];

      res.json(rows);
    } catch (error) {
      console.error('Finance AR error:', error);
      res.status(500).json({ error: 'Failed to fetch AR transactions' });
    }
  });

  // AP Journal — vendor POs within date range with payment status
  app.get('/api/finance/ap', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      if (!pool) return res.status(500).json({ error: 'Database connection not available' });

      const { dateFrom, dateTo } = req.query as { dateFrom?: string; dateTo?: string };
      const from = dateFrom || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const to = dateTo || new Date().toISOString().slice(0, 10);

      const rows = await pool.query(`
        SELECT
          vp.id,
          vp.po_number                                 AS "poNumber",
          COALESCE(v.name, 'Unknown Vendor')           AS "vendorName",
          COALESCE(vp.total_amount, 0)                 AS amount,
          vp.order_date::date                          AS date,
          CASE
            WHEN vp.status = 'CLOSED' THEN 'paid'
            WHEN vp.order_date < NOW() - INTERVAL '45 days'
              AND vp.status NOT IN ('CLOSED', 'CANCELLED') THEN 'overdue'
            ELSE 'pending'
          END AS status
        FROM vendor_pos vp
        LEFT JOIN vendors v ON v.id = vp.vendor_id
        WHERE vp.order_date::date BETWEEN $1 AND $2
          AND vp.status != 'CANCELLED'
        ORDER BY vp.order_date DESC
        LIMIT 500
      `, [from, to]) as any[];

      res.json(rows);
    } catch (error) {
      console.error('Finance AP error:', error);
      res.status(500).json({ error: 'Failed to fetch AP transactions' });
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

  // Shipping Management / FINALIZED status audit
  // Finds orders in Shipping Management whose status is still FINALIZED (should be FULFILLED after shipping)
  app.get('/api/admin/shipping-status-audit', async (req, res) => {
    try {
      const { pool } = await import('../../db');
      const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
      let whereClause = `current_department = 'Shipping Management' AND status = 'FINALIZED'`;
      const params: any[] = [];
      if (startDate) {
        params.push(startDate);
        whereClause += ` AND COALESCE(shipped_date, updated_at::date) >= $${params.length}::date`;
      }
      if (endDate) {
        params.push(endDate);
        whereClause += ` AND COALESCE(shipped_date, updated_at::date) <= ($${params.length}::date + interval '1 day')`;
      }
      const result = await pool.query(
        `SELECT
          order_id,
          fb_order_number,
          customer_id,
          model_id,
          status,
          current_department,
          shipped_date,
          due_date,
          updated_at,
          source
         FROM all_orders
         WHERE ${whereClause}
         ORDER BY COALESCE(shipped_date, updated_at::date) DESC NULLS LAST, order_id ASC`,
        params
      );
      res.json({ success: true, orders: result, total: result.length });
    } catch (error: any) {
      console.error('❌ Shipping status audit error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // QuickNotes routes - collaborative note-taking with sharing
  app.use('/api/quick-notes', authenticateToken, quickNotesRoutes);

  // Schema Governance routes - drift detection, audit log, override (ADMIN/OWNER only)
  app.use('/api/governance', authenticateToken, requireExecutiveAccess, governanceRoutes);

  // CNC Dashboard routes - job queue, setup packages, tooling, QC
  app.use('/api/cnc', (req, res, next) => {
    if (req.path.startsWith('/operation-batches/station')) return next();
    return authenticateToken(req, res, next);
  }, cncDashboardRoutes);

  // Receiving Control Center routes
  app.use('/api/receipts', authenticateToken, receivingRoutes);

  // Estimating / RFQ Builder routes
  app.use('/api/estimating', authenticateToken, estimatingRoutes);
  app.use('/api/draft-bom-drafts', authenticateToken, draftBomDraftsRoutes);
  app.use('/api/rd-projects', authenticateToken, rdProjectsRoutes);

  // Conversational RFQ Risk Assessment routes
  app.use('/api/rfq-risk-sessions', authenticateToken, rfqRiskSessionsRoutes);

  // System Audit Library routes (admin and owner only)
  app.use('/api/audits', requireAdminOrOwner, auditsRoutes);

  // Operations Command Center — shop floor decision surface
  app.use('/api/command-center', authenticateToken, commandCenterRoutes);

  // EDRI — EPOCH DCAA Readiness Index
  app.use('/api/edri', edriRoutes);
  app.use('/api/edri', chargeCodeUsageReportRoutes);
  app.use('/api/edri', laborDistributionReportRoutes);
  app.use('/api/edri', transactionEvidenceMapRoutes);
  app.use('/api/edri', supervisorApprovalExceptionReportRoutes);
  app.use('/api/edri', timesheetCorrectionLogReportRoutes);
  app.use('/api/edri', payrollExportReconciliationReportRoutes);
  app.use('/api/edri', indirectCostBurdenRateReportRoutes);
  app.use('/api/edri', unallowableCostReviewReportRoutes);
  app.use('/api/edri', procurementComplianceReportRoutes);
  app.use('/api/edri', inventoryTraceabilityReportRoutes);
  app.use('/api/edri', auditLedgerIntegrityReportRoutes);
  app.use('/api/edri', policyTrainingAcknowledgmentReportRoutes);

  // DCAA Forensic Audit Engine
  app.use('/api/forensic-audit', forensicAuditRoutes);

  // Document Vault — CUI/ITAR classification and access control
  app.use('/api/vault', vaultRoutes);

  // CMMC 2.0 Level 2 Readiness Dashboard
  app.use('/api/cmmc', cmmcRoutes);

  // Native charge code registry
  app.use('/api/charge-codes', chargeCodesRoutes);

  // Business Continuity Dashboard (ADMIN/OWNER only)
  app.use('/api/continuity', continuityRoutes);

  // Proteus Labs — Prompt Library (ADMIN/OWNER only)
  app.use('/api/proteus-labs', proteusLabsRoutes);

  // Return the pre-existing server if one was passed in (early-bind pattern),
  // otherwise create a new one (backward-compatible fallback).
  return existingServer || createServer(app);
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
  moldsRoutes as moldsRouter,
  kickbackRoutes as kickbacksRouter,
  orderAttachmentsRoutes as orderAttachmentsRouter,
  tasksRoutes as tasksRouter,
  communicationsRoutes as communicationsRouter,
};
