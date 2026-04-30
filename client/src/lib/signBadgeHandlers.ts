export type SignBadgeLookupStatus = 'idle' | 'loading' | 'found' | 'not_found';

export interface ResolvedEmployee {
  id: number;
  name: string;
  employeeCode: string;
  department: string | null;
}

export interface SignBadgeLookupResult {
  ok: boolean;
  employee?: ResolvedEmployee;
}

export interface SignBadgeLookupDeps {
  resolveBadge: (code: string) => Promise<SignBadgeLookupResult>;
  setSignedByName: (name: string) => void;
  setSignResolvedEmployee: (emp: ResolvedEmployee | null) => void;
  setSignBadgeLookupStatus: (status: SignBadgeLookupStatus) => void;
}

export async function fetchResolveBadge(scanCode: string): Promise<SignBadgeLookupResult> {
  const resp = await fetch(`/api/employee-badges/resolve-badge/${encodeURIComponent(scanCode)}`);
  if (!resp.ok) return { ok: false };
  const emp: ResolvedEmployee = await resp.json();
  return { ok: true, employee: emp };
}

export async function runSignBadgeLookup(code: string, deps: SignBadgeLookupDeps): Promise<void> {
  const { resolveBadge, setSignedByName, setSignResolvedEmployee, setSignBadgeLookupStatus } = deps;
  try {
    const result = await resolveBadge(code);
    if (result.ok && result.employee) {
      setSignResolvedEmployee(result.employee);
      setSignedByName(result.employee.name);
      setSignBadgeLookupStatus('found');
    } else {
      setSignResolvedEmployee(null);
      setSignBadgeLookupStatus('not_found');
    }
  } catch {
    setSignResolvedEmployee(null);
    setSignBadgeLookupStatus('not_found');
  }
}
