import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

import {
  evaluateP2ActivationFlags,
  P2_ACTIVATION_FLAGS,
} from '../src/services/p2ControlledActivationService';

const root = path.resolve(__dirname, '../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Phase 14 controlled activation readiness', () => {
  it('keeps every Phase 1-13 control disabled without exact opt-in', () => {
    const result = evaluateP2ActivationFlags({});
    expect(result.enabledCount).toBe(0);
    expect(result.productionActivationAutomatic).toBe(false);
    expect(result.states.every((state) => !state.serverEnabled)).toBe(true);
  });

  it('rejects a client/server mismatch', () => {
    const result = evaluateP2ActivationFlags({
      P2_GENEALOGY_VIEWER_ENABLED: 'false',
      VITE_P2_GENEALOGY_VIEWER_ENABLED: 'true',
    });
    expect(result.ready).toBe(false);
    expect(
      result.blockers.some((blocker) => /disagree/.test(blocker.reason))
    ).toBe(true);
  });

  it('rejects an enabled feature whose prerequisite is disabled', () => {
    const result = evaluateP2ActivationFlags({
      P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED: 'true',
      VITE_P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED: 'true',
    });
    const state = result.states.find(
      (entry) => entry.key === 'P2_MANUFACTURED_COMPONENT_ISSUE_WRITES_ENABLED'
    );
    expect(state?.ready).toBe(false);
    expect(state?.missingDependencies.length).toBeGreaterThan(0);
  });

  it('accepts an internally consistent synthetic configuration', () => {
    const env: NodeJS.ProcessEnv = {
      P2_CONTROLLED_PILOT_ENVIRONMENT: 'SYNTHETIC_DISPOSABLE',
    };
    for (const entry of P2_ACTIVATION_FLAGS) {
      env[entry.key] = 'true';
      if (entry.clientKey) env[entry.clientKey] = 'true';
    }
    const result = evaluateP2ActivationFlags(env);
    expect(result.ready).toBe(true);
    expect(result.enabledCount).toBe(P2_ACTIVATION_FLAGS.length);
    expect(result.environment).toBe('SYNTHETIC_DISPOSABLE');
  });

  it('exposes a read-only authenticated server-authoritative API and gated UI', () => {
    const route = read('server/src/routes/p2ManufacturingWorkOrders.ts');
    const flags = read('server/src/lib/featureFlags.ts');
    const page = read('client/src/pages/P2ControlCenter.tsx');
    const component = read(
      'client/src/components/p2/P2ActivationReadiness.tsx'
    );
    expect(route).toContain("'/p2-activation/readiness'");
    expect(route).toContain('authenticateToken');
    expect(route).toContain("requirePermission('p2.work_orders.view')");
    expect(route).toContain('isP2ControlledActivationReadinessEnabled()');
    expect(flags).toContain(
      "envBool('P2_CONTROLLED_ACTIVATION_READINESS_ENABLED', false)"
    );
    expect(page).toContain(
      "VITE_P2_CONTROLLED_ACTIVATION_READINESS_ENABLED === 'true'"
    );
    expect(component).toContain(
      'This screen cannot enable production features.'
    );
    expect(route).not.toMatch(
      /p2-activation\/readiness[\s\S]{0,500}(INSERT|UPDATE|DELETE)/i
    );
  });
});
