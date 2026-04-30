export interface AddPunchParams {
  employeeId: string;
  type: string;
  punchedAt: string;
  costCode: string;
  note: string;
}

export interface AddPunchDeps {
  fetchJson: (url: string, init: RequestInit) => Promise<{ ok: boolean; data: unknown }>;
}

export interface AddPunchResult {
  [key: string]: unknown;
}

export interface DcaaViolation {
  ruleId: string;
  reason: string;
  remediation?: string;
}

export async function runCreatePunch(
  params: AddPunchParams,
  deps: AddPunchDeps,
): Promise<AddPunchResult> {
  const body: Record<string, unknown> = {
    employeeId: String(params.employeeId),
    type: params.type,
    punchedAt: params.punchedAt,
    source: 'admin',
  };
  if (params.costCode) body.costCode = params.costCode;
  if (params.note) body.note = params.note;

  const { ok, data } = await deps.fetchJson('/api/timekeeping/punches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!ok) {
    const payload = data as { error?: string; dcaaViolation?: DcaaViolation };
    const err: Error & { dcaaViolation?: DcaaViolation } = new Error(
      payload.error ?? 'Failed to create punch',
    );
    err.dcaaViolation = payload.dcaaViolation;
    throw err;
  }

  return data as AddPunchResult;
}

export function buildAddPunchFetchDep(): AddPunchDeps {
  return {
    async fetchJson(url, init) {
      const res = await fetch(url, init);
      const data = await res.json();
      return { ok: res.ok, data };
    },
  };
}
