import { describe, expect, it } from 'vitest';

import { normalizeTitle } from './normalize.ts';

describe('normalizeTitle', () => {
  it.each([
    ['Il nome della rosa', 'it', 'nome della rosa'],
    ['The Name of the Rose', 'en', 'name of the rose'],
    ['Gli indifferenti', 'it', 'indifferenti'],
    ['An Inconvenient Truth', 'en-US', 'inconvenient truth'],
  ])('drops a leading article: %s (%s)', (title, lang, expected) => {
    expect(normalizeTitle(title, lang)).toBe(expected);
  });

  it.each([
    ["L'isola di Arturo", 'isola di arturo'],
    ['L’isola di Arturo', 'isola di arturo'],
    ["Un'altra vita", 'altra vita'],
  ])('drops a leading elided article in Italian: %s', (title, expected) => {
    expect(normalizeTitle(title, 'it')).toBe(expected);
  });

  it('removes diacritics and expands compatibility characters', () => {
    expect(normalizeTitle('Cent’anni di solitudine', 'it')).toBe('cent anni di solitudine');
    expect(normalizeTitle('Les Misérables', 'fr')).toBe('les miserables');
    expect(normalizeTitle('Ça', 'fr')).toBe('ca');
    expect(normalizeTitle('İstanbul', 'tr')).toBe('istanbul');
    expect(normalizeTitle('ﬁnal cut', 'en')).toBe('final cut');
  });

  it('replaces punctuation and symbols with single spaces', () => {
    expect(normalizeTitle('Dune: Part Two', 'en')).toBe('dune part two');
    expect(normalizeTitle('  Harry   Potter & the  “Stone”!  ', 'en')).toBe(
      'harry potter the stone',
    );
  });

  it('keeps an article that is the whole title', () => {
    expect(normalizeTitle('A', 'en')).toBe('a');
    expect(normalizeTitle('Il', 'it')).toBe('il');
  });

  it('keeps articles in the middle and articles of other languages', () => {
    expect(normalizeTitle('A sangue freddo', 'it')).toBe('a sangue freddo');
    expect(normalizeTitle('Il Postino', 'en')).toBe('il postino');
  });

  it('does not remove articles for languages without a list', () => {
    expect(normalizeTitle('The Wall', 'de')).toBe('the wall');
  });

  it('keeps ß, which NFKD does not decompose', () => {
    expect(normalizeTitle('Straße', 'de')).toBe('straße');
  });

  it('maps two spellings of the same title to the same string', () => {
    // Normalization only removes differences of form. It does not translate:
    // "Il nome della rosa" ≡ "The Name of the Rose" comes from Wikidata labels.
    expect(normalizeTitle('Il Nome della Rosa', 'it')).toBe(
      normalizeTitle('il nome della rosa!', 'it'),
    );
  });

  it('returns an empty string for titles made only of punctuation', () => {
    expect(normalizeTitle(' — !? ', 'en')).toBe('');
  });
});
