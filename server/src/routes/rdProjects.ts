import { Router, type Request, type Response } from 'express';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../../db';
import {
  designProjectConfigurationItems,
  designProjectConfigurationItemRelationships,
  designProjectConfigurationWorkspaces,
  designProjectDocumentApplicability,
  designProjectPartRevisionArtifacts,
  designProjectPartRevisions,
  rdProjects,
} from '../../schema';
import { resolveUserSnapshot } from '../../utils/userSnapshot';
import { requirePermission } from '../../middleware/requirePermission';
import {
  designateAuthoritativeDesignControl,
  initializeDesignControlForProject,
  resolveDesignControlAuthority,
} from '../services/designControlAuthorityService';
import { recordAuditEvent } from '../services/auditLedgerService';
import {
  assertDesignControlSchemaReady,
  DesignControlSchemaNotReadyError,
} from '../services/designControlSchemaReadiness';

const router = Router();

const itemTypes = [
  'PRODUCT',
  'ASSEMBLY',
  'SUBASSEMBLY',
  'MANUFACTURED_PART',
  'PURCHASED_COMPONENT',
  'TOOLING',
  'SOFTWARE',
] as const;
const makeBuyValues = ['MAKE', 'BUY', 'UNDETERMINED'] as const;
const requirementRoles = [
  'DRAWING_CAD',
  'BOM',
  'ROUTING',
  'TRAVELER',
  'WORK_INSTRUCTION',
  'INSPECTION_PLAN',
  'TEST_PROCEDURE',
  'MATERIAL_SPECIFICATION',
  'TOOLING_FIXTURE',
  'CNC_PROGRAM',
  'SUPPLIER_REQUIREMENT',
  'TRAINING_CERTIFICATION',
  'PACKAGING_SHIPPING',
] as const;

const itemPayloadSchema = z.object({
  configurationItemNumber: z.string().trim().min(1),
  partNumber: z.string().trim().min(1),
  title: z.string().trim().min(1),
  itemType: z.enum(itemTypes),
  makeBuyDesignation: z.enum(makeBuyValues).default('UNDETERMINED'),
  designResponsibility: z.string().trim().nullable().optional(),
  inventoryItemId: z.number().int().positive().nullable().optional(),
});

const relationshipPayloadSchema = z.object({
  parentConfigurationItemId: z.string().uuid(),
  childConfigurationItemId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  unitOfMeasure: z.string().trim().min(1),
  referenceDesignator: z.string().trim().nullable().optional(),
  effectivityStart: z.string().trim().nullable().optional(),
  effectivityEnd: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const createItemPayloadSchema = itemPayloadSchema.extend({
  parentConfigurationItemId: z.string().uuid().nullable().optional(),
  quantity: z.coerce.number().positive().optional(),
  unitOfMeasure: z.string().trim().min(1).optional(),
  referenceDesignator: z.string().trim().nullable().optional(),
  effectivityStart: z.string().trim().nullable().optional(),
  effectivityEnd: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    result &&
    typeof result === 'object' &&
    'rows' in result &&
    Array.isArray(result.rows)
  ) {
    return result.rows as T[];
  }
  return [];
}

function errorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String(error.code)
    : null;
}

function requestEvidence(req: Request) {
  const actor = actorSnapshot(req);
  return {
    actor,
    snapshot: { userId: actor.id, username: actor.username, role: actor.role },
    metadata: { ipAddress: req.ip, userAgent: req.get('user-agent') ?? null },
  };
}

async function ensureConfigurationReady(
  _req: Request,
  res: Response,
  next: () => void
) {
  try {
    await assertDesignControlSchemaReady();
    next();
  } catch (error) {
    if (error instanceof DesignControlSchemaNotReadyError) {
      return res.status(503).json({
        error: 'DESIGN_CONTROL_SCHEMA_NOT_READY',
        missing: error.missingObjects,
      });
    }
    console.error('Design configuration readiness error:', error);
    return res
      .status(503)
      .json({ error: 'DESIGN_CONTROL_SCHEMA_READINESS_FAILED' });
  }
}

router.use('/:projectId/configuration', ensureConfigurationReady);

const rdProjectPayloadSchema = z.object({
  id: z.string().trim().min(1),
  projectName: z.string().trim().min(1),
  owner: z.string().default(''),
  status: z.enum(['draft', 'active']).default('draft'),
  signoffRequired: z.boolean().default(false),
  signoffUserId: z.string().default(''),
  draftTabIds: z.array(z.string()).default([]),
  description: z.string().default(''),
});

const localReconciliationSchema = rdProjectPayloadSchema.extend({
  confirmed: z.literal(true),
  localStorageKey: z.string().trim().min(1),
});

type AuthenticatedUser = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
  displayName?: string | null;
  role?: string | null;
};

function authenticatedUser(req: Request): AuthenticatedUser | undefined {
  return (req as Request & { user?: AuthenticatedUser }).user;
}

function actorSnapshot(req: Request) {
  const user = authenticatedUser(req);
  return {
    id: typeof user?.id === 'number' ? user.id : null,
    username: user?.username ?? user?.email ?? user?.displayName ?? 'unknown',
    role: user?.role ?? null,
  };
}

