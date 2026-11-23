import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  calibrationByStratum,
  calibrationTest,
  equalMassBins,
  expectedCalibrationError,
} from './ece.ts';
import type { Prediction } from './ece.ts';
import { mulberry32 } from './random.ts';

const preds = (rows: readonly (readonly [number, boolean])[]): Prediction[] =>
  rows.map(([confidence, correct]) => ({ confidence, correct }));

describe('equalMassBins', () => {
  it('splits 10 items into 5 bins of 2', () => {
    expect(equalMassBins([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
      [6, 7],
      [8, 9],
    ]);
  });

  it('spreads the remainder so sizes differ by at most one', () => {
    // n = 7, m = 3: boundaries ⌊0⌋, ⌊7/3⌋ = 2, ⌊14/3⌋ = 4, 7 → sizes 2, 2, 3
    expect(equalMassBins([1, 2, 3, 4, 5, 6, 7], 3).map((b) => b.length)).toEqual([2, 2, 3]);
  });

  it('leaves some bins empty when there are fewer items than bins', () => {
    expect(equalMassBins([1, 2], 5).map((b) => b.length)).toEqual([0, 0, 1, 0, 1]);
  });

  it('rejects a non-positive number of bins', () => {
    expect(() => equalMassBins([1], 0)).toThrow(RangeError);
  });
});

describe('expectedCalibrationError', () => {
  it('matches a hand computation', () => {
    // Bins of 2, sorted by confidence:
    //   conf .1 .2 → mean .15, acc 0/2 = 0   → |0 − .15|  = .15
    //   conf .3 .4 → mean .35, acc 1/2       → |.5 − .35| = .15
    //   conf .5 .6 → mean .55, acc 1/2       → |.5 − .55| = .05
    //   conf .7 .8 → mean .75, acc 2/2       → |1 − .75|  = .25
    //   conf .9 1  → mean .95, acc 2/2       → |1 − .95|  = .05
    // Each bin weighs 2/10: ECE = .2 · (.15 + .15 + .05 + .25 + .05) = .13
    const p = preds([
      [0.9, true],
      [0.1, false],
      [0.4, true],
      [0.6, false],
      [0.2, false],
      [1.0, true],
      [0.8, true],
      [0.3, false],
      [0.7, true],
      [0.5, true],
    ]);
    expect(expectedCalibrationError(p)).toBeCloseTo(0.13, 12);
  });

  it('is 0 when accuracy equals confidence in every bin', () => {
    const p = preds([
      [0.5, true],
      [0.5, false],
      [1, true],
      [1, true],
    ]);
    expect(expectedCalibrationError(p, 2)).toBe(0);
  });

  it('is 1 for a model that is always certain and always wrong', () => {
    expect(
      expectedCalibrationError(
        preds([
          [1, false],
          [1, false],
          [1, false],
        ]),
      ),
    ).toBe(1);
  });

  it('weights bins by their size', () => {
    // m = 2, n = 3: bins of 1 and 2.
    //   [.2 wrong]           → |0 − .2| = .2, weight 1/3
    //   [.6 right, .8 right] → |1 − .7| = .3, weight 2/3
    // ECE = .2/3 + .6/3 = 0.8/3
    const p = preds([
      [0.8, true],
      [0.2, false],
      [0.6, true],
    ]);
    expect(expectedCalibrationError(p, 2)).toBeCloseTo(0.8 / 3, 12);
  });

  it('rejects empty input and confidences outside [0, 1]', () => {
    expect(() => expectedCalibrationError([])).toThrow(RangeError);
    expect(() => expectedCalibrationError(preds([[1.2, true]]))).toThrow(RangeError);
    expect(() => expectedCalibrationError(preds([[NaN, true]]))).toThrow(RangeError);
    expect(() => expectedCalibrationError(preds([[0.5, true]]), 0)).toThrow(RangeError);
    expect(() => calibrationTest(preds([[0.5, true]]), { bins: 2.5 })).toThrow(RangeError);
  });
});

/** n predictions at a fixed confidence, with exactly ⌊n·accuracy⌋ correct, evenly spread. */
const evenly = (n: number, confidence: number, accuracy: number): Prediction[] =>
  Array.from({ length: n }, (_, i) => ({
    confidence,
    correct: Math.floor((i + 1) * accuracy) > Math.floor(i * accuracy),
  }));

describe('calibrationTest (consistency resampling)', () => {
  it('certain and always right: ECE 0, no noise, p-value 1', () => {
    // Under H₀ every y* = 1, so every ECE* = 0 ≥ 0: p = (1 + B)/(B + 1) = 1.
    const result = calibrationTest(evenly(10, 1, 1), { iterations: 99 });
    expect(result).toEqual({
      n: 10,
      ece: 0,
      expectedNoise: 0,
      excess: 0,
      pValue: 1,
      iterations: 99,
    });
  });

  it('certain and always wrong: excess 1, smallest possible p-value 1/(B + 1)', () => {
    const result = calibrationTest(evenly(10, 1, 0), { iterations: 99 });
    expect(result.ece).toBe(1);
    expect(result.excess).toBe(1);
    expect(result.pValue).toBeCloseTo(1 / 100, 12);
  });

  it('expected noise matches √(2/π)·Σ_b (n_b/n)·√(p̄_b(1 − p̄_b)/n_b) on large bins', () => {
    // 5 bins of 400 predictions, each bin at a constant confidence. With equal
    // confidences inside a bin the formula is exact up to the normal
    // approximation (0.1% from the exact binomial value here).
    const confidences = [0.55, 0.65, 0.75, 0.85, 0.95];
    const predictions = confidences.flatMap((c) => evenly(400, c, c));
    const formula =
      Math.sqrt(2 / Math.PI) *
      confidences.reduce((sum, p) => sum + (400 / 2000) * Math.sqrt((p * (1 - p)) / 400), 0);
    expect(formula).toBeCloseTo(0.01582, 5);
    const { expectedNoise } = calibrationTest(predictions, { seed: 11 });
    expect(Math.abs(expectedNoise - formula) / formula).toBeLessThan(0.03);
  });

  it('does not reject data drawn from the stated confidences', () => {
    const random = mulberry32(2024);
    const predictions = Array.from({ length: 500 }, (_, i) => {
      const confidence = 0.5 + (0.5 * i) / 500;
      return { confidence, correct: random() < confidence };
    });
    const result = calibrationTest(predictions, { seed: 5 });
    expect(result.pValue).toBeGreaterThan(0.05);
    expect(Math.abs(result.excess)).toBeLessThan(0.02);
  });

  it('rejects an overconfident model', () => {
    // Claims 0.9, is right half of the time.
    const result = calibrationTest(evenly(200, 0.9, 0.5), { iterations: 999 });
    expect(result.ece).toBeCloseTo(0.4, 12);
    expect(result.excess).toBeGreaterThan(0.35);
    expect(result.pValue).toBeCloseTo(1 / 1000, 12);
  });

  it('is reproducible with the same seed and validates its options', () => {
    const data = evenly(100, 0.7, 0.6);
    expect(calibrationTest(data, { seed: 3 })).toEqual(calibrationTest(data, { seed: 3 }));
    expect(() => calibrationTest(data, { iterations: 0 })).toThrow(RangeError);
    expect(() => calibrationTest([])).toThrow(RangeError);
  });
});

describe('calibrationByStratum', () => {
  it('reveals miscalibration that pooling dilutes: ECE_pooled = (1 − w)·ECE_rest', () => {
    // rest: 300 mentions at confidence 0.8, accuracy 0.72 → ECE_rest = 0.08.
    // explicit: 200 identifiers at confidence 1, all correct → ECE = 0.
    // w = 200/500 = 0.4. Pooled, the explicit ones fill the top 2 of 5 bins:
    // ECE_pooled = (300 · 0.08 + 0)/500 = 0.048, which would pass a 0.05 target.
    const rest = evenly(300, 0.8, 0.72).map((p) => ({ ...p, stratum: 'rest' }));
    const explicit = evenly(200, 1, 1).map((p) => ({ ...p, stratum: 'explicit' }));
    const all = [...explicit, ...rest];

    expect(expectedCalibrationError(all)).toBeCloseTo(0.048, 12);

    const byStratum = calibrationByStratum(all, { iterations: 200 });
    expect([...byStratum.keys()]).toEqual(['explicit', 'rest']);
    expect(byStratum.get('rest')?.ece).toBeCloseTo(0.08, 12);
    expect(byStratum.get('rest')?.n).toBe(300);
    expect(byStratum.get('explicit')?.ece).toBe(0);
  });
});

describe('ties in confidence', () => {
  it('never splits equal confidences across bins, so input order does not matter', () => {
    // Same four predictions in two orders. Splitting the tie would give bins
    // {✓✓}, {✗✗} → ECE 0.5 for the first order and 0 for the second.
    const rightFirst = preds([
      [0.5, true],
      [0.5, true],
      [0.5, false],
      [0.5, false],
    ]);
    const alternating = preds([
      [0.5, true],
      [0.5, false],
      [0.5, true],
      [0.5, false],
    ]);
    expect(expectedCalibrationError(rightFirst, 2)).toBe(0);
    expect(expectedCalibrationError(alternating, 2)).toBe(0);
  });

  it('moves a cut to the end of its tie group', () => {
    // n = 6, m = 3: cuts 2 and 4. Confidences .2 .5 .5 .5 .9 .9: cut 2 falls
    // inside the .5 group and moves to 4, merging with the second cut.
    // Bins: {.2 ✗, .5 ✓, .5 ✓, .5 ✗} and {.9 ✓, .9 ✓}.
    //   bin 1: |k − S| = |2 − 1.7| = 0.3;  bin 2: |2 − 1.8| = 0.2
    // ECE = (0.3 + 0.2) / 6
    const p = preds([
      [0.9, true],
      [0.5, true],
      [0.2, false],
      [0.5, false],
      [0.9, true],
      [0.5, true],
    ]);
    expect(expectedCalibrationError(p, 3)).toBeCloseTo(0.5 / 6, 12);
  });

  it('gives the same ECE for any permutation of the input', () => {
    const prediction = fc.record({
      confidence: fc.constantFrom(0, 0.2, 0.5, 0.8, 1),
      correct: fc.boolean(),
    });
    fc.assert(
      fc.property(
        fc.array(prediction, { minLength: 1, maxLength: 40 }),
        fc.integer({ min: 1, max: 7 }),
        fc.func(fc.integer()),
        (data, bins, key) => {
          const shuffled = data
            .map((p, i) => ({ p, k: key(i) }))
            .sort((a, b) => a.k - b.k)
            .map(({ p }) => p);
          return (
            Math.abs(
              expectedCalibrationError(data, bins) - expectedCalibrationError(shuffled, bins),
            ) < 1e-12
          );
        },
      ),
      { numRuns: 500 },
    );
  });
});
