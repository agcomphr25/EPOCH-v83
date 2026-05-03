import { runForensicScan, ScanSummary } from '../services/dcaaForensicEngine';
import { notificationManager } from '../services/notificationManager';
import { db } from '../../db';
import { dcaaSchedulerState, dcaaScanHistory } from '../../schema';
import { eq, desc } from 'drizzle-orm';

export interface AutomatedScanRecord {
  ranAt: string;
  triggeredBy: 'scheduled';
  summary: ScanSummary;
}

export interface ForensicAuditScheduleConfig {
  isScheduleEnabled: boolean;
  scheduledTime: string;
}

const STATE_KEY = 'last_automated_scan';

let lastAutomatedScan: AutomatedScanRecord | null = null;

let scheduleConfig: ForensicAuditScheduleConfig = {
  isScheduleEnabled: true,
  scheduledTime: '02:30',
};

async function persistStateToDb(record: AutomatedScanRecord): Promise<void> {
  await db
    .insert(dcaaSchedulerState)
    .values({
      key: STATE_KEY,
      ranAt: record.ranAt,
      triggeredBy: record.triggeredBy,
      summary: record.summary as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: dcaaSchedulerState.key,
      set: {
        ranAt: record.ranAt,
        triggeredBy: record.triggeredBy,
        summary: record.summary as Record<string, unknown>,
      },
    });
}

async function appendScanHistory(record: AutomatedScanRecord): Promise<void> {
  await db.insert(dcaaScanHistory).values({
    ranAt: record.ranAt,
    triggeredBy: record.triggeredBy,
    newFindings: record.summary.newFindings,
    violationsClosed: record.summary.violationsClosed,
    rulesRun: record.summary.rulesRun,
    rulesFailed: record.summary.rulesFailed,
    summary: record.summary as Record<string, unknown>,
  });
}

export async function getScanHistory(limit = 20): Promise<typeof dcaaScanHistory.$inferSelect[]> {
  return db
    .select()
    .from(dcaaScanHistory)
    .orderBy(desc(dcaaScanHistory.ranAt))
    .limit(limit);
}

/**
 * Called once during server startup to restore the last scan record from
 * the database into memory. Logs a warning on failure but does not throw.
 */
export async function initSchedulerState(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(dcaaSchedulerState)
      .where(eq(dcaaSchedulerState.key, STATE_KEY))
      .limit(1);
    if (rows.length > 0) {
      const row = rows[0];
      lastAutomatedScan = {
        ranAt: row.ranAt,
        triggeredBy: row.triggeredBy as 'scheduled',
        summary: row.summary as ScanSummary,
      };
      console.log(`[DCAA Forensic Scheduler] Restored last scan state from DB (ran at ${lastAutomatedScan.ranAt})`);
    } else {
      console.log('[DCAA Forensic Scheduler] No previous scan state found in DB');
    }
  } catch (err: any) {
    console.warn('[DCAA Forensic Scheduler] Could not restore state from DB on startup:', err?.message ?? err);
  }
}

export function getLastAutomatedScan(): AutomatedScanRecord | null {
  return lastAutomatedScan;
}

export function getForensicAuditScheduleConfig(): ForensicAuditScheduleConfig {
  return { ...scheduleConfig };
}

export function setForensicAuditScheduleConfig(updates: Partial<ForensicAuditScheduleConfig>): ForensicAuditScheduleConfig {
  scheduleConfig = { ...scheduleConfig, ...updates };
  return { ...scheduleConfig };
}

export async function runScheduledForensicScan(): Promise<void> {
  console.log('[DCAA Forensic Scheduler] Starting nightly automated scan...');
  try {
    const summary = await runForensicScan();

    lastAutomatedScan = {
      ranAt: summary.scannedAt,
      triggeredBy: 'scheduled',
      summary,
    };

    try {
      await persistStateToDb(lastAutomatedScan);
    } catch (persistErr: any) {
      console.warn('[DCAA Forensic Scheduler] Could not persist state to DB:', persistErr?.message ?? persistErr);
    }

    try {
      await appendScanHistory(lastAutomatedScan);
    } catch (histErr: any) {
      console.warn('[DCAA Forensic Scheduler] Could not append scan history to DB:', histErr?.message ?? histErr);
    }

    console.log(
      `[DCAA Forensic Scheduler] Scan complete — ${summary.rulesRun} rules, ` +
        `${summary.newFindings} new violations, ${summary.violationsClosed} closed, ` +
        `${summary.rulesFailed} failed.`,
    );

    notificationManager.broadcast({
      type: 'forensic_scan_complete',
      title: 'Forensic Scan Complete',
      message: `Automated DCAA forensic scan completed — ${summary.newFindings} new violation${summary.newFindings !== 1 ? 's' : ''}, ${summary.violationsClosed} closed.`,
      data: {
        ranAt: summary.scannedAt,
        newFindings: summary.newFindings,
        violationsClosed: summary.violationsClosed,
        rulesRun: summary.rulesRun,
      },
      timestamp: new Date().toISOString(),
    });

    const criticalOpen = summary.breakdown
      .filter(b => b.severity === 'critical' && b.newFindings > 0)
      .reduce((sum, b) => sum + b.newFindings, 0);

    if (criticalOpen > 0) {
      const message =
        `Automated DCAA forensic scan found ${criticalOpen} new critical violation` +
        `${criticalOpen !== 1 ? 's' : ''}. Immediate review required.`;

      notificationManager.broadcast({
        type: 'forensic_critical_violation',
        title: '⚠️ DCAA Critical Violation Detected',
        message,
        data: {
          newFindings: summary.newFindings,
          criticalNew: criticalOpen,
          scannedAt: summary.scannedAt,
        },
        timestamp: new Date().toISOString(),
      });

      console.warn(`[DCAA Forensic Scheduler] ${message}`);
    }
  } catch (err: any) {
    console.error('[DCAA Forensic Scheduler] Automated scan failed:', err?.message ?? err);
  }
}
