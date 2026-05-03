import { describe, it, expect } from 'vitest';
import { formatDates } from '../utils/formatDates';

describe('formatDates', () => {
  it('converts null to null for date columns', () => {
    const row = { dueDate: null, name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBeNull();
  });

  it('converts undefined to null for date columns', () => {
    const row = { dueDate: undefined as unknown, name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBeNull();
  });

  it('converts empty string to null for date columns', () => {
    const row = { dueDate: '', name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBeNull();
  });

  it('formats a JS Date object as YYYY-MM-DD', () => {
    const row = { dueDate: new Date('2024-03-15T12:00:00Z'), name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBe('2024-03-15');
  });

  it('passes through an already-correct YYYY-MM-DD string unchanged', () => {
    const row = { dueDate: '2024-03-15', name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBe('2024-03-15');
  });

  it('converts an ISO datetime string to YYYY-MM-DD', () => {
    const row = { dueDate: '2024-03-15T08:30:00.000Z', name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBe('2024-03-15');
  });

  it('converts an invalid date string to null', () => {
    const row = { dueDate: 'not-a-date', name: 'part' };
    const result = formatDates(row, ['dueDate']);
    expect(result.dueDate).toBeNull();
  });

  it('leaves non-date columns untouched', () => {
    const row = { dueDate: '2024-03-15', qty: 42, name: 'bolt' };
    const result = formatDates(row, ['dueDate']);
    expect(result.qty).toBe(42);
    expect(result.name).toBe('bolt');
  });

  it('handles multiple date columns in a single row', () => {
    const row = { startDate: '2024-01-10', endDate: new Date('2024-06-30T00:00:00Z'), label: 'phase' };
    const result = formatDates(row, ['startDate', 'endDate']);
    expect(result.startDate).toBe('2024-01-10');
    expect(result.endDate).toBe('2024-06-30');
    expect(result.label).toBe('phase');
  });

  it('does not mutate the original row', () => {
    const row = { dueDate: new Date('2024-03-15T00:00:00Z') };
    formatDates(row, ['dueDate']);
    expect(row.dueDate).toBeInstanceOf(Date);
  });
});
