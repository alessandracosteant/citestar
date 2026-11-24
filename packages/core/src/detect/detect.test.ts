import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { sigmoid } from '../math/logistic.ts';
import { detectMentions } from './detect.ts';
import type { DetectInput, TitleCandidate } from './detect.ts';

type Source = DetectInput['source'];

const titles = (
  text: string,
  lang: string,
  source: Source = 'text',
  extra: Partial<DetectInput> = {},
  minP?: number,
): TitleCandidate[] =>
  detectMentions({ text, lang, source, ...extra }, minP === undefined ? {} : { minP }).filter(
    (c): c is TitleCandidate => c.kind === 'title',
  );

/** Every possible surface of a candidate, from e_min to e_max. */
const surfaces = (text: string, c: TitleCandidate): string[] =>
  c.ends.map((e) => text.slice(c.start, e));

// Expected probabilities are computed by hand from PRIOR_WEIGHTS:
// bias −2.2; cue +2.4; author +1.2; afterAuthorMarker −2.0; quoted +1.8;
// italic +1.6; capStart +0.9; capStartIt −0.4; capStartSubtitles −0.3;
// capStartAsr −1.0; titleCaseEn +0.8; sentenceInitial −0.9; singleWord −0.5;
// longSpan −0.8; repeated +0.3·ln(count).

describe('cue phrases', () => {
  it('Italian: "nel romanzo … di <Autore>" opens a window that closes before the author', () => {
    const text = 'Ne parla nel romanzo Il nome della rosa di Eco.';
    const found = titles(text, 'it');
    expect(found).toHaveLength(1);
    const [c] = found;
    if (!c) throw new Error('no candidate');
    // Connectors ("Il", "della") are never a last word.
    expect(surfaces(text, c)).toEqual(['Il nome', 'Il nome della rosa']);
    expect(c.typeHint).toBe('book');
    expect(c.signals).toEqual(['cue']);
    expect(c.features.author).toBe(1);
    // −2.2 + cue 2.4 + author 1.2 + capStart 0.9 + capStartIt −0.4 = 1.9
    expect(c.pMention).toBeCloseTo(sigmoid(1.9), 12);
  });

  it('English: "as <Author> argues in" puts the author in the cue', () => {
    const text = 'As Harari argues in Sapiens, shared stories matter.';
    const [c, ...rest] = titles(text, 'en');
    expect(rest).toEqual([]);
    if (!c) throw new Error('no candidate');
    expect(surfaces(text, c)).toEqual(['Sapiens']);
    expect(c.signals).toEqual(['author', 'capitalized', 'cue']);
    // −2.2 + cue 2.4 + author 1.2 + capStart 0.9 + singleWord −0.5 = 1.8
    expect(c.pMention).toBeCloseTo(sigmoid(1.8), 12);
  });

  it('closes on "by <Name>" and does not mistake the author for a title', () => {
    const text = 'We saw the film Dune by David Lynch was long.';
    const found = titles(text, 'en');
    expect(found.map((c) => surfaces(text, c))).toEqual([['Dune']]);
    expect(found[0]?.typeHint).toBe('film');
    // "David Lynch" is a Title Case run, but it follows "by" after a title:
    // −2.2 + capStart 0.9 + titleCaseEn 0.8 + afterAuthorMarker −2.0 = −2.5
    const all = titles(text, 'en', 'text', {}, 0);
    const lynch = all.find((c) => text.slice(c.start).startsWith('David'));
    expect(lynch?.pMention).toBeCloseTo(sigmoid(-2.5), 12);
  });

  it('does not penalize Italian "di" meaning "about"', () => {
    const text = 'Abbiamo parlato di Sapiens ieri.';
    const [c] = titles(text, 'it', 'text', {}, 0).filter((x) =>
      text.slice(x.start).startsWith('Sapiens'),
    );
    expect(c?.features.afterAuthorMarker).toBe(0);
  });

  it('lets a window run a few words past a soft stop ("Guerra e pace")', () => {
    const text = 'Ho letto Guerra e pace ieri sera.';
    const [c] = titles(text, 'it');
    expect(c && surfaces(text, c)).toEqual(['Guerra', 'Guerra e pace']);
  });

  it('continues past a stop word when a Title Case title goes on', () => {
    const text = 'Read the paper Attention Is All You Need first.';
    const c = titles(text, 'en').find((x) => x.signals.includes('cue'));
    expect(c?.typeHint).toBe('paper');
    expect(c && surfaces(text, c).at(-1)).toBe('Attention Is All You Need');
  });

  it('does not start a title on a pronoun or possessive', () => {
    expect(titles('Is this the book that I read?', 'en')).toEqual([]);
    expect(titles('Ho letto il suo libro.', 'it')).toEqual([]);
  });
});

describe('quotes and italics', () => {
  it('give an exact end and add their weight to the cue', () => {
    const text = 'He admired the essay “Politics and the English Language” for years.';
    const found = titles(text, 'en');
    expect(found).toHaveLength(1);
    const [c] = found;
    if (!c) throw new Error('no candidate');
    expect(surfaces(text, c)).toEqual(['Politics and the English Language']);
    expect(c.signals).toEqual(['capitalized', 'cue', 'quotes']);
    expect(c.typeHint).toBe('book');
    // −2.2 + cue 2.4 + quoted 1.8 + capStart 0.9 + titleCaseEn 0.8 = 3.7
    expect(c.pMention).toBeCloseTo(sigmoid(3.7), 12);
  });

  it('accept guillemets and drop punctuation inside the closing quote', () => {
    const text = 'Rileggo «Il Gattopardo,» da anni.';
    const [c] = titles(text, 'it');
    expect(c && surfaces(text, c)).toEqual(['Il Gattopardo']);
  });

  it('use emphasis spans from the extractor', () => {
    const text = 'Ho riletto Sapiens ieri';
    const start = text.indexOf('Sapiens');
    const [c] = titles(text, 'it', 'text', { emphasis: [{ start, end: start + 7 }] });
    expect(c?.signals).toEqual(['capitalized', 'cue', 'italic']);
    // −2.2 + cue 2.4 + italic 1.6 + capStart 0.9 + capStartIt −0.4 + singleWord −0.5 = 1.8
    expect(c?.pMention).toBeCloseTo(sigmoid(1.8), 12);
  });
});

