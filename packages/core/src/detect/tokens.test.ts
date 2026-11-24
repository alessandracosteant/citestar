import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { isCapitalized, isSentenceInitial, tokenize } from './tokens.ts';

describe('tokenize', () => {
  it('keeps apostrophes and hyphens inside words and splits punctuation', () => {
    expect(tokenize("Cent'anni, Spider-Man e dell’isola.").map((t) => t.text)).toEqual([
      "Cent'anni",
      ',',
      'Spider-Man',
      'e',
      'dell’isola',
      '.',
    ]);
  });

  it('marks words and punctuation', () => {
    expect(tokenize('Dune: 1984!').map((t) => t.isWord)).toEqual([true, false, true, false]);
  });

  it('reports offsets that slice back to each token, also after surrogate pairs', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'grapheme', maxLength: 60 }), (text) =>
        tokenize(text).every((t) => text.slice(t.start, t.end) === t.text),
      ),
    );
    const text = '🎬 the film Dune';
    const dune = tokenize(text).at(-1);
    expect(dune && text.slice(dune.start, dune.end)).toBe('Dune');
  });
});

describe('isCapitalized', () => {
  it('checks the first letter, including titlecase digraphs', () => {
    expect(isCapitalized('Dune')).toBe(true);
    expect(isCapitalized('ǅemal')).toBe(true);
    expect(isCapitalized('dune')).toBe(false);
    expect(isCapitalized('1984')).toBe(false);
  });
});

describe('isSentenceInitial', () => {
  it('looks back over spaces and opening quotes to a sentence end', () => {
    const text = 'Ok. «Dune» is long; Sapiens is not.\nWar';
    expect(isSentenceInitial(text, 0)).toBe(true);
    expect(isSentenceInitial(text, text.indexOf('Dune'))).toBe(true);
    expect(isSentenceInitial(text, text.indexOf('Sapiens'))).toBe(false);
    expect(isSentenceInitial(text, text.indexOf('War'))).toBe(true);
  });
});
