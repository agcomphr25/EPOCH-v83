import { pgPool } from '../../db';
import { detectDrift, getCoverageReport, listPoliciesWithCurrent } from './policiesService';

export interface PolicyTrainingAcknowledgmentReportFilters {
  topic?: string;
  driftOnly?: string;
}

type Severity = 'info' | 'warning' | 'critical';

const TOPICS = [
  {
    key: 'timekeeping',
    label: 'Timekeeping',
    policyKeys: ['timekeeping'],
    keywords: ['timekeeping', 'timesheet', 'time entry', 'daily time'],
  },
  {
    key: 'labor-charging',
    label: 'Labor Charging',
    policyKeys: ['labor-charging'],
    keywords: ['labor charging', 'charge code', 'direct labor', 'indirect labor'],
  },
  {
    key: 'corrections',
    label: 'Corrections',
    policyKeys: ['corrections'],
    keywords: ['correction', 'timesheet correction', 'labor correction'],
  },
  {
    key: 'approvals',
    label: 'Approvals',
    policyKeys: ['approvals'],
    keywords: ['approval', 'supervisor approval', 'timesheet approval'],
  },
  {
    key: 'period-close',
    label: 'Period Close',
    policyKeys: ['period-close'],
    keywords: ['period close', 'pay period close', 'closeout', 'lock period'],
  },
  {
    key: 'indirect-costs',
    label: 'Indirect Costs',
    policyKeys: ['indirect-cost-allocation'],
    keywords: ['indirect cost', 'burden', 'overhead', 'g&a', 'fringe'],
  },
  {
    key: 'unallowable-costs',
    label: 'Unallowable Costs',
    policyKeys: ['unallowable-costs'],
    keywords: ['unallowable', 'allowability', 'far 31', 'expense review'],
  },
] as const;

type TopicKey = typeof TOPICS[number]['key'];

export interface PolicyTrainingAcknowledgmentReport {
  generatedAt: string;
  filters: {
    topic: string | null;
    driftOnly: boolean;
  };
  summary: {
    totalTopics: number;
    publishedPolicies: number;
    policiesWithHashes: number;
    acknowledgmentEligibleUsers: number;
    acknowledgedUsers: number;
    overdueAcknowledgments: number;
    trainingModules: number;
    completedTrainingRecords: number;
    expiredTrainingRecords: number;
    policyDriftCount: number;
    topicDriftCount: number;
  };
  topics: Array<{
    topicKey: string;
    topicLabel: string;
    policyKey: string | null;
    policyTitle: string | null;
    policySource: string | null;
    currentVersionNumber: number | null;
    currentVersionId: string | null;
    publishedAt: string | null;
    contentHash: string | null;
    requiresAcknowledgment: boolean;
    eligibleUserCount: number;
    acknowledgedUserCount: number;
    overdueUserCount: number;
    overdueUsers: Array<{ userId: number; username: string; role: string }>;
    driftState: string;
    liveHash: string | null;
    publishedHash: string | null;
    trainingModuleCount: number;
    trainingCompletionCount: number;
    trainingPassedCount: number;
    expiredTrainingCount: number;
    latestTrainingCompletedAt: string | null;
    trainingModules: Array<{
      id: number;
      title: string;
      category: string | null;
      version: number | null;
      isActive: boolean;
      completionCount: number;
      passedCount: number;
      expiredCount: number;
      latestCompletedAt: string | null;
    }>;
    driftStatus: 'current' | 'policy_drift' | 'ack_overdue' | 'training_gap' | 'training_expired' | 'no_published_policy';
    flags: string[];
  }>;
  exceptions: Array<{
    severity: Severity;
    exceptionType: string;
    message: string;
    topicKey: string | null;
  }>;
}

function parseTopic(value: string | undefined): TopicKey | undefined {
  if (!value || value === 'all') return undefined;
  if (!TOPICS.some((topic) => topic.key === value)) throw new Error('topic is invalid');
  return value as TopicKey;
}

