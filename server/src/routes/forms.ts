import { Router, Request, Response } from 'express';
import {
  insertFormSchema,
  insertFormSubmissionSchema,
  insertPurchaseReviewChecklistSchema,
  insertManufacturersCertificateSchema,
  farFlowdownClauses,
  projectFarFlowdowns,
} from '@shared/schema';
import { and, eq } from 'drizzle-orm';

import { storage } from '../../storage';
import { db } from '../../db';

const router = Router();

function splitClauseNumbers(value: unknown): string[] {
  if (!value) return [];
  return String(value)
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasMeaningfulValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulValue(item));
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized !== '' && normalized !== 'n/a' && normalized !== 'na' && normalized !== 'none';
}

async function ensureFlowdownClause(clauseNumber: string) {
  const [existing] = await db
    .select()
    .from(farFlowdownClauses)
    .where(eq(farFlowdownClauses.clauseNumber, clauseNumber))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(farFlowdownClauses)
    .values({
      clauseNumber,
      title: `Manual FAR/DFARS clause ${clauseNumber}`,
      description: 'Captured from the purchase review checklist for project flowdown continuity.',
      defaultApplicable: false,
      isActive: true,
    })
    .returning();
  return created;
}

async function syncProjectFarFlowdownsFromChecklist(checklist: any) {
  const formData = checklist?.formData ?? {};
  const projectId = formData.projectId || formData.project_id;
  if (!projectId) return;

  const explicitClauseNumbers = splitClauseNumbers(formData.farFlowdownClauseNumbers);
  const clauses = explicitClauseNumbers.length > 0
    ? await Promise.all(explicitClauseNumbers.map(ensureFlowdownClause))
    : await db
        .select()
        .from(farFlowdownClauses)
        .where(eq(farFlowdownClauses.isActive, true));

  const sourceSignals = [
    hasMeaningfulValue(formData.farFlowdownNotes) && 'purchase review FAR/DFARS notes',
    hasMeaningfulValue(formData.retentionRequirements) && 'record retention requirements',
    hasMeaningfulValue(formData.dpasRating) && 'DPAS rating',
    hasMeaningfulValue(formData.certifications) && 'certification requirements',
    hasMeaningfulValue(formData.qualityRequirements) && 'quality requirements',
    hasMeaningfulValue(formData.acceptanceRejectionCriteria) && 'acceptance criteria',
  ].filter(Boolean);

  const selectedClauses = clauses.filter((clause: any) => {
    if (explicitClauseNumbers.length > 0) return true;
    return clause.defaultApplicable;
  });

  for (const clause of selectedClauses) {
    const reasoning = [
      explicitClauseNumbers.length > 0
        ? 'Clause listed on purchase review checklist.'
        : 'Project contract requirements captured in purchase review checklist.',
      sourceSignals.length > 0 ? `Signals: ${sourceSignals.join(', ')}.` : '',
      formData.farFlowdownNotes ? `Notes: ${formData.farFlowdownNotes}` : '',
    ].filter(Boolean).join(' ');

    const existing = await db
      .select()
      .from(projectFarFlowdowns)
      .where(and(
        eq(projectFarFlowdowns.projectId, projectId),
        eq(projectFarFlowdowns.clauseId, clause.id),
      ))
      .limit(1);

    const values = {
      projectId,
      purchaseReviewChecklistId: checklist.id,
      clauseId: clause.id,
      applicable: true,
      reasoning,
      source: 'purchase_review_checklist',
      status: 'open',
      recordedByDisplayName: checklist.createdBy ?? null,
      updatedAt: new Date(),
    };

    if (existing.length > 0) {
      await db.update(projectFarFlowdowns)
        .set(values)
        .where(eq(projectFarFlowdowns.id, existing[0].id));
    } else {
      await db.insert(projectFarFlowdowns).values(values);
    }
  }

  const steps = await storage.getProjectSteps(projectId);
  const purchaseReviewStep = steps.find((step: any) => step.stepType === 'purchase_review_checklist');
  if (purchaseReviewStep) {
    const shouldComplete = checklist.status === 'SUBMITTED' || checklist.status === 'APPROVED';
    await storage.updateProjectStep(purchaseReviewStep.id, {
      linkedPurchaseReviewId: checklist.id,
      ...(shouldComplete ? {
        status: 'completed',
        completedAt: new Date(),
      } : {}),
      notes: selectedClauses.length > 0
        ? `FAR flowdown captured from purchase review checklist #${checklist.id}.`
        : purchaseReviewStep.notes,
    } as any);
  }

  if (selectedClauses.length > 0) {
    await storage.createProjectActivityLog({
      projectId,
      activityType: 'far_flowdown_synced',
      stepType: 'purchase_review_checklist' as any,
      description: `FAR flowdown synced from purchase review checklist #${checklist.id} (${selectedClauses.length} clause${selectedClauses.length === 1 ? '' : 's'})`,
      performedByDisplayName: checklist.createdBy ?? null,
    } as any);
  }
}

