/**
 * CMMC 2.0 Level 2 Readiness — API Routes
 *
 * GET  /api/cmmc/summary       — family-level coverage summary
 * GET  /api/cmmc/controls      — all 110 practices with current status + evidence
 * GET  /api/cmmc/controls/:id  — single practice detail
 * PATCH /api/cmmc/controls/:id — update status, notes, attestation
 * GET  /api/cmmc/export/json   — structured JSON SSP export
 * GET  /api/cmmc/vault-docs    — list vault documents available to attach as policy evidence
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken } from '../../middleware/auth';
import { db } from '../../db';
import { cmmcControlStatus, vaultDocuments } from '../../schema';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import {
  CMMC_PRACTICES,
  CMMC_FAMILIES,
  FAMILY_LABELS,
  getPracticesByFamily,
  getPracticeById,
} from '../services/cmmcControlTaxonomy';
import { getControlMapping } from '../services/cmmcEvidenceMapping';

type CmmcStatus = 'implemented' | 'partial' | 'planned' | 'not_applicable';

const router = Router();
router.use(authenticateToken);

function requireCmmcAccess(req: Request, res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user || (user.role !== 'ADMIN' && user.role !== 'OWNER')) {
    res.status(403).json({ error: 'ADMIN or OWNER role required to access CMMC dashboard.' });
    return;
  }
  next();
}

router.use(requireCmmcAccess);

/** Regex to identify controls that require policy/procedural documentation */
const POLICY_PATTERN = /policy|procedure|document|training|sop|written|formal/i;

/**
 * GET /api/cmmc/summary
 * Returns per-family coverage counts and totals.
 */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(cmmcControlStatus);
    const statusById: Record<string, string> = {};
    for (const r of rows) {
      statusById[r.practiceId] = r.status;
    }

    const familySummaries = CMMC_FAMILIES.map(family => {
      const practices = getPracticesByFamily(family);
      const counts: Record<CmmcStatus, number> = { implemented: 0, partial: 0, planned: 0, not_applicable: 0 };
      for (const p of practices) {
        const s = (statusById[p.practiceId] ?? 'planned') as CmmcStatus;
        counts[s] = (counts[s] ?? 0) + 1;
      }
      const total = practices.length;
      const applicable = total - counts.not_applicable;
      const covered = counts.implemented + counts.partial;
      // Coverage % = fully or partially implemented / applicable (industry standard for SSP readiness)
      const coveragePct = applicable > 0 ? Math.round((covered / applicable) * 100) : 0;
      const implementedPct = applicable > 0 ? Math.round((counts.implemented / applicable) * 100) : 0;
      return {
        family,
        label: FAMILY_LABELS[family],
        total,
        applicable,
        ...counts,
        coveragePct,
        implementedPct,
        coveredCount: covered,
      };
    });

    const totals = familySummaries.reduce(
      (acc, f) => {
        acc.total += f.total;
        acc.applicable += f.applicable;
        acc.implemented += f.implemented;
        acc.partial += f.partial;
        acc.planned += f.planned;
        acc.not_applicable += f.not_applicable;
        return acc;
      },
      { total: 0, applicable: 0, implemented: 0, partial: 0, planned: 0, not_applicable: 0 },
    );

    // Overall coverage = (implemented + partial) / applicable
    const overallCovered = totals.implemented + totals.partial;
    const overallPct = totals.applicable > 0
      ? Math.round((overallCovered / totals.applicable) * 100)
      : 0;
    const implementedOnlyPct = totals.applicable > 0
      ? Math.round((totals.implemented / totals.applicable) * 100)
      : 0;

    res.json({
      families: familySummaries,
      totals: { ...totals, overallPct, implementedOnlyPct },
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[CMMC] /summary error:', err);
    res.status(500).json({ error: 'Failed to load CMMC summary' });
  }
});

/**
 * GET /api/cmmc/controls
 * Returns all 110 practices merged with their current DB status and evidence links.
 * Optional query params: family, status, search
 */