async function userSnapshot(req: Request) {
  const user = authenticatedUser(req);
  if (!user) return { userId: null, displayName: 'unknown' };
  if (!user.id) {
    return {
      userId: null,
      displayName: user.username ?? user.displayName ?? 'unknown',
    };
  }
  return resolveUserSnapshot(user.id).catch(() => ({
    userId: user.id ?? null,
    displayName: user.username ?? user.displayName ?? 'unknown',
  }));
}

function toClientProject(row: typeof rdProjects.$inferSelect) {
  return {
    id: row.id,
    projectName: row.projectName,
    owner: row.owner,
    status: row.status,
    signoffRequired: row.signoffRequired,
    signoffUserId: row.signoffUserId,
    draftTabIds: Array.isArray(row.draftTabIds) ? row.draftTabIds : [],
    description: row.description,
    createdAt: row.createdAt?.toISOString?.(),
    updatedAt: row.updatedAt?.toISOString?.(),
    createdByUserId: row.createdByUserId,
    createdByDisplayName: row.createdByDisplayName,
    updatedByDisplayName: row.updatedByDisplayName,
  };
}

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(rdProjects)
      .orderBy(desc(rdProjects.updatedAt));
    res.json(rows.map(toClientProject));
  } catch (error) {
    console.error('List R&D projects error:', error);
    res.status(500).json({ error: 'Failed to fetch R&D projects' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  try {
    const parsed = rdProjectPayloadSchema.parse({
      ...req.body,
      id: req.params.id,
    });
    const snapshot = await userSnapshot(req);
    const now = new Date();

    const [existing] = await db
      .select()
      .from(rdProjects)
      .where(eq(rdProjects.id, parsed.id))
      .limit(1);

    const [row] = await db
      .insert(rdProjects)
      .values({
        id: parsed.id,
        projectName: parsed.projectName,
        owner: parsed.owner,
        status: parsed.status,
        signoffRequired: parsed.signoffRequired,
        signoffUserId: parsed.signoffRequired ? parsed.signoffUserId : '',
        draftTabIds: parsed.draftTabIds,
        description: parsed.description,
        createdByUserId: existing?.createdByUserId ?? snapshot.userId ?? null,
        createdByDisplayName:
          existing?.createdByDisplayName ?? snapshot.displayName ?? 'unknown',
        updatedByUserId: snapshot.userId ?? null,
        updatedByDisplayName: snapshot.displayName ?? 'unknown',
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: rdProjects.id,
        set: {
          projectName: parsed.projectName,
          owner: parsed.owner,
          status: parsed.status,
          signoffRequired: parsed.signoffRequired,
          signoffUserId: parsed.signoffRequired ? parsed.signoffUserId : '',
          draftTabIds: parsed.draftTabIds,
          description: parsed.description,
          updatedByUserId: snapshot.userId ?? null,
          updatedByDisplayName: snapshot.displayName ?? 'unknown',
          updatedAt: now,
        },
      })
      .returning();

    res.json(toClientProject(row));
  } catch (error) {
    console.error('Save R&D project error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: error.errors[0]?.message || 'Invalid R&D project payload',
      });
    }
    res.status(500).json({ error: 'Failed to save R&D project' });
  }
});

router.get(
  '/:projectId/design-control',
  async (req: Request, res: Response) => {
    try {
      const resolution = await resolveDesignControlAuthority(
        req.params.projectId
      );
      if (!resolution)
        return res.status(404).json({ error: 'R&D project not found' });
      res.json(resolution);
    } catch (error) {
      console.error('Resolve project Design Control authority error:', error);
      res
        .status(500)
        .json({ error: 'Failed to resolve project Design Control authority' });
    }
  }
);

router.post(
  '/:projectId/design-control/initialize',
  requirePermission('design.control.create'),
  async (req: Request, res: Response) => {
    try {
      const result = await initializeDesignControlForProject({
        projectId: req.params.projectId,
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        actor: actorSnapshot(req),
        requestMetadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });
      if (result.status === 'project_not_found')
        return res.status(404).json({ error: 'R&D project not found' });
      if (result.status === 'conflict') {
        return res.status(409).json({
          error: 'DESIGN_CONTROL_RECONCILIATION_REQUIRED',
          message:
            'Existing Design Control records require explicit authority reconciliation.',
          resolution: result.resolution,
        });
      }
      res.status(result.status === 'created' ? 201 : 200).json(result);
    } catch (error: unknown) {
      if (errorCode(error) === '23505') {
        const resolution = await resolveDesignControlAuthority(
          req.params.projectId
        );
        return res.status(200).json({ status: 'existing', resolution });
      }
      console.error('Initialize project Design Control error:', error);
      res
        .status(500)
        .json({ error: 'Failed to initialize project Design Control' });
    }
  }
);

router.post(
  '/:projectId/design-control/designate',
  requirePermission('design.control.admin'),
  async (req: Request, res: Response) => {
    try {
      const parsed = z
        .object({
          recordId: z.string().uuid(),
          reason: z.string().trim().min(1),
        })
        .parse(req.body);
      const result = await designateAuthoritativeDesignControl({
        projectId: req.params.projectId,
        recordId: parsed.recordId,
        reason: parsed.reason,
        actor: actorSnapshot(req),
        requestMetadata: {
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });
      if (result.status === 'project_not_found')
        return res.status(404).json({ error: 'R&D project not found' });
      if (result.status === 'record_not_in_project') {
        return res.status(409).json({
          error:
            'Selected Design Control record does not belong to this project',
        });
      }
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: error.errors[0]?.message ?? 'Invalid designation request',
        });
      }
      console.error('Designate project Design Control authority error:', error);
      res.status(500).json({
        error: 'Failed to designate project Design Control authority',
      });
    }
  }
);

