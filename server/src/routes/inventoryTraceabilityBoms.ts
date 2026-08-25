import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { authenticateToken } from '../../middleware/auth';
import { requirePermission } from '../../middleware/requirePermission';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { getUserPermissions } from '../services/permissionService';
import {
  areControlledItemLinkedBomReadsEnabled,
  areControlledItemLinkedBomWritesEnabled,
  areInventoryTraceabilityPolicyReadsEnabled,
  areInventoryTraceabilityPolicyWritesEnabled,
  isP2ConfigurationBomIntegrationEnabled,
  isRecursiveTraceabilityPreviewEnabled,
} from '../lib/featureFlags';
import {
  TraceabilityBomError,
  createControlledBomDraft,
  createTraceabilityPolicyDraft,
  decideTraceabilityPolicy,
  getControlledBomStatus,
  getTraceabilityPolicyHistory,
  previewControlledBom,
  decideControlledBomRevision,
  releaseControlledBomRevision,
  submitControlledBomRevision,
  submitTraceabilityPolicy,
} from '../services/inventoryTraceabilityBomService';

const router = Router();
const policyTypes = ['SERIAL','LOT','BATCH','STANDARD_QUANTITY','CUSTOMER_SUPPLIED','NONE_APPROVED'] as const;
const classifications = ['RAW_MATERIAL','PURCHASED_COMPONENT','MANUFACTURED_COMPONENT','SUBASSEMBLY','ASSEMBLY','CUSTOMER_SUPPLIED','CONSUMABLE','TOOLING','NON_INVENTORY_SERVICE'] as const;
const policySchema = z.object({
  policyType: z.enum(policyTypes),
  itemClassification: z.enum(classifications),
  partConfigurationRevision: z.string().trim().min(1).max(100),
  unitOfMeasure: z.string().trim().min(1).max(40),
  defaultDepartmentId: z.number().int().positive().optional().nullable(),
  outputSerializationRequired: z.boolean().default(false),
  individualInputScanRequired: z.boolean().default(false),
  lotScanRequired: z.boolean().default(false),
  batchScanRequired: z.boolean().default(false),
  quantityEntryRequired: z.boolean().default(false),
  divisibleInventoryPermitted: z.boolean().default(false),
  shelfLifeControlled: z.boolean().default(false),
  heatLotRequired: z.boolean().default(false),
  dateCodeRequired: z.boolean().default(false),
  cocRequired: z.boolean().default(false),
  materialCertificationRequired: z.boolean().default(false),
  testReportRequired: z.boolean().default(false),
  sdsRequired: z.boolean().default(false),
  tdsRequired: z.boolean().default(false),
  receivingInspectionRequired: z.boolean().default(false),
  customerCustodyRequired: z.boolean().default(false),
  storageRequirements: z.record(z.unknown()).default({}),
  configurationEffectivity: z.record(z.unknown()).default({}),
  noTraceabilityJustification: z.string().trim().max(4000).optional().nullable(),
  effectiveFrom: z.string().datetime().optional().nullable(),
  effectiveTo: z.string().datetime().optional().nullable(),
});
const versionSchema = z.object({ expectedConcurrencyVersion: z.number().int().positive() });
const decisionSchema = versionSchema.extend({
  decision: z.enum(['APPROVE','RETURN','REJECT']),
  capacity: z.string().trim().min(1).max(200),
  signatureMeaning: z.string().trim().min(1).max(1000),
  reason: z.string().trim().max(4000).optional(),
});
const bomDraftSchema = z.object({
  parentInventoryItemId: z.number().int().positive(),
  revisionCode: z.string().trim().min(1).max(100),
  effectivity: z.record(z.unknown()),
  lines: z.array(z.object({
    childInventoryItemId: z.number().int().positive(),
    childRevision: z.string().trim().max(100).optional().nullable(),
    quantityPer: z.number().positive(),
    unitOfMeasure: z.string().trim().max(40).optional().nullable(),
    operationSequence: z.number().int().positive().optional(),
    overridePolicyType: z.enum(policyTypes).optional().nullable(),
    overrideReason: z.string().trim().max(4000).optional().nullable(),
    overrideEffectivity: z.record(z.unknown()).optional(),
    overrideSignatureMeaning: z.string().trim().max(1000).optional().nullable(),
    overrideApprovedAt: z.string().datetime().optional().nullable(),
  })).min(1),
});

function enabled(value: boolean) {
  if (!value) throw new TraceabilityBomError('FEATURE_DISABLED', 'This controlled configuration feature is not enabled.', 404);
}
function id(value: string, label: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new TraceabilityBomError('INVALID_ID', `${label} is invalid.`);
  return parsed;
}
async function actor(req: Request) {
  if (!req.user?.id || !req.user.role) throw new TraceabilityBomError('ACTOR_REQUIRED', 'Authentication is required.', 401);
  const snapshot = await resolveUserSnapshot(req.user.id);
  return { userId: snapshot.userId, displayName: snapshot.displayName, role: String(req.user.role) };
}
async function requireOverrideAuthority(req: Request, lines: Array<{ overridePolicyType?: string | null }>) {
  if (!lines.some((line) => Boolean(line.overridePolicyType))) return;
  if (req.user?.role === 'ADMIN' || req.user?.role === 'OWNER') return;
  const permissions = await getUserPermissions(Number(req.user?.id), String(req.user?.role || ''));
  if (!permissions.permissionSet.has('engineering.controlled_bom.traceability_override'))
    throw new TraceabilityBomError('TRACEABILITY_OVERRIDE_FORBIDDEN', 'You are not authorized to approve a stricter traceability override.', 403);
}
function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', details: error.flatten() });
  if (error instanceof TraceabilityBomError) return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
  console.error('[inventory-traceability-bom]', error);
  return res.status(500).json({ error: 'CONTROLLED_CONFIGURATION_FAILED', message: 'The controlled configuration action could not be completed.' });
}

