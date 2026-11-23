import { describe, expect, it } from 'vitest';

import { wilsonInterval } from './wilson.ts';

describe('wilsonInterval', () => {
  it('25/25 correct: lower bound only 0.867', () => {
    // p̂ = 1, z² = 3.8416, denominator = 1 + 3.8416/25 = 1.153664
    // center = (1 + 3.8416/50) / 1.153664 = 0.933400
    // half-width = 1.96/1.153664 · √(3.8416/2500) = 0.066598
    const { lower, upper } = wilsonInterval(25, 25);
    expect(lower).toBeCloseTo(0.8668, 4);
    expect(upper).toBeCloseTo(1, 12);
  });

  it('per-type guardrail at n = 25 fires from 8 errors upwards (upper bound < 0.85)', () => {
    expect(wilsonInterval(18, 25).upper).toBeCloseTo(0.8572, 4);
    expect(wilsonInterval(17, 25).upper).toBeCloseTo(0.828, 3);
    expect(wilsonInterval(18, 25).upper).toBeGreaterThanOrEqual(0.85);
    expect(wilsonInterval(17, 25).upper).toBeLessThan(0.85);
  });

  it('0.93 observed on 300 is not enough to prove ≥ 0.90', () => {
    const { lower, upper } = wilsonInterval(279, 300);
    expect(lower).toBeCloseTo(0.895, 3);
    expect(upper).toBeCloseTo(0.954, 3);
  });

  it('is symmetric: k successes ↔ n − k failures', () => {
    const a = wilsonInterval(3, 40);
    const b = wilsonInterval(37, 40);
    expect(a.lower).toBeCloseTo(1 - b.upper, 12);
    expect(a.upper).toBeCloseTo(1 - b.lower, 12);
  });

  it('has positive width at the extremes, unlike the Wald interval', () => {
    const { lower, upper } = wilsonInterval(0, 10);
    // center = half-width = 0.13877 when p̂ = 0
    expect(lower).toBeCloseTo(0, 12);
    expect(upper).toBeCloseTo(0.2775, 4);
  });

  it('narrows as n grows', () => {
    const small = wilsonInterval(93, 100);
    const large = wilsonInterval(930, 1000);
    expect(large.upper - large.lower).toBeLessThan(small.upper - small.lower);
  });

  it('rejects invalid input', () => {
    expect(() => wilsonInterval(1, 0)).toThrow(RangeError);
    expect(() => wilsonInterval(5, 4)).toThrow(RangeError);
    expect(() => wilsonInterval(-1, 4)).toThrow(RangeError);
    expect(() => wilsonInterval(1.5, 4)).toThrow(RangeError);
    expect(() => wilsonInterval(1, 4, 0)).toThrow(RangeError);
  });
});
