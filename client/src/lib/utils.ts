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
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error) return error;
  return fallback;
}
