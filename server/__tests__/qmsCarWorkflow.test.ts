import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative: string) =>
  fs.readFileSync(path.join(root, relative), 'utf8');

describe('QMS CAR workflow', () => {
  it('routes the QMS CAR navbar item to the template-based workspace', () => {
    const app = read('client/src/App.tsx');
    const page = read('client/src/pages/QMSCorrectiveActionsPage.tsx');
    const workspace = read(
      'client/src/components/qms/QualityActionWorkspace.tsx'
    );
    expect(app).toContain('path="/qms/cars"');
    expect(app).toContain('path="/qms/corrective-actions"');
    expect(app).toContain('QMSCorrectiveActionsPage');
    expect(workspace).toContain("return '/qms/cars'");
    for (const section of [
      'Problem and scope',
      'Containment and correction',
      'Root cause and corrective action',
      'Effectiveness and closeout',
    ]) {
      expect(page).toContain(section);
    }
  });

  it('persists template detail on authoritative capa records and keeps register projection', () => {
    const migration = read('migrations/0282_car_form_data.sql');
    const schema = read('server/schema.ts');
    const projection = read(
      'migrations/0235_quality_action_change_control.sql'
    );
    expect(migration).toContain('car_form_data jsonb');
    expect(schema).toContain("carFormData: jsonb('car_form_data')");
    expect(projection).toContain('sync_car_quality_action_register_trigger');
  });

  it('requires effectiveness evidence before a CAR can close', () => {
    const routes = read('server/src/routes/quality.ts');
    expect(routes).toContain('validateCapaCompletion');
    expect(routes).toContain(
      'CAR closure requires a root cause, corrective action, and an effective review outcome'
    );
    expect(routes).toContain('qms.quality_action.car_create');
  });
});
