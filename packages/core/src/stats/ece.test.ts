import { describe, expect, it } from 'vitest';

import { equalMassBins, expectedCalibrationError } from './ece.ts';
import type { Prediction } from './ece.ts';

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
  });
});
