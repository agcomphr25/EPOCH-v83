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

export function getWorkflowVersionForNewProject(
  flagValue = process.env.P2_V2_WORKFLOW_CREATION_ENABLED
): ProjectWorkflowVersion {
  // P2 V2 is the released workflow for new projects. Keep an exact, explicit
  // false value as the operational rollback switch; a missing deployment
  // variable must not silently create another legacy project.
  return flagValue === 'false' ? 'legacy_v1' : 'p2_v2';
}