router.post(
  '/reconcile-local',
  requirePermission('design.control.create'),
  async (req: Request, res: Response) => {
    try {
      const parsed = localReconciliationSchema.parse(req.body);
      const [sameId] = await db
        .select()
        .from(rdProjects)
        .where(eq(rdProjects.id, parsed.id))
        .limit(1);
      if (sameId) {
        return res
          .status(409)
          .json({ outcome: 'server_match', project: toClientProject(sameId) });
      }

      const possibleDuplicates = await db.execute(sql`
      SELECT id, project_name, owner, status
      FROM rd_projects
      WHERE lower(trim(project_name)) = lower(trim(${parsed.projectName}))
      ORDER BY updated_at DESC
      LIMIT 10
    `);
      const duplicateRows = rowsOf<Record<string, unknown>>(possibleDuplicates);
      if (Array.isArray(duplicateRows) && duplicateRows.length > 0) {
        return res.status(409).json({
          outcome: 'possible_duplicate',
          message:
            'A similarly named server project exists. No automatic merge or overwrite was performed.',
          possibleDuplicates: duplicateRows,
        });
      }

      const snapshot = await userSnapshot(req);
      const created = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(rdProjects)
          .values({
            id: parsed.id,
            projectName: parsed.projectName,
            owner: parsed.owner,
            status: parsed.status,
            signoffRequired: parsed.signoffRequired,
            signoffUserId: parsed.signoffRequired ? parsed.signoffUserId : '',
            draftTabIds: parsed.draftTabIds,
            description: parsed.description,
            createdByUserId: snapshot.userId,
            createdByDisplayName: snapshot.displayName,
            updatedByUserId: snapshot.userId,
            updatedByDisplayName: snapshot.displayName,
          })
          .returning();

        await recordAuditEvent(
          {
            eventType: 'RD_PROJECT_IMPORTED_FROM_LOCAL_STORAGE',
            subjectType: 'rd_project',
            subjectId: row.id,
            sourceService: 'rdProjects.route',
            actor: actorSnapshot(req),
            ipAddress: req.ip,
            userAgent: req.get('user-agent') ?? null,
            reason: 'Reviewed browser-local R&D project import',
            fieldsChanged: {
              persistence: {
                before: 'browser_local',
                after: 'server_authoritative',
              },
            },
            payload: {
              projectId: row.id,
              localStorageKey: parsed.localStorageKey,
              importedFromLocalStorage: true,
            },
          },
          tx
        );
        return row;
      });
      res
        .status(201)
        .json({ outcome: 'imported', project: toClientProject(created) });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          outcome: 'failed',
          error: error.errors[0]?.message ?? 'Invalid local project',
        });
      }
      console.error('Reconcile browser-local R&D project error:', error);
      res.status(500).json({
        outcome: 'failed',
        error: 'Failed to import local project; local data was not changed',
      });
    }
  }
);

async function projectExists(projectId: string) {
  const [project] = await db
    .select({ id: rdProjects.id })
    .from(rdProjects)
    .where(eq(rdProjects.id, projectId))
    .limit(1);
  return Boolean(project);
}

