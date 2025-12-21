import { Express, Request, Response } from 'express';
import {
  createOutreachNeed,
  getOutreachCoverageStatus,
  executeOutreach,
  fulfillOutreachNeed,
  recordResponse,
  markDeclined,
  getOutreachNeedDetails,
  listOpenOutreachNeeds,
  listExhaustedNeeds,
} from '../services/outreachEngineService';
import { EpochOutreachCandidate } from '../../schema';

// Placeholder message sender - to be replaced with actual email/SMS integration
async function sendOutreachMessage(candidate: EpochOutreachCandidate, channel: string): Promise<boolean> {
  console.log(`[Outreach] Sending ${channel} to ${candidate.contactName || candidate.contactId}`);
  // In production, integrate with SendGrid/Twilio
  // For now, simulate successful send
  return true;
}

export function registerOutreachEngineRoutes(app: Express) {
  // Create a new outreach need with candidates
  app.post('/api/outreach/needs', async (req: Request, res: Response) => {
    try {
      const { tenantId, entityType, entityId, reasonCode, requiredResponses, candidates } = req.body;

      if (!tenantId || !entityType || !entityId || !reasonCode) {
        return res.status(400).json({ error: 'Missing required fields: tenantId, entityType, entityId, reasonCode' });
      }

      if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
        return res.status(400).json({ error: 'At least one candidate is required' });
      }

      const result = await createOutreachNeed(
        { tenantId, entityType, entityId, reasonCode, requiredResponses: requiredResponses || 1 },
        candidates
      );

      return res.status(201).json(result);
    } catch (error) {
      console.error('[Outreach] Error creating need:', error);
      return res.status(500).json({ error: 'Failed to create outreach need' });
    }
  });

  // Get coverage status for an outreach need
  app.get('/api/outreach/needs/:needId/coverage', async (req: Request, res: Response) => {
    try {
      const { needId } = req.params;
      const coverage = await getOutreachCoverageStatus(needId);

      if (!coverage) {
        return res.status(404).json({ error: 'Outreach need not found' });
      }

      return res.json(coverage);
    } catch (error) {
      console.error('[Outreach] Error getting coverage:', error);
      return res.status(500).json({ error: 'Failed to get coverage status' });
    }
  });

  // Get full details for an outreach need
  app.get('/api/outreach/needs/:needId', async (req: Request, res: Response) => {
    try {
      const { needId } = req.params;
      const details = await getOutreachNeedDetails(needId);

      if (!details) {
        return res.status(404).json({ error: 'Outreach need not found' });
      }

      return res.json(details);
    } catch (error) {
      console.error('[Outreach] Error getting need details:', error);
      return res.status(500).json({ error: 'Failed to get outreach need details' });
    }
  });

  // Execute single outreach attempt
  app.post('/api/outreach/needs/:needId/execute', async (req: Request, res: Response) => {
    try {
      const { needId } = req.params;
      const result = await executeOutreach(needId, sendOutreachMessage);

      return res.json(result);
    } catch (error) {
      console.error('[Outreach] Error executing outreach:', error);
      return res.status(500).json({ error: 'Failed to execute outreach' });
    }
  });

  // Fulfill outreach need (execute until complete or exhausted)
  app.post('/api/outreach/needs/:needId/fulfill', async (req: Request, res: Response) => {
    try {
      const { needId } = req.params;
      const result = await fulfillOutreachNeed(needId, sendOutreachMessage);

      return res.json(result);
    } catch (error) {
      console.error('[Outreach] Error fulfilling need:', error);
      return res.status(500).json({ error: 'Failed to fulfill outreach need' });
    }
  });

  // Record a response from a candidate
  app.post('/api/outreach/candidates/:candidateId/respond', async (req: Request, res: Response) => {
    try {
      const { candidateId } = req.params;
      const { notes } = req.body;

      await recordResponse(candidateId, notes);

      return res.json({ success: true, message: 'Response recorded' });
    } catch (error) {
      console.error('[Outreach] Error recording response:', error);
      return res.status(500).json({ error: 'Failed to record response' });
    }
  });

  // Mark a candidate as declined
  app.post('/api/outreach/candidates/:candidateId/decline', async (req: Request, res: Response) => {
    try {
      const { candidateId } = req.params;
      const { reason } = req.body;

      await markDeclined(candidateId, reason);

      return res.json({ success: true, message: 'Candidate marked as declined' });
    } catch (error) {
      console.error('[Outreach] Error marking decline:', error);
      return res.status(500).json({ error: 'Failed to mark decline' });
    }
  });

  // List open outreach needs for a tenant
  app.get('/api/outreach/tenants/:tenantId/open', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const needs = await listOpenOutreachNeeds(tenantId);

      return res.json({
        tenantId,
        count: needs.length,
        needs,
      });
    } catch (error) {
      console.error('[Outreach] Error listing open needs:', error);
      return res.status(500).json({ error: 'Failed to list open needs' });
    }
  });

  // List exhausted outreach needs (for escalation)
  app.get('/api/outreach/tenants/:tenantId/exhausted', async (req: Request, res: Response) => {
    try {
      const { tenantId } = req.params;
      const needs = await listExhaustedNeeds(tenantId);

      return res.json({
        tenantId,
        count: needs.length,
        needs,
      });
    } catch (error) {
      console.error('[Outreach] Error listing exhausted needs:', error);
      return res.status(500).json({ error: 'Failed to list exhausted needs' });
    }
  });
}
