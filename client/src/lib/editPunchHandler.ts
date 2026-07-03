export interface EditPunchParams {
  id: number;
  punchType: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  punchedAt: string;
  note: string;
  chargeCodeId?: number | null;
}

export interface EditPunchDeps {
  fetchJson: (url: string, init: RequestInit) => Promise<{ ok: boolean; data: unknown }>;
}

export interface EditPunchResult {
  [key: string]: unknown;
}

export async function runEditPunch(
  params: EditPunchParams,
  deps: EditPunchDeps,
): Promise<EditPunchResult> {
  const which: 'clockIn' | 'clockOut' =
    params.punchType === 'clock_out' || params.punchType === 'break_end'
      ? 'clockOut'
      : 'clockIn';

  const body: Record<string, unknown> = {
    which,
    punchType: params.punchType,
    punchedAt: params.punchedAt,
    editNote: params.note,
  };
  if (params.chargeCodeId !== undefined) {
    body.chargeCodeId = params.chargeCodeId;
  }

  const { ok, data } = await deps.fetchJson(`/api/timekeeping/punches/${params.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!ok) {
    const payload = data as { error?: string };
    throw new Error(payload.error ?? 'Failed to update punch');
  }

  return data as EditPunchResult;
}

export function buildEditPunchFetchDep(): EditPunchDeps {
  return {
    async fetchJson(url, init) {
      const res = await fetch(url, init);
      const data = await res.json();
      return { ok: res.ok, data };
    },
  };
}
