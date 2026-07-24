import { createHash } from 'crypto';
import path from 'path';

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
export function canonicalizeDhfManifest(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(canonicalizeDhfManifest).join(',')}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) => `${JSON.stringify(key)}:${canonicalizeDhfManifest(value[key])}`
    )
    .join(',')}}`;
}
export const sha256 = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');
export const safeDhfSegment = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 100) || 'evidence';
export function safeExportPath(category: string, index: number, title: string) {
  const result = `${safeDhfSegment(category)}/${String(index).padStart(3, '0')}-${safeDhfSegment(title)}.json`;
  if (result.includes('..') || path.isAbsolute(result))
    throw new Error('DHF export paths must remain inside the archive');
  return result;
}
