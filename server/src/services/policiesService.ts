/**
 * Policies Service — manages the written policies library.
 *
 * Responsibilities:
 *  - Snapshot in-repo markdown files into immutable policy_versions rows
 *  - Accept admin-uploaded external policy documents
 *  - Record user acknowledgments
 *  - Compute acknowledgment coverage by policy and role
 *  - Detect drift between live docs/policies/*.md and the latest published version
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { db } from '../../db';
import {
  policies,
  policyVersions,
  policyAcknowledgments,
  users,
} from '../../schema';
import { and, desc, eq, sql, inArray } from 'drizzle-orm';

export const POLICIES_DOCS_DIR = path.resolve(process.cwd(), 'docs/policies');

export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export function policyDocPath(key: string): string {
  return path.join(POLICIES_DOCS_DIR, `${key}.md`);
}

export function readPolicyDoc(key: string): { body: string; hash: string; sourcePath: string } | null {
  const fullPath = policyDocPath(key);
  if (!fs.existsSync(fullPath)) return null;
  const body = fs.readFileSync(fullPath, 'utf8');
  return {
    body,
    hash: sha256Hex(body),
    sourcePath: path.relative(process.cwd(), fullPath),
  };
}

export interface PolicyWithCurrent {
  policy: typeof policies.$inferSelect;
  currentVersion: typeof policyVersions.$inferSelect | null;
}

export async function listPoliciesWithCurrent(): Promise<PolicyWithCurrent[]> {
  const allPolicies = await db.select().from(policies).orderBy(policies.key);
  if (allPolicies.length === 0) return [];
  const versionIds = allPolicies
    .map((p) => p.currentVersionId)
    .filter((v): v is string => !!v);
  const versions = versionIds.length
    ? await db.select().from(policyVersions).where(inArray(policyVersions.id, versionIds))
    : [];
  const versionsById = new Map(versions.map((v) => [v.id, v]));
  return allPolicies.map((p) => ({
    policy: p,
    currentVersion: p.currentVersionId ? versionsById.get(p.currentVersionId) ?? null : null,
  }));
}

export async function getPolicyByKey(key: string) {
  const rows = await db.select().from(policies).where(eq(policies.key, key)).limit(1);
  return rows[0] ?? null;
}

export async function getVersionsForPolicy(policyId: string) {
  return db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId))
    .orderBy(desc(policyVersions.versionNumber));
}

export async function getNextVersionNumber(policyId: string): Promise<number> {
  const rows = await db
    .select({ max: sql<number>`coalesce(max(${policyVersions.versionNumber}), 0)` })
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId));
  return Number(rows[0]?.max ?? 0) + 1;
}

export interface PublishActor {
  userId?: number;
  displayName?: string;
}

/**
 * Snapshot the current docs/policies/<key>.md into a new immutable version.
 * Throws if the policy doesn't exist or isn't an in-repo policy.
 */
export async function publishInRepoVersion(opts: {
  policyKey: string;
  changeSummary?: string;
  actor?: PublishActor;
}): Promise<typeof policyVersions.$inferSelect> {
  const policy = await getPolicyByKey(opts.policyKey);
  if (!policy) throw new Error(`Policy not found: ${opts.policyKey}`);
  if (policy.source !== 'in-repo') {
    throw new Error(`Policy ${opts.policyKey} is sourced from external upload; use upload action instead.`);
  }
  const doc = readPolicyDoc(opts.policyKey);
  if (!doc) throw new Error(`Markdown source not found at docs/policies/${opts.policyKey}.md`);

  const versionNumber = await getNextVersionNumber(policy.id);
  const inserted = await db
    .insert(policyVersions)
    .values({
      policyId: policy.id,
      versionNumber,
      body: doc.body,
      sourcePath: doc.sourcePath,
      contentHash: doc.hash,
      changeSummary: opts.changeSummary ?? null,
      publishedByUserId: opts.actor?.userId ?? null,
      publishedByDisplayName: opts.actor?.displayName ?? null,
    })
    .returning();
  const version = inserted[0];
  await db.update(policies).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(policies.id, policy.id));
  return version;
}

