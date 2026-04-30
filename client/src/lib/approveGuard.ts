export interface ApproveGuardDeps {
  punches: Array<{ missingEmployeeCode?: boolean }>;
  activeEmployeeId: number | null;
  hasOpenShift?: boolean;
  setShowApproveConfirm: (show: boolean) => void;
  approveMutate: (empId: number) => void;
}

export function handleApproveClick(deps: ApproveGuardDeps): void {
  const { punches, activeEmployeeId, hasOpenShift, setShowApproveConfirm, approveMutate } = deps;
  const hasMissingCodes = punches.some(p => p.missingEmployeeCode);
  if (hasMissingCodes || !!hasOpenShift) {
    setShowApproveConfirm(true);
  } else {
    if (activeEmployeeId !== null) {
      approveMutate(activeEmployeeId);
    }
  }
}

export interface ApproveAnywayDeps {
  activeEmployeeId: number | null;
  approveMutate: (empId: number) => void;
}

export function handleApproveAnyway(deps: ApproveAnywayDeps): void {
  const { activeEmployeeId, approveMutate } = deps;
  if (activeEmployeeId !== null) {
    approveMutate(activeEmployeeId);
  }
}

export interface CancelApproveDeps {
  setShowApproveConfirm: (show: boolean) => void;
}

export function handleCancelApprove(deps: CancelApproveDeps): void {
  deps.setShowApproveConfirm(false);
}