async function configurationCoverage(projectId: string, onlyItemId?: string) {
  const itemRows = await db
    .select()
    .from(designProjectConfigurationItems)
    .where(
      onlyItemId
        ? and(
            eq(designProjectConfigurationItems.rdProjectId, projectId),
            eq(designProjectConfigurationItems.id, onlyItemId)
          )
        : eq(designProjectConfigurationItems.rdProjectId, projectId)
    );
  const itemIds = itemRows.map((item) => item.id);
  const revisions = itemIds.length
    ? await db
        .select()
        .from(designProjectPartRevisions)
        .where(inArray(designProjectPartRevisions.configurationItemId, itemIds))
    : [];
  const revisionIds = revisions.map((revision) => revision.id);
  const applicability = itemIds.length
    ? await db
        .select()
        .from(designProjectDocumentApplicability)
        .where(
          inArray(
            designProjectDocumentApplicability.configurationItemId,
            itemIds
          )
        )
    : [];
  const artifacts = revisionIds.length
    ? await db
        .select()
        .from(designProjectPartRevisionArtifacts)
        .where(
          inArray(
            designProjectPartRevisionArtifacts.partRevisionId,
            revisionIds
          )
        )
    : [];
  const currentRevision = new Map<string, (typeof revisions)[number]>();
  for (const revision of revisions) {
    const current = currentRevision.get(revision.configurationItemId);
    if (!current || revision.revisionSequence > current.revisionSequence)
      currentRevision.set(revision.configurationItemId, revision);
  }
  const rolesFor = (itemType: string) =>
    itemType === 'PURCHASED_COMPONENT'
      ? [
          'SUPPLIER_REQUIREMENT',
          'DRAWING_CAD',
          'INSPECTION_PLAN',
          'MATERIAL_SPECIFICATION',
        ]
      : [...requirementRoles];
  const parts = itemRows
    .filter(
      (item) =>
        item.itemType === 'MANUFACTURED_PART' ||
        item.itemType === 'PURCHASED_COMPONENT'
    )
    .map((item) => {
      const revision = currentRevision.get(item.id);
      const coverage = rolesFor(item.itemType).map((role) => {
        const decision = applicability.find(
          (entry) =>
            entry.configurationItemId === item.id &&
            entry.requirementRole === role
        );
        const link =
          revision &&
          artifacts.find(
            (entry) =>
              entry.partRevisionId === revision.id &&
              entry.artifactRole === role
          );
        let status = 'Missing';
        if (decision?.decision === 'NOT_APPLICABLE') {
          status =
            decision.approvalStatus === 'APPROVED'
              ? 'Not Applicable — Approved'
              : 'Not Applicable — Approval Required';
        } else if (link) {
          status =
            link.lifecycleStateSnapshot === 'RELEASED'
              ? 'Released'
              : link.lifecycleStateSnapshot === 'APPROVED'
                ? 'Approved'
                : 'Draft';
        } else if (decision?.approvalStatus === 'PENDING')
          status = 'Awaiting Approval';
        return {
          role,
          status,
          applicability: decision ?? null,
          artifact: link ?? null,
        };
      });
      return {
        item,
        currentRevision: revision ?? null,
        coverage,
        complete: coverage.filter((entry) =>
          [
            'Released',
            'Approved',
            'Complete',
            'Not Applicable — Approved',
          ].includes(entry.status)
        ).length,
      };
    });
  const totalRequirements = parts.reduce(
    (sum, part) => sum + part.coverage.length,
    0
  );
  const completeRequirements = parts.reduce(
    (sum, part) => sum + part.complete,
    0
  );
  return {
    parts,
    totals: {
      totalConfigurationItems: itemRows.length,
      totalManufacturedParts: itemRows.filter(
        (item) => item.itemType === 'MANUFACTURED_PART'
      ).length,
      totalPurchasedComponents: itemRows.filter(
        (item) => item.itemType === 'PURCHASED_COMPONENT'
      ).length,
      partsMissingRevisions: parts.filter((part) => !part.currentRevision)
        .length,
      partsMissingRoutings: parts.filter(
        (part) =>
          part.item.itemType === 'MANUFACTURED_PART' &&
          part.coverage.some(
            (entry) => entry.role === 'ROUTING' && entry.status === 'Missing'
          )
      ).length,
      partsMissingWorkInstructions: parts.filter(
        (part) =>
          part.item.itemType === 'MANUFACTURED_PART' &&
          part.coverage.some(
            (entry) =>
              entry.role === 'WORK_INSTRUCTION' && entry.status === 'Missing'
          )
      ).length,
      partsMissingInspectionPlans: parts.filter((part) =>
        part.coverage.some(
          (entry) =>
            entry.role === 'INSPECTION_PLAN' && entry.status === 'Missing'
        )
      ).length,
      pendingNotApplicableApprovals: parts.reduce(
        (sum, part) =>
          sum +
          part.coverage.filter(
            (entry) => entry.status === 'Not Applicable — Approval Required'
          ).length,
        0
      ),
      completenessPercentage: totalRequirements
        ? Math.round((completeRequirements / totalRequirements) * 100)
        : 0,
      informationalOnly: true,
      productionEnforcementEnabled: false,
    },
  };
}

router.get(
  '/:projectId/configuration/summary',
  requirePermission('design.configuration.view'),
  async (req, res) => {
    try {
      if (!(await projectExists(req.params.projectId)))
        return res.status(404).json({ error: 'R&D project not found' });
      const [workspace] = await db
        .select()
        .from(designProjectConfigurationWorkspaces)
        .where(
          eq(
            designProjectConfigurationWorkspaces.rdProjectId,
            req.params.projectId
          )
        )
        .limit(1);
      if (!workspace)
        return res.json({
          established: false,
          message:
            'Configuration has not been established for this legacy project.',
          productionEnforcementEnabled: false,
        });
      const [coverage, designControl, releaseResult] = await Promise.all([
        configurationCoverage(req.params.projectId),
        resolveDesignControlAuthority(req.params.projectId),
        db.execute(
          sql`SELECT release_revision, release_status, released_at FROM engineering_releases WHERE rd_project_id = ${req.params.projectId} ORDER BY released_at DESC NULLS LAST, created_at DESC LIMIT 1`
        ),
      ]);
      res.json({
        established: true,
        workspace,
        authoritativeDesignControl: designControl?.authoritativeRecord ?? null,
        currentEngineeringRelease: rowsOf(releaseResult)[0] ?? null,
        ...coverage,
      });
    } catch (error) {
      console.error('Configuration summary error:', error);
      res.status(500).json({ error: 'Failed to load configuration summary' });
    }
  }
);

router.post(
  '/:projectId/configuration/activate',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      if (!(await projectExists(req.params.projectId)))
        return res.status(404).json({ error: 'R&D project not found' });
      const evidence = requestEvidence(req);
      const workspace = await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(designProjectConfigurationWorkspaces)
          .values({
            rdProjectId: req.params.projectId,
            activatedByUserId: evidence.actor.id,
            activatedBySnapshot: evidence.snapshot,
          })
          .onConflictDoNothing()
          .returning();
        const [resolved] = row
          ? [row]
          : await tx
              .select()
              .from(designProjectConfigurationWorkspaces)
              .where(
                eq(
                  designProjectConfigurationWorkspaces.rdProjectId,
                  req.params.projectId
                )
              )
              .limit(1);
        if (row)
          await recordAuditEvent(
            {
              eventType: 'DESIGN_PROJECT_CONFIGURATION_ACTIVATED',
              subjectType: 'rd_project',
              subjectId: req.params.projectId,
              sourceService: 'rdProjects.configuration',
              actor: evidence.actor,
              ...evidence.metadata,
              payload: { productionEnforcementEnabled: false },
            },
            tx
          );
        return { workspace: resolved, created: Boolean(row) };
      });
      res.status(workspace.created ? 201 : 200).json({
        workspace: workspace.workspace,
        alreadyEstablished: !workspace.created,
        productionEnforcementEnabled: false,
      });
    } catch (error) {
      console.error('Activate configuration error:', error);
      res
        .status(500)
        .json({ error: 'Failed to start controlled configuration' });
    }
  }
);

