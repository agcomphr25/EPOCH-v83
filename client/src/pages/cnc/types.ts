// Shared types for the CNC Dashboard feature

export interface CncMachine {
  id: number;
  machineName: string;
  machineNumber: string | null;
  workCenter: string | null;
  capabilities: unknown | null;
  active: boolean;
  createdAt: string;
}

export interface MachineUtilization {
  machine: string;
  totalJobs: number;
  activeJobs: number;
  pendingHours: number;
  totalHours: number;
}

export interface TravelerInfo {
  id: string;
  travelerNumber: string;
  status: string;
  partName: string | null;
  partNumber: string | null;
  workOrderId: string | null;
  quantity: number | null;
  currentStepId: string | null;
  currentStepDept: string | null;
  currentStepStatus: string | null;
  currentStepNumber: number | null;
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
