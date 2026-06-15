const RECOVERY_KEY = 'epoch:chunk-load-recovery-at';
const RECOVERY_COOLDOWN_MS = 60_000;
let inMemoryRecoveryAt = 0;

export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? `${error.name} ${error.message} ${error.stack ?? ''}`
      : String(error ?? '');

  return [
    'failed to fetch dynamically imported module',
    'error loading dynamically imported module',
    'importing a module script failed',
    'chunkloaderror',
    'loading chunk',
  ].some((needle) => message.toLowerCase().includes(needle));
}

export async function clearStaleAppCaches(): Promise<void> {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
  }

  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.update()));
  }
}

export function recoverFromChunkLoadError(error: unknown): boolean {
  if (!isChunkLoadError(error)) {
    return false;
  }

  let lastRecoveryAt = inMemoryRecoveryAt;
  try {
    lastRecoveryAt = Number(sessionStorage.getItem(RECOVERY_KEY) ?? 0);
  } catch {
    // Some locked-down browser modes block sessionStorage; keep recovery alive.
  }

  if (Date.now() - lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
    return false;
  }

  inMemoryRecoveryAt = Date.now();
  try {
    sessionStorage.setItem(RECOVERY_KEY, String(inMemoryRecoveryAt));
  } catch {
    // In-memory cooldown still prevents a tight reload loop for this runtime.
  }

  void clearStaleAppCaches().finally(() => {
    window.location.reload();
  });

  return true;
}