describe('capitalization', () => {
  it('finds a Title Case run without any cue, with a modest probability', () => {
    const text = 'I loved The Name of the Rose last year.';
    const found = titles(text, 'en');
    expect(found).toHaveLength(1);
    const [c] = found;
    if (!c) throw new Error('no candidate');
    expect(surfaces(text, c)).toEqual(['The Name', 'The Name of the Rose']);
    // −2.2 + capStart 0.9 + titleCaseEn 0.8 = −0.5
    expect(c.pMention).toBeCloseTo(sigmoid(-0.5), 12);
  });

  it('finds nothing in the same sentence transcribed in lowercase by ASR', () => {
    expect(titles('i loved the name of the rose last year', 'en', 'asr')).toEqual([]);
  });

  it('weighs a capital letter by language and by source (D17)', () => {
    const p = (text: string, lang: string, source: Source): number | undefined =>
      titles(text, lang, source, {}, 0).find((c) => text.slice(c.start).startsWith('Sapiens'))
        ?.pMention;
    const en = 'We talked about Sapiens yesterday.';
    // −2.2 + capStart 0.9 + singleWord −0.5 = −1.8, then the source adjustments.
    expect(p(en, 'en', 'text')).toBeCloseTo(sigmoid(-1.8), 12);
    expect(p(en, 'en', 'subtitles')).toBeCloseTo(sigmoid(-2.1), 12);
    expect(p(en, 'en', 'asr')).toBeCloseTo(sigmoid(-2.8), 12);
    // Italian: capStartIt −0.4.
    expect(p('Abbiamo parlato di Sapiens ieri.', 'it', 'text')).toBeCloseTo(sigmoid(-2.2), 12);
  });

  it('drops sentence-initial words and single names below the threshold', () => {
    expect(titles('Yesterday we met Marco.', 'en')).toEqual([]);
  });

  it('counts repetitions of the same title', () => {
    const text = 'I saw the film Dune. Later, the film Dune again.';
    const found = titles(text, 'en');
    expect(found).toHaveLength(2);
    for (const c of found) expect(c.features.repeated).toBeCloseTo(Math.log(2), 12);
  });
});

describe('identifiers and offsets', () => {
  it('returns identifiers with their fixed p, ordered with titles', () => {
    const text = 'See arXiv:1706.03762 and the paper Attention Is All You Need.';
    const found = detectMentions({ text, lang: 'en', source: 'text' });
    expect(found.map((c) => c.kind)).toEqual(['identifier', 'title']);
    expect(found[0]).toMatchObject({ kind: 'identifier', id: 'arxiv:1706.03762', pMention: 0.98 });
  });

  it('maps offsets back to the text after surrogate pairs', () => {
    const text = '🎬 the film Dune.';
    const [c] = titles(text, 'en');
    expect(c && surfaces(text, c)).toEqual(['Dune']);
  });

  it('caps a window at 12 words', () => {
    const text = `the novel ${Array.from({ length: 20 }, (_, i) => `Word${String(i)}`).join(' ')}.`;
    const c = titles(text, 'en').find((x) => x.signals.includes('cue'));
    expect(c?.ends.length).toBe(12);
  });

  it('never throws, and every candidate is well formed', () => {
    fc.assert(
      fc.property(
        fc.string({ unit: 'grapheme', maxLength: 120 }),
        fc.constantFrom('en', 'it', 'de'),
        fc.constantFrom<Source>('text', 'subtitles', 'asr'),
        (text, lang, source) =>
          detectMentions({ text, lang, source }, { minP: 0 }).every((c) => {
            if (c.kind === 'identifier') return c.start < c.end && c.end <= text.length;
            const sorted = c.ends.every((e, i) => i === 0 || (c.ends[i - 1] ?? 0) < e);
            return (
              c.start < (c.ends[0] ?? -1) &&
              (c.ends.at(-1) ?? Infinity) <= text.length &&
              sorted &&
              c.pMention > 0 &&
              c.pMention < 1
            );
          }),
      ),
      { numRuns: 500 },
    );
  });
});

describe('author cues by source', () => {
  it('accepts a lowercase author in ASR transcripts', () => {
    const text = 'come scrive harari in sapiens le storie contano';
    const [c] = titles(text, 'it', 'asr');
    expect(c?.signals).toContain('author');
    expect(c && surfaces(text, c)[0]).toBe('sapiens');
  });

  it('rejects a pronoun in place of the author, in ASR and in written text', () => {
    expect(
      titles('as he says in this talk', 'en', 'asr').filter((c) => c.signals.includes('author')),
    ).toEqual([]);
    expect(
      titles('As we say in Rome, slowly.', 'en').filter((c) => c.signals.includes('author')),
    ).toEqual([]);
  });

  it('ignores emphasis spans outside the text', () => {
    expect(
      titles('Dune', 'en', 'text', { emphasis: [{ start: 2, end: 99 }] }, 0).map((c) => c.signals),
    ).toEqual([['capitalized']]);
  });
});
