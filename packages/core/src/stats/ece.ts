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
  const n = predictions.length;
  if (n === 0) throw new RangeError('expectedCalibrationError: no predictions');
  for (const { confidence } of predictions) {
    if (!(confidence >= 0 && confidence <= 1)) {
      throw new RangeError(`confidence must be in [0, 1], got ${String(confidence)}`);
    }
  }

  const sorted = [...predictions].sort((a, b) => a.confidence - b.confidence);
  let ece = 0;
  for (const bin of equalMassBins(sorted, bins)) {
    if (bin.length === 0) continue;
    let confidenceSum = 0;
    let correctCount = 0;
    for (const p of bin) {
      confidenceSum += p.confidence;
      if (p.correct) correctCount++;
    }
    ece += (bin.length / n) * Math.abs(correctCount / bin.length - confidenceSum / bin.length);
  }
  return ece;
}