router.get('/controls', async (req: Request, res: Response) => {
  try {
    const { family, status, search } = req.query as Record<string, string | undefined>;

    const rows = await db.select().from(cmmcControlStatus);
    const statusById: Record<string, typeof rows[0]> = {};
    for (const r of rows) statusById[r.practiceId] = r;

    let practices = CMMC_PRACTICES;
    if (family) practices = practices.filter(p => p.family === family);
    if (status) practices = practices.filter(p => (statusById[p.practiceId]?.status ?? 'planned') === status);
    if (search) {
      const q = search.toLowerCase();
      practices = practices.filter(
        p => p.practiceId.includes(q) || p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q),
      );
    }

    const result = practices.map(p => {
      const db_row = statusById[p.practiceId];
      const mapping = getControlMapping(p.practiceId);
      // Require policy doc if: explicit policy_only link, OR gap note mentions a policy/procedure requirement
      // (checked regardless of whether technical evidence also exists, since many controls need both)
      const requiresPolicyDoc =
        mapping.evidenceLinks.some(e => e.evidenceType === 'policy_only') ||
        (mapping.gapNote != null && POLICY_PATTERN.test(mapping.gapNote));
      return {
        practiceId: p.practiceId,
        family: p.family,
        familyLabel: FAMILY_LABELS[p.family],
        title: p.title,
        description: p.description,
        status: db_row?.status ?? 'planned',
        notes: db_row?.notes ?? mapping.gapNote ?? null,
        evidenceLinks: mapping.evidenceLinks,
        gapNote: mapping.gapNote ?? null,
        requiresPolicyDoc,
        policyDocumentId: db_row?.policyDocumentId ?? null,
        policyDocumentName: db_row?.policyDocumentName ?? null,
        attestedAt: db_row?.attestedAt ?? null,
        attestedByDisplayName: db_row?.attestedByDisplayName ?? null,
        updatedAt: db_row?.updatedAt ?? null,
        dbId: db_row?.id ?? null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[CMMC] /controls error:', err);
    res.status(500).json({ error: 'Failed to load CMMC controls' });
  }
});

/**
 * GET /api/cmmc/controls/:practiceId
 * Single practice detail.
 */
router.get('/controls/:practiceId', async (req: Request, res: Response) => {
  try {
    const { practiceId } = req.params;
    const practice = getPracticeById(practiceId);
    if (!practice) return res.status(404).json({ error: 'Practice not found' });

    const rows = await db.select().from(cmmcControlStatus).where(eq(cmmcControlStatus.practiceId, practiceId));
    const db_row = rows[0];
    const mapping = getControlMapping(practiceId);
    const requiresPolicyDoc =
      mapping.evidenceLinks.some(e => e.evidenceType === 'policy_only') ||
      (mapping.gapNote != null && POLICY_PATTERN.test(mapping.gapNote));

    return res.json({
      practiceId: practice.practiceId,
      family: practice.family,
      familyLabel: FAMILY_LABELS[practice.family],
      title: practice.title,
      description: practice.description,
      status: db_row?.status ?? 'planned',
      notes: db_row?.notes ?? mapping.gapNote ?? null,
      evidenceLinks: mapping.evidenceLinks,
      gapNote: mapping.gapNote ?? null,
      requiresPolicyDoc,
      policyDocumentId: db_row?.policyDocumentId ?? null,
      policyDocumentName: db_row?.policyDocumentName ?? null,
      attestedAt: db_row?.attestedAt ?? null,
      attestedByDisplayName: db_row?.attestedByDisplayName ?? null,
      updatedAt: db_row?.updatedAt ?? null,
      dbId: db_row?.id ?? null,
    });
  } catch (err) {
    console.error('[CMMC] /controls/:id error:', err);
    return res.status(500).json({ error: 'Failed to load control' });
  }
});

const patchSchema = z.object({
  status: z.enum(['implemented', 'partial', 'planned', 'not_applicable']).optional(),
  notes: z.string().nullable().optional(),
  policyDocumentId: z.number().nullable().optional(),
  attest: z.boolean().optional(),
});

/**
 * PATCH /api/cmmc/controls/:practiceId
 * Update status, notes, policy document, or attest a control.
 * Enforces attestation integrity: a policyDocumentId must exist in vault_documents when provided.
 */
router.patch('/controls/:practiceId', async (req: Request, res: Response) => {
  try {
    const { practiceId } = req.params;
    const user = req.user!;

    const practice = getPracticeById(practiceId);
    if (!practice) return res.status(404).json({ error: 'Practice not found' });

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });

    const { status, notes, policyDocumentId, attest } = parsed.data;

    // Validate policy document exists in vault when a policyDocumentId is being set;
    // resolve authoritative name server-side so stored metadata never drifts from the vault
    let resolvedPolicyDocumentName: string | null | undefined;
    if (policyDocumentId != null) {
      const vaultDoc = await db
        .select({ id: vaultDocuments.id, name: vaultDocuments.name })
        .from(vaultDocuments)
        .where(eq(vaultDocuments.id, policyDocumentId))
        .limit(1);
      if (vaultDoc.length === 0) {
        return res.status(400).json({ error: 'Referenced policy document does not exist in the vault.' });
      }
      resolvedPolicyDocumentName = vaultDoc[0].name;
    } else if (policyDocumentId === null) {
      resolvedPolicyDocumentName = null; // clearing the document
    }

    const now = new Date();

    // Build typed update payload using column names directly
    const updatePayload: Partial<{
      status: string;
      notes: string | null;
      policyDocumentId: number | null;
      policyDocumentName: string | null;
      attestedAt: Date | null;
      attestedByUserId: number | null;
      attestedByDisplayName: string | null;
      updatedAt: Date;
    }> = { updatedAt: now };

    if (status !== undefined) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;
    if (policyDocumentId !== undefined) updatePayload.policyDocumentId = policyDocumentId;
    if (resolvedPolicyDocumentName !== undefined) updatePayload.policyDocumentName = resolvedPolicyDocumentName;

    // Fetch existing row before attestation check (needed to see current policyDocumentId)
    const existing = await db.select().from(cmmcControlStatus).where(eq(cmmcControlStatus.practiceId, practiceId));

    if (attest === true) {
      // If this control requires a policy document, ensure one is present (either already stored or being set now)
      const mapping = getControlMapping(practiceId);
      const practiceRequiresPolicyDoc =
        mapping.evidenceLinks.some(e => e.evidenceType === 'policy_only') ||
        (mapping.gapNote != null && POLICY_PATTERN.test(mapping.gapNote));
      if (practiceRequiresPolicyDoc) {
        const effectivePolicyDocId = policyDocumentId !== undefined ? policyDocumentId : (existing[0]?.policyDocumentId ?? null);
        if (!effectivePolicyDocId) {
          return res.status(422).json({
            error: 'Attestation blocked: this control requires a policy document to be attached before it can be attested.',
          });
        }
      }
      updatePayload.attestedAt = now;
      updatePayload.attestedByUserId = user.id;
      updatePayload.attestedByDisplayName = user.username;
    }
    if (existing.length === 0) {
      const mapping = getControlMapping(practiceId);
      const seedStatus = mapping.seedStatus as CmmcStatus;
      await db.insert(cmmcControlStatus).values({
        practiceId,
        family: practice.family,
        status: status ?? seedStatus,
        notes: notes ?? mapping.gapNote ?? null,
        policyDocumentId: policyDocumentId ?? null,
        policyDocumentName: resolvedPolicyDocumentName ?? null,
        attestedAt: attest ? now : null,
        attestedByUserId: attest ? user.id : null,
        attestedByDisplayName: attest ? user.username : null,
      });
    } else {
      await db.update(cmmcControlStatus)
        .set(updatePayload)
        .where(eq(cmmcControlStatus.practiceId, practiceId));
    }

    const updated = await db.select().from(cmmcControlStatus).where(eq(cmmcControlStatus.practiceId, practiceId));
    return res.json({ ok: true, control: updated[0] });
  } catch (err) {
    console.error('[CMMC] PATCH /controls/:id error:', err);
    return res.status(500).json({ error: 'Failed to update control' });
  }
});

