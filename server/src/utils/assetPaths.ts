import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

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
  
  console.log(`🔍 [AssetPath] Resolving asset: ${relativePath}`);
  console.log(`🔍 [AssetPath] Environment: ${process.env.NODE_ENV}`);
  console.log(`🔍 [AssetPath] CWD: ${process.cwd()}`);
  
  if (isDevelopment) {
    // In development, resolve from project root
    const devPath = path.join(process.cwd(), 'server', 'assets', relativePath);
    console.log(`🔍 [AssetPath] Development path: ${devPath}`);
    console.log(`🔍 [AssetPath] File exists: ${fs.existsSync(devPath)}`);
    return devPath;
  } else {
    // In production, esbuild bundles everything to dist/index.js
    // Assets are copied to dist/assets during build
    // So we resolve relative to the dist directory
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = path.dirname(currentFilePath);
    
    // Try multiple possible paths since esbuild bundling changes the structure
    const possiblePaths = [
      // Most likely: if bundled to dist/index.js
      path.join(currentDir, 'assets', relativePath),
      // Alternative: if not bundled deeply
      path.join(currentDir, '..', 'assets', relativePath),
      // Fallback: relative to cwd
      path.join(process.cwd(), 'dist', 'assets', relativePath),
    ];
    
    console.log(`🔍 [AssetPath] Current file: ${currentFilePath}`);
    console.log(`🔍 [AssetPath] Current dir: ${currentDir}`);
    console.log(`🔍 [AssetPath] Trying paths:`, possiblePaths);
    
    // Find the first path that exists
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        console.log(`✅ [AssetPath] Found asset at: ${testPath}`);
        return testPath;
      }
    }
    
    // If none exist, log all attempted paths and return the most likely one
    console.error(`❌ [AssetPath] Asset not found in any location!`);
    console.error(`❌ [AssetPath] Attempted paths:`, possiblePaths);
    
    // Return the most likely path for better error messages
    return possiblePaths[0];
  }
}
