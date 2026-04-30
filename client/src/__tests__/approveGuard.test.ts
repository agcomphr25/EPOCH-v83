import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleApproveClick,
  handleApproveAnyway,
  handleCancelApprove,
  type ApproveGuardDeps,
  type ApproveAnywayDeps,
  type CancelApproveDeps,
} from '../lib/approveGuard';


function makeClickDeps(overrides: Partial<ApproveGuardDeps> = {}): ApproveGuardDeps {
  return {
    punches: [],
    activeEmployeeId: 42,
    setShowApproveConfirm: vi.fn(),
    approveMutate: vi.fn(),
    ...overrides,
  };
}

function makeAnywayDeps(overrides: Partial<ApproveAnywayDeps> = {}): ApproveAnywayDeps {
  return {
    activeEmployeeId: 42,
    approveMutate: vi.fn(),
    ...overrides,
  };
}

function makeCancelDeps(overrides: Partial<CancelApproveDeps> = {}): CancelApproveDeps {
  return {
    setShowApproveConfirm: vi.fn(),
    ...overrides,
  };
}

describe('handleApproveClick', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the confirmation dialog instead of approving when a punch has missingEmployeeCode=true', () => {
    const deps = makeClickDeps({
      punches: [{ missingEmployeeCode: true }],
    });

    handleApproveClick(deps);

    expect(deps.setShowApproveConfirm).toHaveBeenCalledOnce();
    expect(deps.setShowApproveConfirm).toHaveBeenCalledWith(true);
    expect(deps.approveMutate).not.toHaveBeenCalled();
  });

  it('shows the dialog when only some punches have missingEmployeeCode=true', () => {
    const deps = makeClickDeps({
      punches: [{ missingEmployeeCode: false }, { missingEmployeeCode: true }],
    });

    handleApproveClick(deps);

    expect(deps.setShowApproveConfirm).toHaveBeenCalledWith(true);
    expect(deps.approveMutate).not.toHaveBeenCalled();
  });

  it('calls approveMutate directly when no punches have missingEmployeeCode=true', () => {
    const deps = makeClickDeps({
      punches: [{ missingEmployeeCode: false }, { missingEmployeeCode: false }],
    });

    handleApproveClick(deps);

    expect(deps.approveMutate).toHaveBeenCalledOnce();
    expect(deps.approveMutate).toHaveBeenCalledWith(42);
    expect(deps.setShowApproveConfirm).not.toHaveBeenCalled();
  });

  it('calls approveMutate directly when punches have no missingEmployeeCode field', () => {
    const deps = makeClickDeps({
      punches: [{}],
    });

    handleApproveClick(deps);

    expect(deps.approveMutate).toHaveBeenCalledOnce();
    expect(deps.setShowApproveConfirm).not.toHaveBeenCalled();
  });

  it('does NOT call approveMutate when activeEmployeeId is null and no missing codes', () => {
    const deps = makeClickDeps({
      punches: [{ missingEmployeeCode: false }],
      activeEmployeeId: null,
    });

    handleApproveClick(deps);

    expect(deps.approveMutate).not.toHaveBeenCalled();
  });
});

describe('handleApproveAnyway', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls approveMutate with the activeEmployeeId', () => {
    const deps = makeAnywayDeps();

    handleApproveAnyway(deps);

    expect(deps.approveMutate).toHaveBeenCalledOnce();
    expect(deps.approveMutate).toHaveBeenCalledWith(42);
  });

  it('does NOT call approveMutate when activeEmployeeId is null', () => {
    const deps = makeAnywayDeps({ activeEmployeeId: null });

    handleApproveAnyway(deps);

    expect(deps.approveMutate).not.toHaveBeenCalled();
  });
});

describe('handleCancelApprove', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('closes the dialog without calling the approve endpoint', () => {
    const deps = makeCancelDeps();

    handleCancelApprove(deps);

    expect(deps.setShowApproveConfirm).toHaveBeenCalledOnce();
    expect(deps.setShowApproveConfirm).toHaveBeenCalledWith(false);
  });

  it('closes the dialog even after it was opened for missing codes', () => {
    const setShowApproveConfirm = vi.fn();
    const clickDeps = makeClickDeps({
      punches: [{ missingEmployeeCode: true }],
      setShowApproveConfirm,
    });
    handleApproveClick(clickDeps);
    expect(setShowApproveConfirm).toHaveBeenCalledWith(true);

    handleCancelApprove({ setShowApproveConfirm });
    expect(setShowApproveConfirm).toHaveBeenLastCalledWith(false);
  });
});
