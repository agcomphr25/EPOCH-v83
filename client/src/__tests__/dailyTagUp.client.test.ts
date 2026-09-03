import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const page = fs.readFileSync(path.join(root, 'client/src/pages/DailyTagUpPage.tsx'), 'utf8');
const app = fs.readFileSync(path.join(root, 'client/src/App.tsx'), 'utf8');
const navigation = fs.readFileSync(path.join(root, 'client/src/components/Navigation.tsx'), 'utf8');
const permissions = fs.readFileSync(path.join(root, 'client/src/config/userPermissions.ts'), 'utf8');

describe('Daily Tag Up client contract', () => {
  it('registers the top-level route and server capability gate', () => {
    expect(app).toContain('path="/daily-tag-up"');
    expect(navigation).toContain("path: '/daily-tag-up'");
    expect(permissions).toContain("'/daily-tag-up': 'p2.work_orders.view'");
  });

  it('renders required filters, project drill-down, department accordions, and real record links', () => {
    for (const label of ['Project', 'Customer', 'Customer PO', 'Department', 'Source', 'Needs attention', 'Status']) expect(page).toContain(`label="${label}"`);
    expect(page).toContain('>Search</span>');
    expect(page).toContain('data-testid={`department-${department.label}`}');
    expect(page).toContain('/p2-work-orders/queues/${wo.departmentId}?projectId=${encodeURIComponent(project.id)}');
    expect(page).toContain('wo.readiness.state');
    expect(page).toContain('<TreeNode');
    expect(page).toContain('Show Only Problems');
  });

  it('hydrates project and customer PO context and returns to the project Production tab', () => {
    expect(page).toContain('new URLSearchParams(window.location.search)');
    expect(page).toContain("params.get('projectId')?.trim()");
    expect(page).toContain("params.get('customerPo')?.trim()");
    expect(page).toContain('/projects/${encodeURIComponent(project.id)}?tab=production');
  });

  it('moves TV Display to the first Verified Modules card and removes the old top-level placement', () => {
    const verifiedStart = navigation.indexOf('const verifiedModulesItems = [');
    const tv = navigation.indexOf("path: '/tv-display'", verifiedStart);
    const firstExisting = navigation.indexOf("path: '/'", verifiedStart);
    expect(tv).toBeGreaterThan(verifiedStart);
    expect(tv).toBeLessThan(firstExisting);
    expect(navigation.match(/path: '\/tv-display'/g)).toHaveLength(1);
    expect(app).toContain('<Route path="/tv-display" component={TVDisplayPage} />');
  });
});
