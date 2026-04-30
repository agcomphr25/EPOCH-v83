import { describe, it, expect } from 'vitest';
import {
  DOMAIN_LABELS,
  DOMAIN_WEIGHTS,
  topFlagBySeverity,
  computeDomainTarget,
  countMissingEvidence,
  countTotalMissingEvidence,
  filterOpenItems,
  topP1Item,
  topFailureFlagForDashboard,
  type RedFlag,
  type RemediationItem,
  type EvidenceItem,
  type DomainScore,
} from '../lib/edriScorecard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFlag(severity: RedFlag['severity'], overrides: Partial<RedFlag> = {}): RedFlag {
  return { severity, isActive: true, title: `${severity} flag`, ...overrides };
}

function makeItem(
  status: string,
  priority: string,
  overrides: Partial<RemediationItem> & { title?: string } = {},
): RemediationItem {
  return { status, priority, title: `${priority} item`, ...overrides };
}

function makeEvidence(value: unknown, label = 'some label'): EvidenceItem {
  return { label, value };
}

// ---------------------------------------------------------------------------
// DOMAIN_WEIGHTS — structural sanity
// ---------------------------------------------------------------------------

describe('DOMAIN_WEIGHTS', () => {
  it('values sum to exactly 1.0', () => {
    const total = Object.values(DOMAIN_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1.0, 10);
  });

  it('every weight is a positive number', () => {
    for (const [key, weight] of Object.entries(DOMAIN_WEIGHTS)) {
      expect(weight, `weight for ${key} must be > 0`).toBeGreaterThan(0);
      expect(typeof weight).toBe('number');
    }
  });

  it('contains at least one domain key', () => {
    expect(Object.keys(DOMAIN_WEIGHTS).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// DOMAIN_LABELS — structural sanity
// ---------------------------------------------------------------------------

describe('DOMAIN_LABELS', () => {
  it('has a non-empty string label for every DOMAIN_WEIGHTS key', () => {
    for (const key of Object.keys(DOMAIN_WEIGHTS)) {
      const label = DOMAIN_LABELS[key];
      expect(label, `DOMAIN_LABELS is missing an entry for ${key}`).toBeDefined();
      expect(typeof label).toBe('string');
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it('contains at least one label entry', () => {
    expect(Object.keys(DOMAIN_LABELS).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// topFlagBySeverity
// ---------------------------------------------------------------------------

describe('topFlagBySeverity', () => {
  it('returns null when no flags are provided', () => {
    expect(topFlagBySeverity([])).toBeNull();
  });

  it('picks CRITICAL over all other severities', () => {
    const flags = [
      makeFlag('LOW'),
      makeFlag('HIGH'),
      makeFlag('CRITICAL'),
      makeFlag('MEDIUM'),
    ];
    const result = topFlagBySeverity(flags);
    expect(result?.severity).toBe('CRITICAL');
  });

  it('picks HIGH when no CRITICAL flag exists', () => {
    const flags = [makeFlag('MEDIUM'), makeFlag('HIGH'), makeFlag('LOW')];
    const result = topFlagBySeverity(flags);
    expect(result?.severity).toBe('HIGH');
  });

  it('picks MEDIUM when neither CRITICAL nor HIGH flags exist', () => {
    const flags = [makeFlag('LOW'), makeFlag('MEDIUM')];
    const result = topFlagBySeverity(flags);
    expect(result?.severity).toBe('MEDIUM');
  });

  it('picks LOW when it is the only severity present', () => {
    const flags = [makeFlag('LOW')];
    const result = topFlagBySeverity(flags);
    expect(result?.severity).toBe('LOW');
  });

  it('returns the first CRITICAL flag when multiple CRITICAL flags exist', () => {
    const first = makeFlag('CRITICAL', { title: 'first critical' });
    const second = makeFlag('CRITICAL', { title: 'second critical' });
    const result = topFlagBySeverity([first, second]);
    expect(result?.title).toBe('first critical');
  });
});

// ---------------------------------------------------------------------------
// topFailureFlagForDashboard
// ---------------------------------------------------------------------------

describe('topFailureFlagForDashboard', () => {
  it('returns null when there are no active red flags', () => {
    expect(topFailureFlagForDashboard([])).toBeNull();
  });

  it('returns the first CRITICAL flag when one is present', () => {
    const flags = [makeFlag('MEDIUM'), makeFlag('CRITICAL'), makeFlag('HIGH')];
    const result = topFailureFlagForDashboard(flags);
    expect(result?.severity).toBe('CRITICAL');
  });

  it('falls back to the first HIGH flag when no CRITICAL flags exist', () => {
    const flags = [makeFlag('MEDIUM'), makeFlag('HIGH'), makeFlag('LOW')];
    const result = topFailureFlagForDashboard(flags);
    expect(result?.severity).toBe('HIGH');
  });

  it('returns null when only MEDIUM or LOW flags are active (not pass-blocking)', () => {
    const flags = [makeFlag('MEDIUM'), makeFlag('LOW')];
    expect(topFailureFlagForDashboard(flags)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// countMissingEvidence
// ---------------------------------------------------------------------------

describe('countMissingEvidence', () => {
  it('returns 0 for an empty evidence array', () => {
    expect(countMissingEvidence([])).toBe(0);
  });

  it('counts items whose value is exactly "SCORER_UNAVAILABLE"', () => {
    const items = [
      makeEvidence('SCORER_UNAVAILABLE'),
      makeEvidence('some real value'),
      makeEvidence('SCORER_UNAVAILABLE'),
    ];
    expect(countMissingEvidence(items)).toBe(2);
  });

  it('does not count items with other string values', () => {
    const items = [
      makeEvidence('OK'),
      makeEvidence(42),
      makeEvidence(null),
      makeEvidence(false),
    ];
    expect(countMissingEvidence(items)).toBe(0);
  });

  it('counts all items when every item is SCORER_UNAVAILABLE', () => {
    const items = Array.from({ length: 5 }, () => makeEvidence('SCORER_UNAVAILABLE'));
    expect(countMissingEvidence(items)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// countTotalMissingEvidence — across all domains
// ---------------------------------------------------------------------------

describe('countTotalMissingEvidence', () => {
  it('returns 0 when domainScores array is empty', () => {
    expect(countTotalMissingEvidence([])).toBe(0);
  });

  it('sums SCORER_UNAVAILABLE items across multiple domains', () => {
    const domains: DomainScore[] = [
      {
        domainKey: 'TIMEKEEPING',
        evidenceItems: [
          makeEvidence('SCORER_UNAVAILABLE'),
          makeEvidence('123'),
        ],
      },
      {
        domainKey: 'ACCOUNTING',
        evidenceItems: [
          makeEvidence('SCORER_UNAVAILABLE'),
          makeEvidence('SCORER_UNAVAILABLE'),
        ],
      },
      {
        domainKey: 'POLICY',
        evidenceItems: [makeEvidence('ok')],
      },
    ];
    expect(countTotalMissingEvidence(domains)).toBe(3);
  });

  it('handles domains that have no evidenceItems field', () => {
    const domains: DomainScore[] = [
      { domainKey: 'TIMEKEEPING' },
      {
        domainKey: 'ACCOUNTING',
        evidenceItems: [makeEvidence('SCORER_UNAVAILABLE')],
      },
    ];
    expect(countTotalMissingEvidence(domains)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// filterOpenItems — remediation count
// ---------------------------------------------------------------------------

describe('filterOpenItems', () => {
  it('returns an empty array when there are no items', () => {
    expect(filterOpenItems([])).toEqual([]);
  });

  it('returns only items with status OPEN', () => {
    const items: RemediationItem[] = [
      makeItem('OPEN', 'P1_CRITICAL'),
      makeItem('IN_PROGRESS', 'P2_HIGH'),
      makeItem('RESOLVED', 'P3_MEDIUM'),
      makeItem('OPEN', 'P4_LOW'),
      makeItem('WAIVED', 'P2_HIGH'),
    ];
    const open = filterOpenItems(items);
    expect(open).toHaveLength(2);
    expect(open.every(r => r.status === 'OPEN')).toBe(true);
  });

  it('returns all items when every item is OPEN', () => {
    const items = [
      makeItem('OPEN', 'P1_CRITICAL'),
      makeItem('OPEN', 'P2_HIGH'),
    ];
    expect(filterOpenItems(items)).toHaveLength(2);
  });

  it('returns an empty array when no item is OPEN', () => {
    const items = [
      makeItem('IN_PROGRESS', 'P1_CRITICAL'),
      makeItem('RESOLVED', 'P2_HIGH'),
    ];
    expect(filterOpenItems(items)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// topP1Item — top priority surfacing
// ---------------------------------------------------------------------------

describe('topP1Item', () => {
  it('returns null when there are no open items', () => {
    expect(topP1Item([])).toBeNull();
  });

  it('surfaces a P1_CRITICAL item when one is present', () => {
    const items: RemediationItem[] = [
      makeItem('OPEN', 'P2_HIGH', { title: 'P2 item' }),
      makeItem('OPEN', 'P1_CRITICAL', { title: 'P1 item' }),
      makeItem('OPEN', 'P3_MEDIUM', { title: 'P3 item' }),
    ];
    const result = topP1Item(items);
    expect(result?.priority).toBe('P1_CRITICAL');
    expect(result?.title).toBe('P1 item');
  });

  it('falls back to P2_HIGH when there is no P1_CRITICAL item', () => {
    const items: RemediationItem[] = [
      makeItem('OPEN', 'P3_MEDIUM', { title: 'P3 item' }),
      makeItem('OPEN', 'P2_HIGH', { title: 'P2 item' }),
    ];
    const result = topP1Item(items);
    expect(result?.priority).toBe('P2_HIGH');
    expect(result?.title).toBe('P2 item');
  });

  it('returns null when only P3_MEDIUM or P4_LOW items are present', () => {
    const items: RemediationItem[] = [
      makeItem('OPEN', 'P3_MEDIUM'),
      makeItem('OPEN', 'P4_LOW'),
    ];
    expect(topP1Item(items)).toBeNull();
  });

  it('returns the first P1_CRITICAL item when multiple P1 items exist', () => {
    const items: RemediationItem[] = [
      makeItem('OPEN', 'P1_CRITICAL', { title: 'first P1' }),
      makeItem('OPEN', 'P1_CRITICAL', { title: 'second P1' }),
    ];
    const result = topP1Item(items);
    expect(result?.title).toBe('first P1');
  });
});

// ---------------------------------------------------------------------------
// computeDomainTarget
// ---------------------------------------------------------------------------

describe('computeDomainTarget', () => {
  it('returns 85 when domainWeight is 0', () => {
    expect(computeDomainTarget(80, 75, 0)).toBe(85);
  });

  it('returns 85 when domainWeight is negative', () => {
    expect(computeDomainTarget(80, 75, -0.1)).toBe(85);
  });

  it('computes the correct target for a domain that needs to improve', () => {
    // compositeScore = 0.2 * 50 + 0.8 * 90 = 10 + 72 = 82
    // otherContribution = 82 - 50 * 0.2 = 72
    // needed = (85 - 72) / 0.2 = 65
    const target = computeDomainTarget(82, 50, 0.2);
    expect(target).toBeCloseTo(65, 5);
  });

  it('clamps the result to 0 at the lower bound', () => {
    // If otherContribution alone already exceeds 85, the domain target would be negative
    // compositeScore = 0.1 * 10 + 0.9 * 100 = 1 + 90 = 91
    // otherContribution = 91 - 10 * 0.1 = 90
    // needed = (85 - 90) / 0.1 = -50 → clamped to 0
    const target = computeDomainTarget(91, 10, 0.1);
    expect(target).toBe(0);
  });

  it('clamps the result to 100 at the upper bound', () => {
    // compositeScore = 0.5 * 20 + 0.5 * 10 = 15
    // otherContribution = 15 - 20 * 0.5 = 5
    // needed = (85 - 5) / 0.5 = 160 → clamped to 100
    const target = computeDomainTarget(15, 20, 0.5);
    expect(target).toBe(100);
  });

  it('returns exactly 85 when the domain score is already at the composite target', () => {
    // Equal weights: compositeScore = 85, all domains at 85
    // otherContribution = 85 - 85 * 0.5 = 42.5
    // needed = (85 - 42.5) / 0.5 = 85
    const target = computeDomainTarget(85, 85, 0.5);
    expect(target).toBeCloseTo(85, 5);
  });

  // -------------------------------------------------------------------------
  // Edge cases: floating-point weights that don't sum to exactly 1.0
  // -------------------------------------------------------------------------

  it('handles a weight of exactly 1/7 (repeating decimal) without clamping to an extreme', () => {
    // Seven domains with weight 1/7 each and scores [80,82,84,86,88,90,92].
    // The additive accumulation (as a real engine performs it) yields
    // 85.99999999999999 rather than exactly 86 — a genuine IEEE 754 underflow.
    // For the lowest-scoring domain (score=80):
    //   otherContribution ≈ 85.9999... - 80*(1/7) ≈ 74.5714
    //   needed = (85 - 74.5714) / (1/7) ≈ 73
    const w = 1 / 7;
    const scores = [80, 82, 84, 86, 88, 90, 92];
    const compositeScore = scores.reduce((sum, s) => sum + w * s, 0);
    expect(compositeScore).toBeLessThan(86); // confirm genuine floating-point underflow
    const target = computeDomainTarget(compositeScore, 80, w);
    expect(target).toBeGreaterThan(0);
    expect(target).toBeLessThan(100);
    expect(target).toBeCloseTo(73, 1);
  });

  it('clamps to 100 when weight is a fractional 0.143 and other domains already cover the gap', () => {
    // weight = 0.143 (approx 1/7 stored as 3-decimal float).
    // compositeScore = 78, domainRawScore = 70.
    // otherContribution = 78 - 70 * 0.143 = 78 - 10.01 = 67.99
    // needed = (85 - 67.99) / 0.143 ≈ 119 → clamped to 100
    const target = computeDomainTarget(78, 70, 0.143);
    expect(target).toBe(100);
  });

  it('produces a stable result when domain weights sum to slightly less than 1.0 (floating-point underflow)', () => {
    // Simulate a composite built by an engine whose three 1/3 weights
    // accumulate to 0.9999999999999999 rather than 1.0. The value
    // 79.9999999999999 is a real IEEE 754 double one ULP below 80 and
    // represents what such an engine would emit for three domains all scoring 80.
    //
    // With compositeScore = 79.9999999999999, domainScore = 80, w = 1/3:
    //   otherContribution ≈ 79.9999... - 80*(1/3) ≈ 53.333...
    //   needed = (85 - 53.333...) / (1/3) ≈ 95
    const w = 1 / 3;
    const compositeScore = 79.9999999999999; // verified below 80 in IEEE 754
    expect(compositeScore).toBeLessThan(80);
    const target = computeDomainTarget(compositeScore, 80, w);
    expect(Number.isFinite(target)).toBe(true);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThanOrEqual(100);
    expect(target).toBeCloseTo(95, 1);
  });

  it('produces a stable result when domain weights sum to slightly more than 1.0 (floating-point overflow)', () => {
    // Two domains each with weight 0.5 + Number.EPSILON, simulating an engine
    // rounding error that pushes the weight sum just above 1.0. The composite
    // is built via additive reduction so the tiny overage carries through.
    // With compositeScore ≈ 80.0000...003 and domainScore = 80, w ≈ 0.5+ε:
    //   otherContribution ≈ 40.0000...001
    //   needed = (85 - 40.0000...001) / (0.5+ε) ≈ 90
    const w = 0.5 + Number.EPSILON;
    const compositeScore = [80, 80].reduce((sum, s) => sum + w * s, 0);
    expect(compositeScore).toBeGreaterThan(80); // confirm genuine floating-point overflow
    const target = computeDomainTarget(compositeScore, 80, w);
    expect(Number.isFinite(target)).toBe(true);
    expect(target).toBeGreaterThanOrEqual(0);
    expect(target).toBeLessThanOrEqual(100);
    expect(target).toBeCloseTo(90, 1);
  });

  it('clamps to 0 when weight is fractional 0.143 and the other domains already exceed the composite target', () => {
    // otherContribution = compositeScore - domainRawScore * weight
    // = 91 - 10 * 0.143 = 91 - 1.43 = 89.57
    // needed = (85 - 89.57) / 0.143 ≈ -31.96 → clamped to 0
    const target = computeDomainTarget(91, 10, 0.143);
    expect(target).toBe(0);
  });
});