// Enhanced Forms Management
router.get('/enhanced', async (req: Request, res: Response) => {
  try {
    const forms = await storage.getAllEnhancedForms();
    res.json(forms);
  } catch (error) {
    console.error('Get enhanced forms error:', error);
    res.status(500).json({ error: 'Failed to fetch enhanced forms' });
  }
});

router.get('/enhanced/:id', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const form = await storage.getEnhancedFormById(formId);

    if (!form) {
      return res.status(404).json({ error: 'Form not found' });
    }

    res.json(form);
  } catch (error) {
    console.error('Get enhanced form error:', error);
    res.status(500).json({ error: 'Failed to fetch enhanced form' });
  }
});

router.post('/enhanced', async (req: Request, res: Response) => {
  try {
    const formData = insertFormSchema.parse(req.body);
    const newForm = await storage.createEnhancedForm(formData);
    res.status(201).json(newForm);
  } catch (error) {
    console.error('Create enhanced form error:', error);
    res.status(500).json({ error: 'Failed to create enhanced form' });
  }
});

router.put('/enhanced/:id', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const updates = req.body;
    const updatedForm = await storage.updateEnhancedForm(formId, updates);
    res.json(updatedForm);
  } catch (error) {
    console.error('Update enhanced form error:', error);
    res.status(500).json({ error: 'Failed to update enhanced form' });
  }
});

router.delete('/enhanced/:id', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    await storage.deleteEnhancedForm(formId);
    res.status(204).end();
  } catch (error) {
    console.error('Delete enhanced form error:', error);
    res.status(500).json({ error: 'Failed to delete enhanced form' });
  }
});

// Form Submissions
router.get('/enhanced/:id/submissions', async (req: Request, res: Response) => {
  try {
    const formId = parseInt(req.params.id);
    const submissions = await storage.getFormSubmissions(formId);
    res.json(submissions);
  } catch (error) {
    console.error('Get form submissions error:', error);
    res.status(500).json({ error: 'Failed to fetch form submissions' });
  }
});

router.post(
  '/enhanced/:id/submissions',
  async (req: Request, res: Response) => {
    try {
      const formId = parseInt(req.params.id);
      const submissionData = insertFormSubmissionSchema.parse({
        ...req.body,
        formId,
      });
      const newSubmission = await storage.createFormSubmission(submissionData);
      res.status(201).json(newSubmission);
    } catch (error) {
      console.error('Create form submission error:', error);
      res.status(500).json({ error: 'Failed to create form submission' });
    }
  }
);

// Purchase Review Checklist
router.get('/purchase-review-checklists/blank/pdf', async (_req: Request, res: Response) => {
  try {
    const { generatePurchaseReviewChecklistPdf } = await import('../services/purchaseReviewChecklistPdf');
    const pdfBytes = await generatePurchaseReviewChecklistPdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Blank_Purchase_Review_Checklist.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Generate blank purchase review checklist PDF error:', error);
    res.status(500).json({ error: 'Failed to generate blank purchase review checklist PDF' });
  }
});

router.get('/purchase-review-checklists/:id/pdf', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const checklist = await storage.getPurchaseReviewChecklistById(id);
    if (!checklist) return res.status(404).json({ error: 'Purchase review checklist not found' });
    const { generatePurchaseReviewChecklistPdf } = await import('../services/purchaseReviewChecklistPdf');
    const pdfBytes = await generatePurchaseReviewChecklistPdf((checklist.formData || {}) as Record<string, unknown>);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Purchase_Review_Checklist_${id}.pdf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('Generate purchase review checklist PDF error:', error);
    res.status(500).json({ error: 'Failed to generate purchase review checklist PDF' });
  }
});

