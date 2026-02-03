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
 * Get the URL for accessing a media file.
 * Handles both cloud storage and local storage paths.
 * 
 * @param storagePath - The storage path from the database
 * @returns URL for accessing the file
 */
export function getMediaUrl(storagePath: string | null): string {
  if (!storagePath) return '';
  
  // Cloud storage paths start with /objects/ (or objects/ without leading slash)
  if (storagePath.startsWith('/objects/')) {
    return storagePath;
  }
  if (storagePath.startsWith('objects/')) {
    // Normalize to include leading slash for proper routing
    return `/${storagePath}`;
  }
  
  // Legacy local storage paths - serve through media API
  const filename = storagePath.split('/').pop();
  return `/api/media/file/${filename}`;
}

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
