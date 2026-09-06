import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { runMigrationSafetyCheck } from '../utils/migrationSafetyCheck';
import {
  investigateProductionQuestion,
  MAX_INVESTIGATOR_TOOL_CALLS,
} from '../src/services/productionInvestigator.service';

vi.mock('../db', () => ({
  queryRows: vi.fn(),
}));

function fakeOpenAI(messages: any[]) {
  const create = vi.fn();
  for (const message of messages) {
    create.mockResolvedValueOnce({ choices: [{ message }] });
  }
  return { chat: { completions: { create } } };
}

describe('Production Investigator agent loop', () => {
  it('records sanitized activity for a model-selected read-only tool', async () => {
    const openai = fakeOpenAI([
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'get_order',
              arguments: JSON.stringify({
                order_number: 'FD740',
                rationale: 'Establish the current order status.',
                unsafe_extra: 'must not reach the activity log',
              }),
            },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'FD740 is currently in Finish.',
        tool_calls: [],
      },
    ]);
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      summary: 'Found FD740 in Finish.',
      data: { currentDepartment: 'Finish' },
    });

    const result = await investigateProductionQuestion('Where is FD740?', {
      openai,
      executeTool,
    });

    expect(result.answer).toContain('Finish');
    expect(result.partial).toBe(false);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]).toMatchObject({
      toolName: 'get_order',
      sanitizedArguments: { order_number: 'FD740' },
      rationale: 'Establish the current order status.',
      status: 'success',
    });
    expect(result.activities[0].sanitizedArguments).not.toHaveProperty(
      'unsafe_extra'
    );
  });

  it('blocks an identical repeated call and marks the answer partial', async () => {
    const call = (id: string) => ({
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id,
          type: 'function',
          function: {
            name: 'get_kickbacks',
            arguments: JSON.stringify({
              order_number: 'FD740',
              rationale: 'Check for quality problems.',
            }),
          },
        },
      ],
    });
    const openai = fakeOpenAI([
      call('call-1'),
      call('call-2'),
      {
        role: 'assistant',
        content: 'The repeated lookup was blocked.',
        tool_calls: [],
      },
    ]);
    const executeTool = vi.fn().mockResolvedValue({
      ok: true,
      summary: 'No kickbacks found.',
      data: [],
    });

    const result = await investigateProductionQuestion('Check FD740 twice.', {
      openai,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(result.activities).toHaveLength(2);
    expect(result.activities[1]).toMatchObject({
      status: 'failure',
      errorCode: 'DUPLICATE_CALL_BLOCKED',
    });
    expect(result.partial).toBe(true);
  });

  it('keeps the experiment capped at five tool calls', () => {
    expect(MAX_INVESTIGATOR_TOOL_CALLS).toBe(5);
  });

  it('uses a forward-only additive migration', () => {
    const migration = fs.readFileSync(
      path.resolve(
        process.cwd(),
        'migrations/0318_production_investigator_phase1.sql'
      ),
      'utf8'
    );
    expect(() =>
      runMigrationSafetyCheck(
        migration,
        '0318_production_investigator_phase1.sql'
      )
    ).not.toThrow();
  });
});
