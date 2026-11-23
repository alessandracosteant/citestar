import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { jaro, jaroWinkler } from './jaro-winkler.ts';
import { normalizeTitle } from './normalize.ts';
import type { Normalized } from './normalize.ts';

/** Normalize with an undetermined language: case folding only, no articles. */
const n = (s: string): Normalized => normalizeTitle(s, 'und');

// Expected values worked out by hand (see comments) and cross-checked with an
// independent implementation. The first three are the classic examples from
// Winkler's papers (lowercased by normalization, which does not change them).
describe('jaro', () => {
  it('martha / marhta: 6 matches, 1 transposition', () => {
    // w = ⌊6/2⌋ − 1 = 2. All 6 letters match; "th" vs "ht" are 2 out-of-order
    // positions → t = 1. J = (6/6 + 6/6 + 5/6) / 3 = 17/18.
    expect(jaro(n('MARTHA'), n('MARHTA'))).toBeCloseTo(17 / 18, 12);
  });

  it('dwayne / duane: 4 matches, no transpositions', () => {
    // d, a, n, e match within w = 2. J = (4/6 + 4/5 + 4/4) / 3 = 37/45.
    expect(jaro(n('DWAYNE'), n('DUANE'))).toBeCloseTo(37 / 45, 12);
  });

  it('dixon / dicksonx: the x is too far to match', () => {
    // w = ⌊8/2⌋ − 1 = 3. x at position 2 would need position ≤ 5, but x is at
    // 7. Matches d, i, o, n: J = (4/5 + 4/8 + 1) / 3 = 23/30.
    expect(jaro(n('DIXON'), n('DICKSONX'))).toBeCloseTo(23 / 30, 12);
  });

  it('handles empty strings and strings with nothing in common', () => {
    expect(jaro(n(''), n(''))).toBe(1);
    expect(jaro(n('abc'), n(''))).toBe(0);
    expect(jaro(n(''), n('abc'))).toBe(0);
    expect(jaro(n('abc'), n('xyz'))).toBe(0);
  });

  it('gives 0 to a swap of two letters in a 2-letter string (window is 0)', () => {
    expect(jaro(n('ab'), n('ba'))).toBe(0);
  });

  it('counts code points, not UTF-16 units', () => {
    // "𠀀" (U+20000) is one code point but two UTF-16 units, and survives
    // normalization unchanged.
    expect(jaro(n('𠀀bc'), n('𠀀bd'))).toBeCloseTo(jaro(n('abc'), n('abd')), 12);
  });
});

describe('jaroWinkler', () => {
  it('adds the prefix bonus ℓ·p·(1 − J)', () => {
    // martha: ℓ = 3 → 17/18 + 3 · 0.1 · (1/18) = 0.961111…
    expect(jaroWinkler(n('MARTHA'), n('MARHTA'))).toBeCloseTo(0.961111, 6);
    // dwayne: ℓ = 1 → 37/45 + 0.1 · 8/45 = 0.84
    expect(jaroWinkler(n('DWAYNE'), n('DUANE'))).toBeCloseTo(0.84, 12);
    // dixon: ℓ = 2 → 23/30 + 0.2 · 7/30 = 0.813333…
    expect(jaroWinkler(n('DIXON'), n('DICKSONX'))).toBeCloseTo(0.813333, 6);
  });

  it('caps the prefix at 4 characters', () => {
    // J(dune, dune part two) = (4/4 + 4/13 + 1) / 3 = 10/13; ℓ = 4, not 13.
    expect(jaroWinkler(n('dune'), n('dune part two'))).toBeCloseTo(10 / 13 + 0.4 * (3 / 13), 12);
  });

  it('gives no bonus below the 0.7 threshold', () => {
    // abcxyz / abcdef: J = (3/6 + 3/6 + 1) / 3 = 2/3 < 0.7, despite a common
    // prefix of 3.
    expect(jaroWinkler(n('abcxyz'), n('abcdef'))).toBeCloseTo(2 / 3, 12);
  });

  it('rejects a prefix scale that could exceed 1, and accepts custom options', () => {
    expect(() => jaroWinkler(n('a'), n('a'), { prefixScale: 0.3 })).toThrow(RangeError);
    // With maxPrefix 2.5 and p = 0.4 (2.5 · 0.4 = 1) a prefix of 3 would give 1.03.
    expect(() => jaroWinkler(n('abcd'), n('abce'), { maxPrefix: 2.5, prefixScale: 0.4 })).toThrow(
      RangeError,
    );
    expect(() => jaroWinkler(n('a'), n('a'), { maxPrefix: -1 })).toThrow(RangeError);
    expect(() => jaroWinkler(n('a'), n('a'), { prefixScale: NaN })).toThrow(RangeError);
    expect(() => jaroWinkler(n('a'), n('a'), { boostThreshold: NaN })).toThrow(RangeError);
    expect(jaroWinkler(n('abcxyz'), n('abcdef'), { boostThreshold: 0 })).toBeCloseTo(
      2 / 3 + 0.3 * (1 / 3),
      12,
    );
  });
});

describe('jaroWinkler properties', () => {
  // Small alphabets make matches, transpositions and shared prefixes frequent.
  const text = fc
    .oneof(
      fc.string({ unit: fc.constantFrom('a', 'b', 'c', 'd', ' '), maxLength: 14 }),
      fc.string({ unit: 'grapheme', maxLength: 14 }),
    )
    .map(n);

  it('is symmetric', () => {
    fc.assert(
      fc.property(text, text, (a, b) => Math.abs(jaroWinkler(a, b) - jaroWinkler(b, a)) < 1e-12),
      { numRuns: 3000 },
    );
  });

  it('lies in [0, 1]', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        const s = jaroWinkler(a, b);
        return s >= 0 && s <= 1;
      }),
      { numRuns: 3000 },
    );
  });

  it('equals 1 on identical strings', () => {
    fc.assert(fc.property(text, (a) => jaroWinkler(a, a) === 1));
  });

  it('is never below plain Jaro', () => {
    fc.assert(fc.property(text, text, (a, b) => jaroWinkler(a, b) >= jaro(a, b)));
  });
});
