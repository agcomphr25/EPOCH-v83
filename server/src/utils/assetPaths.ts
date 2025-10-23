import * as path from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolves asset paths consistently across development and production environments.
 * Uses import.meta.url for ES module compatibility in both dev and production.
 * 
 * In development: resolves relative to process.cwd() -> server/assets
 * In production: resolves relative to the compiled output directory -> dist/assets
 * 
 * @param relativePath - Path relative to server/assets (e.g., 'logo_updated.png')
 * @returns Absolute path to the asset
 */
export function resolveAssetPath(relativePath: string): string {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    // In development, resolve from project root
    return path.join(process.cwd(), 'server', 'assets', relativePath);
  } else {
    // In production, resolve from compiled output directory using import.meta.url
    // This file will be at dist/src/utils/assetPaths.js, so we go up to dist/assets
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    return path.join(currentDir, '..', '..', 'assets', relativePath);
  }
}
