import type { Request, Response } from 'express';

export const SPEC_SHEET_CAPABILITIES = {
  templateCreate: 'spec_sheets.template.create',
  templateUpdate: 'spec_sheets.template.update',
  templateDeactivate: 'spec_sheets.template.deactivate',
  create: 'spec_sheets.create',
  edit: 'spec_sheets.edit',
  submit: 'spec_sheets.submit',
  approveEngineering: 'spec_sheets.approve.engineering',
  approveQuality: 'spec_sheets.approve.quality',
  approveProduction: 'spec_sheets.approve.production',
  approveCustomer: 'spec_sheets.approve.customer',
  release: 'spec_sheets.release',
  supersede: 'spec_sheets.supersede',
  obsolete: 'spec_sheets.obsolete',
  reopen: 'spec_sheets.reopen',
  delete: 'spec_sheets.delete',
  viewHistory: 'spec_sheets.history.view',
} as const;

export type SpecSheetLifecycle =
  'DRAFT' | 'IN_REVIEW' | 'RELEASED' | 'SUPERSEDED' | 'OBSOLETE';

export const SPEC_SHEET_TRANSITIONS: Readonly<
  Record<SpecSheetLifecycle, readonly SpecSheetLifecycle[]>
> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['DRAFT', 'RELEASED'],
  RELEASED: ['SUPERSEDED', 'OBSOLETE'],
  SUPERSEDED: ['OBSOLETE'],
  OBSOLETE: [],
};

type AuthenticatedSpecActor = {
  id: number;
  username?: string;
  name?: string;
  displayName?: string;
  role?: string;
  capabilities: string[];
};

export function getSpecActor(req: Request): AuthenticatedSpecActor | null {
  const candidate = (req as Request & { user?: Record<string, unknown> }).user;
  const id = Number(candidate?.id);
  if (!candidate || !Number.isInteger(id) || id <= 0) {
    return null;
  }
  return {
    ...(candidate as Omit<AuthenticatedSpecActor, 'id' | 'capabilities'>),
    id,
    capabilities: Array.isArray(candidate.capabilities)
      ? candidate.capabilities.map(String)
      : [],
  };
}

export function actorHasSpecCapability(
  actor: AuthenticatedSpecActor,
  capability: string
): boolean {
  const role = String(actor.role || '').toUpperCase();
  return (
    role === 'ADMIN' ||
    role === 'OWNER' ||
    actor.capabilities.includes('*') ||
    actor.capabilities.includes(capability)
  );
}

export function requireSpecCapability(
  req: Request,
  res: Response,
  capability: string
): AuthenticatedSpecActor | null {
  const actor = getSpecActor(req);
  if (!actor) {
    res.status(401).json({ error: 'Authenticated identity is required' });
    return null;
  }
  if (!actorHasSpecCapability(actor, capability)) {
    res.status(403).json({
      error: 'Specification-sheet capability is required',
      requiredCapability: capability,
    });
    return null;
  }
  return actor;
}

export function assertSpecTransition(
  from: string,
  to: string
): asserts to is SpecSheetLifecycle {
  const normalizedFrom = from.toUpperCase() as SpecSheetLifecycle;
  const normalizedTo = to.toUpperCase() as SpecSheetLifecycle;
  if (
    !(normalizedFrom in SPEC_SHEET_TRANSITIONS) ||
    !SPEC_SHEET_TRANSITIONS[normalizedFrom].includes(normalizedTo)
  ) {
    throw new Error(
      `Invalid specification lifecycle transition: ${normalizedFrom} -> ${normalizedTo}`
    );
  }
}

export function specActorSnapshot(actor: AuthenticatedSpecActor) {
  return {
    id: actor.id,
    username: actor.username || null,
    displayName:
      actor.displayName || actor.name || actor.username || `user-${actor.id}`,
    role: actor.role || null,
    capabilities: [...actor.capabilities],
  };
}
