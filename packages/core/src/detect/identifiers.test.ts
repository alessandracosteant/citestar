import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  findIdentifiers,
  isbn10To13,
  isValidArxivNew,
  isValidArxivOld,
  isValidIsbn10,
  isValidIsbn13,
  isValidIssn,
  trimDoi,
} from './identifiers.ts';

// Check digits for generated identifiers, written independently of the code
// under test.
const isbn10Check = (nine: string): string => {
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * Number(nine[i]);
  const c = (11 - (sum % 11)) % 11;
  return c === 10 ? 'X' : String(c);
};
const isbn13Check = (twelve: string): string => {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * Number(twelve[i]);
  return String((10 - (sum % 10)) % 10);
};
const digits = (n: number): fc.Arbitrary<string> =>
  fc.array(fc.integer({ min: 0, max: 9 }), { minLength: n, maxLength: n }).map((d) => d.join(''));
const validIsbn10 = digits(9).map((nine) => nine + isbn10Check(nine));
const validIsbn13 = digits(9).map((nine) => `978${nine}` + isbn13Check(`978${nine}`));
const replaceAt = (s: string, i: number, ch: string): string => s.slice(0, i) + ch + s.slice(i + 1);
const swap = (s: string, i: number, j: number): string =>
  replaceAt(replaceAt(s, i, s[j] ?? ''), j, s[i] ?? '');

describe('ISBN-10', () => {
  it('accepts valid numbers, including X as check digit, and rejects others', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
    expect(isValidIsbn10('080442957X')).toBe(true);
    expect(isValidIsbn10('0306406153')).toBe(false);
    expect(isValidIsbn10('03064061X2')).toBe(false); // X only in last position
    expect(isValidIsbn10('030640615')).toBe(false);
  });

  it('converts to ISBN-13', () => {
    expect(isbn10To13('0306406152')).toBe('9780306406157');
    expect(isbn10To13('080442957X')).toBe('9780804429573');
    expect(() => isbn10To13('0306406153')).toThrow(RangeError);
  });

  it('detects every single-character error', () => {
    fc.assert(
      fc.property(
        validIsbn10,
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 1, max: 10 }),
        (isbn, pos, shift) => {
          const value = isbn[pos] === 'X' ? 10 : Number(isbn[pos]);
          const next = (value + shift) % 11;
          // A wrong character: any other digit, or X (=10) in the last position.
          if (next === 10 && pos !== 9) return true;
          return !isValidIsbn10(replaceAt(isbn, pos, next === 10 ? 'X' : String(next)));
        },
      ),
    );
  });

  it('detects every transposition of two different characters, adjacent or not', () => {
    fc.assert(
      fc.property(
        validIsbn10,
        fc.integer({ min: 0, max: 9 }),
        fc.integer({ min: 0, max: 9 }),
        (isbn, i, j) => {
          if (isbn[i] === isbn[j]) return true;
          return !isValidIsbn10(swap(isbn, i, j));
        },
      ),
    );
  });
});

describe('ISBN-13', () => {
  it('accepts valid numbers with prefix 978 or 979 only', () => {
    expect(isValidIsbn13('9780306406157')).toBe(true);
    expect(isValidIsbn13('9780306406158')).toBe(false);
    expect(isValidIsbn13('9770306406150')).toBe(false); // prefix 977 is not a book
  });

  it('detects every single-digit error', () => {
    fc.assert(
      fc.property(
        validIsbn13,
        fc.integer({ min: 3, max: 12 }),
        fc.integer({ min: 1, max: 9 }),
        (isbn, pos, shift) =>
          !isValidIsbn13(replaceAt(isbn, pos, String((Number(isbn[pos]) + shift) % 10))),
      ),
    );
  });

  it('misses exactly the adjacent transpositions of digits that differ by 5', () => {
    // Swapping a, b at weights 1 and 3 changes the sum by ±2(a − b), which is
    // ≡ 0 (mod 10) exactly when |a − b| = 5 (docs/MATH.md §8).
    expect(isValidIsbn13('9780306401657')).toBe(true); // 6 and 1 swapped in 9780306406157
    fc.assert(
      fc.property(validIsbn13, fc.integer({ min: 3, max: 11 }), (isbn, i) => {
        const a = Number(isbn[i]);
        const b = Number(isbn[i + 1]);
        if (a === b) return true;
        return isValidIsbn13(swap(isbn, i, i + 1)) === (Math.abs(a - b) === 5);
      }),
      { numRuns: 2000 },
    );
  });
});

describe('ISSN', () => {
  it('validates the mod-11 check digit', () => {
    expect(isValidIssn('0378-5955')).toBe(true);
    expect(isValidIssn('20493630')).toBe(true);
    expect(isValidIssn('0378-5956')).toBe(false);
    expect(isValidIssn('0378-595')).toBe(false);
  });
});

