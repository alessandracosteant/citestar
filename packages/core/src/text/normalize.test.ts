import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  normalizedTokens,
  normalizeTitle,
  normalizeTitleVariants,
  titleVariants,
} from './normalize.ts';

const LANGS = ['en', 'it', 'it-IT', 'en-GB', 'de', 'fr', 'und'] as const;

describe('normalizeTitle', () => {
  it.each([
    ['Il nome della rosa', 'it', 'nome della rosa'],
    ['The Name of the Rose', 'en', 'name of the rose'],
    ['Gli indifferenti', 'it', 'indifferenti'],
    ['An Inconvenient Truth', 'en-US', 'inconvenient truth'],
    ['I promessi sposi', 'it', 'promessi sposi'],
  ])('drops a leading article of the language: %s (%s)', (title, lang, expected) => {
    expect(normalizeTitle(title, lang)).toBe(expected);
  });

  it('uses only the articles of the given language', () => {
    expect(normalizeTitle('I, Robot', 'en')).toBe('i robot');
    expect(normalizeTitle('A sangue freddo', 'it')).toBe('a sangue freddo');
    expect(normalizeTitle('Il Postino', 'en')).toBe('il postino');
    expect(normalizeTitle('The Wall', 'de')).toBe('the wall');
  });

  it.each([
    ["L'isola di Arturo", 'isola di arturo'],
    ['L’isola di Arturo', 'isola di arturo'],
    ["Un'altra vita", 'altra vita'],
    ["Gl'indifferenti", 'indifferenti'],
  ])('drops an elided Italian article: %s', (title, expected) => {
    expect(normalizeTitle(title, 'it')).toBe(expected);
  });

  it('keeps the article when the rest starts with an article too (La La Land)', () => {
    expect(normalizeTitle('La La Land', 'it')).toBe('la la land');
    expect(normalizeTitle('The A-Team', 'en')).toBe('the a team');
    expect(normalizeTitle('The The', 'en')).toBe('the the');
  });

  it('keeps an article that is the whole title', () => {
    expect(normalizeTitle('A', 'en')).toBe('a');
    expect(normalizeTitle('Il', 'it')).toBe('il');
  });

  it('removes diacritics, format characters and compatibility forms', () => {
    expect(normalizeTitle('Cent’anni di solitudine', 'it')).toBe('cent anni di solitudine');
    expect(normalizeTitle('Les Misérables', 'fr')).toBe('les miserables');
    expect(normalizeTitle('İstanbul', 'tr')).toBe('istanbul');
    expect(normalizeTitle('ﬁnal cut', 'en')).toBe('final cut');
    expect(normalizeTitle('infor­mation', 'en')).toBe('information'); // soft hyphen
    expect(normalizeTitle('ℌello', 'en')).toBe('hello'); // NFKD gives "H", then lowercase
  });

  it('turns punctuation, symbols and controls into single spaces', () => {
    expect(normalizeTitle('Dune: Part Two', 'en')).toBe('dune part two');
    expect(normalizeTitle('  Harry   Potter & the  “Stone”!\t', 'en')).toBe(
      'harry potter the stone',
    );
    expect(normalizeTitle(' — !? ', 'en')).toBe('');
  });

  it('keeps ß, which NFKD does not decompose', () => {
    expect(normalizeTitle('Straße', 'de')).toBe('straße');
  });

  it('is idempotent on hand-picked tricky inputs', () => {
    for (const s of ['La La Land', 'The The', "L'L'isola", 'Il Il Il', 'ΟΔΟΣ', 'ǅemal', '']) {
      for (const lang of LANGS) {
        const once = normalizeTitle(s, lang);
        expect(normalizeTitle(once, lang), `${s} (${lang})`).toBe(once);
      }
    }
  });
});

describe('normalizeTitle properties', () => {
  const lang = fc.constantFrom(...LANGS);
  // Titles built from articles, words and separators exercise the article rule
  // far more often than uniform random strings.
  const word = fc.constantFrom(
    'the',
    'a',
    'an',
    'il',
    'la',
    'l',
    'i',
    'gli',
    'un',
    'La',
    'THE',
    'rosa',
    'Dune',
    'é',
    'ﬁ',
  );
  const sep = fc.constantFrom(' ', "'", '’', ': ', ' - ', ', ', '  ', '­');
  const title = fc
    .array(fc.tuple(word, sep), { maxLength: 6 })
    .map((parts) => parts.map(([w, s]) => w + s).join(''));

  it('is idempotent: f(f(s)) = f(s), on any Unicode string', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 40 }), lang, (s, l) => {
        const once = normalizeTitle(s, l);
        return normalizeTitle(once, l) === once;
      }),
      { numRuns: 2000 },
    );
  });

  it('is idempotent on titles made of articles and separators', () => {
    fc.assert(
      fc.property(
        title,
        lang,
        (s, l) => normalizeTitle(normalizeTitle(s, l), l) === normalizeTitle(s, l),
      ),
      { numRuns: 2000 },
    );
  });

  it('outputs single-space-separated tokens with no leading or trailing space', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 40 }), lang, (s, l) => {
        const out = normalizeTitle(s, l);
        return !/^\s|\s$|\s\s/u.test(out);
      }),
    );
  });

  it('gives tokens that are themselves normalized', () => {
    fc.assert(
      fc.property(title, lang, (s, l) =>
        normalizedTokens(normalizeTitle(s, l)).every((t) => normalizeTitle(t, l) === t),
      ),
    );
  });
});

describe('titleVariants', () => {
  it.each([
    ['Dune: Part Two', ['Dune: Part Two', 'Dune']],
    ['Star Wars - Episode IV', ['Star Wars - Episode IV', 'Star Wars']],
    ['Il Gattopardo — romanzo', ['Il Gattopardo — romanzo', 'Il Gattopardo']],
    ['Spider-Man', ['Spider-Man']],
    ['Sapiens', ['Sapiens']],
    [': no main title', [': no main title']],
  ])('%s', (title, expected) => {
    expect(titleVariants(title)).toEqual(expected);
  });

  it('normalizes variants and drops duplicates and empty ones', () => {
    expect(normalizeTitleVariants('Harry Potter e la pietra filosofale', 'it')).toEqual([
      'harry potter e la pietra filosofale',
    ]);
    expect(normalizeTitleVariants('The Lord of the Rings: The Return of the King', 'en')).toEqual([
      'lord of the rings the return of the king',
      'lord of the rings',
    ]);
    expect(normalizeTitleVariants('!!: ??', 'en')).toEqual([]);
  });
});

describe('normalizedTokens', () => {
  it('splits on single spaces and maps the empty string to no tokens', () => {
    expect(normalizedTokens(normalizeTitle('Dune: Part Two', 'en'))).toEqual([
      'dune',
      'part',
      'two',
    ]);
    expect(normalizedTokens(normalizeTitle('', 'en'))).toEqual([]);
  });
});

describe('language tags and separators', () => {
  it('accepts POSIX locale tags and surrounding spaces', () => {
    expect(normalizeTitle('Il nome della rosa', 'it_IT')).toBe('nome della rosa');
    expect(normalizeTitle('The Wall', ' EN ')).toBe('wall');
  });

  it('splits the main title at a full-width colon', () => {
    expect(titleVariants('千と千尋の神隠し：特別版')).toEqual([
      '千と千尋の神隠し：特別版',
      '千と千尋の神隠し',
    ]);
  });
});
