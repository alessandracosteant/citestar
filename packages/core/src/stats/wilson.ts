export interface Interval {
  readonly lower: number;
  readonly upper: number;
}

/** z for a two-sided 95% interval (the 97.5th percentile of N(0, 1), rounded). */
export const Z_95 = 1.96;

/**
 * Wilson score interval for a binomial proportion.
 *
 * It contains every p for which the observed proportion p̂ = successes / n is
 * not surprising, |p̂ − p| ≤ z·√(p(1 − p)/n). Solving that quadratic in p:
 *
 *   center     = (p̂ + z²/(2n)) / (1 + z²/n)
 *   half-width = z / (1 + z²/n) · √(p̂(1 − p̂)/n + z²/(4n²))
 *
 * Unlike the Wald interval p̂ ± z·√(p̂(1 − p̂)/n), it stays meaningful near 0
 * and 1 (where precision lives). See docs/MATH.md §3.
 */
export function wilsonInterval(successes: number, n: number, z = Z_95): Interval {
  if (!Number.isInteger(n) || n <= 0)
    throw new RangeError('wilsonInterval: n must be a positive integer');
  if (!Number.isInteger(successes) || successes < 0 || successes > n) {
    throw new RangeError('wilsonInterval: successes must be an integer in [0, n]');
  }
  if (!(z > 0 && Number.isFinite(z)))
    throw new RangeError('wilsonInterval: z must be finite and > 0');

  const p = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denominator;
  const halfWidth = (z / denominator) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));

  // Clamp rounding noise: mathematically the bounds are already in [0, 1].
  return {
    lower: Math.max(0, center - halfWidth),
    upper: Math.min(1, center + halfWidth),
  };
}