function parseBoolean(value: string | undefined): boolean {
  return value === 'true' || value === '1' || value === 'yes';
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function sqlKeywordClause(columnSql: string, keywords: readonly string[]) {
  return keywords.map((_, index) => `${columnSql} ILIKE $${index + 1}`).join(' OR ');
}

async function getTrainingCoverageForTopic(keywords: readonly string[]) {
  const likeParams = keywords.map((keyword) => `%${keyword}%`);
  const clause = sqlKeywordClause(
    `COALESCE(tm.title, '') || ' ' || COALESCE(tm.description, '') || ' ' || COALESCE(tm.category, '') || ' ' || COALESCE(tm.content, '')`,
    keywords,
  );

  const result = await pgPool.query(`
    WITH matched_modules AS (
      SELECT tm.id, tm.title, tm.category, tm.version, COALESCE(tm.is_active, true) AS is_active
      FROM training_modules tm
      WHERE COALESCE(tm.is_active, true) = true
        AND (${clause})
    ),
    records AS (
      SELECT
        module_id,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS completion_count,
        COUNT(*) FILTER (WHERE status = 'COMPLETED' AND COALESCE(score, 0) >= 0)::int AS passed_count,
        COUNT(*) FILTER (WHERE expiry_date IS NOT NULL AND expiry_date < NOW())::int AS expired_count,
        MAX(completed_at) AS latest_completed_at
      FROM employee_training_records
      GROUP BY module_id
    ),
    completions AS (
      SELECT
        module_id,
        COUNT(*)::int AS completion_count,
        COUNT(*) FILTER (WHERE passed = true)::int AS passed_count,
        COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW())::int AS expired_count,
        MAX(completed_at) AS latest_completed_at
      FROM training_completions
      GROUP BY module_id
    )
    SELECT
      mm.id,
      mm.title,
      mm.category,
      mm.version,
      mm.is_active,
      COALESCE(r.completion_count, 0) + COALESCE(c.completion_count, 0) AS completion_count,
      COALESCE(r.passed_count, 0) + COALESCE(c.passed_count, 0) AS passed_count,
      COALESCE(r.expired_count, 0) + COALESCE(c.expired_count, 0) AS expired_count,
      GREATEST(r.latest_completed_at, c.latest_completed_at) AS latest_completed_at
    FROM matched_modules mm
    LEFT JOIN records r ON r.module_id = mm.id
    LEFT JOIN completions c ON c.module_id = mm.id
    ORDER BY mm.title;
  `, likeParams);

  return result.rows.map((row) => ({
    id: Number(row.id),
    title: String(row.title),
    category: row.category ?? null,
    version: row.version == null ? null : Number(row.version),
    isActive: !!row.is_active,
    completionCount: Number(row.completion_count ?? 0),
    passedCount: Number(row.passed_count ?? 0),
    expiredCount: Number(row.expired_count ?? 0),
    latestCompletedAt: toIso(row.latest_completed_at),
  }));
}

function chooseDriftStatus(flags: string[]): PolicyTrainingAcknowledgmentReport['topics'][number]['driftStatus'] {
  if (flags.includes('No published policy version')) return 'no_published_policy';
  if (flags.includes('Policy content drift') || flags.includes('Policy source document missing')) return 'policy_drift';
  if (flags.includes('Acknowledgments overdue')) return 'ack_overdue';
  if (flags.includes('No matching training module')) return 'training_gap';
  if (flags.includes('Training completion expired')) return 'training_expired';
  return 'current';
}

export async function getPolicyTrainingAcknowledgmentReport(
  filters: PolicyTrainingAcknowledgmentReportFilters = {},
): Promise<PolicyTrainingAcknowledgmentReport> {
  const topicFilter = parseTopic(filters.topic);
  const driftOnly = parseBoolean(filters.driftOnly);

  const [policyRows, coverageRows, driftRows] = await Promise.all([
    listPoliciesWithCurrent(),
    getCoverageReport(),
    detectDrift(),
  ]);

  const policyByKey = new Map(policyRows.map((row) => [row.policy.key, row]));
  const coverageByKey = new Map(coverageRows.map((row) => [row.policyKey, row]));
  const driftByKey = new Map(driftRows.map((row) => [row.policyKey, row]));
  const topicsToReport = topicFilter ? TOPICS.filter((topic) => topic.key === topicFilter) : TOPICS;
  const exceptions: PolicyTrainingAcknowledgmentReport['exceptions'] = [];

  const topics = [];
  for (const topic of topicsToReport) {
    const primaryPolicyKey = topic.policyKeys[0];
    const policyRow = policyByKey.get(primaryPolicyKey);
    const coverage = coverageByKey.get(primaryPolicyKey);
    const drift = driftByKey.get(primaryPolicyKey);
    const modules = await getTrainingCoverageForTopic(topic.keywords);

    const flags: string[] = [];
    if (!policyRow?.currentVersion) flags.push('No published policy version');
    if (drift?.state === 'drift') flags.push('Policy content drift');
    if (drift?.state === 'doc-missing') flags.push('Policy source document missing');
    if ((coverage?.overdueUserCount ?? 0) > 0) flags.push('Acknowledgments overdue');
    if (modules.length === 0) flags.push('No matching training module');
    if (modules.some((module) => module.expiredCount > 0)) flags.push('Training completion expired');
    if (modules.length > 0 && modules.every((module) => module.completionCount === 0)) flags.push('No training completions');

    const trainingCompletionCount = modules.reduce((sum, module) => sum + module.completionCount, 0);
    const trainingPassedCount = modules.reduce((sum, module) => sum + module.passedCount, 0);
    const expiredTrainingCount = modules.reduce((sum, module) => sum + module.expiredCount, 0);
    const latestTrainingCompletedAt = modules
      .map((module) => module.latestCompletedAt)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1) ?? null;

    const row = {
      topicKey: topic.key,
      topicLabel: topic.label,
      policyKey: policyRow?.policy.key ?? primaryPolicyKey,
      policyTitle: policyRow?.policy.title ?? null,
      policySource: policyRow?.policy.source ?? null,
      currentVersionNumber: policyRow?.currentVersion?.versionNumber ?? null,
      currentVersionId: policyRow?.currentVersion?.id ?? null,
      publishedAt: toIso(policyRow?.currentVersion?.publishedAt),
      contentHash: policyRow?.currentVersion?.contentHash ?? null,
      requiresAcknowledgment: policyRow?.policy.requiresAcknowledgment ?? true,
      eligibleUserCount: coverage?.eligibleUserCount ?? 0,
      acknowledgedUserCount: coverage?.acknowledgedUserCount ?? 0,
      overdueUserCount: coverage?.overdueUserCount ?? 0,
      overdueUsers: coverage?.overdueUsers ?? [],
      driftState: drift?.state ?? 'no-published-version',
      liveHash: drift?.liveHash ?? null,
      publishedHash: drift?.publishedHash ?? policyRow?.currentVersion?.contentHash ?? null,
      trainingModuleCount: modules.length,
      trainingCompletionCount,
      trainingPassedCount,
      expiredTrainingCount,
      latestTrainingCompletedAt,
      trainingModules: modules,
      driftStatus: chooseDriftStatus(flags),
      flags,
    };

    for (const flag of flags) {
      exceptions.push({
        severity: flag.includes('No published') || flag.includes('drift') || flag.includes('missing') ? 'critical' : 'warning',
        exceptionType: flag.toUpperCase().replace(/[^A-Z0-9]+/g, '_'),
        message: `${topic.label}: ${flag}.`,
        topicKey: topic.key,
      });
    }

    topics.push(row);
  }

  const visibleTopics = driftOnly ? topics.filter((topic) => topic.flags.length > 0) : topics;
  const visibleTopicKeys = new Set<string>(visibleTopics.map((topic) => topic.topicKey));
  const visibleExceptions = exceptions.filter((exception) => !driftOnly || (exception.topicKey && visibleTopicKeys.has(exception.topicKey)));

  const summary = visibleTopics.reduce<PolicyTrainingAcknowledgmentReport['summary']>((acc, row) => {
    acc.totalTopics += 1;
    if (row.currentVersionId) acc.publishedPolicies += 1;
    if (row.contentHash) acc.policiesWithHashes += 1;
    acc.acknowledgmentEligibleUsers += row.eligibleUserCount;
    acc.acknowledgedUsers += row.acknowledgedUserCount;
    acc.overdueAcknowledgments += row.overdueUserCount;
    acc.trainingModules += row.trainingModuleCount;
    acc.completedTrainingRecords += row.trainingCompletionCount;
    acc.expiredTrainingRecords += row.expiredTrainingCount;
    if (['drift', 'doc-missing', 'no-published-version'].includes(row.driftState)) acc.policyDriftCount += 1;
    if (row.flags.length > 0) acc.topicDriftCount += 1;
    return acc;
  }, {
    totalTopics: 0,
    publishedPolicies: 0,
    policiesWithHashes: 0,
    acknowledgmentEligibleUsers: 0,
    acknowledgedUsers: 0,
    overdueAcknowledgments: 0,
    trainingModules: 0,
    completedTrainingRecords: 0,
    expiredTrainingRecords: 0,
    policyDriftCount: 0,
    topicDriftCount: 0,
  });

  return {
    generatedAt: new Date().toISOString(),
    filters: {
      topic: topicFilter ?? null,
      driftOnly,
    },
    summary,
    topics: visibleTopics,
    exceptions: visibleExceptions,
  };
}
