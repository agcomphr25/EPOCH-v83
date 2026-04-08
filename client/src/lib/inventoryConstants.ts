import type { ManufacturedCategory, SupplySourceDashboard } from '@shared/schema';

export const MANUFACTURED_CATEGORY_ORDER: ManufacturedCategory[] = [
  'PACKET',
  'KIT',
  'MACHINED_PART',
  'CORE',
  'SUB_ASSEMBLY',
  'ASSEMBLY',
  'COMPOSITE',
  'COMPONENT',
];

export const CATEGORY_DISPLAY_NAMES: Record<ManufacturedCategory, string> = {
  PACKET: 'Packet',
  KIT: 'Kitting',
  MACHINED_PART: 'Machined Part',
  CORE: 'Core',
  SUB_ASSEMBLY: 'Sub-Assembly',
  ASSEMBLY: 'Assembly',
  COMPOSITE: 'Composite',
  COMPONENT: 'Component',
};

export const DASHBOARD_DISPLAY_NAMES: Record<SupplySourceDashboard, string> = {
  CUTTING_TABLE: 'Cutting Table',
  CNC: 'CNC',
  CORE: 'Core',
  ASSEMBLY: 'Assembly',
};
