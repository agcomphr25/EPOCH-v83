export const PROJECT_WORKFLOW_VERSIONS = ['legacy_v1', 'p2_v2'] as const;

export type ProjectWorkflowVersion = (typeof PROJECT_WORKFLOW_VERSIONS)[number];

export class ProjectWorkflowVersionError extends Error {
  readonly code = 'UNKNOWN_PROJECT_WORKFLOW_VERSION';
  readonly storedWorkflowVersion: unknown;

  constructor(value: unknown) {
    super(`Unknown project workflow version: ${String(value)}`);
    this.name = 'ProjectWorkflowVersionError';
    this.storedWorkflowVersion = value;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      workflowVersion: this.storedWorkflowVersion,
    };
  }
}

export function resolveProjectWorkflowVersion(
  projectOrValue: { workflowVersion?: unknown } | unknown
): ProjectWorkflowVersion {
  const value =
    typeof projectOrValue === 'object' && projectOrValue !== null
      ? (projectOrValue as { workflowVersion?: unknown }).workflowVersion
      : projectOrValue;

  if (value === null || value === undefined || value === 'legacy_v1')
    return 'legacy_v1';
  if (value === 'p2_v2') return 'p2_v2';
  throw new ProjectWorkflowVersionError(value);
}

export function serializeProjectWorkflowVersion<
  T extends { workflowVersion?: unknown },
>(project: T) {
  return {
    workflowVersion: project.workflowVersion ?? null,
    effectiveWorkflowVersion: resolveProjectWorkflowVersion(project),
  };
}

// Phase 1 is deliberately fail-closed until the p2_v2 initializer exists.
export function getWorkflowVersionForNewProject(
  flagValue = process.env.P2_V2_WORKFLOW_CREATION_ENABLED
): ProjectWorkflowVersion {
  const requested =
    typeof flagValue === 'string' && flagValue.trim().toLowerCase() === 'true';
  if (requested) {
    console.warn(
      '[Projects] P2_V2_WORKFLOW_CREATION_ENABLED requested, but p2_v2 initialization is unavailable; creating legacy_v1'
    );
  }
  return 'legacy_v1';
}
