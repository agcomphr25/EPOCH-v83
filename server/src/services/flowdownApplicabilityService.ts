import { and, eq } from 'drizzle-orm';
import { db } from '../../db';
import {
  farFlowdownClauses,
  vendorPOs,
  vendorPoFarFlowdowns,
  vendorPoFlowdownAssessments,
  vendors,
} from '../../schema';

export type FlowdownAnswers = Record<string, boolean | null>;

function recommendationFor(clause: any, assessment: any) {
  if (!assessment?.governmentSupported) return { recommendation: 'EXCLUDE', triggerReason: 'Purchase is not identified as supporting a Government contract.' };
  const rule = (clause.applicabilityRule || {}) as any;
  const procurementClass = String(assessment.procurementClass || 'UNKNOWN');
  let recommendation = clause.defaultApplicable ? 'INCLUDE' : 'EXCLUDE';
  let triggerReason = clause.defaultApplicable ? 'AG baseline requirement for Government-supported purchases.' : 'No questionnaire trigger was identified.';

  if (rule.trigger === 'government_supported') {
    recommendation = 'INCLUDE';
    triggerReason = 'Government-supported purchase.';
  }
  if (Array.isArray(rule.procurementClasses)) {
    recommendation = rule.procurementClasses.includes(procurementClass) ? 'INCLUDE' : 'EXCLUDE';
    triggerReason = recommendation === 'INCLUDE'
      ? `Procurement classification is ${procurementClass.replaceAll('_', ' ').toLowerCase()}.`
      : `Clause is tied to a commercial classification; current classification is ${procurementClass.replaceAll('_', ' ').toLowerCase()}.`;
  }
  if (Array.isArray(rule.anyAnswers)) {
    const answers: FlowdownAnswers = assessment.answers || {};
    const trueKeys = rule.anyAnswers.filter((key: string) => answers[key] === true);
    const unknownKeys = rule.anyAnswers.filter((key: string) => answers[key] == null);
    if (trueKeys.length) {
      recommendation = clause.legalReviewRequired ? 'REVIEW' : 'INCLUDE';
      triggerReason = `Triggered by: ${trueKeys.join(', ')}.`;
    } else if (unknownKeys.length) {
      recommendation = 'REVIEW';
      triggerReason = `Answer required: ${unknownKeys.join(', ')}.`;
    } else {
      recommendation = 'EXCLUDE';
      triggerReason = `Not triggered by: ${rule.anyAnswers.join(', ')}.`;
    }
  }
  if (['COTS', 'COMMERCIAL_PRODUCT', 'COMMERCIAL_SERVICE'].includes(procurementClass) && clause.commercialApplicability === 'CONDITIONAL' && recommendation === 'INCLUDE') {
    recommendation = 'REVIEW';
    triggerReason += ' Confirm this clause is permitted for a commercial subcontract.';
  }
  return { recommendation, triggerReason };
}

export async function getVendorPoFlowdownWorkspace(vendorPoId: number) {
  const [po] = await db.select({ id: vendorPOs.id, poNumber: vendorPOs.poNumber, vendorId: vendorPOs.vendorId, totalCost: vendorPOs.totalCost, status: vendorPOs.status, vendorName: vendors.name })
    .from(vendorPOs).leftJoin(vendors, eq(vendorPOs.vendorId, vendors.id)).where(eq(vendorPOs.id, vendorPoId));
  if (!po) throw new Error('Vendor PO not found');
  const [assessment] = await db.select().from(vendorPoFlowdownAssessments).where(eq(vendorPoFlowdownAssessments.vendorPoId, vendorPoId));
  const clauses = await db.select().from(farFlowdownClauses).where(eq(farFlowdownClauses.isActive, true)).orderBy(farFlowdownClauses.clauseNumber);
  const decisions = await db.select().from(vendorPoFarFlowdowns).where(eq(vendorPoFarFlowdowns.vendorPoId, vendorPoId));
  const byClause = new Map(decisions.map((row) => [row.clauseId, row]));
  return {
    po,
    assessment: assessment || {
      vendorPoId,
      governmentSupported: false,
      internalContractReference: '',
      sourceDocumentReference: '',
      discloseContractReference: false,
      procurementClass: 'UNKNOWN',
      answers: {},
      reviewStatus: 'DRAFT',
      reviewNotes: '',
      exhibitRevision: 0,
    },
    clauses: clauses.map((clause) => {
      const recommendation = recommendationFor(clause, assessment);
      const saved = byClause.get(clause.id);
      return {
        ...clause,
        ...recommendation,
        savedDecision: saved?.decision || 'PENDING',
        decisionReason: saved?.decisionReason || '',
        savedApplicable: saved?.applicable ?? null,
        savedTriggerReason: saved?.triggerReason || null,
      };
    }),
  };
}