router.get(
  '/:projectId/configuration/tree',
  requirePermission('design.configuration.view'),
  async (req, res) => {
    const items = await db
      .select()
      .from(designProjectConfigurationItems)
      .where(
        eq(designProjectConfigurationItems.rdProjectId, req.params.projectId)
      );
    const relationships = await db
      .select()
      .from(designProjectConfigurationItemRelationships)
      .where(
        eq(
          designProjectConfigurationItemRelationships.rdProjectId,
          req.params.projectId
        )
      );
    const revisions = items.length
      ? await db
          .select()
          .from(designProjectPartRevisions)
          .where(
            inArray(
              designProjectPartRevisions.configurationItemId,
              items.map((item) => item.id)
            )
          )
      : [];
    res.json({ items, relationships, revisions });
  }
);

router.post(
  '/:projectId/configuration/items',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const parsed = createItemPayloadSchema.parse(req.body);
      const evidence = requestEvidence(req);
      const created = await db.transaction(async (tx) => {
        const [workspace] = await tx
          .select()
          .from(designProjectConfigurationWorkspaces)
          .where(
            eq(
              designProjectConfigurationWorkspaces.rdProjectId,
              req.params.projectId
            )
          )
          .limit(1);
        if (!workspace)
          throw Object.assign(new Error('Configuration not established'), {
            code: 'CONFIGURATION_NOT_ESTABLISHED',
          });

        if (parsed.parentConfigurationItemId) {
          const [parent] = await tx
            .select({ id: designProjectConfigurationItems.id })
            .from(designProjectConfigurationItems)
            .where(
              and(
                eq(
                  designProjectConfigurationItems.id,
                  parsed.parentConfigurationItemId
                ),
                eq(
                  designProjectConfigurationItems.rdProjectId,
                  req.params.projectId
                )
              )
            )
            .limit(1);
          if (!parent)
            throw Object.assign(new Error('Parent not found'), {
              code: 'PARENT_NOT_FOUND',
            });
        }

        const {
          parentConfigurationItemId,
          quantity,
          unitOfMeasure,
          referenceDesignator,
          effectivityStart,
          effectivityEnd,
          sortOrder,
          ...itemValues
        } = parsed;
        const [item] = await tx
          .insert(designProjectConfigurationItems)
          .values({
            rdProjectId: req.params.projectId,
            ...itemValues,
            createdByUserId: evidence.actor.id,
            createdBySnapshot: evidence.snapshot,
          })
          .returning();

        let relationship:
          | typeof designProjectConfigurationItemRelationships.$inferSelect
          | null = null;
        if (parentConfigurationItemId) {
          if (quantity === undefined || !unitOfMeasure)
            throw Object.assign(new Error('Parent relationship incomplete'), {
              code: 'PARENT_RELATIONSHIP_REQUIRED_FIELDS',
            });
          [relationship] = await tx
            .insert(designProjectConfigurationItemRelationships)
            .values({
              rdProjectId: req.params.projectId,
              parentConfigurationItemId,
              childConfigurationItemId: item.id,
              quantity: String(quantity),
              unitOfMeasure,
              referenceDesignator,
              effectivityStart,
              effectivityEnd,
              sortOrder: sortOrder ?? 0,
              createdByUserId: evidence.actor.id,
              createdBySnapshot: evidence.snapshot,
            })
            .returning();
        }
        return { item, relationship };
      });
      res.status(201).json(created);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      const code = errorCode(error);
      if (code === 'CONFIGURATION_NOT_ESTABLISHED')
        return res.status(409).json({ error: 'CONFIGURATION_NOT_ESTABLISHED' });
      if (
        ['PARENT_NOT_FOUND', 'PARENT_RELATIONSHIP_REQUIRED_FIELDS'].includes(
          code ?? ''
        )
      )
        return res.status(409).json({ error: code });
      if (code === '23505')
        return res.status(409).json({ error: 'DUPLICATE_CONFIGURATION_ITEM' });
      res.status(500).json({ error: 'Failed to create configuration item' });
    }
  }
);

router.patch(
  '/:projectId/configuration/items/:itemId',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const parsed = itemPayloadSchema.partial().parse(req.body);
      const [item] = await db
        .update(designProjectConfigurationItems)
        .set({ ...parsed, updatedAt: new Date() })
        .where(
          and(
            eq(designProjectConfigurationItems.id, req.params.itemId),
            eq(
              designProjectConfigurationItems.rdProjectId,
              req.params.projectId
            )
          )
        )
        .returning();
      if (!item)
        return res.status(404).json({ error: 'Configuration item not found' });
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      res.status(500).json({ error: 'Failed to update configuration item' });
    }
  }
);

