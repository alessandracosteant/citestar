import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { logit, sigmoid } from './logistic.ts';

describe('sigmoid', () => {
  it('matches hand-computed values', () => {
    expect(sigmoid(0)).toBe(0.5);
    // σ(ln 3) = 1 / (1 + 1/3) = 3/4
    expect(sigmoid(Math.log(3))).toBeCloseTo(0.75, 12);
    expect(sigmoid(-Math.log(3))).toBeCloseTo(0.25, 12);
  });

  it('does not overflow or return NaN at extreme scores', () => {
    expect(sigmoid(1000)).toBe(1);
    expect(sigmoid(-1000)).toBe(0);
    expect(() => sigmoid(NaN)).toThrow(RangeError);
  });

  it('is symmetric: σ(−x) = 1 − σ(x)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -30, max: 30, noNaN: true }),
        (x) => Math.abs(sigmoid(-x) - (1 - sigmoid(x))) < 1e-12,
      ),
    );
  });
});

describe('logit', () => {
  it('is the inverse of sigmoid', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -20, max: 20, noNaN: true }),
        (x) => Math.abs(logit(sigmoid(x)) - x) < 1e-6,
      ),
    );
  });

  it('rejects probabilities outside (0, 1)', () => {
    expect(() => logit(0)).toThrow(RangeError);
    expect(() => logit(1)).toThrow(RangeError);
    expect(() => logit(NaN)).toThrow(RangeError);
  });
});