export async function saveVendorPoFlowdownWorkspace(input: {
  vendorPoId: number;
  assessment: {
    governmentSupported: boolean;
    internalContractReference?: string | null;
    sourceDocumentReference?: string | null;
    discloseContractReference?: boolean;
    procurementClass: string;
    answers: FlowdownAnswers;
    reviewStatus: string;
    reviewNotes: string;
  };
  decisions: Array<{ clauseId: number; decision: 'INCLUDE' | 'EXCLUDE'; decisionReason: string; recommendation: string; triggerReason: string; inclusionMethod: string }>;
  actor?: { id?: number | null; name?: string | null };
}) {
  const approvalRequested = input.assessment.reviewStatus === 'APPROVED';
  if (approvalRequested && input.assessment.governmentSupported) {
    if (input.assessment.procurementClass === 'UNKNOWN') throw new Error('Classify the purchase before approval');
    if (!input.assessment.internalContractReference?.trim()) throw new Error('Internal customer contract reference is required');
    if (!input.assessment.sourceDocumentReference?.trim()) throw new Error('Customer flowdown source document is required');
    if (!input.assessment.reviewNotes?.trim()) throw new Error('Approval notes are required');
    if (!input.decisions.length || input.decisions.some((row) => !row.decisionReason.trim())) throw new Error('Every clause decision requires a reason');
  }

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(vendorPoFlowdownAssessments).where(eq(vendorPoFlowdownAssessments.vendorPoId, input.vendorPoId));
    const values = {
      ...input.assessment,
      internalContractReference: input.assessment.internalContractReference?.trim() || null,
      sourceDocumentReference: input.assessment.sourceDocumentReference?.trim() || null,
      discloseContractReference: false,
      approvedByUserId: approvalRequested ? input.actor?.id || null : null,
      approvedByDisplayName: approvalRequested ? input.actor?.name || null : null,
      approvedAt: approvalRequested ? new Date() : null,
      exhibitRevision: approvalRequested ? (existing?.exhibitRevision || 0) + 1 : (existing?.exhibitRevision || 0),
      updatedAt: new Date(),
    };
    const [assessment] = existing
      ? await tx.update(vendorPoFlowdownAssessments).set(values).where(eq(vendorPoFlowdownAssessments.vendorPoId, input.vendorPoId)).returning()
      : await tx.insert(vendorPoFlowdownAssessments).values({ vendorPoId: input.vendorPoId, ...values }).returning();

    await tx.delete(vendorPoFarFlowdowns).where(eq(vendorPoFarFlowdowns.vendorPoId, input.vendorPoId));
    if (input.decisions.length) {
      await tx.insert(vendorPoFarFlowdowns).values(input.decisions.map((row) => ({
        vendorPoId: input.vendorPoId,
        clauseId: row.clauseId,
        applicable: row.decision === 'INCLUDE',
        reasoning: row.decisionReason.trim(),
        recommendation: row.recommendation,
        decision: row.decision,
        triggerReason: row.triggerReason,
        decisionReason: row.decisionReason.trim(),
        inclusionMethod: row.inclusionMethod || 'REFERENCE',
        source: 'GUIDED_REVIEW',
        recordedByUserId: input.actor?.id || null,
        recordedByDisplayName: input.actor?.name || null,
      })));
    }
    return assessment;
  });
}
