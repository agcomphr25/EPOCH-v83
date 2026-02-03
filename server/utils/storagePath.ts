/**
 * Storage Path Utilities
 * 
 * Centralized utilities for normalizing and handling storage paths
 * for both cloud (object storage) and local filesystem files.
 * 
 * Cloud storage paths should start with /objects/ prefix.
 * Local paths typically start with uploads/ prefix.
 */

/**
 * Normalize a storage path to ensure consistent format.
 * Handles edge case where cloud storage paths might be stored without leading slash.
 * 
 * @param storagePath - The storage path to normalize
 * @returns Normalized storage path with proper prefix
 */
export function normalizeStoragePath(storagePath: string | null | undefined): string | null {
  if (!storagePath) return null;
  
  // Handle objects/ prefix without leading slash
  if (storagePath.startsWith('objects/')) {
    return `/${storagePath}`;
  }
  
  return storagePath;
}

/**
 * Check if a storage path is a cloud storage path (/objects/...)
 * 
 * @param storagePath - The storage path to check
 * @returns True if this is a cloud storage path
 */
export function isCloudStoragePath(storagePath: string | null | undefined): boolean {
  if (!storagePath) return false;
  const normalized = normalizeStoragePath(storagePath);
  return normalized?.startsWith('/objects/') ?? false;
}

/**
 * Check if a storage path is a local filesystem path (uploads/...)
 * 
 * @param storagePath - The storage path to check
 * @returns True if this is a local storage path
 */
export function isLocalStoragePath(storagePath: string | null | undefined): boolean {
  if (!storagePath) return false;
  return storagePath.startsWith('uploads/');
}
