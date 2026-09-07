import type { NextFunction, Request, Response } from 'express';

import {
  isFinanceAiExplanationsEnabled,
  isFinanceArDraftPreparationEnabled,
  isFinanceAttentionCenterEnabled,
} from './featureFlags';

export const FINANCE_PILOT_USERNAME = 'glennj';
export const FINANCE_EVIDENCE_RETENTION_DAYS = 2555;

export type FinanceAuthorityLevel =
  | 'OBSERVE'
  | 'PREPARE'
  | 'APPROVE'
  | 'EXECUTE';

export type FinancePilotUser = {
  id?: number | null;
  username?: string | null;
  role?: string | null;
};

export function isFinancePilotUser(
  user: FinancePilotUser | null | undefined
): boolean {
  return user?.username?.trim().toLowerCase() === FINANCE_PILOT_USERNAME;
}

export function getFinanceOperationsCapabilityState() {
  const attentionCenter = isFinanceAttentionCenterEnabled();
  const arDraftPreparation = isFinanceArDraftPreparationEnabled();
  const aiExplanations = isFinanceAiExplanationsEnabled();

  return {
    pilotUsername: FINANCE_PILOT_USERNAME,
    deterministicOnly: !aiExplanations,
    capabilities: {
      attentionCenter,
      arDraftPreparation,
      aiExplanations,
    },
    controls: {
      aiMayCreateDrafts: arDraftPreparation,
      aiMayApprove: false,
      aiMayPost: false,
      aiMaySend: false,
      aiMayPay: false,
      attachmentsMayBeSentToAi: false,
      internalFreeTextMayBeSentToAi: false,
      evidenceRetentionDays: FINANCE_EVIDENCE_RETENTION_DAYS,
    },
  } as const;
}

export function requireFinancePilotUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!isFinancePilotUser(req.user)) {
    res.status(403).json({
      error: 'Finance Operations pilot access is restricted to glennj',
      code: 'FINANCE_PILOT_ACCESS_DENIED',
    });
    return;
  }
  next();
}
