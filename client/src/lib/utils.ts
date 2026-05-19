import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Extracts a human-readable message from an unknown error value.
 * Use this in catch blocks and useMutation onError handlers to surface
 * the server's error message rather than a fully generic fallback.
 */
export function getErrorMessage(error: unknown, fallback = 'An unexpected error occurred'): string {
  const normalize = (message: string) =>
    message.toLowerCase().includes('error code undefined')
      ? 'File storage is not available. Check the storage provider configuration and try again.'
      : message;

  if (error instanceof Error && error.message) return normalize(error.message);
  if (typeof error === 'string' && error) return normalize(error);
  if (error && typeof error === 'object') {
    const data = error as Record<string, unknown>;
    const message = data.message || data.error || data.details || data.reason;
    if (typeof message === 'string' && message.trim()) return normalize(message);
  }
  return fallback;
}