/**
 * GET /api/cmmc/vault-docs
 * Returns a list of vault documents the requesting admin can attach as policy evidence.
 * Only returns document id and name (no download URLs).
 */
router.get('/vault-docs', async (req: Request, res: Response) => {
  try {
    const docs = await db
      .select({
        id: vaultDocuments.id,
        name: vaultDocuments.name,
        classification: vaultDocuments.classification,
        createdAt: vaultDocuments.createdAt,
      })
      .from(vaultDocuments)
      .orderBy(desc(vaultDocuments.createdAt));

    res.json(docs);
  } catch (err) {
    console.error('[CMMC] /vault-docs error:', err);
    res.status(500).json({ error: 'Failed to list vault documents' });
  }
});

/**
 * GET /api/cmmc/export/json
 * Full SSP export as structured JSON (all 110 practices with status, evidence, notes).
 */
router.get('/export/json', async (req: Request, res: Response) => {
  try {
    const rows = await db.select().from(cmmcControlStatus);
    const statusById: Record<string, typeof rows[0]> = {};
    for (const r of rows) statusById[r.practiceId] = r;

    const controls = CMMC_PRACTICES.map(p => {
      const db_row = statusById[p.practiceId];
      const mapping = getControlMapping(p.practiceId);
      const requiresPolicyDoc =
        mapping.evidenceLinks.some(e => e.evidenceType === 'policy_only') ||
        (mapping.gapNote != null && POLICY_PATTERN.test(mapping.gapNote));
      return {
        practiceId: p.practiceId,
        family: p.family,
        familyLabel: FAMILY_LABELS[p.family],
        title: p.title,
        description: p.description,
        status: db_row?.status ?? 'planned',
        notes: db_row?.notes ?? null,
        gapNote: mapping.gapNote ?? null,
        requiresPolicyDoc,
        evidenceLinks: mapping.evidenceLinks,
        policyDocumentId: db_row?.policyDocumentId ?? null,
        policyDocumentName: db_row?.policyDocumentName ?? null,
        attestedAt: db_row?.attestedAt ?? null,
        attestedByDisplayName: db_row?.attestedByDisplayName ?? null,
        updatedAt: db_row?.updatedAt ?? null,
      };
    });

    const statusCounts: Record<CmmcStatus, number> = { implemented: 0, partial: 0, planned: 0, not_applicable: 0 };
    for (const c of controls) {
      const k = c.status as CmmcStatus;
      if (k in statusCounts) statusCounts[k]++;
    }
    const totals = { ...statusCounts, total: 110 };
    const applicable = 110 - totals.not_applicable;
    const covered = totals.implemented + totals.partial;

    const sspDocument = {
      documentTitle: 'EPOCH System Security Plan — CMMC 2.0 Level 2 Readiness',
      standardReference: 'NIST SP 800-171 Rev 2',
      exportedAt: new Date().toISOString(),
      exportedBy: req.user?.username ?? 'unknown',
      summary: totals,
      overallCoveragePct: applicable > 0 ? Math.round((covered / applicable) * 100) : 0,
      implementedOnlyPct: applicable > 0 ? Math.round((totals.implemented / applicable) * 100) : 0,
      controls,
    };

    res.setHeader('Content-Disposition', `attachment; filename="ssp-cmmc-${new Date().toISOString().slice(0, 10)}.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.json(sspDocument);
  } catch (err) {
    console.error('[CMMC] /export/json error:', err);
    return res.status(500).json({ error: 'Failed to generate SSP export' });
  }
});

export default router;