async function createsCycle(
  projectId: string,
  parentId: string,
  childId: string,
  excludedRelationshipId?: string
) {
  if (parentId === childId) return true;
  const edges = await db
    .select()
    .from(designProjectConfigurationItemRelationships)
    .where(
      eq(designProjectConfigurationItemRelationships.rdProjectId, projectId)
    );
  const children = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.id === excludedRelationshipId) continue;
    children.set(edge.parentConfigurationItemId, [
      ...(children.get(edge.parentConfigurationItemId) ?? []),
      edge.childConfigurationItemId,
    ]);
  }
  const pending = [childId];
  const seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return false;
}

async function validateRelationship(
  projectId: string,
  payload: z.infer<typeof relationshipPayloadSchema>,
  excludedRelationshipId?: string
) {
  const items = await db
    .select({ id: designProjectConfigurationItems.id })
    .from(designProjectConfigurationItems)
    .where(
      and(
        eq(designProjectConfigurationItems.rdProjectId, projectId),
        inArray(designProjectConfigurationItems.id, [
          payload.parentConfigurationItemId,
          payload.childConfigurationItemId,
        ])
      )
    );
  if (items.length !== 2) return 'CROSS_PROJECT_RELATIONSHIP';
  if (
    await createsCycle(
      projectId,
      payload.parentConfigurationItemId,
      payload.childConfigurationItemId,
      excludedRelationshipId
    )
  )
    return 'CONFIGURATION_CYCLE';
  return null;
}

router.post(
  '/:projectId/configuration/relationships',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const parsed = relationshipPayloadSchema.parse(req.body);
      const invalid = await validateRelationship(req.params.projectId, parsed);
      if (invalid) return res.status(409).json({ error: invalid });
      const evidence = requestEvidence(req);
      const [relationship] = await db
        .insert(designProjectConfigurationItemRelationships)
        .values({
          rdProjectId: req.params.projectId,
          ...parsed,
          quantity: String(parsed.quantity),
          createdByUserId: evidence.actor.id,
          createdBySnapshot: evidence.snapshot,
        })
        .returning();
      res.status(201).json(relationship);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      if (errorCode(error) === '23505')
        return res.status(409).json({ error: 'DUPLICATE_CURRENT_CHILD' });
      res.status(500).json({ error: 'Failed to add relationship' });
    }
  }
);

router.patch(
  '/:projectId/configuration/relationships/:relationshipId',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const existing = await db
        .select()
        .from(designProjectConfigurationItemRelationships)
        .where(
          and(
            eq(
              designProjectConfigurationItemRelationships.id,
              req.params.relationshipId
            ),
            eq(
              designProjectConfigurationItemRelationships.rdProjectId,
              req.params.projectId
            )
          )
        )
        .limit(1);
      if (!existing[0])
        return res.status(404).json({ error: 'Relationship not found' });
      const parsed = relationshipPayloadSchema.parse({
        ...existing[0],
        ...req.body,
        quantity: req.body.quantity ?? existing[0].quantity,
      });
      const invalid = await validateRelationship(
        req.params.projectId,
        parsed,
        req.params.relationshipId
      );
      if (invalid) return res.status(409).json({ error: invalid });
      const [relationship] = await db
        .update(designProjectConfigurationItemRelationships)
        .set({ ...parsed, quantity: String(parsed.quantity) })
        .where(
          and(
            eq(
              designProjectConfigurationItemRelationships.id,
              req.params.relationshipId
            ),
            eq(
              designProjectConfigurationItemRelationships.rdProjectId,
              req.params.projectId
            )
          )
        )
        .returning();
      res.json(relationship);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      res.status(500).json({ error: 'Failed to update relationship' });
    }
  }
);

router.put(
  '/:projectId/configuration/relationships/reorder',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const parsed = z
        .object({
          parentConfigurationItemId: z.string().uuid(),
          relationshipIds: z.array(z.string().uuid()).min(1),
        })
        .parse(req.body);
      await db.transaction(async (tx) => {
        const [parent] = await tx
          .select({ id: designProjectConfigurationItems.id })
          .from(designProjectConfigurationItems)
          .where(
            and(
              eq(
                designProjectConfigurationItems.id,
                parsed.parentConfigurationItemId
              ),
              eq(
                designProjectConfigurationItems.rdProjectId,
                req.params.projectId
              )
            )
          )
          .limit(1);
        if (!parent)
          throw Object.assign(new Error('Invalid reorder scope'), {
            code: 'INVALID_REORDER_SCOPE',
          });
        const rows = await tx
          .select()
          .from(designProjectConfigurationItemRelationships)
          .where(
            and(
              eq(
                designProjectConfigurationItemRelationships.rdProjectId,
                req.params.projectId
              ),
              eq(
                designProjectConfigurationItemRelationships.parentConfigurationItemId,
                parsed.parentConfigurationItemId
              ),
              inArray(
                designProjectConfigurationItemRelationships.id,
                parsed.relationshipIds
              )
            )
          );
        if (rows.length !== parsed.relationshipIds.length)
          throw Object.assign(new Error('Invalid reorder scope'), {
            code: 'INVALID_REORDER_SCOPE',
          });
        for (
          let sortOrder = 0;
          sortOrder < parsed.relationshipIds.length;
          sortOrder += 1
        ) {
          const id = parsed.relationshipIds[sortOrder];
          await tx
            .update(designProjectConfigurationItemRelationships)
            .set({ sortOrder })
            .where(
              and(
                eq(designProjectConfigurationItemRelationships.id, id),
                eq(
                  designProjectConfigurationItemRelationships.rdProjectId,
                  req.params.projectId
                )
              )
            );
        }
      });
      res.json({ reordered: parsed.relationshipIds.length });
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      if (errorCode(error) === 'INVALID_REORDER_SCOPE')
        return res.status(409).json({ error: 'INVALID_REORDER_SCOPE' });
      res.status(500).json({ error: 'Failed to reorder relationships' });
    }
  }
);

