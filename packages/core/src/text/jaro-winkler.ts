/**
 * Jaro and Jaro–Winkler string similarity, in [0, 1].
 *
 * Jaro: two characters "match" if they are equal and no farther apart than
 * w = ⌊max(|a|, |b|) / 2⌋ − 1 positions. With m matches and t transpositions
 * (half the number of matched characters that appear in a different order):
 *
 *   J = (m/|a| + m/|b| + (m − t)/m) / 3,   and J = 0 when m = 0.
 *
 * Winkler adds a bonus for a common prefix of length ℓ ≤ 4, because typos are
 * rarer at the start of a word:
 *
 *   JW = J + ℓ · p · (1 − J),   with p = 0.1,
 *
 * applied only when J ≥ 0.7 (Winkler's boost threshold), so that two unrelated
 * strings do not look similar just because they share a prefix.
 *
 * Strings are compared by Unicode code point, not UTF-16 unit, so characters
 * outside the Basic Multilingual Plane count once. Both arguments must be
 * normalized (see normalize.ts): comparing raw strings would make "Dune" and
 * "dune" differ.
 */
import type { Normalized } from './normalize.ts';

export interface JaroWinklerOptions {
  /** Weight p of the common-prefix bonus. Must be ≤ 1 / maxPrefix. Default 0.1. */
  readonly prefixScale?: number;
  /** Maximum prefix length ℓ that earns the bonus. Default 4. */
  readonly maxPrefix?: number;
  /** Jaro similarity below which no bonus is given. Default 0.7. */
  readonly boostThreshold?: number;
}

export function jaro(a: Normalized, b: Normalized): number {
  const s = Array.from(a);
  const t = Array.from(b);
  if (s.length === 0 && t.length === 0) return 1;
  if (s.length === 0 || t.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(s.length, t.length) / 2) - 1);
  const sMatched = new Array<boolean>(s.length).fill(false);
  const tMatched = new Array<boolean>(t.length).fill(false);

  let matches = 0;
  for (let i = 0; i < s.length; i++) {
    const from = Math.max(0, i - window);
    const to = Math.min(t.length - 1, i + window);
    for (let j = from; j <= to; j++) {
      if (!tMatched[j] && s[i] === t[j]) {
        sMatched[i] = true;
        tMatched[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;

  // Walk the matched characters of both strings in order and count the
  // positions where they differ: each transposition is counted twice.
  let k = 0;
  let outOfOrder = 0;
  for (let i = 0; i < s.length; i++) {
    if (!sMatched[i]) continue;
    while (!tMatched[k]) k++;
    if (s[i] !== t[k]) outOfOrder++;
    k++;
  }
  const transpositions = outOfOrder / 2;

  return (matches / s.length + matches / t.length + (matches - transpositions) / matches) / 3;
}

export function jaroWinkler(
  a: Normalized,
  b: Normalized,
  options: JaroWinklerOptions = {},
): number {
  const { prefixScale = 0.1, maxPrefix = 4, boostThreshold = 0.7 } = options;
  if (prefixScale < 0 || prefixScale * maxPrefix > 1) {
    throw new RangeError('prefixScale must be in [0, 1 / maxPrefix] to keep the result in [0, 1]');
  }

  const similarity = jaro(a, b);
  if (similarity < boostThreshold) return similarity;

  const s = Array.from(a);
  const t = Array.from(b);
  let prefix = 0;
  while (prefix < maxPrefix && prefix < s.length && s[prefix] === t[prefix]) prefix++;

  return similarity + prefix * prefixScale * (1 - similarity);
}
