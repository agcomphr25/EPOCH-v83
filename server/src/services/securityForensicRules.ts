import { pool } from '../../db';
import type { ForensicRule, ForensicViolation } from './dcaaForensicRules';

async function safeQuery<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const rows = await pool.query(sql, params);
  return rows as T[];
}

function isTruthyEnv(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

export const securityForensicRules: ForensicRule[] = [
  {
    ruleId: 'SEC-001',
    domain: 'SECURITY',
    severity: 'critical',
    description: 'Production authentication bypass or weak runtime secret configuration is enabled.',
    expectedCondition: 'Production runs with authentication bypass disabled and JWT/session secrets at least 32 characters long.',
    failureCondition: 'NODE_ENV=production with DEV_AUTH_BYPASS/AUTH_BYPASS enabled, or JWT_SECRET/SESSION_SECRET shorter than 32 characters.',
    farCitation: 'CMMC AC.L2-3.1.1 / IA.L2-3.5.2',
    remediationGuidance: 'Disable all auth bypass flags in production and rotate any weak secrets to high-entropy values.',
    entityType: 'runtime_config',
    execute: async (): Promise<ForensicViolation[]> => {
      const violations: ForensicViolation[] = [];
      const isProduction = process.env.NODE_ENV === 'production';
      const bypassFlags = ['DEV_AUTH_BYPASS', 'AUTH_BYPASS', 'SKIP_AUTH', 'DISABLE_AUTH']
        .filter((key) => isTruthyEnv(process.env[key]));
      const secretKeys = ['JWT_SECRET', 'SESSION_SECRET'];
      const weakSecretKeys = secretKeys.filter((key) => {
        const value = process.env[key];
        return value != null && value.length > 0 && value.length < 32;
      });

      if (isProduction && bypassFlags.length > 0) {
        violations.push({
          entityId: 'production-auth-bypass',
          description: `Production auth bypass flag(s) enabled: ${bypassFlags.join(', ')}.`,
          evidence: {
            environment: process.env.NODE_ENV,
            enabledFlags: bypassFlags,
          },
        });
      }

      if (weakSecretKeys.length > 0) {
        violations.push({
          entityId: 'weak-runtime-secrets',
          description: `Runtime secret(s) are shorter than 32 characters: ${weakSecretKeys.join(', ')}.`,
          evidence: {
            weakSecretKeys,
            minimumLength: 32,
          },
        });
      }

      return violations;
    },
  },
  {
    ruleId: 'SEC-002',
    domain: 'SECURITY',
    severity: 'high',
    description: 'Active EPOCH user account is linked to an inactive employee profile.',
    expectedCondition: 'Users tied to inactive employees are disabled or explicitly reviewed.',
    failureCondition: 'users.is_active=true while the linked/matched employee has is_active=false.',
    farCitation: 'CMMC AC.L2-3.1.1',
    remediationGuidance: 'Disable the user account or reactivate/correct the employee profile if the employee is still active.',
    entityType: 'user',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        user_id: number;
        username: string;
        role: string;
        employee_id: number;
        employee_name: string | null;
      }>(`
        SELECT DISTINCT
          u.id AS user_id,
          u.username,
          u.role,
          e.id AS employee_id,
          e.name AS employee_name
        FROM users u
        JOIN employees e ON (
          u.employee_id = e.id
          OR LOWER(u.username) = LOWER(e.employee_code)
          OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
        )
        WHERE COALESCE(u.is_active, true) = true
          AND COALESCE(e.is_active, true) = false
      `);

      return rows.map((row) => ({
        entityId: String(row.user_id),
        description: `Active user ${row.username} (${row.role}) is linked to inactive employee ${row.employee_name ?? row.employee_id}.`,
        evidence: row,
      }));
    },
  },
  {
    ruleId: 'SEC-003',
    domain: 'SECURITY',
    severity: 'medium',
    description: 'Expired sessions remain marked active.',
    expectedCondition: 'Expired sessions are revoked or marked inactive.',
    failureCondition: 'user_sessions.is_active=true and expires_at < now().',
    farCitation: 'CMMC AC.L2-3.1.10',
    remediationGuidance: 'Expire stale sessions immediately and verify session cleanup runs on login, logout, and scheduled maintenance.',
    entityType: 'user_session',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        id: number;
        user_id: number;
        username: string;
        expires_at: string;
      }>(`
        SELECT id, user_id, username, expires_at::text
        FROM user_sessions
        WHERE COALESCE(is_active, false) = true
          AND expires_at < NOW()
        LIMIT 250
      `);

      return rows.map((row) => ({
        entityId: String(row.id),
        description: `Session ${row.id} for ${row.username} expired at ${row.expires_at} but remains active.`,
        evidence: row,
      }));
    },
  },
  {
    ruleId: 'SEC-004',
    domain: 'SECURITY',
    severity: 'medium',
    description: 'Privileged user account is not linked to an active employee profile.',
    expectedCondition: 'ADMIN/OWNER accounts map to a current active employee profile or a documented service account.',
    failureCondition: 'Active ADMIN/OWNER user has no active employee match by employee_id, employee_code, or email.',
    farCitation: 'CMMC AC.L2-3.1.5',
    remediationGuidance: 'Link the account to an active employee, downgrade the role, disable the account, or document it as a controlled service account.',
    entityType: 'user',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        user_id: number;
        username: string;
        role: string;
        email: string | null;
      }>(`
        SELECT u.id AS user_id, u.username, u.role, u.email
        FROM users u
        LEFT JOIN employees e ON (
          COALESCE(e.is_active, true) = true
          AND (
            u.employee_id = e.id
            OR LOWER(u.username) = LOWER(e.employee_code)
            OR (u.email IS NOT NULL AND e.email IS NOT NULL AND LOWER(u.email) = LOWER(e.email))
          )
        )
        WHERE COALESCE(u.is_active, true) = true
          AND UPPER(u.role) IN ('ADMIN', 'OWNER')
          AND e.id IS NULL
      `);

      return rows.map((row) => ({
        entityId: String(row.user_id),
        description: `Privileged account ${row.username} (${row.role}) has no active employee linkage.`,
        evidence: row,
      }));
    },
  },
  {
    ruleId: 'SEC-005',
    domain: 'SECURITY',
    severity: 'high',
    description: 'Timekeeper PIN appears to be stored unhashed.',
    expectedCondition: 'Employee timekeeper PINs are stored as bcrypt hashes, not plain text.',
    failureCondition: 'employees.timekeeper_pin exists but does not look like a bcrypt hash.',
    farCitation: 'CMMC IA.L2-3.5.10',
    remediationGuidance: 'Reset the employee PIN through the normal PIN management flow so it is stored as a bcrypt hash.',
    entityType: 'employee',
    execute: async (): Promise<ForensicViolation[]> => {
      const rows = await safeQuery<{
        employee_id: number;
        employee_code: string | null;
        employee_name: string | null;
      }>(`
        SELECT id AS employee_id, employee_code, name AS employee_name
        FROM employees
        WHERE timekeeper_pin IS NOT NULL
          AND timekeeper_pin <> ''
          AND timekeeper_pin NOT LIKE '$2%'
      `);

      return rows.map((row) => ({
        entityId: String(row.employee_id),
        description: `Employee ${row.employee_name ?? row.employee_id} has a timekeeper PIN value that does not look like a bcrypt hash.`,
        evidence: {
          ...row,
          storedHashRedacted: true,
        },
      }));
    },
  },
];
