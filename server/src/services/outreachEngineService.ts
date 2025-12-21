import { db } from '../../db';
import { 
  epochOutreachNeeds, 
  epochOutreachCandidates, 
  epochOutreachAttempts,
  EpochOutreachNeed,
  EpochOutreachCandidate,
  InsertEpochOutreachNeed,
  InsertEpochOutreachCandidate
} from '../../schema';
import { eq, and, asc, sql } from 'drizzle-orm';

export interface CoverageStatus {
  outreachNeedId: string;
  requiredResponses: number;
  responsesReceived: number;
  remainingSlots: number;
  exhausted: boolean;
  status: 'open' | 'fulfilled' | 'exhausted';
}

export interface OutreachResult {
  success: boolean;
  candidateId?: string;
  channel?: string;
  attemptId?: string;
  error?: string;
}

// Get coverage status for an outreach need (deterministic)
export async function getOutreachCoverageStatus(outreachNeedId: string): Promise<CoverageStatus | null> {
  const [need] = await db
    .select()
    .from(epochOutreachNeeds)
    .where(eq(epochOutreachNeeds.id, outreachNeedId))
    .limit(1);

  if (!need) {
    return null;
  }

  // Count responses received
  const [responseCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(epochOutreachCandidates)
    .where(and(
      eq(epochOutreachCandidates.outreachNeedId, outreachNeedId),
      eq(epochOutreachCandidates.status, 'responded')
    ));

  // Count eligible candidates (pending or contacted but not exhausted)
  const [eligibleCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(epochOutreachCandidates)
    .where(and(
      eq(epochOutreachCandidates.outreachNeedId, outreachNeedId),
      sql`${epochOutreachCandidates.status} IN ('pending', 'contacted')`
    ));

  const responsesReceived = responseCount?.count || 0;
  const remainingSlots = Math.max(0, need.requiredResponses - responsesReceived);
  const eligibleCandidates = eligibleCount?.count || 0;
  const exhausted = remainingSlots > 0 && eligibleCandidates === 0;

  let status: 'open' | 'fulfilled' | 'exhausted' = 'open';
  if (remainingSlots === 0) {
    status = 'fulfilled';
  } else if (exhausted) {
    status = 'exhausted';
  }

  return {
    outreachNeedId,
    requiredResponses: need.requiredResponses,
    responsesReceived,
    remainingSlots,
    exhausted,
    status,
  };
}

// Select exactly one eligible candidate (deterministic: by priority, then creation date)
async function selectNextCandidate(outreachNeedId: string): Promise<EpochOutreachCandidate | null> {
  const [candidate] = await db
    .select()
    .from(epochOutreachCandidates)
    .where(and(
      eq(epochOutreachCandidates.outreachNeedId, outreachNeedId),
      eq(epochOutreachCandidates.status, 'pending')
    ))
    .orderBy(asc(epochOutreachCandidates.priority), asc(epochOutreachCandidates.createdAt))
    .limit(1);

  return candidate || null;
}

// Record an attempt and update candidate status
async function recordAttempt(
  candidateId: string, 
  channel: string, 
  outcome: 'sent' | 'failed' | 'responded',
  notes?: string
): Promise<string> {
  // Insert attempt record
  const [attempt] = await db.insert(epochOutreachAttempts).values({
    outreachCandidateId: candidateId,
    channelUsed: channel,
    outcome,
    notes,
  }).returning({ id: epochOutreachAttempts.id });

  // Update candidate
  const newStatus = outcome === 'responded' ? 'responded' : 
                    outcome === 'failed' ? 'declined' : 'contacted';
  
  await db.update(epochOutreachCandidates)
    .set({ 
      status: newStatus,
      attemptCount: sql`${epochOutreachCandidates.attemptCount} + 1`,
      lastAttemptAt: new Date(),
    })
    .where(eq(epochOutreachCandidates.id, candidateId));

  return attempt.id;
}

// Update need status based on coverage
async function updateNeedStatus(outreachNeedId: string): Promise<void> {
  const coverage = await getOutreachCoverageStatus(outreachNeedId);
  if (!coverage) return;

  if (coverage.status === 'fulfilled') {
    await db.update(epochOutreachNeeds)
      .set({ status: 'fulfilled', fulfilledAt: new Date() })
      .where(eq(epochOutreachNeeds.id, outreachNeedId));
    console.log(`[Outreach] Need ${outreachNeedId} fulfilled`);
  } else if (coverage.status === 'exhausted') {
    await db.update(epochOutreachNeeds)
      .set({ status: 'exhausted' })
      .where(eq(epochOutreachNeeds.id, outreachNeedId));
    console.log(`[Outreach] Need ${outreachNeedId} exhausted - escalation required`);
  }
}

// Execute outreach for a single need (deterministic)
export async function executeOutreach(
  outreachNeedId: string,
  sendMessage: (candidate: EpochOutreachCandidate, channel: string) => Promise<boolean>
): Promise<OutreachResult> {
  // 1. Compute coverage status
  const coverage = await getOutreachCoverageStatus(outreachNeedId);
  if (!coverage) {
    return { success: false, error: 'Outreach need not found' };
  }

  // 2. If remainingSlots == 0, stop
  if (coverage.remainingSlots === 0) {
    return { success: true, error: 'No remaining slots - outreach complete' };
  }

  // 3. If exhausted, escalate
  if (coverage.exhausted) {
    await updateNeedStatus(outreachNeedId);
    return { success: false, error: 'No eligible candidates - escalation triggered' };
  }

  // 4. Select exactly one eligible candidate
  const candidate = await selectNextCandidate(outreachNeedId);
  if (!candidate) {
    await updateNeedStatus(outreachNeedId);
    return { success: false, error: 'No eligible candidates found' };
  }

  // 5. Send message via provided callback
  const channel = candidate.channelPreference;
  let outcome: 'sent' | 'failed' = 'failed';
  
  try {
    const sent = await sendMessage(candidate, channel);
    outcome = sent ? 'sent' : 'failed';
  } catch (error) {
    console.error(`[Outreach] Failed to send to ${candidate.contactId}:`, error);
    outcome = 'failed';
  }

  // 6. Record attempt
  const attemptId = await recordAttempt(candidate.id, channel, outcome);

  // 7. Update need status
  await updateNeedStatus(outreachNeedId);

  return {
    success: outcome === 'sent',
    candidateId: candidate.id,
    channel,
    attemptId,
  };
}

// Execute outreach until coverage is met or exhausted
export async function fulfillOutreachNeed(
  outreachNeedId: string,
  sendMessage: (candidate: EpochOutreachCandidate, channel: string) => Promise<boolean>
): Promise<{ attempts: OutreachResult[]; finalStatus: CoverageStatus | null }> {
  const attempts: OutreachResult[] = [];
  let maxIterations = 100; // Safety limit

  while (maxIterations > 0) {
    maxIterations--;

    const coverage = await getOutreachCoverageStatus(outreachNeedId);
    if (!coverage) break;

    if (coverage.remainingSlots === 0 || coverage.exhausted) {
      break;
    }

    const result = await executeOutreach(outreachNeedId, sendMessage);
    attempts.push(result);

    if (!result.success || result.error?.includes('No remaining slots')) {
      break;
    }
  }

  const finalStatus = await getOutreachCoverageStatus(outreachNeedId);
  return { attempts, finalStatus };
}

// Create a new outreach need with candidates
export async function createOutreachNeed(
  need: InsertEpochOutreachNeed,
  candidates: Omit<InsertEpochOutreachCandidate, 'outreachNeedId'>[]
): Promise<{ needId: string; candidateCount: number }> {
  const [created] = await db.insert(epochOutreachNeeds).values(need).returning({ id: epochOutreachNeeds.id });

  if (candidates.length > 0) {
    await db.insert(epochOutreachCandidates).values(
      candidates.map((c, i) => ({
        ...c,
        outreachNeedId: created.id,
        priority: c.priority ?? i,
      }))
    );
  }

  console.log(`[Outreach] Created need ${created.id} with ${candidates.length} candidates`);

  return {
    needId: created.id,
    candidateCount: candidates.length,
  };
}

// Record a response from a candidate
export async function recordResponse(candidateId: string, notes?: string): Promise<void> {
  // Update candidate status to responded
  await db.update(epochOutreachCandidates)
    .set({ status: 'responded' })
    .where(eq(epochOutreachCandidates.id, candidateId));

  // Record the response as an attempt
  await recordAttempt(candidateId, 'response', 'responded', notes);

  // Get the outreach need and update its status
  const [candidate] = await db
    .select({ outreachNeedId: epochOutreachCandidates.outreachNeedId })
    .from(epochOutreachCandidates)
    .where(eq(epochOutreachCandidates.id, candidateId))
    .limit(1);

  if (candidate) {
    await updateNeedStatus(candidate.outreachNeedId);
  }

  console.log(`[Outreach] Response recorded for candidate ${candidateId}`);
}

// Mark a candidate as declined (triggers replacement outreach)
export async function markDeclined(candidateId: string, reason?: string): Promise<void> {
  await db.update(epochOutreachCandidates)
    .set({ status: 'declined' })
    .where(eq(epochOutreachCandidates.id, candidateId));

  console.log(`[Outreach] Candidate ${candidateId} declined: ${reason || 'No reason provided'}`);
}

// Get outreach need with all candidates and attempts
export async function getOutreachNeedDetails(outreachNeedId: string): Promise<{
  need: EpochOutreachNeed;
  candidates: (EpochOutreachCandidate & { attempts: typeof epochOutreachAttempts.$inferSelect[] })[];
  coverage: CoverageStatus;
} | null> {
  const [need] = await db
    .select()
    .from(epochOutreachNeeds)
    .where(eq(epochOutreachNeeds.id, outreachNeedId))
    .limit(1);

  if (!need) return null;

  const candidates = await db
    .select()
    .from(epochOutreachCandidates)
    .where(eq(epochOutreachCandidates.outreachNeedId, outreachNeedId))
    .orderBy(asc(epochOutreachCandidates.priority));

  const candidatesWithAttempts = await Promise.all(
    candidates.map(async (c) => {
      const attempts = await db
        .select()
        .from(epochOutreachAttempts)
        .where(eq(epochOutreachAttempts.outreachCandidateId, c.id));
      return { ...c, attempts };
    })
  );

  const coverage = await getOutreachCoverageStatus(outreachNeedId);

  return {
    need,
    candidates: candidatesWithAttempts,
    coverage: coverage!,
  };
}

// List open outreach needs for a tenant
export async function listOpenOutreachNeeds(tenantId: string): Promise<EpochOutreachNeed[]> {
  return db
    .select()
    .from(epochOutreachNeeds)
    .where(and(
      eq(epochOutreachNeeds.tenantId, tenantId),
      eq(epochOutreachNeeds.status, 'open')
    ));
}

// List exhausted outreach needs (for escalation review)
export async function listExhaustedNeeds(tenantId: string): Promise<EpochOutreachNeed[]> {
  return db
    .select()
    .from(epochOutreachNeeds)
    .where(and(
      eq(epochOutreachNeeds.tenantId, tenantId),
      eq(epochOutreachNeeds.status, 'exhausted')
    ));
}
