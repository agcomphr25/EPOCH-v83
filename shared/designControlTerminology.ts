export const DESIGN_CONTROL_TERMINOLOGY = {
  AS9100: 'Aerospace Quality Management System Standard',
  BOM: 'Bill of Materials',
  CAD: 'Computer-Aided Design',
  CDR: 'Critical Design Review',
  DHF: 'Design History File',
  DR: 'Design Review',
  ECN: 'Engineering Change Notice',
  ECR: 'Engineering Change Request',
  FAI: 'First Article Inspection',
  MDR: 'Master Document Register',
  NCR: 'Nonconformance Report',
  P1: 'Production Line 1',
  P2: 'Production Line 2',
  PDR: 'Preliminary Design Review',
  PRR: 'Production Readiness Review',
  QMS: 'Quality Management System',
  SOW: 'Statement of Work',
  TRR: 'Test Readiness Review',
  UAS: 'Unmanned Aircraft System',
  WIP: 'Work in Process',
} as const;

export type DesignControlAcronym = keyof typeof DESIGN_CONTROL_TERMINOLOGY;

export function expandDesignControlTerm(term: DesignControlAcronym) {
  return `${term} (${DESIGN_CONTROL_TERMINOLOGY[term]})`;
}

export const DESIGN_CONTROL_UNITS = {
  kts: 'knots',
  hrs: 'hours',
  ft: 'feet',
  nm: 'nautical miles',
} as const;