router.delete(
  '/:projectId/configuration/relationships/:relationshipId',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    const [removed] = await db
      .delete(designProjectConfigurationItemRelationships)
      .where(
        and(
          eq(
            designProjectConfigurationItemRelationships.id,
            req.params.relationshipId
          ),
          eq(
            designProjectConfigurationItemRelationships.rdProjectId,
            req.params.projectId
          )
        )
      )
      .returning();
    if (!removed)
      return res.status(404).json({ error: 'Relationship not found' });
    res.json({ removed: true });
  }
);

router.post(
  '/:projectId/configuration/items/:itemId/revisions',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const parsed = z
        .object({
          revisionIdentifier: z.string().trim().min(1),
          changeSummary: z.string().trim().min(1),
          predecessorRevisionId: z.string().uuid().nullable().optional(),
          effectivityStart: z.string().trim().nullable().optional(),
          effectivityEnd: z.string().trim().nullable().optional(),
          sourceEcrId: z.string().uuid().nullable().optional(),
          sourceEcnId: z.string().uuid().nullable().optional(),
        })
        .parse(req.body);
      const evidence = requestEvidence(req);
      const revision = await db.transaction(async (tx) => {
        const [item] = await tx
          .select()
          .from(designProjectConfigurationItems)
          .where(
            and(
              eq(designProjectConfigurationItems.id, req.params.itemId),
              eq(
                designProjectConfigurationItems.rdProjectId,
                req.params.projectId
              )
            )
          )
          .limit(1);
        if (!item)
          throw Object.assign(new Error('Item not found'), {
            code: 'ITEM_NOT_FOUND',
          });
        await tx.execute(
          sql`SELECT id FROM design_project_configuration_items WHERE id = ${item.id} FOR UPDATE`
        );
        if (parsed.predecessorRevisionId) {
          const [predecessor] = await tx
            .select()
            .from(designProjectPartRevisions)
            .where(
              and(
                eq(designProjectPartRevisions.id, parsed.predecessorRevisionId),
                eq(designProjectPartRevisions.configurationItemId, item.id)
              )
            )
            .limit(1);
          if (!predecessor)
            throw Object.assign(new Error('Predecessor not found'), {
              code: 'PREDECESSOR_NOT_FOUND',
            });
        }
        const sequenceRows = await tx.execute(
          sql`SELECT COALESCE(MAX(revision_sequence), 0)::int AS value FROM design_project_part_revisions WHERE configuration_item_id = ${item.id}`
        );
        const revisionSequence =
          Number(rowsOf<{ value: number }>(sequenceRows)[0]?.value ?? 0) + 1;
        const [created] = await tx
          .insert(designProjectPartRevisions)
          .values({
            configurationItemId: item.id,
            revisionIdentifier: parsed.revisionIdentifier,
            revisionSequence,
            lifecycleState: 'DRAFT',
            changeSummary: parsed.changeSummary,
            predecessorRevisionId: parsed.predecessorRevisionId,
            effectivityStart: parsed.effectivityStart,
            effectivityEnd: parsed.effectivityEnd,
            sourceEcrId: parsed.sourceEcrId,
            sourceEcnId: parsed.sourceEcnId,
            createdByUserId: evidence.actor.id,
            createdBySnapshot: evidence.snapshot,
          })
          .returning();
        return created;
      });
      res.status(201).json(revision);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      if (
        ['ITEM_NOT_FOUND', 'PREDECESSOR_NOT_FOUND'].includes(
          errorCode(error) ?? ''
        )
      )
        return res.status(409).json({ error: errorCode(error) });
      res.status(500).json({ error: 'Failed to create draft revision' });
    }
  }
);

router.put(
  '/:projectId/configuration/items/:itemId/applicability/:role',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    try {
      const role = z.enum(requirementRoles).parse(req.params.role);
      const parsed = z
        .object({
          decision: z.enum(['REQUIRED', 'OPTIONAL', 'NOT_APPLICABLE']),
          justification: z.string().trim().nullable().optional(),
        })
        .parse(req.body);
      if (parsed.decision === 'NOT_APPLICABLE' && !parsed.justification)
        return res
          .status(400)
          .json({ error: 'NOT_APPLICABLE_JUSTIFICATION_REQUIRED' });
      const evidence = requestEvidence(req);
      const approvalStatus =
        parsed.decision === 'NOT_APPLICABLE' ? 'DRAFT' : 'NOT_REQUIRED';
      const result = await db.execute(sql`
      INSERT INTO design_project_document_applicability
        (configuration_item_id, requirement_role, decision, justification, approval_status, created_by_user_id, created_by_snapshot)
      SELECT id, ${role}, ${parsed.decision}, ${parsed.justification ?? null}, ${approvalStatus}, ${evidence.actor.id}, ${JSON.stringify(evidence.snapshot)}::jsonb
      FROM design_project_configuration_items WHERE id = ${req.params.itemId} AND rd_project_id = ${req.params.projectId}
      ON CONFLICT (configuration_item_id, requirement_role) WHERE configuration_item_id IS NOT NULL
      DO UPDATE SET decision = EXCLUDED.decision, justification = EXCLUDED.justification,
        approval_status = EXCLUDED.approval_status, approved_by_user_id = NULL,
        approved_by_snapshot = NULL, approved_at = NULL, updated_at = now()
      RETURNING *
    `);
      const row = rowsOf(result)[0];
      if (!row)
        return res.status(404).json({ error: 'Configuration item not found' });
      res.json(row);
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: error.errors[0]?.message });
      res
        .status(500)
        .json({ error: 'Failed to set documentation requirement' });
    }
  }
);

