/**
 * log(Σᵢ e^(xᵢ)) computed without overflow.
 *
 * e^1000 overflows a double, but log Σ e^(xᵢ) = M + log Σ e^(xᵢ − M) for any M.
 * Choosing M = max xᵢ makes every exponent ≤ 0, so each term is in (0, 1] and
 * at least one term equals 1: no overflow, and the sum never underflows to 0.
 *
 * Returns −∞ for an empty list or a list of −∞ values (sum of nothing is 0).
 */
export function logSumExp(values: readonly number[]): number {
  // A loop, not Math.max(...values): spreading a large array overflows the call
  // stack (around 10⁵ elements).
  let max = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v) || v === Infinity) {
      throw new RangeError('logSumExp: values must not be +∞ or NaN');
    }
    if (v > max) max = v;
  }
  if (max === -Infinity) return -Infinity;
  let sum = 0;
  for (const v of values) sum += Math.exp(v - max);
  return max + Math.log(sum);
}

/**
 * Softmax with temperature T:
 *
 *   softmax(s / T)ᵢ = e^(sᵢ/T) / Σⱼ e^(sⱼ/T)
 *
 * T → 0 sharpens the distribution towards the maximum; T → ∞ flattens it
 * towards uniform. A score of −∞ gets probability 0 (useful to mask a
 * candidate). Computed in log space with logSumExp for numerical stability.
 */
export function softmax(scores: readonly number[], temperature = 1): number[] {
  if (!(temperature > 0) || !Number.isFinite(temperature)) {
    throw new RangeError('softmax: temperature must be a finite number > 0');
  }
  if (scores.length === 0) return [];
  const scaled = scores.map((s) => s / temperature);
  const lse = logSumExp(scaled);
  if (lse === -Infinity) throw new RangeError('softmax: at least one score must be finite');
  return scaled.map((s) => Math.exp(s - lse));
}
