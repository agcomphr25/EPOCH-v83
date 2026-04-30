import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Crown, TrendingUp, CheckCircle2, AlertTriangle, Wifi } from 'lucide-react';
import EdriSubNav from '@/components/EdriSubNav';

// ---------------------------------------------------------------------------
// Visual config — unchanged from v1 shell
// ---------------------------------------------------------------------------
const BAND_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  STRONG:   { label: 'Strong',   bg: 'bg-green-100 dark:bg-green-900',  text: 'text-green-800 dark:text-green-200' },
  ADEQUATE: { label: 'Adequate', bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
  PARTIAL:  { label: 'Partial',  bg: 'bg-orange-100 dark:bg-orange-900', text: 'text-orange-800 dark:text-orange-200' },
  WEAK:     { label: 'Weak',     bg: 'bg-red-100 dark:bg-red-900',      text: 'text-red-800 dark:text-red-200' },
  NONE:     { label: 'None',     bg: 'bg-gray-100 dark:bg-gray-800',    text: 'text-gray-700 dark:text-gray-300' },
};

type GapSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
type FixEffort   = 'Low' | 'Medium' | 'High';
type EpochState  = 'STRONG' | 'ADEQUATE' | 'PARTIAL' | 'WEAK' | 'NONE';

// ---------------------------------------------------------------------------
// Score → EpochState mapping
// Breakpoints are DCAA-risk-calibrated:
//   ≥ 90 → STRONG:   controls effective, no material compliance gap
//   ≥ 80 → ADEQUATE: functional controls with minor correctable gaps
//   ≥ 65 → PARTIAL:  controls present but materially incomplete
//   ≥ 50 → WEAK:     minimal controls, significant DCAA exposure
//   < 50 → NONE:     absent or severely deficient
// ---------------------------------------------------------------------------
function domainScoreToState(score: number | undefined | null): EpochState {
  if (score === undefined || score === null) return 'NONE';
  if (score >= 90) return 'STRONG';
  if (score >= 80) return 'ADEQUATE';
  if (score >= 65) return 'PARTIAL';
  if (score >= 50) return 'WEAK';
  return 'NONE';
}

// ---------------------------------------------------------------------------
// Explicit row → EDRI domain mapping
// Only rows with isLiveBacked=true have their currentEpochState replaced by
// live data at render time. All other editorial columns are untouched.
// ---------------------------------------------------------------------------
interface DomainMapping {
  // EDRI domain keys to use. '__COMPOSITE__' means use the snapshot composite score.
  domains: string[];
  // 'avg' blends two domains equally. 'primary' uses domains[0].
  blendMode: 'avg' | 'primary';
  isLiveBacked: boolean;
  // Human-readable note shown in tooltip / code — used in SECTION B report below.
  sourceNote: string;
}