router.get('/inventory-items/:itemId/traceability-policies', authenticateToken,
  requirePermission('inventory.traceability_policy.view'), async (req, res) => {
    try { enabled(areInventoryTraceabilityPolicyReadsEnabled()); res.json({ policies: await getTraceabilityPolicyHistory(id(req.params.itemId, 'Inventory Item')) }); }
    catch (error) { fail(res, error); }
  });
router.post('/inventory-items/:itemId/traceability-policies', authenticateToken,
  requirePermission('inventory.traceability_policy.edit'), async (req, res) => {
    try { enabled(areInventoryTraceabilityPolicyWritesEnabled()); const body = policySchema.parse(req.body); res.status(201).json(await createTraceabilityPolicyDraft({ ...body, inventoryItemId: id(req.params.itemId, 'Inventory Item') }, await actor(req))); }
    catch (error) { fail(res, error); }
  });
router.post('/traceability-policies/:policyId/submit', authenticateToken,
  requirePermission('inventory.traceability_policy.submit'), async (req, res) => {
    try { enabled(areInventoryTraceabilityPolicyWritesEnabled()); const body = versionSchema.parse(req.body); res.json(await submitTraceabilityPolicy(req.params.policyId, body.expectedConcurrencyVersion, await actor(req))); }
    catch (error) { fail(res, error); }
  });
router.post('/traceability-policies/:policyId/decision', authenticateToken,
  requirePermission('inventory.traceability_policy.approve'), async (req, res) => {
    try {
      enabled(areInventoryTraceabilityPolicyWritesEnabled());
      const body = decisionSchema.parse(req.body);
      res.json(await decideTraceabilityPolicy({ ...body, policyId: req.params.policyId, expectedVersion: body.expectedConcurrencyVersion }, await actor(req)));
    }
    catch (error) { fail(res, error); }
  });

router.get('/inventory-items/:itemId/controlled-bom-status', authenticateToken,
  requirePermission('engineering.controlled_bom.view'), async (req, res) => {
    try { enabled(areControlledItemLinkedBomReadsEnabled() && isP2ConfigurationBomIntegrationEnabled()); res.json({ status: await getControlledBomStatus(id(req.params.itemId, 'Inventory Item')) }); }
    catch (error) { fail(res, error); }
  });
router.post('/controlled-boms', authenticateToken,
  requirePermission('engineering.controlled_bom.edit'), async (req, res) => {
    try { enabled(areControlledItemLinkedBomWritesEnabled()); const body = bomDraftSchema.parse(req.body); await requireOverrideAuthority(req, body.lines); res.status(201).json(await createControlledBomDraft(body, await actor(req))); }
    catch (error) { fail(res, error); }
  });
router.post('/controlled-bom-revisions/:revisionId/submit', authenticateToken,
  requirePermission('engineering.controlled_bom.submit'), async (req, res) => {
    try { enabled(areControlledItemLinkedBomWritesEnabled()); const body = versionSchema.parse(req.body); res.json(await submitControlledBomRevision(req.params.revisionId, body.expectedConcurrencyVersion, await actor(req))); }
    catch (error) { fail(res, error); }
  });
router.post('/controlled-bom-revisions/:revisionId/decision', authenticateToken,
  requirePermission('engineering.controlled_bom.approve'), async (req, res) => {
    try {
      enabled(areControlledItemLinkedBomWritesEnabled());
      const body = decisionSchema.parse(req.body);
      if (body.decision === 'APPROVE') {
        res.json(await releaseControlledBomRevision({ revisionId: req.params.revisionId, expectedVersion: body.expectedConcurrencyVersion, capacity: body.capacity, signatureMeaning: body.signatureMeaning }, await actor(req)));
      } else {
        res.json(await decideControlledBomRevision({ revisionId: req.params.revisionId, expectedVersion: body.expectedConcurrencyVersion, decision: body.decision, capacity: body.capacity, signatureMeaning: body.signatureMeaning, reason: body.reason }, await actor(req)));
      }
    }
    catch (error) { fail(res, error); }
  });
router.get('/controlled-bom-revisions/:revisionId/preview', authenticateToken,
  requirePermission('engineering.controlled_bom.view'), async (req, res) => {
    try { enabled(areControlledItemLinkedBomReadsEnabled() && isRecursiveTraceabilityPreviewEnabled()); res.json(await previewControlledBom(req.params.revisionId)); }
    catch (error) { fail(res, error); }
  });

export default router;