router.get(
  '/purchase-review-checklists',
  async (req: Request, res: Response) => {
    try {
      const checklists = await storage.getAllPurchaseReviewChecklists();
      res.json(checklists);
    } catch (error) {
      console.error('Get purchase review checklists error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch purchase review checklists' });
    }
  }
);

router.get(
  '/purchase-review-checklists/:id',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const checklist = await storage.getPurchaseReviewChecklistById(id);

      if (!checklist) {
        return res
          .status(404)
          .json({ error: 'Purchase review checklist not found' });
      }

      res.json(checklist);
    } catch (error) {
      console.error('Get purchase review checklist error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch purchase review checklist' });
    }
  }
);

router.post(
  '/purchase-review-checklists',
  async (req: Request, res: Response) => {
    try {
      const checklistData = insertPurchaseReviewChecklistSchema.parse(req.body);
      const newChecklist =
        await storage.createPurchaseReviewChecklist(checklistData);
      await syncProjectFarFlowdownsFromChecklist(newChecklist);
      res.status(201).json(newChecklist);
    } catch (error) {
      console.error('Create purchase review checklist error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res
        .status(500)
        .json({ error: 'Failed to create purchase review checklist' });
    }
  }
);

router.put(
  '/purchase-review-checklists/:id',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const updatedChecklist = await storage.updatePurchaseReviewChecklist(
        id,
        updates
      );
      await syncProjectFarFlowdownsFromChecklist(updatedChecklist);
      res.json(updatedChecklist);
    } catch (error) {
      console.error('Update purchase review checklist error:', error);
      res
        .status(500)
        .json({ error: 'Failed to update purchase review checklist' });
    }
  }
);

router.delete(
  '/purchase-review-checklists/:id',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deletePurchaseReviewChecklist(id);
      res.status(204).end();
    } catch (error) {
      console.error('Delete purchase review checklist error:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete purchase review checklist' });
    }
  }
);

// Manufacturer's Certificate of Conformance routes
router.get(
  '/manufacturers-certificates',
  async (req: Request, res: Response) => {
    try {
      const certificates = await storage.getAllManufacturersCertificates();
      res.json(certificates);
    } catch (error) {
      console.error('Get manufacturers certificates error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch manufacturers certificates' });
    }
  }
);

router.get(
  '/manufacturers-certificates/:id',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const certificate = await storage.getManufacturersCertificate(id);

      if (!certificate) {
        return res
          .status(404)
          .json({ error: "Manufacturer's certificate not found" });
      }

      res.json(certificate);
    } catch (error) {
      console.error('Get manufacturers certificate error:', error);
      res
        .status(500)
        .json({ error: 'Failed to fetch manufacturers certificate' });
    }
  }
);

router.post(
  '/manufacturers-certificates',
  async (req: Request, res: Response) => {
    try {
      const certificateData = insertManufacturersCertificateSchema.parse(
        req.body
      );
      const newCertificate =
        await storage.createManufacturersCertificate(certificateData);
      res.status(201).json(newCertificate);
    } catch (error) {
      console.error('Create manufacturers certificate error:', error);
      if (error instanceof Error) {
        return res.status(400).json({ error: error.message });
      }
      res
        .status(500)
        .json({ error: 'Failed to create manufacturers certificate' });
    }
  }
);

router.put(
  '/manufacturers-certificates/:id',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      const updatedCertificate = await storage.updateManufacturersCertificate(
        id,
        updates
      );
      res.json(updatedCertificate);
    } catch (error) {
      console.error('Update manufacturers certificate error:', error);
      res
        .status(500)
        .json({ error: 'Failed to update manufacturers certificate' });
    }
  }
);

router.delete(
  '/manufacturers-certificates/:id',
  async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteManufacturersCertificate(id);
      res.status(204).end();
    } catch (error) {
      console.error('Delete manufacturers certificate error:', error);
      res
        .status(500)
        .json({ error: 'Failed to delete manufacturers certificate' });
    }
  }
);

export default router;
