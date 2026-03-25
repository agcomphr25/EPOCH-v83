/**
 * Schema Governance API Routes
 *
 * GET  /api/governance/drift              — Schema drift report (introspection-based)
 * GET  /api/governance/sql-violations     — Raw SQL violations scan across server/
 * GET  /api/governance/audit-log          — Last 50 schema_change_log entries
 * POST /api/governance/override           — Admin: log + optionally execute an overridden
 *                                           destructive operation with reason recorded
 */

import { Router, Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

router.get('/drift', async (_req: Request, res: Response) => {
  try {
    const { pgPool } = await import('../../db');
    const { detectSchemaDrift } = await import('../../governance/schemaDrift');
    const drift = await detectSchemaDrift(pgPool);
    res.json({
      drift,
      summary: {
        total: drift.length,
        critical: drift.filter(d => d.severity === 'CRITICAL').length,
        warning: drift.filter(d => d.severity === 'WARNING').length,
      },
    });
  } catch (err: unknown) {
    console.error('[governance/drift]', err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/sql-violations', async (_req: Request, res: Response) => {
  try {
    const { scanRawSql } = await import('../../governance/rawSqlScanner');
    const serverDir = path.resolve(__dirname, '../..');
    const violations = scanRawSql(serverDir);
    res.json({ violations, total: violations.length });
  } catch (err: unknown) {
    console.error('[governance/sql-violations]', err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/migration-guard', async (_req: Request, res: Response) => {
  try {
    const { pgPool } = await import('../../db');
    const { checkMigration } = await import('../../governance/migrationGuard');
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const { fileURLToPath: ftu } = await import('url');

    const migrationsDir = pathModule.default.resolve(pathModule.default.dirname(ftu(import.meta.url)), '../../../migrations');
    const sqlFiles = fsModule.default.existsSync(migrationsDir)
      ? fsModule.default.readdirSync(migrationsDir).filter((f: string) => f.endsWith('.sql'))
      : [];

    let combinedSql = '';
    for (const f of sqlFiles) {
      combinedSql += fsModule.default.readFileSync(pathModule.default.join(migrationsDir, f), 'utf-8') + '\n';
    }

    if (!combinedSql.trim()) {
      return res.json({ violations: [], allowed: true, summary: 'No migration SQL files found.' });
    }

    const result = await checkMigration(combinedSql, pgPool, false);
    res.json({
      violations: result.violations,
      allowed: result.allowed,
      summary: result.summary,
      blockedCount: result.violations.filter(v => v.blocked).length,
      total: result.violations.length,
    });
  } catch (err: unknown) {
    console.error('[governance/migration-guard]', err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const { pgPool } = await import('../../db');
    const limit = Math.min(parseInt(String(req.query.limit ?? '50'), 10) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);
    const [entriesResult, countResult] = await Promise.all([
      pgPool.query(
        `SELECT id, timestamp, actor, action_type, table_name, column_name,
                before_state, after_state, approved_by, override_reason
         FROM schema_change_log
         ORDER BY timestamp DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      ),
      pgPool.query(`SELECT COUNT(*)::int AS total FROM schema_change_log`),
    ]);
    const total = countResult.rows[0]?.total ?? 0;
    res.json({
      entries: entriesResult.rows,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (err: unknown) {
    const msg = errorMessage(err);
    console.error('[governance/audit-log]', msg);
    if (msg.includes('does not exist')) {
      return res.json({ entries: [], total: 0, limit: 50, offset: 0, hasMore: false, note: 'schema_change_log table not yet created' });
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/governance/override
 *
 * Admin-only endpoint that:
 * 1. Validates admin role
 * 2. Accepts a SQL statement + reason
 * 3. Runs the SQL through checkMigration with override=true
 * 4. If the guard allows it (or override clears blocks), executes the SQL
 * 5. Logs the action atomically to schema_change_log with full audit trail
 *
 * Body: { tableName, columnName?, actionType, overrideReason, sql? }
 *   sql   — optional: if provided, the DDL SQL is validated + executed against the DB.
 *           If omitted, the entry is recorded as a declarative governance audit note.
 */
router.post('/override', async (req: Request, res: Response) => {
  const user = (req as Request & { user?: { role: string; username?: string; id?: string } }).user;
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin role required to log schema overrides' });
  }

  const {
    tableName,
    columnName,
    actionType,
    overrideReason,
    beforeState,
    afterState,
    sql: ddlSql,
  } = req.body as {
    tableName?: string;
    columnName?: string;
    actionType?: string;
    overrideReason?: string;
    beforeState?: unknown;
    afterState?: unknown;
    sql?: string;
  };

  if (!tableName || !actionType || !overrideReason) {
    return res.status(400).json({ error: 'tableName, actionType, and overrideReason are required' });
  }

  const validActionTypes = ['ADD_COLUMN', 'DROP_COLUMN', 'ALTER_COLUMN', 'DROP_TABLE', 'RAW_SQL', 'OVERRIDE'];
  if (!validActionTypes.includes(actionType)) {
    return res.status(400).json({ error: `actionType must be one of: ${validActionTypes.join(', ')}` });
  }

  const actor = user.username ?? user.id ?? 'unknown';

  try {
    const { pgPool } = await import('../../db');
    const { logMutationStrict } = await import('../../governance/mutationLogger');

    let guardSummary: string | undefined;
    let executionResult: { rowCount: number } | undefined;

    if (ddlSql?.trim()) {
      // --- Execution path: transactional (guard → execute → audit in one transaction) ---

      // Allowlist: only schema DDL patterns are permitted via this endpoint.
      // This prevents the override endpoint from becoming a general SQL execution sink.
      const DDL_PATTERN = /^\s*(ALTER\s+TABLE|DROP\s+TABLE|DROP\s+COLUMN|CREATE\s+TABLE|CREATE\s+INDEX|DROP\s+INDEX|ALTER\s+INDEX|COMMENT\s+ON)/i;
      const trimmedSql = ddlSql.trim();
      if (!DDL_PATTERN.test(trimmedSql)) {
        return res.status(400).json({
          error: 'Only schema DDL statements are permitted (ALTER TABLE, DROP TABLE, CREATE TABLE, CREATE/DROP INDEX). DML and procedural SQL are not allowed via the governance override endpoint.',
        });
      }

      const { checkMigration } = await import('../../governance/migrationGuard');

      // Run guard check before acquiring transaction
      const guardResult = await checkMigration(ddlSql, pgPool, true /* override */);
      guardSummary = guardResult.summary;

      if (!guardResult.allowed) {
        return res.status(422).json({
          error: 'Guard still blocked even with override flag',
          summary: guardResult.summary,
          violations: guardResult.violations,
        });
      }

      // Acquire a transaction client so execution + audit are atomic
      const { captureColumnState, captureTableState } = await import('../../governance/mutationLogger');

      // Auto-capture before_state from DB if not provided by caller
      const resolvedBeforeState = beforeState ?? (
        actionType === 'DROP_TABLE'
          ? await captureTableState(pgPool, tableName)
          : columnName
            ? await captureColumnState(pgPool, tableName, columnName)
            : null
      );

      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');

        const execResult = await client.query(ddlSql);
        executionResult = { rowCount: execResult.rowCount ?? 0 };

        // Auto-capture after_state from DB if not provided by caller
        const resolvedAfterState = afterState ?? (
          actionType === 'DROP_TABLE'
            ? await captureTableState(client, tableName)
            : columnName
              ? await captureColumnState(client, tableName, columnName)
              : null
        );

        // Audit log INSIDE the transaction — if this fails, the whole TX rolls back
        await logMutationStrict(client, {
          actor,
          actionType: actionType as Parameters<typeof logMutationStrict>[1]['actionType'],
          tableName,
          columnName,
          beforeState: resolvedBeforeState,
          afterState: { guardSummary, executionResult, schemaAfter: resolvedAfterState },
          approvedBy: actor,
          overrideReason,
        });

        await client.query('COMMIT');
      } catch (txErr: unknown) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw txErr;
      } finally {
        client.release();
      }
    } else {
      // --- Audit-note path: no SQL to execute — just log the intent ---
      // Still strict: if we can't write the audit log, the override is rejected
      await logMutationStrict(pgPool, {
        actor,
        actionType: actionType as Parameters<typeof logMutationStrict>[1]['actionType'],
        tableName,
        columnName,
        beforeState,
        afterState,
        approvedBy: actor,
        overrideReason,
      });
    }

    res.json({
      success: true,
      executed: !!ddlSql?.trim(),
      guardSummary,
      executionResult,
      message: ddlSql?.trim()
        ? `Override approved: SQL executed and logged to schema_change_log (transactional).`
        : `Override logged to schema_change_log as audit note.`,
    });
  } catch (err: unknown) {
    console.error('[governance/override]', err);
    res.status(500).json({ error: errorMessage(err) });
  }
});

export default router;