/**
 * Publish a new version of an external-source policy (PDF/DOCX/MD already uploaded
 * to object storage). The caller passes the storage path + metadata.
 */
export async function publishExternalVersion(opts: {
  policyKey: string;
  uploadedFileUrl: string;
  uploadedFileName: string;
  uploadedFileMime: string;
  contentHash: string;
  changeSummary?: string;
  actor?: PublishActor;
}): Promise<typeof policyVersions.$inferSelect> {
  const policy = await getPolicyByKey(opts.policyKey);
  if (!policy) throw new Error(`Policy not found: ${opts.policyKey}`);
  if (policy.source !== 'external-upload') {
    throw new Error(`Policy ${opts.policyKey} is in-repo; use publish action instead.`);
  }
  const versionNumber = await getNextVersionNumber(policy.id);
  const inserted = await db
    .insert(policyVersions)
    .values({
      policyId: policy.id,
      versionNumber,
      uploadedFileUrl: opts.uploadedFileUrl,
      uploadedFileName: opts.uploadedFileName,
      uploadedFileMime: opts.uploadedFileMime,
      contentHash: opts.contentHash,
      changeSummary: opts.changeSummary ?? null,
      publishedByUserId: opts.actor?.userId ?? null,
      publishedByDisplayName: opts.actor?.displayName ?? null,
    })
    .returning();
  const version = inserted[0];
  await db.update(policies).set({ currentVersionId: version.id, updatedAt: new Date() }).where(eq(policies.id, policy.id));
  return version;
}

/**
 * Record a user acknowledgment of a specific policy version. Idempotent (relies on
 * the unique constraint on (policy_version_id, user_id)).
 */
