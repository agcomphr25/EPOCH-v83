import { z } from 'zod';

// Action Types
export const BADGE_ACTION_TYPES = {
  P1_DEPARTMENT_PROGRESS: 'P1_DEPARTMENT_PROGRESS',
  P2_DEPARTMENT_PROGRESS: 'P2_DEPARTMENT_PROGRESS',
  QUICK_NAVIGATION: 'QUICK_NAVIGATION',
  CLOCK_IN_OUT: 'CLOCK_IN_OUT',
} as const;

export type BadgeActionType = typeof BADGE_ACTION_TYPES[keyof typeof BADGE_ACTION_TYPES];

// Action Config Schemas
export const p1DepartmentProgressConfigSchema = z.object({
  fromDepartment: z.string(),
  toDepartment: z.string(),
});

export const p2DepartmentProgressConfigSchema = z.object({
  departmentName: z.string(),
});

export const quickNavigationConfigSchema = z.object({
  targetPage: z.string(),
});

export const clockInOutConfigSchema = z.object({
  autoDetect: z.boolean().default(true),
});

// Discriminated Union for Action Config
export const badgeActionConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal(BADGE_ACTION_TYPES.P1_DEPARTMENT_PROGRESS),
    config: p1DepartmentProgressConfigSchema,
  }),
  z.object({
    type: z.literal(BADGE_ACTION_TYPES.P2_DEPARTMENT_PROGRESS),
    config: p2DepartmentProgressConfigSchema,
  }),
  z.object({
    type: z.literal(BADGE_ACTION_TYPES.QUICK_NAVIGATION),
    config: quickNavigationConfigSchema,
  }),
  z.object({
    type: z.literal(BADGE_ACTION_TYPES.CLOCK_IN_OUT),
    config: clockInOutConfigSchema,
  }),
]);

export type BadgeActionConfig = z.infer<typeof badgeActionConfigSchema>;

// Human-readable labels
export const ACTION_TYPE_LABELS: Record<BadgeActionType, string> = {
  [BADGE_ACTION_TYPES.P1_DEPARTMENT_PROGRESS]: 'Progress P1 Orders Between Departments',
  [BADGE_ACTION_TYPES.P2_DEPARTMENT_PROGRESS]: 'Progress P2 Items in Department',
  [BADGE_ACTION_TYPES.QUICK_NAVIGATION]: 'Quick Navigate to Page',
  [BADGE_ACTION_TYPES.CLOCK_IN_OUT]: 'Clock In/Out',
};

// Department options
export const P1_DEPARTMENTS = [
  'P1 Production Queue',
  'Barcode',
  'Layup/Plugging',
  'CNC',
  'Finish',
  'Finish QC',
  'Gunsmith',
  'Paint',
  'Shipping QC',
];

export const P2_DEPARTMENTS = [
  'P2 Production Queue',
  'Receiving',
  'Inspection',
  'Assembly',
  'Testing',
  'Packaging',
  'Shipping',
];

export const NAVIGATION_PAGES = [
  { value: '/dashboard', label: 'Dashboard' },
  { value: '/orders', label: 'Orders List' },
  { value: '/production-queue', label: 'Production Queue' },
  { value: '/p2-department-manager', label: 'P2 Department Manager' },
  { value: '/cutting-table', label: 'Cutting Table' },
  { value: '/employee-portal', label: 'Employee Portal' },
];
