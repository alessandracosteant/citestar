import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { logSumExp, softmax } from './softmax.ts';

describe('logSumExp', () => {
  it('equals log Σ e^x on small values', () => {
    // e^0 + e^(ln 2) + e^(ln 3) = 1 + 2 + 3 = 6
    expect(logSumExp([0, Math.log(2), Math.log(3)])).toBeCloseTo(Math.log(6), 12);
  });

  it('does not overflow on large values', () => {
    // log(e^1000 + e^1000) = 1000 + log 2
    expect(logSumExp([1000, 1000])).toBeCloseTo(1000 + Math.log(2), 9);
  });

  it('returns −∞ for an empty list or only −∞', () => {
    expect(logSumExp([])).toBe(-Infinity);
    expect(logSumExp([-Infinity, -Infinity])).toBe(-Infinity);
  });

  it('rejects +∞ and NaN', () => {
    expect(() => logSumExp([1, Infinity])).toThrow(RangeError);
    expect(() => logSumExp([1, NaN])).toThrow(RangeError);
  });
});

describe('softmax', () => {
  it('turns scores into probabilities proportional to e^s', () => {
    // e^s = 1, 2, 3 → probabilities 1/6, 2/6, 3/6
    const p = softmax([0, Math.log(2), Math.log(3)]);
    expect(p[0]).toBeCloseTo(1 / 6, 12);
    expect(p[1]).toBeCloseTo(2 / 6, 12);
    expect(p[2]).toBeCloseTo(3 / 6, 12);
  });

  it('divides scores by the temperature', () => {
    // T = 2: [0, 2 ln 2] / 2 = [0, ln 2] → e^z = 1, 2 → 1/3, 2/3
    const p = softmax([0, 2 * Math.log(2)], 2);
    expect(p[0]).toBeCloseTo(1 / 3, 12);
    expect(p[1]).toBeCloseTo(2 / 3, 12);
  });

  it('gets sharper as T decreases and flatter as T increases', () => {
    const scores = [1, 2];
    const sharp = softmax(scores, 0.1)[1] ?? NaN;
    const normal = softmax(scores, 1)[1] ?? NaN;
    const flat = softmax(scores, 100)[1] ?? NaN;
    expect(sharp).toBeGreaterThan(normal);
    expect(normal).toBeGreaterThan(flat);
    expect(flat).toBeCloseTo(0.5, 2);
  });

  it('is stable on large scores', () => {
    // [1000, 1001] behaves like [0, 1]: 1/(1+e), e/(1+e)
    const p = softmax([1000, 1001]);
    expect(p[0]).toBeCloseTo(1 / (1 + Math.E), 12);
    expect(p[1]).toBeCloseTo(Math.E / (1 + Math.E), 12);
  });

  it('gives probability 0 to −∞ scores', () => {
    expect(softmax([0, -Infinity, 0])).toEqual([0.5, 0, 0.5]);
  });

  it('sums to 1', () => {
    const p = softmax([0.3, -1.2, 4, 2.5, 0]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('returns an empty list for no scores and rejects invalid input', () => {
    expect(softmax([])).toEqual([]);
    expect(() => softmax([1], 0)).toThrow(RangeError);
    expect(() => softmax([1], -1)).toThrow(RangeError);
    expect(() => softmax([1], NaN)).toThrow(RangeError);
    expect(() => softmax([-Infinity])).toThrow(RangeError);
  });
});

describe('softmax properties', () => {
  // Bounded scores: with |s| up to 1e300 a shift would lose all precision.
  const score = fc.double({ min: -500, max: 500, noNaN: true });
  const scores = fc.array(score, { minLength: 1, maxLength: 20 });
  const temperature = fc.double({ min: 0.05, max: 50, noNaN: true });

  it('sums to 1, with every probability in [0, 1]', () => {
    fc.assert(
      fc.property(scores, temperature, (s, t) => {
        const p = softmax(s, t);
        const sum = p.reduce((a, b) => a + b, 0);
        return Math.abs(sum - 1) < 1e-9 && p.every((x) => x >= 0 && x <= 1);
      }),
    );
  });

  it('is invariant to adding the same constant to every score', () => {
    fc.assert(
      fc.property(scores, score, temperature, (s, c, t) => {
        const p = softmax(s, t);
        const q = softmax(
          s.map((x) => x + c),
          t,
        );
        return p.every((x, i) => Math.abs(x - (q[i] ?? NaN)) < 1e-9);
      }),
    );
  });

  it('preserves the order of the scores', () => {
    fc.assert(
      fc.property(scores, temperature, (s, t) => {
        const p = softmax(s, t);
        return s.every((x, i) => s.every((y, j) => !(x > y) || (p[i] ?? NaN) >= (p[j] ?? NaN)));
      }),
    );
  });
});
