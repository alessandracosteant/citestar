import { describe, expect, it } from 'vitest';

import { bootstrapInterval, quantile } from './bootstrap.ts';
import { mulberry32 } from './random.ts';

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('mulberry32', () => {
  it('is reproducible for the same seed and differs across seeds', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const c = mulberry32(43);
    const first = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(first);
    expect(c()).not.toBe(first[0]);
  });

  it('produces values in [0, 1) with mean close to 1/2', () => {
    const random = mulberry32(7);
    const values = Array.from({ length: 10_000 }, random);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    // Standard error of the mean of U(0,1) over 10,000 draws: √(1/12)/100 ≈ 0.003
    expect(mean(values)).toBeCloseTo(0.5, 1);
  });
});

describe('quantile', () => {
  it('interpolates linearly between ranks (type 7)', () => {
    // h = (4 − 1)·q
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75, 12); // h = 0.75
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 12); // h = 1.5
    expect(quantile([1, 2, 3, 4], 1)).toBe(4);
    expect(quantile([5], 0.3)).toBe(5);
  });

  it('rejects empty input and q outside [0, 1]', () => {
    expect(() => quantile([], 0.5)).toThrow(RangeError);
    expect(() => quantile([1], 1.5)).toThrow(RangeError);
  });
});

describe('bootstrapInterval', () => {
  it('collapses to the value for constant data', () => {
    expect(bootstrapInterval([3, 3, 3, 3], mean)).toEqual({ lower: 3, upper: 3 });
  });

  it('is reproducible with the same seed', () => {
    const data = [0.1, 0.5, 0.9, 0.3, 0.7];
    expect(bootstrapInterval(data, mean, { seed: 9 })).toEqual(
      bootstrapInterval(data, mean, { seed: 9 }),
    );
  });

  it('approximates the normal interval for the mean of a fair coin', () => {
    // 50 ones and 50 zeros: mean 0.5, standard error √(0.25/100) = 0.05,
    // normal 95% interval ≈ 0.5 ± 0.098.
    const data = [...Array<number>(50).fill(1), ...Array<number>(50).fill(0)];
    const { lower, upper } = bootstrapInterval(data, mean, { iterations: 4000, seed: 3 });
    expect(lower).toBeGreaterThan(0.38);
    expect(lower).toBeLessThan(0.43);
    expect(upper).toBeGreaterThan(0.57);
    expect(upper).toBeLessThan(0.62);
  });

  it('rejects invalid options', () => {
    expect(() => bootstrapInterval([], mean)).toThrow(RangeError);
    expect(() => bootstrapInterval([1], mean, { iterations: 0 })).toThrow(RangeError);
    expect(() => bootstrapInterval([1], mean, { confidence: 1 })).toThrow(RangeError);
  });
});
