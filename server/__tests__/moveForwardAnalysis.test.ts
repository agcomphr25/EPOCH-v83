import { describe, expect, it } from 'vitest';

import {
  deterministicAnalysis,
  sensibleDate,
} from '../src/services/moveForwardAnalysis';

const now = new Date('2026-08-12T12:00:00-05:00');

describe('Move Forward analysis', () => {
  it('splits a DDTC renewal into reference, accounting, compliance, task, and reminder items', () => {
    const result = deterministicAnalysis(
      'We are going to have to spend $3,000 in September for renewing the DDTC registration',
      now
    );
    const types = result.items.map((item) => item.itemType);
    expect(types).toEqual(
      expect.arrayContaining([
        'reference_note',
        'accounting_attention',
        'compliance_attention',
        'task',
        'reminder',
      ])
    );
    expect(
      result.items.find((item) => item.itemType === 'accounting_attention')
        ?.amountCents
    ).toBe(300000);
    expect(
      result.items.find((item) => item.itemType === 'accounting_attention')
        ?.dueDate
    ).toBe('2026-09-01');
  });

  it('keeps a scrap incident as a note and production/quality discussion suggestion', () => {
    const result = deterministicAnalysis(
      'We had to scrap 2 plies of uni because the mandrel bumped into the table',
      now
    );
    expect(result.items.map((item) => item.itemType)).toEqual(
      expect.arrayContaining([
        'reference_note',
        'production_quality_discussion',
      ])
    );
    expect(result.questions[0]).toMatch(/order|work order|part|process/i);
  });

  it('assigns an undated ask to Glenn on the next business day', () => {
    const result = deterministicAnalysis(
      'Ask Chris about the QMS matching the process manual at the internal audit',
      now
    );
    expect(result.items.map((item) => item.itemType)).toEqual(
      expect.arrayContaining([
        'person_follow_up',
        'task',
        'compliance_attention',
      ])
    );
    expect(
      result.items.find((item) => item.itemType === 'person_follow_up')?.dueDate
    ).toBe('2026-08-13');
  });

  it('chooses the first business day for month-only commitments', () => {
    expect(
      sensibleDate('Renew this in November', new Date('2026-08-12T12:00:00'))
    ).toBe('2026-11-02');
  });
});