const ROW_DOMAIN_MAP: Record<string, DomainMapping> = {
  // --- TIMEKEEPING-backed ---
  'Labor Charging Controls': {
    domains: ['TIMEKEEPING', 'CHARGE_CODE'],
    blendMode: 'avg',
    isLiveBacked: true,
    sourceNote: 'TIMEKEEPING + CHARGE_CODE domain scores averaged — directly backed by punch compliance and charge code validation sub-checks',
  },
  'Timekeeping Policy Compliance': {
    domains: ['POLICY', 'TIMEKEEPING'],
    blendMode: 'avg',
    isLiveBacked: true,
    sourceNote: 'POLICY + TIMEKEEPING averaged — PIN enforcement, kiosk policy, and timesheet policy controls are scored in both domains',
  },
  'Charge Code Segregation': {
    domains: ['CHARGE_CODE'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'CHARGE_CODE domain score — direct: the charge code domain scores direct/indirect segregation enforcement',
  },
  'Audit Trail Integrity': {
    domains: ['TIMEKEEPING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'TIMEKEEPING domain score — TK-005 (punch edit audit trail) is a sub-check within the timekeeping domain scorer',
  },
  'Real-Time Labor Visibility': {
    domains: ['TIMEKEEPING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'TIMEKEEPING domain score (proxy) — live labor capture health and punch frequency are timekeeping sub-checks',
  },
  'Uncompensated Overtime Detection': {
    domains: ['TIMEKEEPING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'TIMEKEEPING domain score — forensic UCO pattern detection is executed as a timekeeping forensic rule',
  },
  'DCAA Floor Check Readiness': {
    domains: ['TIMEKEEPING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'TIMEKEEPING domain score (proxy) — floor check requires accurate real-time punch records, captured by the timekeeping domain',
  },

  // --- ACCOUNTING-backed ---
  'Incurred Cost Submission Readiness': {
    domains: ['ACCOUNTING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'ACCOUNTING domain score (proxy) — ICE readiness is not directly scored; accounting controls readiness is used as the closest proxy',
  },
  'Indirect Cost Rate Management': {
    domains: ['ACCOUNTING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'ACCOUNTING domain score (proxy) — indirect rate management is a subset of accounting controls readiness',
  },
  'Project Cost-to-Complete Forecasting': {
    domains: ['ACCOUNTING'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'ACCOUNTING domain score (proxy) — PM forecasting capability is not directly scored; accounting readiness is the closest available signal',
  },

  // --- PROCUREMENT-backed ---
  'Purchase Order & Procurement Controls': {
    domains: ['PROCUREMENT'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'PROCUREMENT domain score — direct: procurement controls are the core subject of this domain',
  },
  'Subcontractor Monitoring': {
    domains: ['PROCUREMENT'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'PROCUREMENT domain score (proxy) — subcontract flowdown is a procurement controls sub-area',
  },
  'Travel & ODC Authorization': {
    domains: ['PROCUREMENT'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'PROCUREMENT domain score (proxy) — ODC authorization is procurement-adjacent; no dedicated EDRI domain exists for travel today',
  },

  // --- INVENTORY-backed ---
  'Inventory Valuation & Traceability': {
    domains: ['INVENTORY'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'INVENTORY domain score — direct: lot-level traceability and material valuation are the core subject of this domain',
  },

  // --- POLICY-backed ---
  'Employee Classification Integrity': {
    domains: ['POLICY'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'POLICY domain score (proxy) — classification is enforced via policy controls; no dedicated HR domain exists in EDRI today',
  },
  'Evidence Packet Generation': {
    domains: ['POLICY'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'POLICY domain score — EDRI evidence workflow is a policy compliance capability; POLICY domain health is a reasonable proxy',
  },
  'Visual Rules & Workflow Enforcement': {
    domains: ['POLICY'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'POLICY domain score (proxy) — workflow enforcement and operator guardrails are captured in policy controls scoring',
  },

  // --- COMPOSITE (uses snapshot.compositeScore directly) ---
  'Compliance Score Trending': {
    domains: ['__COMPOSITE__'],
    blendMode: 'primary',
    isLiveBacked: true,
    sourceNote: 'EDRI composite score — direct: this row represents the EDRI system itself; the composite is the most honest state indicator',
  },

  // --- EDITORIAL (no live EDRI backing) ---
  // GOVT_PROPERTY domain is defined in the EDRI schema but has 0 weight and
  // is not scored in edriDomainScorers.ts. Presenting a derived score would
  // be false precision — this row remains editorial until GFP scoring is built.
  'Government Property Accountability': {
    domains: [],
    blendMode: 'primary',
    isLiveBacked: false,
    sourceNote: 'GOVT_PROPERTY domain defined but not yet scored — remains editorial until GFP scoring is implemented',
  },
};

// ---------------------------------------------------------------------------
// Compute a blended score for a row from the live domain score map.
// Returns null when no live data is available for this row.
// ---------------------------------------------------------------------------
function computeRowScore(
  requirement: string,
  domainScoreMap: Record<string, number>,
  compositeScore: number | null,
): number | null {
  const mapping = ROW_DOMAIN_MAP[requirement];
  if (!mapping || !mapping.isLiveBacked) return null;

  if (mapping.domains.includes('__COMPOSITE__')) {
    return compositeScore;
  }

  if (mapping.domains.length === 0) return null;

  const scores = mapping.domains
    .map(d => domainScoreMap[d])
    .filter((s): s is number => s !== undefined && s !== null);

  if (scores.length === 0) return null;

  if (mapping.blendMode === 'avg') {
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }
  return scores[0]; // 'primary'
}

// ---------------------------------------------------------------------------
// Static matrix data — all editorial columns preserved exactly as-is.
// The currentEpochState fields below serve as editorial FALLBACKS only;
// for live-backed rows they are REPLACED at render time by EDRI data.
// ---------------------------------------------------------------------------
interface MatrixRow {
  requirement: string;
  whyItMatters: string;
  costpointNative: string;
  costpointWithIntegration: string;
  epochNative: string;
  editorialEpochState: EpochState; // static fallback — never shown for live-backed rows
  gapSeverity: GapSeverity;
  fixEffort: FixEffort;
  executiveAdvantage: string;
}

const MATRIX_DATA: MatrixRow[] = [
  {
    requirement: 'Labor Charging Controls',
    whyItMatters: 'Prevents unallowable or misallocated direct/indirect labor — top DCAA finding category.',
    costpointNative: 'Native timesheet approval, charge code validation, floor-check integration',
    costpointWithIntegration: 'Deltek Time & Expense adds mobile capture and exception routing',
    epochNative: 'Real-time time clock, charge code enforcement, supervisor approval workflow',
    editorialEpochState: 'ADEQUATE',
    gapSeverity: 'MEDIUM',
    fixEffort: 'Medium',
    executiveAdvantage: 'EPOCH captures punch-level granularity unavailable in Costpoint desktop timesheets',
  },
  {
    requirement: 'Timekeeping Policy Compliance',
    whyItMatters: 'Written, enforced policy required for DCAA audit survivability (FAR 31.201-2).',
    costpointNative: 'Policy stored as document attachment only — no active enforcement',
    costpointWithIntegration: 'GovWin or compliance modules add acknowledgment tracking',
    epochNative: 'Policy acknowledgment integrated with operator onboarding flow',
    editorialEpochState: 'PARTIAL',
    gapSeverity: 'HIGH',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH can enforce acknowledgment at every timesheet submission; Costpoint cannot without custom scripting',
  },
  {
    requirement: 'Charge Code Segregation',
    whyItMatters: 'Direct/indirect separation is the foundation of DCAA cost accounting.',
    costpointNative: 'Full project-based charge structure, pools/bases defined natively',
    costpointWithIntegration: 'Same; no integration changes this core function',
    epochNative: 'Charge code library with direct/indirect flags and project assignment',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'Parity — both systems handle segregation; EPOCH is simpler to configure for small-to-mid portfolios',
  },
  {
    requirement: 'Audit Trail Integrity',
    whyItMatters: 'DCAA requires immutable records for all timesheet edits and approvals.',
    costpointNative: 'Audit log built-in; tamper protection via database controls',
    costpointWithIntegration: 'Same core; integrations may introduce log gaps',
    epochNative: 'Append-only audit event log on all labor and status transitions',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH audit log is queryable in real-time by operators; Costpoint audit access requires DBA intervention',
  },
  {
    requirement: 'Incurred Cost Submission Readiness',
    whyItMatters: 'Annual ICE submission requires reconciled labor, ODC, and indirect cost data.',
    costpointNative: 'ICE module with DCAA-format export built in',
    costpointWithIntegration: 'Cognos or Unanet add additional analytics layers',
    epochNative: 'Labor ledger export; no ICE template generator yet',
    editorialEpochState: 'PARTIAL',
    gapSeverity: 'CRITICAL',
    fixEffort: 'High',
    executiveAdvantage: 'Costpoint leads here — EPOCH requires custom export mapping to produce ICE-ready data',
  },
  {
    requirement: 'Indirect Cost Rate Management',
    whyItMatters: 'Provisional and final billing rates must be traceable to actuals.',
    costpointNative: 'Rate tables, pool/base allocation, billing rate schedule management',
    costpointWithIntegration: 'Same; integrations add dashboard views',
    epochNative: 'Rate tracking in development; manual input supported',
    editorialEpochState: 'WEAK',
    gapSeverity: 'CRITICAL',
    fixEffort: 'High',
    executiveAdvantage: 'Costpoint leads significantly — this is a known EPOCH gap requiring development investment',
  },
  {
    requirement: 'Purchase Order & Procurement Controls',
    whyItMatters: 'ODC and material costs require competitive sourcing evidence for DCAA.',
    costpointNative: 'Full procurement module: requisition → PO → receipt → voucher',
    costpointWithIntegration: 'Procurement gateway connectors add supplier portal capability',
    epochNative: 'Vendor library and PO entry; no three-way match automation',
    editorialEpochState: 'PARTIAL',
    gapSeverity: 'HIGH',
    fixEffort: 'Medium',
    executiveAdvantage: 'Costpoint leads on three-way match; EPOCH excels at shop-floor material traceability that Costpoint lacks',
  },
  {
    requirement: 'Inventory Valuation & Traceability',
    whyItMatters: 'DCAA requires accurate material cost allocation and physical inventory reconciliation.',
    costpointNative: 'Inventory module with FIFO/LIFO/weighted average; cycle count support',
    costpointWithIntegration: 'Barcode and WMS integrations extend accuracy',
    epochNative: 'Lot-level inventory tracking with material ledger and transaction history',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH lot-level tracking exceeds Costpoint inventory granularity for custom manufacturing environments',
  },
  {
    requirement: 'Subcontractor Monitoring',
    whyItMatters: 'Pass-through costs require documented oversight and consent from prime (FAR 52.244-2).',
    costpointNative: 'Subcontract management with consent tracking and invoicing',
    costpointWithIntegration: 'Same; workflow tools add task-order level visibility',
    epochNative: 'Subcontractor scoring module in EDRI; operational controls limited',
    editorialEpochState: 'PARTIAL',
    gapSeverity: 'HIGH',
    fixEffort: 'Medium',
    executiveAdvantage: 'EPOCH EDRI subcontractor readiness score provides a risk signal Costpoint has no equivalent for',
  },
  {
    requirement: 'Government Property Accountability',
    whyItMatters: 'GFP must be tagged, located, and reported per FAR 52.245-1.',
    costpointNative: 'GFP module with asset register, location tracking, and reporting',
    costpointWithIntegration: 'EAM integrations extend to maintenance and disposal',
    epochNative: 'GFP domain defined in EDRI schema; active scoring deferred',
    editorialEpochState: 'NONE',
    gapSeverity: 'CRITICAL',
    fixEffort: 'High',
    executiveAdvantage: 'Costpoint leads — GFP is a deferred EPOCH domain requiring explicit development roadmap commitment',
  },
  {
    requirement: 'Employee Classification Integrity',
    whyItMatters: 'Misclassified exempt/non-exempt labor creates SCA and DCAA violations.',
    costpointNative: 'HR module with SCA wage table and classification flags',
    costpointWithIntegration: 'HRIS integrations (Workday, ADP) add classification validation',
    epochNative: 'Operator role classification in system; no SCA wage enforcement',
    editorialEpochState: 'PARTIAL',
    gapSeverity: 'HIGH',
    fixEffort: 'Medium',
    executiveAdvantage: 'EPOCH role-based access control enforces classification at the workflow level — a control Costpoint lacks operationally',
  },
  {
    requirement: 'Real-Time Labor Visibility',
    whyItMatters: 'PM execution requires current labor actuals vs. budget without waiting for period close.',
    costpointNative: 'Near-real-time with nightly batch; live views via Costpoint Analytics',
    costpointWithIntegration: 'Unanet or Cognos provide sub-day refresh',
    epochNative: 'Live time clock data feeds dashboard without batch dependency',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH native real-time visibility is a material operational superiority over Costpoint batch architecture',
  },
  {
    requirement: 'Project Cost-to-Complete Forecasting',
    whyItMatters: 'PMs need EAC/ETC for execution control; DCAA reviews forecast accuracy.',
    costpointNative: 'EV module with EAC/ETC, schedule integration, EVMS reporting',
    costpointWithIntegration: 'MPM and Cobra integrations add EVMS-certified reporting',
    epochNative: 'Manual ETC entry supported; no automated EAC computation engine',
    editorialEpochState: 'WEAK',
    gapSeverity: 'HIGH',
    fixEffort: 'High',
    executiveAdvantage: 'Costpoint leads — EPOCH requires EAC engine investment to close this gap for large program management',
  },
  {
    requirement: 'Uncompensated Overtime Detection',
    whyItMatters: 'UCO must be disclosed and priced; DCAA examines exempt employee time records.',
    costpointNative: 'UCO disclosure via policy flag; no automated detection',
    costpointWithIntegration: 'Time & Expense flags pattern deviations with workflow rules',
    epochNative: 'EDRI forensic scanner detects anomalous punch patterns indicative of UCO',
    editorialEpochState: 'ADEQUATE',
    gapSeverity: 'MEDIUM',
    fixEffort: 'Medium',
    executiveAdvantage: 'EPOCH forensic scan provides automated UCO signal that Costpoint native lacks without custom report development',
  },
  {
    requirement: 'Travel & ODC Authorization',
    whyItMatters: 'Unallowable travel costs are a persistent DCAA finding; pre-approval is required.',
    costpointNative: 'Expense module with pre-approval workflow, per-diem tables, FAR unallowable flags',
    costpointWithIntegration: 'Concur integration adds receipt-level OCR and pre-trip approval',
    epochNative: 'ODC entry with charge code assignment; no pre-approval workflow',
    editorialEpochState: 'WEAK',
    gapSeverity: 'HIGH',
    fixEffort: 'Medium',
    executiveAdvantage: 'Costpoint leads on travel compliance — EPOCH requires ODC pre-approval workflow to reach parity',
  },
  {
    requirement: 'DCAA Floor Check Readiness',
    whyItMatters: 'DCAA floor checks verify employees are present and charging correctly in real time.',
    costpointNative: 'Floor check reports generated post-fact; no live operator location awareness',
    costpointWithIntegration: 'Floor check software add-ons available; requires additional license',
    epochNative: 'Time clock screen provides live operator status, active charge code, and shift visibility',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH live floor visibility is a significant operational advantage — auditors can observe in real time without system add-ons',
  },
  {
    requirement: 'Evidence Packet Generation',
    whyItMatters: 'DCAA requests require rapid assembly of supporting documents by project/period.',
    costpointNative: 'Report generation by project; manual assembly into audit package',
    costpointWithIntegration: 'Document management integrations (SharePoint, DocuWare) speed assembly',
    epochNative: 'EDRI evidence packet builder generates domain-level audit packages on demand',
    editorialEpochState: 'ADEQUATE',
    gapSeverity: 'MEDIUM',
    fixEffort: 'Medium',
    executiveAdvantage: 'EPOCH EDRI evidence workflow is a novel capability — Costpoint has no equivalent automated audit-package builder',
  },
  {
    requirement: 'Compliance Score Trending',
    whyItMatters: 'Leadership needs a forward-looking compliance risk signal, not just a point-in-time audit result.',
    costpointNative: 'No compliance scoring; relies on external audit findings',
    costpointWithIntegration: 'Third-party GRC tools (Archer, Workiva) provide risk dashboards',
    epochNative: 'EDRI composite score with domain-level trending, band classification, and red-flag engine',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH EDRI is a native compliance intelligence capability with no Costpoint equivalent — a strategic differentiator',
  },
  {
    requirement: 'Visual Rules & Workflow Enforcement',
    whyItMatters: 'Operators need clear, in-system guidance to avoid violations at the point of action.',
    costpointNative: 'Validation rules on data entry; no visual workflow guidance at operator level',
    costpointWithIntegration: 'Workflow tools add task routing but not shop-floor visual guidance',
    epochNative: 'Department workflow rules, traveler scanning, and status guard rails enforced at UI level',
    editorialEpochState: 'STRONG',
    gapSeverity: 'LOW',
    fixEffort: 'Low',
    executiveAdvantage: 'EPOCH visual workflow enforcement prevents violations before they happen — Costpoint acts on violations after the fact',
  },
];

// ---------------------------------------------------------------------------
// Recommendation builder — executive-facing, truth-forward
// ---------------------------------------------------------------------------
function buildRecommendation(
  domainScoreMap: Record<string, number>,
  compositeScore: number | null,
  activeRedFlagCount: number,
): string {
  const tk  = domainScoreMap['TIMEKEEPING']  ?? null;
  const cc  = domainScoreMap['CHARGE_CODE']  ?? null;
  const acc = domainScoreMap['ACCOUNTING']   ?? null;
  const pro = domainScoreMap['PROCUREMENT']  ?? null;
  const inv = domainScoreMap['INVENTORY']    ?? null;

  const sentences: string[] = [];

  // Opening — composite assessment
  if (compositeScore !== null) {
    if (compositeScore >= 80) {
      sentences.push(`EPOCH's overall compliance posture is rated ${compositeScore.toFixed(0)}/100 by EDRI — above the 80-point Conditionally Passable threshold.`);
    } else if (compositeScore >= 65) {
      sentences.push(`EPOCH's overall EDRI composite score is ${compositeScore.toFixed(0)}/100 — in the High Risk band, indicating meaningful gaps that require attention before a live DCAA audit.`);
    } else {
      sentences.push(`EPOCH's current EDRI composite score is ${compositeScore.toFixed(0)}/100 — below the 65-point threshold. Material control deficiencies exist that represent active DCAA audit risk.`);
    }
  }

  // TIMEKEEPING + CHARGE_CODE assessment
  const tkAvg = (tk !== null && cc !== null) ? (tk + cc) / 2 : (tk ?? cc);
  if (tkAvg !== null) {
    if (tkAvg >= 80) {
      sentences.push(`Timekeeping and charge code controls are performing well (avg ${tkAvg.toFixed(0)}/100) — EPOCH already leads Costpoint in real-time labor capture and punch-level audit granularity.`);
    } else if (tkAvg >= 65) {
      sentences.push(`Timekeeping controls are partially effective (avg ${tkAvg.toFixed(0)}/100); active red flags or stale approvals are reducing the score and should be resolved before any audit engagement.`);
    } else {
      sentences.push(`Timekeeping controls are materially weak (avg ${tkAvg.toFixed(0)}/100). Costpoint is likely safer in this area today until EPOCH's timekeeping compliance posture improves.`);
    }
  }

  // ACCOUNTING assessment
  if (acc !== null) {
    if (acc >= 80) {
      sentences.push(`Accounting controls are adequate (${acc.toFixed(0)}/100).`);
    } else {
      sentences.push(`Accounting infrastructure scores ${acc.toFixed(0)}/100 — Costpoint retains a meaningful advantage in cost accounting, indirect rate management, and ICE submission readiness today.`);
    }
  }

  // PROCUREMENT assessment
  if (pro !== null) {
    if (pro >= 80) {
      sentences.push(`Procurement controls are functional (${pro.toFixed(0)}/100).`);
    } else {
      sentences.push(`Procurement controls score ${pro.toFixed(0)}/100 — three-way match and ODC pre-approval remain gaps where Costpoint currently leads.`);
    }
  }

  // INVENTORY — EPOCH's strength signal
  if (inv !== null && inv >= 80) {
    sentences.push(`Inventory traceability is a native EPOCH strength (${inv.toFixed(0)}/100) — lot-level tracking exceeds Costpoint granularity for custom manufacturing environments.`);
  }

  // Active red flag count
  if (activeRedFlagCount > 0) {
    sentences.push(`${activeRedFlagCount} active EDRI red flag${activeRedFlagCount !== 1 ? 's' : ''} require resolution before this matrix can be presented to a DCAA auditor with confidence.`);
  }

  // Closing — GFP and known editorial gaps
  sentences.push(
    `Government Property Accountability remains an unscored gap — GFP domain scoring has not been implemented and Costpoint leads here until EPOCH commits a roadmap item to close it.`
  );

  return sentences.join(' ');
}

// ---------------------------------------------------------------------------
// Sub-components (unchanged from v1)
// ---------------------------------------------------------------------------
function SeverityBadge({ severity }: { severity: GapSeverity }) {
  const map: Record<GapSeverity, string> = {
    CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    HIGH:     'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
    MEDIUM:   'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    LOW:      'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${map[severity]}`}>
      {severity}
    </span>
  );
}

function EffortBadge({ effort }: { effort: FixEffort }) {
  const map: Record<FixEffort, string> = {
    Low:    'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    High:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${map[effort]}`}>
      {effort}
    </span>
  );
}

function EpochStateBadge({ state }: { state: EpochState }) {
  const cfg = BAND_CONFIG[state];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

const LEGEND_ITEMS = [
  { key: 'STRONG',   desc: 'Native capability — no gap' },
  { key: 'ADEQUATE', desc: 'Functional — minor gaps only' },
  { key: 'PARTIAL',  desc: 'Present but incomplete' },
  { key: 'WEAK',     desc: 'Minimal — significant gap' },
  { key: 'NONE',     desc: 'Not implemented' },
] as const;

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------
export default function EdriExecutiveMatrix() {
  // Single query — snapshot/latest carries domainScores + redFlags + remediationItems
  const { data: snapshotData, isLoading } = useQuery<any>({
    queryKey: ['/api/edri/snapshot/latest'],
  });

  // ---------------------------------------------------------------------------
  // Derived state from live data
  // ---------------------------------------------------------------------------
  const compositeScore: number | null =
    snapshotData?.snapshot?.compositeScore != null
      ? Number(snapshotData.snapshot.compositeScore)
      : null;

  // Build a fast lookup map: domainKey → rawScore (as number)
  const domainScoreMap: Record<string, number> = {};
  if (snapshotData?.domainScores) {
    for (const ds of snapshotData.domainScores as Array<{ domainKey: string; rawScore: unknown }>) {
      domainScoreMap[ds.domainKey] = Number(ds.rawScore);
    }
  }

  const activeRedFlags: any[] = (snapshotData?.redFlags ?? []).filter((f: any) => f.isActive);
  const openRemItems: any[] = (snapshotData?.remediationItems ?? []).filter((r: any) => r.status === 'OPEN');

  const snapshotComputedAt: string | null = snapshotData?.snapshot?.computedAt ?? null;

  // Resolve the live EpochState for each row.
  // Returns null for editorial rows → falls back to editorialEpochState at render time.
  function resolveRowState(requirement: string): EpochState | null {
    const score = computeRowScore(requirement, domainScoreMap, compositeScore);
    if (score === null) return null;
    return domainScoreToState(score);
  }

  // ---------------------------------------------------------------------------
  // Dynamic KPI counts
  // ---------------------------------------------------------------------------
  // gapSeverity is editorial and not changed by live data
  const criticalCount = MATRIX_DATA.filter(r => r.gapSeverity === 'CRITICAL').length;
  const highCount     = MATRIX_DATA.filter(r => r.gapSeverity === 'HIGH').length;

  // strongCount and epochAdvantageCount use live state when available
  const strongCount = MATRIX_DATA.filter(r => {
    const live = isLoading ? null : resolveRowState(r.requirement);
    const state = live ?? r.editorialEpochState;
    return state === 'STRONG';
  }).length;

  const epochAdvantageCount = MATRIX_DATA.filter(r => {
    const live = isLoading ? null : resolveRowState(r.requirement);
    const state = live ?? r.editorialEpochState;
    return state === 'STRONG' || state === 'ADEQUATE';
  }).length;

  const liveBackedCount = MATRIX_DATA.filter(r => ROW_DOMAIN_MAP[r.requirement]?.isLiveBacked).length;

  // ---------------------------------------------------------------------------
  // Recommendation text
  // ---------------------------------------------------------------------------
  const recommendationText = isLoading || compositeScore === null
    ? null
    : buildRecommendation(domainScoreMap, compositeScore, activeRedFlags.length);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6 space-y-6 max-w-full mx-auto">
      <EdriSubNav />

      {/* Page header */}
      <div className="flex items-start gap-4">
        <Crown className="h-9 w-9 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="text-3xl font-bold">Executive Readiness Matrix</h1>
          <p className="text-muted-foreground mt-1">
            Leadership-level assessment: should EPOCH be trusted over Costpoint for operational control, PM execution, and audit defensibility?
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {isLoading ? (
              <Badge variant="outline" className="text-xs">Loading live data…</Badge>
            ) : compositeScore !== null ? (
              <Badge variant="outline" className="text-xs border-green-500 text-green-700 dark:text-green-400 flex items-center gap-1">
                <Wifi className="h-3 w-3" />
                Live EDRI Data — {liveBackedCount}/19 rows scored
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">No EDRI snapshot available</Badge>
            )}
            <Badge variant="outline" className="text-amber-600 border-amber-400 text-xs">EXECUTIVE VIEW</Badge>
          </div>
        </div>
      </div>

      {/* Executive summary card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-base">
              <ShieldCheck className="h-5 w-5" />
              EDRI (Existing Dashboard)
            </CardTitle>
            <CardDescription className="text-blue-600 dark:text-blue-400">
              EPOCH DCAA Readiness Index
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-blue-800 dark:text-blue-200 space-y-2">
            <p className="font-medium">Question answered: "Would we survive a DCAA audit today?"</p>
            <ul className="space-y-1 text-blue-700 dark:text-blue-300 text-xs">
              <li>• Scores EPOCH compliance posture across 6 domains</li>
              <li>• Surfaces active red flags, forensic violations, and remediation items</li>
              <li>• Tracks composite score trending over time</li>
              <li>• Audience: Compliance team, internal auditors, DCAA prep staff</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-base">
              <Crown className="h-5 w-5" />
              Executive Readiness Matrix (This Page)
            </CardTitle>
            <CardDescription className="text-amber-600 dark:text-amber-400">
              Leadership Trust Assessment
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-amber-800 dark:text-amber-200 space-y-2">
            <p className="font-medium">Question answered: "Should leadership trust EPOCH over Costpoint?"</p>
            <ul className="space-y-1 text-amber-700 dark:text-amber-300 text-xs">
              <li>• Compares EPOCH vs. Costpoint on 19 operational + compliance dimensions</li>
              <li>• Current EPOCH State is live-derived from EDRI for {liveBackedCount} of 19 rows</li>
              <li>• 1 row (Government Property) remains editorial — EDRI domain not yet scored</li>
              <li>• Audience: Leadership team, program executives, CFO, DCAA-facing leadership</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Critical Gaps</p>
            <p className="text-3xl font-bold text-red-600 dark:text-red-400">{criticalCount}</p>
            <p className="text-xs text-muted-foreground mt-1">require immediate investment</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">High Gaps</p>
            <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{highCount}</p>
            <p className="text-xs text-muted-foreground mt-1">require near-term roadmap</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">EPOCH Strong</p>
            {isLoading ? (
              <Skeleton className="h-9 w-12 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">{strongCount}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              dimensions — native capability{compositeScore !== null ? ' (live)' : ''}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">EPOCH Advantage</p>
            {isLoading ? (
              <Skeleton className="h-9 w-12 mt-1" />
            ) : (
              <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{epochAdvantageCount}</p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              of 19 dimensions — at or above parity{compositeScore !== null ? ' (live)' : ''}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live EDRI snapshot summary — only shown when data is available */}
      {!isLoading && compositeScore !== null && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">EDRI Composite</p>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{compositeScore.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">live snapshot score</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Active Red Flags</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{activeRedFlags.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">open EDRI violations</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200 dark:border-orange-800">
            <CardContent className="pt-4 pb-3">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Open Remediations</p>
              <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{openRemItems.length}</p>
              <p className="text-xs text-muted-foreground mt-0.5">items in remediation queue</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Scoring legend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Current EPOCH State — Color Legend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {LEGEND_ITEMS.map(({ key, desc }) => {
              const cfg = BAND_CONFIG[key];
              return (
                <div key={key} className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
                    {cfg.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{desc}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground font-medium w-full">Score breakpoints (live rows): ≥90 Strong · ≥80 Adequate · ≥65 Partial · ≥50 Weak · &lt;50 None</p>
            <p className="text-xs text-muted-foreground font-medium w-full">Gap Severity:</p>
            {(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as GapSeverity[]).map(s => (
              <div key={s} className="flex items-center gap-1.5">
                <SeverityBadge severity={s} />
              </div>
            ))}
            <p className="text-xs text-muted-foreground font-medium w-full mt-1">Fix Effort:</p>
            {(['Low', 'Medium', 'High'] as FixEffort[]).map(e => (
              <div key={e} className="flex items-center gap-1.5">
                <EffortBadge effort={e} />
              </div>
            ))}
            <div className="flex items-center gap-3 w-full mt-1 pt-1 border-t">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  <Wifi className="h-2.5 w-2.5" /> LIVE
                </span>
                <span className="text-xs text-muted-foreground">state derived from EDRI domain score</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-dashed border-gray-400">
                  EDITORIAL
                </span>
                <span className="text-xs text-muted-foreground">expert assessment — EDRI domain not yet scored</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matrix table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            19-Dimension Comparison Matrix
          </CardTitle>
          <CardDescription>
            EPOCH vs. Costpoint across all compliance control areas — Current EPOCH State is live-derived from EDRI for {liveBackedCount}/19 rows; 1 row remains editorial
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="w-full">
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left p-3 border font-semibold min-w-[160px]">Requirement</th>
                    <th className="text-left p-3 border font-semibold min-w-[180px]">Why It Matters</th>
                    <th className="text-left p-3 border font-semibold min-w-[160px]">Costpoint Native</th>
                    <th className="text-left p-3 border font-semibold min-w-[160px]">Costpoint + Integration</th>
                    <th className="text-left p-3 border font-semibold min-w-[160px]">EPOCH Native</th>
                    <th className="text-center p-3 border font-semibold min-w-[130px]">Current EPOCH State</th>
                    <th className="text-center p-3 border font-semibold min-w-[100px]">Gap Severity</th>
                    <th className="text-center p-3 border font-semibold min-w-[90px]">Fix Effort</th>
                    <th className="text-left p-3 border font-semibold min-w-[200px]">Executive Advantage</th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX_DATA.map((row, i) => {
                    const mapping = ROW_DOMAIN_MAP[row.requirement];
                    const isLive = mapping?.isLiveBacked ?? false;
                    const liveState: EpochState | null = isLive && !isLoading
                      ? resolveRowState(row.requirement)
                      : null;
                    const displayState: EpochState = liveState ?? row.editorialEpochState;

                    return (
                      <tr
                        key={i}
                        className={`hover:bg-muted/40 transition-colors ${!isLive ? 'bg-muted/20' : ''}`}
                      >
                        <td className="p-3 border font-semibold text-foreground align-top">
                          {row.requirement}
                        </td>
                        <td className="p-3 border text-muted-foreground align-top leading-relaxed">
                          {row.whyItMatters}
                        </td>
                        <td className="p-3 border text-muted-foreground align-top leading-relaxed">
                          {row.costpointNative}
                        </td>
                        <td className="p-3 border text-muted-foreground align-top leading-relaxed">
                          {row.costpointWithIntegration}
                        </td>
                        <td className="p-3 border text-muted-foreground align-top leading-relaxed">
                          {row.epochNative}
                        </td>
                        <td className="p-3 border text-center align-top">
                          {isLoading && isLive ? (
                            <Skeleton className="h-5 w-16 mx-auto" />
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <EpochStateBadge state={displayState} />
                              {isLive ? (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 leading-none">
                                  <Wifi className="h-2 w-2" /> LIVE
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border border-dashed border-gray-400 leading-none">
                                  EDITORIAL
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-3 border text-center align-top">
                          <SeverityBadge severity={row.gapSeverity} />
                        </td>
                        <td className="p-3 border text-center align-top">
                          <EffortBadge effort={row.fixEffort} />
                        </td>
                        <td className="p-3 border align-top">
                          <p className="text-foreground leading-relaxed">{row.executiveAdvantage}</p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Recommendation panel */}
      <Card className="border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950">
        <CardContent className="pt-6 pb-6">
          <div className="flex items-start gap-4">
            <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-green-800 dark:text-green-200">Executive Recommendation</h3>
              {isLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full max-w-2xl" />
                  <Skeleton className="h-4 w-4/5 max-w-xl" />
                  <Skeleton className="h-4 w-3/5 max-w-lg" />
                </div>
              ) : recommendationText ? (
                <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed max-w-4xl">
                  {recommendationText}
                </p>
              ) : (
                <p className="text-sm text-green-700 dark:text-green-300 leading-relaxed max-w-4xl">
                  EPOCH can exceed Costpoint in operational truth if identified control gaps are closed.
                  EPOCH already leads on real-time labor visibility, lot-level inventory traceability, forensic compliance scanning,
                  floor-check readiness, and visual workflow enforcement — all areas where Costpoint requires expensive add-ons or custom development.
                  Critical investment priorities are: ICE submission readiness, indirect rate management, government property accountability,
                  and travel pre-approval workflow. Closing these four gaps converts EPOCH from an operationally superior platform
                  into a fully DCAA-defensible system without Costpoint dependency.
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                  {strongCount} Dimensions — EPOCH Leads
                </Badge>
                <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
                  {criticalCount} Critical Gaps — Investment Required
                </Badge>
                <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs">
                  {highCount} High Gaps — Near-Term Roadmap
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer note */}
      <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50 border text-xs text-muted-foreground">
        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1">
          <p>
            <strong>Data sources:</strong> Current EPOCH State for {liveBackedCount}/19 rows is derived from the latest EDRI snapshot
            {snapshotComputedAt ? ` (computed ${new Date(snapshotComputedAt).toLocaleString()})` : ''}.
            The Government Property Accountability row remains an editorial expert assessment —
            the GOVT_PROPERTY domain is defined in EDRI but carries no scoring weight until GFP module development is prioritized.
          </p>
          <p>
            <strong>Proxy rows:</strong> Some live-backed rows use their domain's aggregate score as a proxy
            (e.g., Accounting domain score for ICE submission readiness; Procurement domain for Travel &amp; ODC).
            These are marked LIVE but may not reflect the full nuance of each specific control area.
          </p>
          <p>
            All Costpoint capability descriptions reflect standard Costpoint 8.x baseline; integration capabilities vary by contract.
          </p>
        </div>
      </div>
    </div>
  );
}
