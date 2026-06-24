// Shared types for the CNC Dashboard feature

export interface CncMachine {
  id: number;
  machineName: string;
  machineNumber: string | null;
  workCenter: string | null;
  capabilities: unknown | null;
  axisCapabilities: string[] | null;
  machineType: string | null;
  maxLengthIn: number | null;
  maxHeightIn: number | null;
  active: boolean;
  createdAt: string;
  useDefaultSchedule: boolean;
  customDaysPerWeek: number | null;
  customHoursPerDay: number | null;
  customWeeklyCapacityHours: number | null;
}

export type CncMachineType = 'Mill' | 'Lathe' | 'Other';
export const CNC_MACHINE_TYPES: CncMachineType[] = ['Mill', 'Lathe', 'Other'];
export const CNC_AXIS_OPTIONS = ['3-Axis', '4-Axis', '5-Axis', 'Lathe', 'Turn-Mill', 'Router'] as const;

export interface MachinedPartRouting {
  id: number;
  inventoryItemId: string;
  routingName: string;
  partNumber: string | null;
  partName: string | null;
  notes: string | null;
  createdByDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MachinedPartRoutingOp {
  id: number;
  routingId: number;
  opNumber: number;
  opName: string;
  machineType: string | null;
  preferredMachineId: number | null;
  programNames: string[];
  toolList: { toolNumber: string; pocket: string; description: string; diameter: string; offsetNotes: string }[];
  fixtureInstructions: string | null;
  workOriginNotes: string | null;
  qcTolerances: { characteristic: string; nominal: string; tolerance: string; method: string }[];
  referencePhotoLinks: { url: string; caption: string }[];
  tips: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface MachineUtilization {
  machine: string;
  totalJobs: number;
  activeJobs: number;
  pendingHours: number;
  totalHours: number;
}

export interface CncScheduleSettings {
  id: number | null;
  name: string;
  scheduleType: 'FOUR_TEN' | 'FIVE_EIGHT' | 'CUSTOM';
  daysPerWeek: number;
  hoursPerDay: number;
  weeklyCapacityHours: number;
  isDefault: boolean;
}

export interface MachineLoadSummary {
  machineId: number;
  machineName: string;
  machineType: string | null;
  axisCapabilities: string[] | null;
  weeklyCapacityHours: number;
  scheduledHours: number;
  remainingHours: number;
  utilizationPct: number;
  overloaded: boolean;
  useDefaultSchedule: boolean;
  customDaysPerWeek: number | null;
  customHoursPerDay: number | null;
}

export interface TravelerInfo {
  id: string;
  travelerNumber: string;
  status: string;
  partName: string | null;
  partNumber: string | null;
  workOrderId: string | null;
  productionWorkOrderId: string | null;
  quantity: number | null;
  currentStepId: string | null;
  currentStepDept: string | null;
  currentStepStatus: string | null;
  currentStepNumber: number | null;
}

export interface EmployeeOption {
  id: number;
  name: string;
  preferredName?: string | null;
  employeeCode?: string | null;
  department?: string | null;
  employmentStatus?: string | null;
  isActive?: boolean | null;
}

export interface CncOperationBatch {
  id: number;
  workOrderId: string;
  workOrderNumber: string;
  partNumber: string | null;
  partName: string | null;
  travelerStepId: string;
  travelerStepNumber: number;
  travelerStepDepartment: string;
  travelerId: string;
  travelerNumber: string;
  operationId: number | null;
  operationSequence: number | null;
  operationName: string | null;
  batchCode: string;
  batchNumber: number;
  batchQty: number;
  qtyCompleted: number;
  qtyScrapped: number;
  assignedMachineId: number | null;
  assignedMachineName: string | null;
  assignedEmployeeId: number | null;
  assignedEmployeeDisplayName: string | null;
  status: 'queued' | 'assigned' | 'in_progress' | 'hold' | 'completed' | 'cancelled' | string;
  barcodeValue: string;
  priority: 'critical' | 'high' | 'medium' | 'low' | string;
  dueDate: string | null;
  notes: string | null;
  createdByUserId: number | null;
  createdByDisplayName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CncJob {
  id: number;
  workOrder: string;
  partNumber: string;
  partName: string;
  revision: string | null;
  qty: number;
  machine: string | null;
  programmerUserId: number | null;
  programmerDisplayName: string | null;
  assignedOperatorUserId: number | null;
  assignedOperatorDisplayName: string | null;
  dueDate: string | null;
  estimatedHours: number | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: string;
  linkedTravelerId: string | null;
  linkedTravelerStepId: string | null;
  customerPo: string | null;
  materialReady: boolean;
  qcHold: boolean;
  notes: string | null;
  forwardDestination: string | null;
  completedAt: string | null;
  createdAt: string;
  // Joined summary counts from backend aggregation
  totalOps: number;
  completedOps: number;
}

export interface CncJobOperation {
  id: number;
  jobId: number;
  sequence: number;
  opName: string;
  opDescription: string | null;
  standardLaborMinutes: number | null;
  machine: string | null;
  estimatedSetupMinutes: number | null;
  estimatedCycleMinutes: number | null;
  status: string;
  ncProgramRef: string | null;
  qcPlan: string | null;
  fixture: string | null;
  workRefPoint: string | null;
  rawStockOrientation: string | null;
  datumNotes: string | null;
  warmupNotes: string | null;
  tribalKnowledge: string | null;
  actualSetupStartAt: string | null;
  actualSetupEndAt: string | null;
  actualRunStartAt: string | null;
  actualRunEndAt: string | null;
  partCount: number;
  scrapQty: number;
  pauseReason: string | null;
  proveoutCompleted: boolean;
  claimedByUserId: number | null;
  claimedByDisplayName: string | null;
  signedOffByUserId: number | null;
  signedOffByDisplayName: string | null;
  operatorNotes: string | null;
  completedAt: string | null;
}

export interface CncProgram {
  id: number;
  operationId: number;
  programName: string;
  programNumber: string | null;
  version: string | null;
  machine: string | null;
  estimatedCycleMinutes: number | null;
  proveOutRequired: boolean;
  approvedByDisplayName: string | null;
  approvedAt: string | null;
  notes: string | null;
}

export interface CncToolList {
  id: number;
  operationId: number;
  toolNumber: string;
  holderPosition: string | null;
  toolName: string;
  diameter: number | null;
  offsetNotes: string | null;
  replacementNotes: string | null;
  imageUrl: string | null;
  sortOrder: number;
}

export interface CncSetupPhoto {
  id: number;
  operationId: number;
  category: string;
  url: string;
  storageKey: string | null;
  caption: string | null;
  uploadedByDisplayName: string | null;
  createdAt: string;
}

export interface CncQcCheckpoint {
  id: number;
  operationId: number;
  name: string;
  characteristic: string | null;
  nominal: string | null;
  tolerance: string | null;
  method: string | null;
  frequency: string | null;
  required: boolean;
  photoRequired: boolean;
  signatureRequired: boolean;
  sortOrder: number;
}

export interface CncQcResult {
  id: number;
  checkpointId: number;
  operationId: number;
  result: 'pass' | 'fail' | 'na';
  measuredValue: string | null;
  notes: string | null;
  photoUrl: string | null;
  recordedByDisplayName: string | null;
  recordedAt: string;
}

export interface CncTimeLog {
  id: number;
  operationId: number;
  type: string;
  timestamp: string;
  reason: string | null;
  createdByDisplayName: string | null;
  createdAt: string;
}

// ── Payload types for API mutations (typed — no `any`) ────────────────────────

export interface CreateJobPayload {
  workOrder: string;
  partNumber: string;
  partName: string;
  revision?: string | null;
  qty: number;
  machine?: string | null;
  programmerDisplayName?: string | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  priority: string;
  linkedTravelerId?: string | null;
  customerPo?: string | null;
  notes?: string | null;
}

export interface UpdateJobPayload {
  status?: string;
  machine?: string | null;
  priority?: string;
  materialReady?: boolean;
  qcHold?: boolean;
  customerPo?: string | null;
  forwardDestination?: string | null;
  completedAt?: string | null;
  notes?: string | null;
}


export interface CreateOperationPayload {
  jobId: number;
  sequence: number;
  opName: string;
  opDescription?: string | null;
  standardLaborMinutes?: number | null;
  machine?: string | null;
  estimatedSetupMinutes?: number | null;
  estimatedCycleMinutes?: number | null;
  ncProgramRef?: string | null;
  fixture?: string | null;
  workRefPoint?: string | null;
  rawStockOrientation?: string | null;
  datumNotes?: string | null;
  warmupNotes?: string | null;
}

export interface UpdateOperationPayload {
  status?: string;
  machine?: string | null;
  fixture?: string | null;
  workRefPoint?: string | null;
  rawStockOrientation?: string | null;
  ncProgramRef?: string | null;
  qcPlan?: string | null;
  opDescription?: string | null;
  standardLaborMinutes?: number | null;
  estimatedSetupMinutes?: number | null;
  estimatedCycleMinutes?: number | null;
  datumNotes?: string | null;
  warmupNotes?: string | null;
  tribalKnowledge?: string | null;
  operatorNotes?: string | null;
  partCount?: number;
  scrapQty?: number;
  pauseReason?: string | null;
  proveoutCompleted?: boolean;
  actualSetupStartAt?: string | null;
  actualSetupEndAt?: string | null;
  actualRunStartAt?: string | null;
  actualRunEndAt?: string | null;
  completedAt?: string | null;
  signedOffByDisplayName?: string | null;
}

export interface CreateToolPayload {
  operationId: number;
  toolNumber: string;
  holderPosition?: string | null;
  toolName: string;
  diameter?: number | null;
  offsetNotes?: string | null;
  replacementNotes?: string | null;
  imageUrl?: string | null;
}

export interface CreateProgramPayload {
  operationId: number;
  programName: string;
  programNumber?: string | null;
  version?: string | null;
  machine?: string | null;
  estimatedCycleMinutes?: number | null;
  proveOutRequired: boolean;
  notes?: string | null;
}

export interface CreatePhotoPayload {
  operationId: number;
  category: string;
  url: string;
  storageKey?: string | null;
  caption?: string | null;
}

export interface CreateCheckpointPayload {
  operationId: number;
  name: string;
  characteristic?: string | null;
  nominal?: string | null;
  tolerance?: string | null;
  method?: string | null;
  frequency?: string | null;
  required: boolean;
  photoRequired?: boolean;
  signatureRequired?: boolean;
}

export interface CreateQcResultPayload {
  checkpointId: number;
  operationId: number;
  result: 'pass' | 'fail' | 'na';
  measuredValue?: string | null;
  notes?: string | null;
  photoUrl?: string | null;
}

export interface CreateTimeLogPayload {
  operationId: number;
  type: string;
  reason?: string | null;
}

export interface CreateOperationBatchPayload {
  workOrderId: string;
  travelerStepId: string;
  operationId?: number | null;
  batchQty: number;
  assignedMachineId?: number | null;
  assignedMachineName?: string | null;
  assignedEmployeeId?: number | null;
  assignedEmployeeDisplayName?: string | null;
  priority?: string;
  dueDate?: string | null;
  notes?: string | null;
}

export interface BulkCreateOperationBatchPayload {
  workOrderId: string;
  travelerStepId: string;
  operationId?: number | null;
  batchQtys: number[];
  assignedMachineId?: number | null;
  assignedMachineName?: string | null;
  assignedEmployeeId?: number | null;
  assignedEmployeeDisplayName?: string | null;
  priority?: string;
  dueDate?: string | null;
  notes?: string | null;
}

export interface AssignOperationBatchPayload {
  assignedMachineId?: number | null;
  assignedMachineName?: string | null;
  assignedEmployeeId?: number | null;
  assignedEmployeeDisplayName?: string | null;
  notes?: string | null;
}

// ── Work order search result from authoritative all_orders table ──────────────

export interface WorkOrderSearchResult {
  workOrderId: string;
  customerPo: string;
  model: string;
}

// ── Typed API error response ──────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;
  issues?: unknown[];
  missingCheckpoints?: { id: number; name: string }[];
}

export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  const errObj = err as { body?: ApiErrorResponse; message?: string };
  return errObj?.body?.error ?? errObj?.message ?? 'Unknown error';
}
