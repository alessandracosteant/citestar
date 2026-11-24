/**
 * Logistic function σ(x) = 1 / (1 + e⁻ˣ), mapping a log-odds score to a
 * probability in (0, 1). Computed so that neither branch overflows: for
 * x ≥ 0 it uses e⁻ˣ ≤ 1, for x < 0 the equivalent eˣ / (1 + eˣ) with eˣ < 1.
 */
export function sigmoid(x: number): number {
  if (Number.isNaN(x)) throw new RangeError('sigmoid: x is NaN');
  if (x >= 0) return 1 / (1 + Math.exp(-x));
  const e = Math.exp(x);
  return e / (1 + e);
}

/** Inverse of σ: log(p / (1 − p)), the log-odds of a probability in (0, 1). */
export function logit(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError('logit: p must be in (0, 1)');
  return Math.log(p / (1 - p));
}
