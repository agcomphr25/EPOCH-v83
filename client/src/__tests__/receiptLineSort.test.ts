import { describe, it, expect } from 'vitest';
import { receiptLineStatusRank, compareReceiptLines } from '../lib/receiptLineSort';

describe('receiptLineStatusRank', () => {
  it('returns 0 (Pending) when ordered > 0 and received === 0', () => {
    expect(receiptLineStatusRank({ orderedQty: 10, receivedQty: 0 })).toBe(0);
  });

  it('returns 1 (Partial) when received > 0 and received < ordered', () => {
    expect(receiptLineStatusRank({ orderedQty: 10, receivedQty: 5 })).toBe(1);
  });

  it('returns 2 (Over-received) when received > ordered and ordered > 0', () => {
    expect(receiptLineStatusRank({ orderedQty: 5, receivedQty: 10 })).toBe(2);
  });

  it('returns 3 (Complete) when received equals ordered', () => {
    expect(receiptLineStatusRank({ orderedQty: 10, receivedQty: 10 })).toBe(3);
  });

  it('returns 3 (Complete) when both quantities are 0', () => {
    expect(receiptLineStatusRank({ orderedQty: 0, receivedQty: 0 })).toBe(3);
  });

  it('handles string quantity values', () => {
    expect(receiptLineStatusRank({ orderedQty: '10', receivedQty: '0' })).toBe(0);
    expect(receiptLineStatusRank({ orderedQty: '10', receivedQty: '5' })).toBe(1);
    expect(receiptLineStatusRank({ orderedQty: '5', receivedQty: '10' })).toBe(2);
    expect(receiptLineStatusRank({ orderedQty: '10', receivedQty: '10' })).toBe(3);
  });

  it('handles null/undefined quantity values as 0', () => {
    expect(receiptLineStatusRank({ orderedQty: null, receivedQty: null })).toBe(3);
    expect(receiptLineStatusRank({})).toBe(3);
  });
});

describe('compareReceiptLines — priority ordering', () => {
  const pending = { orderedQty: 10, receivedQty: 0, agPartNumber: 'P001' };
  const partial = { orderedQty: 10, receivedQty: 5, agPartNumber: 'P002' };
  const over = { orderedQty: 5, receivedQty: 10, agPartNumber: 'P003' };
  const complete = { orderedQty: 10, receivedQty: 10, agPartNumber: 'P004' };

  it('sorts Pending before Partial', () => {
    expect(compareReceiptLines(pending, partial)).toBeLessThan(0);
    expect(compareReceiptLines(partial, pending)).toBeGreaterThan(0);
  });

  it('sorts Partial before Over-received', () => {
    expect(compareReceiptLines(partial, over)).toBeLessThan(0);
    expect(compareReceiptLines(over, partial)).toBeGreaterThan(0);
  });

  it('sorts Over-received before Complete', () => {
    expect(compareReceiptLines(over, complete)).toBeLessThan(0);
    expect(compareReceiptLines(complete, over)).toBeGreaterThan(0);
  });

  it('sorts Pending before Complete', () => {
    expect(compareReceiptLines(pending, complete)).toBeLessThan(0);
  });

  it('returns 0 when two lines have identical status and quantities', () => {
    const a = { orderedQty: 10, receivedQty: 0, agPartNumber: 'P001' };
    const b = { orderedQty: 10, receivedQty: 0, agPartNumber: 'P001' };
    expect(compareReceiptLines(a, b)).toBe(0);
  });

  it('sorts a mixed array into the expected order: Pending, Partial, Over-received, Complete', () => {
    const lines = [complete, over, pending, partial];
    const sorted = [...lines].sort(compareReceiptLines);
    expect(sorted[0]).toBe(pending);
    expect(sorted[1]).toBe(partial);
    expect(sorted[2]).toBe(over);
    expect(sorted[3]).toBe(complete);
  });
});

describe('compareReceiptLines — within-rank tie-breaking', () => {
  it('within Pending, sorts by larger orderedQty first', () => {
    const small = { orderedQty: 5, receivedQty: 0, agPartNumber: 'A' };
    const large = { orderedQty: 20, receivedQty: 0, agPartNumber: 'B' };
    expect(compareReceiptLines(large, small)).toBeLessThan(0);
    expect(compareReceiptLines(small, large)).toBeGreaterThan(0);
  });

  it('within Partial, sorts by largest remaining quantity (ordered - received) first', () => {
    const mostRemaining = { orderedQty: 20, receivedQty: 2, agPartNumber: 'A' };
    const leastRemaining = { orderedQty: 10, receivedQty: 8, agPartNumber: 'B' };
    expect(compareReceiptLines(mostRemaining, leastRemaining)).toBeLessThan(0);
  });

  it('within Over-received, sorts by largest excess (received - ordered) first', () => {
    const bigExcess = { orderedQty: 5, receivedQty: 20, agPartNumber: 'A' };
    const smallExcess = { orderedQty: 5, receivedQty: 7, agPartNumber: 'B' };
    expect(compareReceiptLines(bigExcess, smallExcess)).toBeLessThan(0);
  });

  it('within Complete, sorts alphabetically by agPartNumber', () => {
    const aaa = { orderedQty: 10, receivedQty: 10, agPartNumber: 'AAA' };
    const zzz = { orderedQty: 10, receivedQty: 10, agPartNumber: 'ZZZ' };
    expect(compareReceiptLines(aaa, zzz)).toBeLessThan(0);
    expect(compareReceiptLines(zzz, aaa)).toBeGreaterThan(0);
  });
});