export async function recordAcknowledgment(opts: {
  policyVersionId: string;
  userId: number;
  userDisplayName: string;
  userRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const versionRows = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.id, opts.policyVersionId))
    .limit(1);
  if (versionRows.length === 0) throw new Error('Policy version not found');
  const version = versionRows[0];

  // Idempotent insert
  const existing = await db
    .select()
    .from(policyAcknowledgments)
    .where(
      and(
        eq(policyAcknowledgments.policyVersionId, version.id),
        eq(policyAcknowledgments.userId, opts.userId),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  const inserted = await db
    .insert(policyAcknowledgments)
    .values({
      policyId: version.policyId,
      policyVersionId: version.id,
      userId: opts.userId,
      userDisplayName: opts.userDisplayName,
      userRole: opts.userRole ?? null,
      ipAddress: opts.ipAddress ?? null,
      userAgent: opts.userAgent ?? null,
    })
    .returning();
  return inserted[0];
}

export async function getAcknowledgmentsForUser(userId: number) {
  return db
    .select()
    .from(policyAcknowledgments)
    .where(eq(policyAcknowledgments.userId, userId))
    .orderBy(desc(policyAcknowledgments.acknowledgedAt));
}

/**
 * Determine which currently-published policies a user must still acknowledge.
 * A user owes an acknowledgment when:
 *  - the policy requires acknowledgment
 *  - the user's role is in acknowledgment_roles (or the list is empty = everyone)
 *  - the policy has a current published version
 *  - the user has not yet acknowledged that specific version
 */
export async function getOutstandingForUser(opts: { userId: number; role: string }): Promise<
  Array<{ policy: typeof policies.$inferSelect; currentVersion: typeof policyVersions.$inferSelect }>
> {
  const allPolicies = await listPoliciesWithCurrent();
  const userAcks = await getAcknowledgmentsForUser(opts.userId);
  const ackedVersionIds = new Set(userAcks.map((a) => a.policyVersionId));
  return allPolicies
    .filter(({ policy, currentVersion }) => {
      if (!policy.isActive) return false;
      if (!policy.requiresAcknowledgment) return false;
      if (!currentVersion) return false;
      const roles = policy.acknowledgmentRoles ?? [];
      if (roles.length > 0 && !roles.includes(opts.role)) return false;
      return !ackedVersionIds.has(currentVersion.id);
    })
    .map(({ policy, currentVersion }) => ({ policy, currentVersion: currentVersion! }));
}

/**
 * Acknowledgment coverage report: per policy, count eligible users, acknowledged users,
 * and overdue users (eligible - acknowledged) for the CURRENT version of each policy.
 */
export interface CoverageRow {
  policyId: string;
  policyKey: string;
  policyTitle: string;
  currentVersionId: string | null;
  currentVersionNumber: number | null;
  publishedAt: Date | null;
  eligibleUserCount: number;
  acknowledgedUserCount: number;
  overdueUserCount: number;
  overdueUsers: Array<{ userId: number; username: string; role: string }>;
}

export async function getCoverageReport(): Promise<CoverageRow[]> {
  const allPolicies = await listPoliciesWithCurrent();
  const allUsers = await db
    .select({ id: users.id, username: users.username, role: users.role, isActive: users.isActive })
    .from(users)
    .where(eq(users.isActive, true));

  const rows: CoverageRow[] = [];
  for (const { policy, currentVersion } of allPolicies) {
    const roles = policy.acknowledgmentRoles ?? [];
    const eligible = allUsers.filter((u) => (roles.length === 0 ? true : roles.includes(u.role)));
    let acknowledgedIds = new Set<number>();
    if (currentVersion) {
      const acks = await db
        .select({ userId: policyAcknowledgments.userId })
        .from(policyAcknowledgments)
        .where(eq(policyAcknowledgments.policyVersionId, currentVersion.id));
      acknowledgedIds = new Set(acks.map((a) => a.userId));
    }
    const overdue = currentVersion ? eligible.filter((u) => !acknowledgedIds.has(u.id)) : eligible;
    rows.push({
      policyId: policy.id,
      policyKey: policy.key,
      policyTitle: policy.title,
      currentVersionId: currentVersion?.id ?? null,
      currentVersionNumber: currentVersion?.versionNumber ?? null,
      publishedAt: currentVersion?.publishedAt ?? null,
      eligibleUserCount: eligible.length,
      acknowledgedUserCount: acknowledgedIds.size,
      overdueUserCount: overdue.length,
      overdueUsers: overdue.map((u) => ({ userId: u.id, username: u.username, role: u.role })),
    });
  }
  return rows;
}

export interface DriftRow {
  policyId: string;
  policyKey: string;
  state: 'in-sync' | 'drift' | 'no-published-version' | 'doc-missing' | 'not-applicable';
  liveHash: string | null;
  publishedHash: string | null;
}

/**
 * Compare hashes of live docs/policies/*.md to the latest published version
 * for in-repo policies. External-upload policies are reported as 'not-applicable'.
 */
export async function detectDrift(): Promise<DriftRow[]> {
  const allPolicies = await listPoliciesWithCurrent();
  return allPolicies.map(({ policy, currentVersion }) => {
    if (policy.source !== 'in-repo') {
      return {
        policyId: policy.id,
        policyKey: policy.key,
        state: 'not-applicable',
        liveHash: null,
        publishedHash: currentVersion?.contentHash ?? null,
      };
    }
    const doc = readPolicyDoc(policy.key);
    if (!doc) {
      return {
        policyId: policy.id,
        policyKey: policy.key,
        state: 'doc-missing',
        liveHash: null,
        publishedHash: currentVersion?.contentHash ?? null,
      };
    }
    if (!currentVersion) {
      return {
        policyId: policy.id,
        policyKey: policy.key,
        state: 'no-published-version',
        liveHash: doc.hash,
        publishedHash: null,
      };
    }
    return {
      policyId: policy.id,
      policyKey: policy.key,
      state: doc.hash === currentVersion.contentHash ? 'in-sync' : 'drift',
      liveHash: doc.hash,
      publishedHash: currentVersion.contentHash,
    };
  });
}
