import { db, type OfflineMutation, type MutationStatus } from './offlineDB';

function generateUUID(): string {
  return crypto.randomUUID();
}

export async function queueMutation(
  eventType: string,
  payload: Record<string, unknown>,
): Promise<OfflineMutation> {
  const mutation: OfflineMutation = {
    id: generateUUID(),
    eventType,
    payload,
    createdAt: Date.now(),
    retryCount: 0,
    idempotencyKey: generateUUID(),
    status: 'pending',
  };

  await db.mutationQueue.add(mutation);
  console.info('[EPOCH] Mutation queued:', mutation.eventType, mutation.id);
  return mutation;
}

export async function getPendingMutations(): Promise<OfflineMutation[]> {
  return db.mutationQueue
    .where('status')
    .equals('pending')
    .sortBy('createdAt');
}

export async function getRetryableMutations(maxRetries: number = 5): Promise<OfflineMutation[]> {
  const failed = await db.mutationQueue
    .where('status')
    .equals('failed')
    .sortBy('createdAt');
  return failed.filter((m) => m.retryCount < maxRetries);
}

async function updateStatus(id: string, status: MutationStatus): Promise<boolean> {
  const updated = await db.mutationQueue.update(id, { status });
  if (updated) {
    console.info(`[EPOCH] Mutation ${status}:`, id);
    return true;
  }
  console.warn(`[EPOCH] Mutation not found for status update:`, id);
  return false;
}

export async function markMutationSynced(id: string): Promise<void> {
  await updateStatus(id, 'synced');
}

export async function markMutationFailed(id: string): Promise<void> {
  await updateStatus(id, 'failed');
}

export async function markMutationPending(id: string): Promise<void> {
  await updateStatus(id, 'pending');
}

export async function incrementRetryCount(id: string): Promise<void> {
  await db.mutationQueue
    .where('id')
    .equals(id)
    .modify((mutation) => {
      mutation.retryCount += 1;
    });
}

export async function clearQueue(): Promise<void> {
  await db.mutationQueue.clear();
  console.info('[EPOCH] Mutation queue cleared');
}