router.post(
  '/:projectId/configuration/applicability/:applicabilityId/submit',
  requirePermission('design.configuration.edit'),
  async (req, res) => {
    const outcome = await db.transaction(async (tx) => {
      const scoped = await tx.execute(sql`
        SELECT a.id, a.decision, a.approval_status, a.justification
        FROM design_project_document_applicability a
        JOIN design_project_configuration_items i ON i.id = a.configuration_item_id
        WHERE a.id = ${req.params.applicabilityId}
          AND i.rd_project_id = ${req.params.projectId}
        FOR UPDATE OF a
      `);
      const applicability = rowsOf<{
        decision: string;
        approval_status: string;
        justification: string | null;
      }>(scoped)[0];
      if (!applicability) return { status: 'not_found' as const };
      if (
        applicability.decision !== 'NOT_APPLICABLE' ||
        applicability.approval_status !== 'DRAFT' ||
        !applicability.justification?.trim()
      )
        return { status: 'not_ready' as const };
      const result = await tx.execute(sql`
        UPDATE design_project_document_applicability a
        SET approval_status = 'PENDING', updated_at = now()
        FROM design_project_configuration_items i
        WHERE a.id = ${req.params.applicabilityId}
          AND a.configuration_item_id = i.id
          AND i.rd_project_id = ${req.params.projectId}
          AND a.decision = 'NOT_APPLICABLE'
          AND a.approval_status = 'DRAFT'
          AND nullif(btrim(a.justification), '') IS NOT NULL
        RETURNING a.*
      `);
      return { status: 'submitted' as const, row: rowsOf(result)[0] };
    });
    if (outcome.status === 'not_found')
      return res.status(404).json({ error: 'Applicability not found' });
    if (outcome.status === 'not_ready')
      return res.status(409).json({ error: 'NOT_APPLICABLE_NOT_SUBMITTABLE' });
    res.json(outcome.row);
  }
);

router.post(
  '/:projectId/configuration/applicability/:applicabilityId/approve',
  requirePermission('design.configuration.applicability.approve'),
  async (req, res) => {
    const evidence = requestEvidence(req);
    const outcome = await db.transaction(async (tx) => {
      const scoped = await tx.execute(sql`
        SELECT a.id, a.decision, a.approval_status, a.justification
        FROM design_project_document_applicability a
        JOIN design_project_configuration_items i ON i.id = a.configuration_item_id
        WHERE a.id = ${req.params.applicabilityId}
          AND i.rd_project_id = ${req.params.projectId}
        FOR UPDATE OF a
      `);
      const applicability = rowsOf<{
        decision: string;
        approval_status: string;
      }>(scoped)[0];
      if (!applicability) return { status: 'not_found' as const };
      if (
        applicability.decision !== 'NOT_APPLICABLE' ||
        applicability.approval_status !== 'PENDING'
      )
        return { status: 'not_ready' as const };
      const result = await tx.execute(sql`
        UPDATE design_project_document_applicability a SET approval_status = 'APPROVED',
          approved_by_user_id = ${evidence.actor.id}, approved_by_snapshot = ${JSON.stringify(evidence.snapshot)}::jsonb,
          approved_at = now(), updated_at = now()
        FROM design_project_configuration_items i
        WHERE a.id = ${req.params.applicabilityId} AND a.configuration_item_id = i.id
          AND i.rd_project_id = ${req.params.projectId} AND a.decision = 'NOT_APPLICABLE'
          AND a.approval_status = 'PENDING' RETURNING a.*
      `);
      return { status: 'approved' as const, row: rowsOf(result)[0] };
    });
    if (outcome.status === 'not_found')
      return res.status(404).json({ error: 'Applicability not found' });
    if (outcome.status === 'not_ready')
      return res.status(409).json({ error: 'NOT_APPLICABLE_NOT_APPROVABLE' });
    res.json(outcome.row);
  }
);

router.get(
  '/:projectId/configuration/items/:itemId/coverage',
  requirePermission('design.configuration.view'),
  async (req, res) => {
    const coverage = await configurationCoverage(
      req.params.projectId,
      req.params.itemId
    );
    if (!coverage.parts[0])
      return res.status(404).json({ error: 'Part not found' });
    res.json(coverage.parts[0]);
  }
);

router.get(
  '/:projectId/configuration/coverage',
  requirePermission('design.configuration.view'),
  async (req, res) => {
    res.json(await configurationCoverage(req.params.projectId));
  }
);

export default router;
