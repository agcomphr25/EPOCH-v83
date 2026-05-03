export const EMPLOYEES_QUERY_KEY = '/api/employees';

export interface SetEmployeeCodeDeps {
  employeeId: number;
  code: string;
  autoAssign?: boolean;
  putEmployee: (id: number, payload: { employeeCode: string }) => Promise<void>;
  invalidateQueries: (opts: { queryKey: string[] }) => void;
  clearEditing: () => void;
  toast: (opts: { title: string; variant?: string }) => void;
}

export async function runSetEmployeeCode(deps: SetEmployeeCodeDeps): Promise<void> {
  const { employeeId, code, autoAssign, putEmployee, invalidateQueries, clearEditing, toast } = deps;
  const trimmed = code.trim();
  if (!autoAssign && !trimmed) {
    toast({ title: 'Employee code cannot be empty', variant: 'destructive' });
    return;
  }
  try {
    await putEmployee(employeeId, { employeeCode: trimmed });
    invalidateQueries({ queryKey: [EMPLOYEES_QUERY_KEY] });
    clearEditing();
    toast({ title: 'Employee code saved' });
  } catch {
    toast({ title: 'Failed to save employee code', variant: 'destructive' });
  }
}
