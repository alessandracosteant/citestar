import { describe, expect, it } from 'vitest';

import { jaro, jaroWinkler } from './jaro-winkler.ts';

// Expected values worked out by hand (see comments) and cross-checked with an
// independent implementation. The first three are the classic examples from
// Winkler's papers.
describe('jaro', () => {
  it('MARTHA / MARHTA: 6 matches, 1 transposition', () => {
    // w = ⌊6/2⌋ − 1 = 2. All 6 letters match; "TH" vs "HT" are 2 out-of-order
    // positions → t = 1. J = (6/6 + 6/6 + 5/6) / 3 = 17/18.
    expect(jaro('MARTHA', 'MARHTA')).toBeCloseTo(17 / 18, 12);
  });

  it('DWAYNE / DUANE: 4 matches, no transpositions', () => {
    // D, A, N, E match within w = 2. J = (4/6 + 4/5 + 4/4) / 3 = 37/45.
    expect(jaro('DWAYNE', 'DUANE')).toBeCloseTo(37 / 45, 12);
  });

  it('DIXON / DICKSONX: the X is too far to match', () => {
    // w = ⌊8/2⌋ − 1 = 3. X at position 2 would need position ≤ 5, but X is at
    // 7. Matches D, I, O, N: J = (4/5 + 4/8 + 1) / 3 = 23/30.
    expect(jaro('DIXON', 'DICKSONX')).toBeCloseTo(23 / 30, 12);
  });

  it('handles empty strings and strings with nothing in common', () => {
    expect(jaro('', '')).toBe(1);
    expect(jaro('abc', '')).toBe(0);
    expect(jaro('', 'abc')).toBe(0);
    expect(jaro('abc', 'xyz')).toBe(0);
  });

  it('gives 0 to a swap of two letters in a 2-letter string (window is 0)', () => {
    expect(jaro('ab', 'ba')).toBe(0);
  });

  it('is symmetric and equals 1 for identical strings', () => {
    expect(jaro('DUANE', 'DWAYNE')).toBeCloseTo(jaro('DWAYNE', 'DUANE'), 12);
    expect(jaro('Sapiens', 'Sapiens')).toBe(1);
  });

  it('counts code points, not UTF-16 units', () => {
    // "𝔸" is one code point but two UTF-16 units.
    expect(jaro('𝔸b', '𝔸b')).toBe(1);
    expect(jaro('𝔸bc', '𝔸bd')).toBeCloseTo(jaro('abc', 'abd'), 12);
  });
});

describe('jaroWinkler', () => {
  it('adds the prefix bonus ℓ·p·(1 − J)', () => {
    // MARTHA: ℓ = 3 → 17/18 + 3 · 0.1 · (1/18) = 0.961111…
    expect(jaroWinkler('MARTHA', 'MARHTA')).toBeCloseTo(0.961111, 6);
    // DWAYNE: ℓ = 1 → 37/45 + 0.1 · 8/45 = 0.84
    expect(jaroWinkler('DWAYNE', 'DUANE')).toBeCloseTo(0.84, 12);
    // DIXON: ℓ = 2 → 23/30 + 0.2 · 7/30 = 0.813333…
    expect(jaroWinkler('DIXON', 'DICKSONX')).toBeCloseTo(0.813333, 6);
  });

  it('caps the prefix at 4 characters', () => {
    // J(dune, dune part two) = (4/4 + 4/13 + 1) / 3 = 10/13; ℓ = 4, not 13.
    expect(jaroWinkler('dune', 'dune part two')).toBeCloseTo(10 / 13 + 0.4 * (3 / 13), 12);
  });

  it('gives no bonus below the 0.7 threshold', () => {
    // abcxyz / abcdef: J = (3/6 + 3/6 + 1) / 3 = 2/3 < 0.7, despite a common
    // prefix of 3.
    expect(jaroWinkler('abcxyz', 'abcdef')).toBeCloseTo(2 / 3, 12);
  });

  it('never exceeds 1 and rejects a prefix scale that could', () => {
    expect(jaroWinkler('Sapiens', 'Sapiens')).toBe(1);
    expect(() => jaroWinkler('a', 'a', { prefixScale: 0.3 })).toThrow(RangeError);
  });

  it('accepts custom options', () => {
    expect(jaroWinkler('abcxyz', 'abcdef', { boostThreshold: 0 })).toBeCloseTo(
      2 / 3 + 0.3 * (1 / 3),
      12,
    );
  });
});
