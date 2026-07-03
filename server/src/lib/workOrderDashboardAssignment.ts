export interface WorkOrderDashboardAssignmentInput {
  department?: string | null;
  departments?: Array<string | null | undefined> | null;
  queueType?: string | null;
  dashboardType?: string | null;
  assignedDepartment?: string | null;
  assignedDashboardRoute?: string | null;
  wizardData?: unknown;
  departmentBudgets?: unknown;
}

export interface WorkOrderDashboardAssignment {
  dashboardType: string;
  queueType: string;
  assignedDepartment: string;
  assignedDashboardRoute: string;
  dashboardLabel: string;
}

const DASHBOARD_ROUTES = new Set([
  '/cutting-control-center',
  '/kits-queue',
  '/layup-queue',
  '/core-queue',
  '/sub-assembly-queue',
  '/assembly-queue',
  '/manufacturing-queue',
  '/cnc-dashboard',
  '/cnc-queue',
  '/finish-queue',
  '/qc-shipping-queue',
  '/shipping-queue',
]);

function normalizeKey(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

function titleCase(value: string): string {
  return value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeWizardData(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return normalizeWizardData(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (typeof value !== 'object' || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  const nested = data.wizardData ?? data.wizard_data;
  if (nested && nested !== data) {
    const normalizedNested = normalizeWizardData(nested);
    if (Object.keys(normalizedNested).length > 0) return normalizedNested;
  }
  return data;
}

function collectDepartments(input: WorkOrderDashboardAssignmentInput): string[] {
  const values: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
  };

  push(input.assignedDepartment);
  push(input.department);
  push(input.queueType);
  push(input.dashboardType);
  input.departments?.forEach(push);

  const wizardData = normalizeWizardData(input.wizardData);
  const step8 = normalizeWizardData(wizardData.step8);
  const step2 = normalizeWizardData(wizardData.step2);
  push(step8.bottleneckDepartment);
  if (Array.isArray(step2.departments)) step2.departments.forEach(push);

  const budgets = input.departmentBudgets;
  if (budgets && typeof budgets === 'object' && !Array.isArray(budgets)) {
    Object.keys(budgets as Record<string, unknown>).forEach(push);
  }

  return values;
}

function assignmentForDepartment(rawDepartment: string | null | undefined): WorkOrderDashboardAssignment {
  const normalized = normalizeKey(rawDepartment);

  if (normalized.includes('cutting') || normalized === 'cut' || normalized.includes('cuttable')) {
    return {
      dashboardType: 'CUTTING',
      queueType: 'CUTTING',
      assignedDepartment: 'Cutting',
      assignedDashboardRoute: '/cutting-control-center',
      dashboardLabel: 'Cutting Control Center',
    };
  }

  if (normalized.includes('kitting') || normalized === 'kit' || normalized.includes('kits')) {
    return {
      dashboardType: 'KITTING',
      queueType: 'KIT',
      assignedDepartment: 'Kitting',
      assignedDashboardRoute: '/kits-queue',
      dashboardLabel: 'Kits Queue',
    };
  }

  if (normalized.includes('layup') || normalized.includes('lay')) {
    return {
      dashboardType: 'LAYUP',
      queueType: 'LAYUP',
      assignedDepartment: 'Layup',
      assignedDashboardRoute: '/layup-queue',
      dashboardLabel: 'Layup Queue',
    };
  }

  if (normalized.includes('core')) {
    return {
      dashboardType: 'CORE',
      queueType: 'CORE',
      assignedDepartment: 'Core',
      assignedDashboardRoute: '/core-queue',
      dashboardLabel: 'Core Queue',
    };
  }

  if (normalized.includes('subassembly') || normalized.includes('subassy') || normalized.includes('subassembl')) {
    return {
      dashboardType: 'SUB_ASSEMBLY',
      queueType: 'SUB_ASSEMBLY',
      assignedDepartment: 'Sub Assembly',
      assignedDashboardRoute: '/sub-assembly-queue',
      dashboardLabel: 'Sub Assembly Queue',
    };
  }

  if (normalized.includes('finalassembly') || normalized.includes('finalassy')) {
    return {
      dashboardType: 'FINAL_ASSEMBLY',
      queueType: 'FINAL_ASSEMBLY',
      assignedDepartment: 'Assembly',
      assignedDashboardRoute: '/assembly-queue',
      dashboardLabel: 'Final Assembly Swimlane',
    };
  }

  if (normalized.includes('assembly') || normalized === 'assy') {
    return {
      dashboardType: 'ASSEMBLY',
      queueType: 'ASSEMBLY',
      assignedDepartment: 'Assembly',
      assignedDashboardRoute: '/assembly-queue',
      dashboardLabel: 'Assembly Queue',
    };
  }

  if (normalized.includes('cnc') || normalized.includes('machine') || normalized.includes('machining')) {
    return {
      dashboardType: 'CNC',
      queueType: 'CNC',
      assignedDepartment: 'CNC',
      assignedDashboardRoute: '/cnc-dashboard',
      dashboardLabel: 'CNC Dashboard',
    };
  }

  if (normalized.includes('finish') || normalized.includes('paint') || normalized.includes('coating')) {
    return {
      dashboardType: 'FINISH',
      queueType: 'FINISH',
      assignedDepartment: 'Finish',
      assignedDashboardRoute: '/finish-queue',
      dashboardLabel: 'Finish Queue',
    };
  }

  if (normalized.includes('shipping') || normalized === 'ship') {
    return {
      dashboardType: 'SHIPPING',
      queueType: 'SHIPPING',
      assignedDepartment: 'Shipping',
      assignedDashboardRoute: '/shipping-queue',
      dashboardLabel: 'Shipping Queue',
    };
  }

  if (normalized.includes('qc') || normalized.includes('quality') || normalized.includes('inspection')) {
    return {
      dashboardType: 'QC',
      queueType: 'QC',
      assignedDepartment: 'QC',
      assignedDashboardRoute: '/qc-shipping-queue',
      dashboardLabel: 'QC / Shipping Queue',
    };
  }

  return {
    dashboardType: 'MANUFACTURING',
    queueType: 'MANUFACTURING',
    assignedDepartment: rawDepartment?.trim() ? titleCase(rawDepartment.trim()) : 'Manufacturing',
    assignedDashboardRoute: '/manufacturing-queue',
    dashboardLabel: 'Manufacturing Queue',
  };
}

export function assignDashboardForWorkOrder(input: WorkOrderDashboardAssignmentInput): WorkOrderDashboardAssignment {
  if (input.assignedDashboardRoute && DASHBOARD_ROUTES.has(input.assignedDashboardRoute)) {
    const stored = assignmentForDepartment(input.assignedDepartment ?? input.queueType ?? input.dashboardType);
    return {
      ...stored,
      dashboardType: input.dashboardType?.trim() || stored.dashboardType,
      queueType: input.queueType?.trim() || stored.queueType,
      assignedDepartment: input.assignedDepartment?.trim() || stored.assignedDepartment,
      assignedDashboardRoute: input.assignedDashboardRoute,
    };
  }

  const departments = collectDepartments(input);
  const preferredDepartment = departments.find((dept) => assignmentForDepartment(dept).dashboardType !== 'MANUFACTURING')
    ?? departments[0]
    ?? null;
  return assignmentForDepartment(preferredDepartment);
}
