import type { ManufacturedCategory, SupplySourceDashboard } from '@shared/schema';

export const MANUFACTURED_CATEGORY_ORDER: ManufacturedCategory[] = [
  'PACKET',
  'FOAM_CUTTING',
  'THREE_D_PRINTING_CUTTING',
  'KIT',
  'MACHINED_PART',
  'CORE',
  'SUB_ASSEMBLY',
  'ASSEMBLY',
  'FINAL_ASSEMBLY',
  'COMPOSITE',
  'COMPONENT',
];

export const CATEGORY_DISPLAY_NAMES: Record<ManufacturedCategory, string> = {
  PACKET: 'Packet',
  FOAM_CUTTING: 'Foam Cutting',
  THREE_D_PRINTING_CUTTING: '3d Printing/Cutting',
  KIT: 'Kitting',
  MACHINED_PART: 'Machined Part',
  CORE: 'Core',
  SUB_ASSEMBLY: 'Sub-Assembly',
  ASSEMBLY: 'Assembly',
  FINAL_ASSEMBLY: 'Final Assembly',
  COMPOSITE: 'Composite',
  COMPONENT: 'Component',
};

export const DASHBOARD_DISPLAY_NAMES: Record<SupplySourceDashboard, string> = {
  CUTTING_TABLE: 'Cutting Table',
  KITTING: 'Kitting',
  CNC: 'CNC',
  CORE: 'Core',
  SUB_ASSEMBLY: 'Sub-Assembly',
  ASSEMBLY: 'Assembly',
  FINAL_ASSEMBLY: 'Final Assembly',
  LAYUP: 'Layup',
};
