import { mulberry32 } from './random.ts';
import type { Random } from './random.ts';

export interface Prediction {
  /** Predicted probability that the prediction is correct, in [0, 1]. */
  readonly confidence: number;
  readonly correct: boolean;
}

/**
 * Splits items, already sorted, into `bins` groups of equal size (sizes differ
 * by at most one). Bin b gets indices [⌊b·n/m⌋, ⌊(b+1)·n/m⌋). When n < m some
 * bins are empty.
 */
export function equalMassBins<T>(sorted: readonly T[], bins: number): T[][] {
  if (!Number.isInteger(bins) || bins < 1) throw new RangeError('bins must be a positive integer');
  const n = sorted.length;
  return Array.from({ length: bins }, (_, b) =>
    sorted.slice(Math.floor((b * n) / bins), Math.floor(((b + 1) * n) / bins)),
  );
}

/** Non-empty equal-mass bins of predictions sorted by confidence. */
function binPredictions(predictions: readonly Prediction[], bins: number): Prediction[][] {
  if (predictions.length === 0) throw new RangeError('no predictions');
  for (const { confidence } of predictions) {
    if (!(confidence >= 0 && confidence <= 1)) {
      throw new RangeError(`confidence must be in [0, 1], got ${String(confidence)}`);
    }
  }
  const sorted = [...predictions].sort((a, b) => a.confidence - b.confidence);
  return equalMassBins(sorted, bins).filter((bin) => bin.length > 0);
}

/**
 * ECE from per-bin counts: (n_b/n)·|k_b/n_b − S_b/n_b| = |k_b − S_b| / n, where
 * k_b is the number correct and S_b the sum of confidences in bin b. Observed
 * and simulated ECEs go through this same function, so that ties compare
 * exactly in the p-value.
 */
function eceFromCounts(
  correct: readonly number[],
  confidenceSums: readonly number[],
  n: number,
): number {
  let total = 0;
  correct.forEach((k, b) => {
    total += Math.abs(k - (confidenceSums[b] ?? NaN));
  });
  return total / n;
}

const sumConfidence = (bin: readonly Prediction[]): number =>
  bin.reduce((sum, p) => sum + p.confidence, 0);
const countCorrect = (bin: readonly Prediction[]): number =>
  bin.reduce((count, p) => count + (p.correct ? 1 : 0), 0);

/**
 * Expected Calibration Error with equal-mass bins:
 *
 *   ECE = Σ_b (|B_b| / n) · |acc(B_b) − conf(B_b)|
 *
 * Predictions are sorted by confidence (ties keep their input order) and split
 * into `bins` groups of equal size. Equal-mass bins avoid the nearly empty,
 * noisy bins that fixed-width bins produce when most confidences are high.
 * See docs/MATH.md §2, including the noise floor of this estimate.
 */
export function expectedCalibrationError(predictions: readonly Prediction[], bins = 5): number {
  const binned = binPredictions(predictions, bins);
  return eceFromCounts(binned.map(countCorrect), binned.map(sumConfidence), predictions.length);
}

export interface CalibrationTestOptions {
  /** Number of equal-mass bins. Default 5. */
  readonly bins?: number;
  /** Number of simulated datasets B. Default 2000. */
  readonly iterations?: number;
  /** Seed of the pseudo-random generator. Default 1. */
  readonly seed?: number;
  /** Custom random source; overrides `seed`. */
  readonly random?: Random;
}

export interface CalibrationTest {
  readonly n: number;
  /** Observed ECE. */
  readonly ece: number;
  /** E[ECE*]: the ECE a perfectly calibrated model shows on these confidences. */
  readonly expectedNoise: number;
  /** ece − expectedNoise: the miscalibration beyond sampling noise. */
  readonly excess: number;
  /** (1 + #{ECE* ≥ ece}) / (B + 1), under H₀: perfect calibration. */
  readonly pValue: number;
  readonly iterations: number;
}

/**
 * Consistency resampling (Bröcker & Smith, 2007). Under H₀ "the model is
 * perfectly calibrated", outcome i is Bernoulli(confidenceᵢ). We simulate B
 * datasets y* from the same confidences (and therefore the same bins), compute
 * ECE* on each, and compare the observed ECE with that distribution:
 *
 * - expectedNoise = mean of ECE*, the ECE that sampling noise alone produces;
 * - excess = observed ECE − expectedNoise;
 * - pValue = (1 + #{ECE* ≥ ECE}) / (B + 1). The +1 counts the observed data as
 *   one of the draws under H₀, which keeps the test valid and the p-value > 0.
 *
 * See docs/MATH.md §2.
 */
export function calibrationTest(
  predictions: readonly Prediction[],
  options: CalibrationTestOptions = {},
): CalibrationTest {
  const { bins = 5, iterations = 2000, seed = 1 } = options;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError('calibrationTest: iterations must be a positive integer');
  }
  const random = options.random ?? mulberry32(seed);

  const n = predictions.length;
  const binned = binPredictions(predictions, bins);
  const confidenceSums = binned.map(sumConfidence);
  const ece = eceFromCounts(binned.map(countCorrect), confidenceSums, n);

  let noiseSum = 0;
  let atLeastObserved = 0;
  const simulated = new Array<number>(binned.length);
  for (let i = 0; i < iterations; i++) {
    binned.forEach((bin, b) => {
      let k = 0;
      for (const p of bin) if (random() < p.confidence) k++;
      simulated[b] = k;
    });
    const simulatedEce = eceFromCounts(simulated, confidenceSums, n);
    noiseSum += simulatedEce;
    if (simulatedEce >= ece) atLeastObserved++;
  }

  const expectedNoise = noiseSum / iterations;
  return {
    n,
    ece,
    expectedNoise,
    excess: ece - expectedNoise,
    pValue: (1 + atLeastObserved) / (iterations + 1),
    iterations,
  };
}

export interface StratifiedPrediction extends Prediction {
  /**
   * Group the prediction belongs to. Evaluation uses "explicit" for mentions
   * with an explicit identifier (DOI, ISBN, arXiv), "rest" for all others.
   */
  readonly stratum: string;
}

/**
 * Runs calibrationTest separately on each stratum, each with its own bins.
 *
 * Pooling strata hides miscalibration: explicit identifiers have p ≈ 1 and are
 * almost always right, so with a share w of them the pooled ECE is roughly
 * (1 − w)·ECE_rest. See docs/MATH.md §2.
 *
 * @returns one result per stratum, ordered by stratum name.
 */
export function calibrationByStratum(
  predictions: readonly StratifiedPrediction[],
  options: CalibrationTestOptions = {},
): Map<string, CalibrationTest> {
  const groups = new Map<string, StratifiedPrediction[]>();
  for (const p of predictions) {
    const group = groups.get(p.stratum);
    if (group === undefined) groups.set(p.stratum, [p]);
    else group.push(p);
  }
  const names = [...groups.keys()].sort();
  return new Map(names.map((name) => [name, calibrationTest(groups.get(name) ?? [], options)]));
}
