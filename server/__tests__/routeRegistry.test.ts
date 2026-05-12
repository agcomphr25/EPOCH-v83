import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROUTES_INDEX = path.resolve(process.cwd(), 'server/src/routes/index.ts');

type RouteRegistration = {
  method: string;
  routePath: string;
  line: number;
};

function findAppRouteRegistrations(source: string): RouteRegistration[] {
  const registrations: RouteRegistration[] = [];
  const routePattern = /\bapp\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  const lineStarts = [0];

  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === '\n') lineStarts.push(i + 1);
  }

  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(source)) !== null) {
    const line =
      lineStarts.findIndex((start, index) => {
        const next = lineStarts[index + 1] ?? Number.POSITIVE_INFINITY;
        return match!.index >= start && match!.index < next;
      }) + 1;

    registrations.push({
      method: match[1].toUpperCase(),
      routePath: match[2],
      line,
    });
  }

  return registrations;
}

describe('route registry', () => {
  it('does not register duplicate app-level method/path handlers in routes/index.ts', () => {
    const source = fs.readFileSync(ROUTES_INDEX, 'utf8');
    const registrations = findAppRouteRegistrations(source);
    const byKey = new Map<string, RouteRegistration[]>();

    for (const registration of registrations) {
      const key = `${registration.method} ${registration.routePath}`;
      const existing = byKey.get(key) ?? [];
      existing.push(registration);
      byKey.set(key, existing);
    }

    const duplicates = Array.from(byKey.entries())
      .filter(([, routes]) => routes.length > 1)
      .map(([key, routes]) => `${key} at lines ${routes.map((r) => r.line).join(', ')}`);

    expect(
      duplicates,
      `Duplicate app-level routes shadow later handlers:\n${duplicates.join('\n')}`,
    ).toHaveLength(0);
  });
});
