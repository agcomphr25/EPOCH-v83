import {
  getPendingMutations,
  getRetryableMutations,
  markMutationSynced,
  markMutationFailed,
  markMutationPending,
  incrementRetryCount,
} from './mutationQueue';

const MAX_RETRY_COUNT = 10;
const SYNC_INTERVAL_MS = 30_000;
const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 422];

let syncIntervalId: ReturnType<typeof setInterval> | null = null;
let isSyncing = false;
let onlineHandler: (() => void) | null = null;

export async function processMutationQueue(): Promise<void> {
  if (!navigator.onLine) {
    console.info('[EPOCH SYNC] Offline — skipping queue processing');
    return;
  }

  if (isSyncing) {
    console.info('[EPOCH SYNC] Already processing — skipping');
    return;
  }

  isSyncing = true;

  try {
    const retryable = await getRetryableMutations(MAX_RETRY_COUNT);
    for (const mutation of retryable) {
      await markMutationPending(mutation.id);
    }

    const pending = await getPendingMutations();

    if (pending.length === 0) {
      return;
    }

    console.info(`[EPOCH SYNC] Processing mutation queue — ${pending.length} pending`);

    for (const mutation of pending) {
      if (mutation.retryCount >= MAX_RETRY_COUNT) {
        console.warn(`[EPOCH SYNC] Mutation exceeded max retries, marking failed:`, mutation.id);
        await markMutationFailed(mutation.id);
        continue;
      }

      try {
        const response = await fetch('/api/offline/replay-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: mutation.idempotencyKey,
            eventType: mutation.eventType,
            payload: mutation.payload,
          }),
        });

        if (response.ok) {
          const data = await response.json().catch(() => ({}));
          if (data.status === 'replayed' || data.status === 'already_processed') {
            await markMutationSynced(mutation.id);
            console.info('[EPOCH SYNC] Mutation synced:', mutation.id);
          } else {
            await incrementRetryCount(mutation.id);
            await markMutationFailed(mutation.id);
            console.warn(`[EPOCH SYNC] Unexpected replay response, retrying:`, mutation.id, data);
          }
        } else if (NON_RETRYABLE_STATUS_CODES.includes(response.status)) {
          await markMutationFailed(mutation.id);
          console.error(`[EPOCH SYNC] Mutation permanently failed (${response.status}):`, mutation.id);
        } else {
          await incrementRetryCount(mutation.id);
          await markMutationFailed(mutation.id);
          console.warn(`[EPOCH SYNC] Mutation retry scheduled (${mutation.retryCount + 1}/${MAX_RETRY_COUNT}):`, mutation.id);
        }
      } catch {
        await incrementRetryCount(mutation.id);
        await markMutationFailed(mutation.id);
        console.warn(`[EPOCH SYNC] Mutation retry scheduled (network error, ${mutation.retryCount + 1}/${MAX_RETRY_COUNT}):`, mutation.id);
      }
    }
  } finally {
    isSyncing = false;
  }
}

export function startSyncEngine(): void {
  if (syncIntervalId !== null) {
    console.info('[EPOCH SYNC] Sync engine already running');
    return;
  }

  console.info('[EPOCH SYNC] Sync engine starting');

  onlineHandler = () => {
    console.info('[EPOCH SYNC] Connection restored — triggering sync');
    processMutationQueue();
  };
  window.addEventListener('online', onlineHandler);

  syncIntervalId = setInterval(() => {
    processMutationQueue();
  }, SYNC_INTERVAL_MS);

  processMutationQueue();

  console.info('[EPOCH SYNC] Sync engine started — interval:', SYNC_INTERVAL_MS, 'ms');
}

export function stopSyncEngine(): void {
  if (syncIntervalId !== null) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }
  if (onlineHandler !== null) {
    window.removeEventListener('online', onlineHandler);
    onlineHandler = null;
  }
  console.info('[EPOCH SYNC] Sync engine stopped');
}
