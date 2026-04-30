import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  runSetEmployeeCode,
  EMPLOYEES_QUERY_KEY,
  type SetEmployeeCodeDeps,
} from '../lib/employeeCodeHandlers';

function makeDeps(overrides: Partial<SetEmployeeCodeDeps> = {}): SetEmployeeCodeDeps {
  return {
    employeeId: 42,
    code: 'EMP005',
    putEmployee: vi.fn<(id: number, payload: { employeeCode: string }) => Promise<void>>().mockResolvedValue(undefined),
    invalidateQueries: vi.fn(),
    clearEditing: vi.fn(),
    toast: vi.fn(),
    ...overrides,
  };
}

describe('runSetEmployeeCode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls putEmployee with the correct id and trimmed code', async () => {
    const deps = makeDeps({ code: '  EMP005  ' });

    await runSetEmployeeCode(deps);

    expect(deps.putEmployee).toHaveBeenCalledOnce();
    expect(deps.putEmployee).toHaveBeenCalledWith(42, { employeeCode: 'EMP005' });
  });

  it('invalidates the employees query cache after a successful save', async () => {
    const deps = makeDeps();

    await runSetEmployeeCode(deps);

    expect(deps.invalidateQueries).toHaveBeenCalledOnce();
    expect(deps.invalidateQueries).toHaveBeenCalledWith({
      queryKey: [EMPLOYEES_QUERY_KEY],
    });
  });

  it('calls clearEditing after a successful save (restores the table row)', async () => {
    const deps = makeDeps();

    await runSetEmployeeCode(deps);

    expect(deps.clearEditing).toHaveBeenCalledOnce();
  });

  it('shows a success toast after a successful save', async () => {
    const deps = makeDeps();

    await runSetEmployeeCode(deps);

    expect(deps.toast).toHaveBeenCalledOnce();
    expect(deps.toast).toHaveBeenCalledWith({ title: 'Employee code saved' });
  });

  it('rejects an empty code without calling putEmployee', async () => {
    const deps = makeDeps({ code: '   ' });

    await runSetEmployeeCode(deps);

    expect(deps.putEmployee).not.toHaveBeenCalled();
    expect(deps.invalidateQueries).not.toHaveBeenCalled();
    expect(deps.clearEditing).not.toHaveBeenCalled();
  });

  it('shows a destructive toast when the code is empty', async () => {
    const deps = makeDeps({ code: '' });

    await runSetEmployeeCode(deps);

    expect(deps.toast).toHaveBeenCalledWith({
      title: 'Employee code cannot be empty',
      variant: 'destructive',
    });
  });

  it('does NOT call invalidateQueries when putEmployee throws', async () => {
    const deps = makeDeps({
      putEmployee: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runSetEmployeeCode(deps);

    expect(deps.invalidateQueries).not.toHaveBeenCalled();
  });

  it('does NOT call clearEditing when putEmployee throws', async () => {
    const deps = makeDeps({
      putEmployee: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runSetEmployeeCode(deps);

    expect(deps.clearEditing).not.toHaveBeenCalled();
  });

  it('shows a destructive toast when putEmployee throws', async () => {
    const deps = makeDeps({
      putEmployee: vi.fn().mockRejectedValue(new Error('network error')),
    });

    await runSetEmployeeCode(deps);

    expect(deps.toast).toHaveBeenCalledWith({
      title: 'Failed to save employee code',
      variant: 'destructive',
    });
  });

  describe('editing an existing code', () => {
    it('calls putEmployee with the new code when replacing an existing one', async () => {
      const deps = makeDeps({ employeeId: 7, code: 'EMP999' });

      await runSetEmployeeCode(deps);

      expect(deps.putEmployee).toHaveBeenCalledOnce();
      expect(deps.putEmployee).toHaveBeenCalledWith(7, { employeeCode: 'EMP999' });
    });

    it('invalidates the employees cache after replacing an existing code', async () => {
      const deps = makeDeps({ code: 'EMP999' });

      await runSetEmployeeCode(deps);

      expect(deps.invalidateQueries).toHaveBeenCalledWith({
        queryKey: [EMPLOYEES_QUERY_KEY],
      });
    });

    it('calls clearEditing after successfully replacing an existing code', async () => {
      const deps = makeDeps({ code: 'EMP999' });

      await runSetEmployeeCode(deps);

      expect(deps.clearEditing).toHaveBeenCalledOnce();
    });

    it('shows a success toast after replacing an existing code', async () => {
      const deps = makeDeps({ code: 'EMP999' });

      await runSetEmployeeCode(deps);

      expect(deps.toast).toHaveBeenCalledWith({ title: 'Employee code saved' });
    });

    it('trims whitespace from the replacement code before saving', async () => {
      const deps = makeDeps({ code: '  EMP999  ' });

      await runSetEmployeeCode(deps);

      expect(deps.putEmployee).toHaveBeenCalledWith(42, { employeeCode: 'EMP999' });
    });

    it('rejects replacing an existing code with a blank value', async () => {
      const deps = makeDeps({ code: '   ' });

      await runSetEmployeeCode(deps);

      expect(deps.putEmployee).not.toHaveBeenCalled();
      expect(deps.toast).toHaveBeenCalledWith({
        title: 'Employee code cannot be empty',
        variant: 'destructive',
      });
    });
  });
});
