import { mulberry32 } from './random.ts';
import type { Random } from './random.ts';
import type { Interval } from './wilson.ts';

/**
 * Quantile of sorted values with linear interpolation between the two nearest
 * ranks (the "type 7" definition, default in R and NumPy): position
 * h = (n − 1)·q, result = x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋ + 1] − x[⌊h⌋]).
 */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new RangeError('quantile: no values');
  if (!(q >= 0 && q <= 1)) throw new RangeError('quantile: q must be in [0, 1]');
  const h = (sorted.length - 1) * q;
  const lo = Math.floor(h);
  const below = sorted[lo] ?? NaN;
  const above = sorted[Math.min(lo + 1, sorted.length - 1)] ?? NaN;
  return below + (h - lo) * (above - below);
}

export interface BootstrapOptions {
  /** Number of resamples. Default 2000. */
  readonly iterations?: number;
  /** Confidence level of the interval. Default 0.95. */
  readonly confidence?: number;
  /** Seed of the pseudo-random generator, for reproducible results. Default 1. */
  readonly seed?: number;
  /** Custom random source; overrides `seed`. */
  readonly random?: Random;
}

/**
 * Percentile bootstrap confidence interval of `statistic` over `data`.
 *
 * The sample stands in for the population: we draw `iterations` new samples
 * of the same size **with replacement**, compute the statistic on each, and
 * take the (α/2, 1 − α/2) quantiles of the results, with α = 1 − confidence.
 */
export function bootstrapInterval<T>(
  data: readonly T[],
  statistic: (sample: readonly T[]) => number,
  options: BootstrapOptions = {},
): Interval {
  const { iterations = 2000, confidence = 0.95, seed = 1 } = options;
  if (data.length === 0) throw new RangeError('bootstrapInterval: no data');
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError('bootstrapInterval: iterations must be a positive integer');
  }
  if (!(confidence > 0 && confidence < 1)) {
    throw new RangeError('bootstrapInterval: confidence must be in (0, 1)');
  }
  const random = options.random ?? mulberry32(seed);

  const n = data.length;
  const stats: number[] = [];
  const sample = new Array<T>(n);
  for (let i = 0; i < iterations; i++) {
    for (let j = 0; j < n; j++) {
      sample[j] = data[Math.floor(random() * n)] as T;
    }
    stats.push(statistic(sample));
  }
  stats.sort((a, b) => a - b);

  const alpha = 1 - confidence;
  return { lower: quantile(stats, alpha / 2), upper: quantile(stats, 1 - alpha / 2) };
}
