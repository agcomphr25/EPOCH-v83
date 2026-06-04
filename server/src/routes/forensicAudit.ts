import { Router } from 'express';
import { requireAdminOrOwner, sessionAwareAuth } from '../../middleware/auth';
import { runForensicScan, getFindings, getFindingsSummary, updateFindingStatus } from '../services/dcaaForensicEngine';
import { timekeepingForensicRules } from '../services/dcaaForensicRules';
import { securityForensicRules } from '../services/securityForensicRules';
import { getLastAutomatedScan, getForensicAuditScheduleConfig, setForensicAuditScheduleConfig, getScanHistory } from '../jobs/forensicAuditScheduler';

const router = Router();

router.post('/run', requireAdminOrOwner, async (req, res) => {
  try {
    const summary = await runForensicScan();
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('[Forensic Audit] Run failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Forensic scan failed', details: err instanceof Error ? err.message : String(err) });
  }
});

router.get('/rules', sessionAwareAuth, (_req, res) => {
  const rules = [...timekeepingForensicRules, ...securityForensicRules].map(r => ({
    ruleId: r.ruleId,
    domain: r.domain,
    severity: r.severity,
    description: r.description,
    expectedCondition: r.expectedCondition,
    failureCondition: r.failureCondition,
    farCitation: r.farCitation,
    remediationGuidance: r.remediationGuidance,
    entityType: r.entityType,
    enforcedAtWriteTime: r.enforcedAtWriteTime ?? false,
    enforcementNote: r.enforcementNote ?? null,
  }));
  res.json(rules);
});

router.get('/findings', sessionAwareAuth, async (req, res) => {
  try {
    const {
      domain,
      severity,
      status,
      entityType,
      ruleId,
      page,
      pageSize,
    } = req.query as Record<string, string | undefined>;

    const result = await getFindings({
      domain: domain || undefined,
      severity: severity || undefined,
      status: status || undefined,
      entityType: entityType || undefined,
      ruleId: ruleId || undefined,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? Math.min(parseInt(pageSize, 10), 200) : 50,
    });

    res.json(result);
  } catch (err) {
    console.error('[Forensic Audit] Findings fetch failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch findings' });
  }
});

router.patch('/findings/:id', requireAdminOrOwner, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid finding id' });
      return;
    }
    const { status, resolutionNotes } = req.body as { status?: string; resolutionNotes?: string };
    const allowed = ['open', 'acknowledged', 'resolved'];
    if (!status || !allowed.includes(status)) {
      res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
      return;
    }
    const updated = await updateFindingStatus(id, status as 'open' | 'acknowledged' | 'resolved', resolutionNotes);
    if (!updated) {
      res.status(404).json({ error: 'Finding not found' });
      return;
    }
    res.json({ ok: true, finding: updated });
  } catch (err) {
    console.error('[Forensic Audit] Patch finding failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to update finding status' });
  }
});

router.get('/summary', sessionAwareAuth, async (req, res) => {
  try {
    const summary = await getFindingsSummary();
    res.json(summary);
  } catch (err) {
    console.error('[Forensic Audit] Summary fetch failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch findings summary' });
  }
});

router.get('/last-automated-scan', sessionAwareAuth, (_req, res) => {
  const record = getLastAutomatedScan();
  if (!record) {
    return res.json({ hasRun: false, lastScan: null });
  }
  res.json({ hasRun: true, lastScan: record });
});

router.get('/scan-history', sessionAwareAuth, async (req, res) => {
  try {
    const limitParam = req.query.limit;
    const limit = limitParam ? Math.min(Math.max(parseInt(String(limitParam), 10) || 20, 1), 100) : 20;
    const rows = await getScanHistory(limit);
    res.json({ history: rows, count: rows.length });
  } catch (err) {
    console.error('[Forensic Audit] Scan history fetch failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'Failed to fetch scan history' });
  }
});

router.get('/schedule-config', requireAdminOrOwner, (_req, res) => {
  res.json(getForensicAuditScheduleConfig());
});

router.put('/schedule-config', requireAdminOrOwner, (req, res) => {
  const { isScheduleEnabled, scheduledTime } = req.body as {
    isScheduleEnabled?: boolean;
    scheduledTime?: string;
  };

  const updates: Record<string, unknown> = {};

  if (typeof isScheduleEnabled === 'boolean') {
    updates.isScheduleEnabled = isScheduleEnabled;
  }

  if (typeof scheduledTime === 'string') {
    const timeMatch = scheduledTime.match(/^(\d{2}):(\d{2})$/);
    if (!timeMatch) {
      res.status(400).json({ error: 'scheduledTime must be in HH:MM format' });
      return;
    }
    const hour = parseInt(timeMatch[1], 10);
    const minute = parseInt(timeMatch[2], 10);
    if (hour > 23 || minute > 59) {
      res.status(400).json({ error: 'scheduledTime has an invalid hour (0–23) or minute (0–59)' });
      return;
    }
    updates.scheduledTime = scheduledTime;
  }

  const updated = setForensicAuditScheduleConfig(updates);
  res.json(updated);
});

export default router;
