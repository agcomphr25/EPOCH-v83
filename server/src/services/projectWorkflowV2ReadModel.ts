type Row = Record<string, unknown>;

const text = (value: unknown) => (value == null ? null : String(value));
const activeApproval = (approval: Row) => !approval.superseded_at;
const approvedNotApplicable = (step: Row) =>
  step.status === 'NOT_APPLICABLE' &&
  ((step.approvals as Row[] | undefined) ?? []).some(
    (approval) =>
      activeApproval(approval) &&
      approval.decision === 'NOT_APPLICABLE_APPROVED'
  );

export function calculateP2V2Progress(steps: Row[]) {
  const completedStages = steps.filter(
    (step) => step.status === 'COMPLETE' || approvedNotApplicable(step)
  ).length;
  return {
    totalStages: steps.length,
    completedStages,
    blockedStages: steps.filter((step) => step.status === 'BLOCKED').length,
    pendingApprovalStages: steps.filter(
      (step) => step.status === 'PENDING_APPROVAL'
    ).length,
    percentComplete: steps.length
      ? Math.round((completedStages / steps.length) * 100)
      : 0,
  };
}

const mapLink = (link: Row) => ({
  id: text(link.id),
  recordType: text(link.record_type),
  recordId: text(link.record_id),
  relationshipType: text(link.relationship_type),
  isAuthoritative: Boolean(link.is_authoritative),
  recordRevision: text(link.record_revision),
  effectivityReference: text(link.effectivity_reference),
  linkedBy: link.linked_by ?? null,
  linkedByDisplayName: text(link.linked_by_display_name),
  linkedAt: link.linked_at ?? null,
  supersededAt: link.unlinked_at ?? null,
  supersededReason: text(link.unlink_reason),
});

const mapApproval = (approval: Row) => ({
  id: text(approval.id),
  decision: text(approval.decision),
  approvalType: text(approval.approval_type),
  signatureMeaning: text(approval.signature_meaning),
  actorDisplayName: text(approval.actor_display_name),
  actorRole: text(approval.actor_role),
  decidedAt: approval.decided_at ?? null,
  reason: text(approval.reason),
  superseded: Boolean(approval.superseded_at),
  supersededAt: approval.superseded_at ?? null,
});

export function buildP2V2WorkflowResponse(projectId: string, model: Row) {
  const instance = model.instance as Row;
  const integrity = model.integrity as { valid: boolean; issues: unknown[] };
  const rawSteps = (model.steps as Row[]) ?? [];
  const stages = rawSteps.map((step) => {
    const links = ((step.links as Row[]) ?? []).map(mapLink);
    const approvals = ((step.approvals as Row[]) ?? []).map(mapApproval);
    const activeLinks = links.filter((link) => !link.supersededAt);
    const supersededLinks = links.filter((link) => Boolean(link.supersededAt));
    return {
      id: text(step.id),
      stepType: text(step.step_type),
      stepOrder: Number(step.step_order),
      label: text(step.label_snapshot),
      description: text(step.description_snapshot),
      status: text(step.status),
      applicability: text(step.applicability),
      applicabilityReason: text(step.applicability_reason),
      applicabilitySource: text(step.applicability_source),
      ownerEmployeeId: step.owner_employee_id ?? null,
      ownerDisplayName: text(step.owner_display_name),
      ownerRole: text(step.owner_role),
      dueDate: step.due_date ?? null,
      startedAt: step.started_at ?? null,
      completedAt: step.completed_at ?? null,
      completedBy: step.completed_by ?? null,
      completedByDisplayName: text(step.completed_by_display_name),
      blockedReason: text(step.blocked_reason),
      revisionReference: text(step.revision_reference),
      effectivityReference: text(step.effectivity_reference),
      notes: text(step.notes),
      activeLinks,
      supersededLinks,
      approvals,
      evidenceCount: links.length + approvals.length,
      lastUpdated: step.updated_at ?? step.created_at ?? null,
    };
  });
  const progress = calculateP2V2Progress(rawSteps);
  return {
    projectId,
    workflowVersion: 'p2_v2',
    definitionVersion: instance.definition_version,
    initialized: true,
    workflowInstanceId: text(instance.id),
    workflowStatus: text(instance.status),
    initializedAt: instance.initialized_at ?? null,
    initializedBy: text(instance.initialized_by_display_name),
    integrityStatus: integrity.valid ? 'VALID' : 'INVALID',
    integrityErrors: integrity.issues,
    ...progress,
    stages,
  };
}

export function buildUninitializedP2V2Response(projectId: string) {
  return {
    projectId,
    workflowVersion: 'p2_v2',
    definitionVersion: null,
    initialized: false,
    workflowInstanceId: null,
    workflowStatus: 'NOT_INITIALIZED',
    initializedAt: null,
    initializedBy: null,
    integrityStatus: 'NOT_EVALUATED',
    integrityErrors: [],
    totalStages: 0,
    completedStages: 0,
    blockedStages: 0,
    pendingApprovalStages: 0,
    percentComplete: null,
    message: 'P2 V2 workflow has not been initialized.',
    stages: [],
  };
}