describe('arXiv identifiers', () => {
  it('validates new-style numbers by month and by digit count per period', () => {
    expect(isValidArxivNew('1706', '03762')).toBe(true);
    expect(isValidArxivNew('0704', '0001')).toBe(true); // first month of the scheme
    expect(isValidArxivNew('0703', '0001')).toBe(false); // before it
    expect(isValidArxivNew('1713', '03762')).toBe(false); // month 13
    expect(isValidArxivNew('1412', '12345')).toBe(false); // 4 digits until 2014
    expect(isValidArxivNew('1501', '0001')).toBe(false); // 5 digits from 2015
  });

  it('validates old-style identifiers by archive and date', () => {
    expect(isValidArxivOld('hep-th', '9901')).toBe(true);
    expect(isValidArxivOld('math', '0309')).toBe(true);
    expect(isValidArxivOld('foo', '9901')).toBe(false);
    expect(isValidArxivOld('hep-th', '0801')).toBe(false); // after March 2007
    expect(isValidArxivOld('hep-th', '9013')).toBe(false);
  });
});

describe('trimDoi', () => {
  it.each([
    ['10.1000/182.', '10.1000/182'],
    ['10.1000/182);', '10.1000/182'],
    ['10.1016/0002-9149(87)90136-1', '10.1016/0002-9149(87)90136-1'],
    ['10.1016/0002-9149(87)90136-1).', '10.1016/0002-9149(87)90136-1'],
    ['10.1000/a(b)', '10.1000/a(b)'],
  ])('%s → %s', (raw, expected) => {
    expect(trimDoi(raw)).toBe(expected);
  });
});

describe('findIdentifiers', () => {
  const ids = (text: string): string[] => findIdentifiers(text).map((m) => m.id);
  const surfaces = (text: string): string[] =>
    findIdentifiers(text).map((m) => text.slice(m.start, m.end));

  it('finds prefixed ISBN-10 and ISBN-13 and canonicalizes them to ISBN-13', () => {
    expect(ids('ISBN 0-306-40615-2 and ISBN-13: 978-0-306-40615-7')).toEqual([
      'isbn:9780306406157',
      'isbn:9780306406157',
    ]);
    expect(ids('isbn: 0-8044-2957-X')).toEqual(['isbn:9780804429573']);
  });

  it('accepts a bare ISBN-13 but not a bare ISBN-10, which a phone number can mimic', () => {
    expect(ids('Get 9780306406157 today')).toEqual(['isbn:9780306406157']);
    expect(ids('Call 0306406152 now')).toEqual([]);
  });

  it('rejects numbers whose check digit fails', () => {
    expect(ids('ISBN 0-306-40615-3, ISSN 0378-5956')).toEqual([]);
  });

  it('finds ISSNs only after the ISSN prefix', () => {
    expect(ids('ISSN 0378-5955')).toEqual(['issn:0378-5955']);
    expect(ids('from 1990-2005')).toEqual([]);
  });

  it('finds DOIs, trims the sentence punctuation and lowercases the id', () => {
    const text = 'See (doi:10.1000/ABC.182).';
    expect(ids(text)).toEqual(['doi:10.1000/abc.182']);
    expect(surfaces(text)).toEqual(['doi:10.1000/ABC.182']);
    expect(surfaces('Read https://doi.org/10.1000/182 first')).toEqual([
      'https://doi.org/10.1000/182',
    ]);
    expect(ids('as in 10.1016/0002-9149(87)90136-1).')).toEqual([
      'doi:10.1016/0002-9149(87)90136-1',
    ]);
  });

  it('finds arXiv identifiers only with a prefix or URL, dropping the version', () => {
    expect(ids('The transformer comes from arXiv:1706.03762.')).toEqual(['arxiv:1706.03762']);
    expect(ids('https://arxiv.org/abs/1706.03762v5')).toEqual(['arxiv:1706.03762']);
    expect(ids('a ratio of 1706.03762')).toEqual([]);
    expect(ids('see hep-th/9901001 and math.GT/0309136')).toEqual([
      'arxiv:hep-th/9901001',
      'arxiv:math/0309136',
    ]);
    expect(ids('and/or 9901001')).toEqual([]);
  });

  it('prefers the match that starts first when two overlap', () => {
    // The arXiv DOI contains "arXiv.1706.03762" but no "arXiv:" prefix.
    expect(ids('doi:10.48550/arXiv.1706.03762')).toEqual(['doi:10.48550/arxiv.1706.03762']);
  });

  it('reports offsets that slice the text back to the match', () => {
    const text = '🎬 ISBN 0-306-40615-2';
    const [match] = findIdentifiers(text);
    expect(match && text.slice(match.start, match.end)).toBe('ISBN 0-306-40615-2');
  });

  it('never throws and returns ordered, non-overlapping matches', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme-ascii', maxLength: 80 }), (text) => {
        const found = findIdentifiers(text);
        return found.every(
          (m, i) =>
            m.start < m.end &&
            m.end <= text.length &&
            (i === 0 || (found[i - 1]?.end ?? 0) <= m.start),
        );
      }),
    );
  });
});
