export interface EvidenceItem {
  label: string;
  value: unknown;
}

export interface RedFlag {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  isActive: boolean;
  title?: string;
  farCitation?: string;
  [key: string]: unknown;
}

export interface RemediationItem {
  status: string;
  priority: string;
  title?: string;
  [key: string]: unknown;
}

export interface DomainScore {
  domainKey: string;
  evidenceItems?: EvidenceItem[];
  weight?: number | string;
  rawScore?: number | string;
  [key: string]: unknown;
}

export const DOMAIN_LABELS: Record<string, string> = {
  TIMEKEEPING: 'Timekeeping',
  CHARGE_CODE: 'Charge Code',
  ACCOUNTING: 'Accounting',
  PROCUREMENT: 'Procurement',
  INVENTORY: 'Inventory',
  POLICY: 'Policy',
  GOVT_PROPERTY: 'Govt. Property',
};

export const DOMAIN_WEIGHTS: Record<string, number> = {
  TIMEKEEPING: 0.30,
  CHARGE_CODE: 0.20,
  ACCOUNTING: 0.20,
  PROCUREMENT: 0.10,
  INVENTORY: 0.10,
  POLICY: 0.10,
};

export const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;
export type Severity = typeof SEVERITY_ORDER[number];

export function topFlagBySeverity(flags: RedFlag[]): RedFlag | null {
  for (const sev of SEVERITY_ORDER) {
    const match = flags.find(f => f.severity === sev);
    if (match) return match;
  }
  return null;
}

export function computeDomainTarget(
  compositeScore: number,
  domainRawScore: number,
  domainWeight: number,
): number {
  if (domainWeight <= 0) return 85;
  const otherContribution = compositeScore - domainRawScore * domainWeight;
  const needed = (85 - otherContribution) / domainWeight;
  return Math.max(0, Math.min(100, needed));
}

export function countMissingEvidence(evidenceItems: EvidenceItem[]): number {
  return evidenceItems.filter(ev => ev.value === 'SCORER_UNAVAILABLE').length;
}

export function countTotalMissingEvidence(domainScores: DomainScore[]): number {
  return domainScores.reduce((sum, ds) => {
    const items: EvidenceItem[] = ds.evidenceItems ?? [];
    return sum + countMissingEvidence(items);
  }, 0);
}

export function filterOpenItems(remediationItems: RemediationItem[]): RemediationItem[] {
  return remediationItems.filter(r => r.status === 'OPEN');
}

export function topP1Item(openItems: RemediationItem[]): RemediationItem | null {
  return (
    openItems.find(r => r.priority === 'P1_CRITICAL') ??
    openItems.find(r => r.priority === 'P2_HIGH') ??
    null
  );
}

/**
 * Returns the top pass-blocking flag for the dashboard scorecard.
 * Only CRITICAL and HIGH flags are considered pass-blocking failures —
 * MEDIUM and LOW flags do not prevent an audit pass and are excluded.
 * Within the eligible severities, CRITICAL is surfaced before HIGH.
 */
export function topFailureFlagForDashboard(activeRedFlags: RedFlag[]): RedFlag | null {
  const criticalFlags = activeRedFlags.filter(f => f.severity === 'CRITICAL');
  const highFlags = activeRedFlags.filter(f => f.severity === 'HIGH');
  return criticalFlags[0] ?? highFlags[0] ?? null;
}
