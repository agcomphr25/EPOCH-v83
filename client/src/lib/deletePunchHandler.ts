export interface DeletePunchParams {
  id: number;
  editNote: string;
}

export interface DeletePunchDeps {
  fetchJson: (url: string, init: RequestInit) => Promise<{ ok: boolean; data: unknown }>;
}

export async function runDeletePunch(
  params: DeletePunchParams,
  deps: DeletePunchDeps,
): Promise<void> {
  const { ok, data } = await deps.fetchJson(`/api/timekeeping/punches/${params.id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ editNote: params.editNote }),
  });

  if (!ok) {
    const payload = data as { error?: string };
    throw new Error(payload.error ?? 'Failed to delete punch');
  }
}

export function buildDeletePunchFetchDep(): DeletePunchDeps {
  return {
    async fetchJson(url, init) {
      const res = await fetch(url, init);
      const data = res.status === 204 ? null : await res.json().catch(() => null);
      return { ok: res.ok, data };
    },
  };
}
