/**
 * Lite detection: finds where a title probably starts and the range of places
 * where it may end, without any model or catalog. Four signals propose
 * candidates, merged when they start at the same position:
 *
 * - cue phrases ("nel romanzo", "the film", "come scrive X in", "I've read");
 * - quotation marks (“…”, «…», „…“, "…", ‘…’);
 * - italics, passed in by the extractor as `emphasis` spans;
 * - runs of capitalized words ("The Name of the Rose").
 *
 * The end of a title is left open (D18): the candidate carries every possible
 * end between e_min and e_max. Linking (M1e) queries the catalog once for the
 * window and picks the end that best matches a real title. Explicit
 * identifiers (ISBN, DOI, ...) take a separate path with a fixed p.
 */
import type { WorkType } from '../model.ts';
import { normalizeTitle } from '../text/normalize.ts';
import { emptyFeatures, mentionProbability, PRIOR_WEIGHTS } from './features.ts';
import type { DetectionWeights, FeatureVector } from './features.ts';
import { findIdentifiers, IDENTIFIER_P } from './identifiers.ts';
import type { IdentifierMatch } from './identifiers.ts';
import { CUE_NOUN_TYPES, lexiconFor } from './lexicon.ts';
import type { Lexicon } from './lexicon.ts';
import { isCapitalized, isSentenceInitial, tokenize } from './tokens.ts';
import type { Token } from './tokens.ts';

export type TextSource = 'text' | 'subtitles' | 'asr';

export interface Span {
  readonly start: number;
  readonly end: number;
}

export interface DetectInput {
  readonly text: string;
  /** BCP 47 tag of the text's language: selects cues, stops and articles. */
  readonly lang: string;
  readonly source: TextSource;
  /** Italic or emphasized spans, from the DOM (<i>, <em>) or Markdown. */
  readonly emphasis?: readonly Span[];
}

export type Signal = 'cue' | 'author' | 'quotes' | 'italic' | 'capitalized';

export interface TitleCandidate {
  readonly kind: 'title';
  /** UTF-16 offset where the title starts. */
  readonly start: number;
  /** Possible end offsets, ascending: ends[0] = e_min, ends.at(-1) = e_max. */
  readonly ends: readonly number[];
  readonly typeHint?: WorkType;
  readonly signals: readonly Signal[];
  readonly features: FeatureVector;
  /** p_m = σ(b + Σ wᵢ·fᵢ), before any catalog evidence. */
  readonly pMention: number;
}

export interface IdentifierCandidate extends IdentifierMatch {
  readonly kind: 'identifier';
  readonly pMention: number;
}

export type MentionCandidate = TitleCandidate | IdentifierCandidate;

export interface DetectOptions {
  /** Candidates below this p_m are dropped before linking. Default 0.25. */
  readonly minP?: number;
  readonly weights?: DetectionWeights;
}

export const DEFAULT_MIN_P = 0.25;
/** Longest title window, in words. */
const MAX_WORDS = 12;
/** Words a window may continue after a soft stop ("Guerra e pace"). */
const SOFT_SPAN = 3;
/** Windows longer than this many words look like speech, not titles. */
const LONG_SPAN = 8;

const OPENING_QUOTES = new Set(['“', '"', '«', '‘', '„', '(']);
const CLOSING_QUOTES = new Set(['”', '"', '»', '’', '“', ')', ',']);
const QUOTES =
  /“\s*([^“”\n]{1,200}?)\s*”|«\s*([^«»\n]{1,200}?)\s*»|„\s*([^„“”\n]{1,200}?)\s*[“”]|"\s*([^"\n]{1,200}?)\s*"|‘\s*([^‘’\n]{1,200}?)\s*’(?!\p{L})/dgu;
const TRAILING_PUNCTUATION = /[\s.,;:!?…]+$/u;
const POSSESSIVE = /^[\p{Lu}\p{Lt}][\p{L}\p{M}-]*['’]s$/u;

interface Draft {
  readonly start: number;
  readonly ends: Set<number>;
  readonly exactEnds: Set<number>;
  readonly signals: Set<Signal>;
  typeHint?: WorkType;
}

class Context {
  readonly input: DetectInput;
  readonly tokens: Token[];
  readonly lex: Lexicon;
  private readonly drafts = new Map<number, Draft>();

  constructor(input: DetectInput) {
    this.input = input;
    this.tokens = tokenize(input.text);
    this.lex = lexiconFor(input.lang);
  }

  draft(start: number): Draft {
    let d = this.drafts.get(start);
    if (d === undefined) {
      d = { start, ends: new Set(), exactEnds: new Set(), signals: new Set() };
      this.drafts.set(start, d);
    }
    return d;
  }

  allDrafts(): Draft[] {
    return [...this.drafts.values()].sort((a, b) => a.start - b.start);
  }

  /** Index of the first token starting at or after a position. */
  tokenIndexAt(position: number): number {
    let lo = 0;
    let hi = this.tokens.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((this.tokens[mid]?.start ?? Infinity) < position) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  lower(token: Token | undefined): string {
    return token?.text.toLowerCase() ?? '';
  }

  /** After a stop word: does a Title Case title go on (skipping connectors)? */
  titleCaseContinues(j: number): boolean {
    for (let i = j + 1; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (!t?.isWord) return false;
      if (this.lex.connectors.has(this.lower(t))) continue;
      return isCapitalized(t.text);
    }
    return false;
  }

  nextWordIsName(j: number): boolean {
    const t = this.tokens[j + 1];
    return t !== undefined && t.isWord && isCapitalized(t.text);
  }

  /**
   * The title window starting at word k: every possible end until a stop.
   * Punctuation, hard stops and "di/by <Name>" close it; soft stops let it
   * run SOFT_SPAN more words; in Title Case languages a lowercase content
   * word closes a capitalized title. Connectors are never a title's last word.
   */
  window(k: number): number[] {
    const { lex } = this;
    // Start checks apply to the first content word, after leading articles:
    // "il suo libro" and "the film Dune" (after "We saw") are not titles.
    let c = k;
    while (this.tokens[c]?.isWord === true && lex.connectors.has(this.lower(this.tokens[c]))) c++;
    const content = this.tokens[c];
    const first = this.lower(content);
    if (
      content === undefined ||
      !content.isWord ||
      lex.hardStops.has(first) ||
      lex.softStops.has(first) ||
      lex.authorMarkers.has(first) ||
      lex.startBlockers.has(first) ||
      Object.hasOwn(CUE_NOUN_TYPES, first)
    ) {
      return [];
    }
    const titleCase = lex.titleCase && this.input.source !== 'asr' && isCapitalized(content.text);

    const ends: number[] = [];
    let words = 0;
    let softLeft = Infinity;
    for (let j = k; j < this.tokens.length && words < MAX_WORDS; j++) {
      const t = this.tokens[j];
      if (!t?.isWord) break;
      const word = this.lower(t);
      if (j > c) {
        if (lex.authorMarkers.has(word) && this.nextWordIsName(j)) break;
        if (lex.hardStops.has(word) && !this.titleCaseContinues(j)) break;
        if (titleCase && !isCapitalized(t.text)) {
          // Lowercase inside a Title Case title: only connectors that lead to
          // another capitalized word ("of the Rose").
          if (!(lex.connectors.has(word) && this.titleCaseContinues(j))) break;
        } else if (
          softLeft === Infinity &&
          lex.softStops.has(word) &&
          !this.titleCaseContinues(j)
        ) {
          softLeft = SOFT_SPAN + 1;
        }
      }
      if (softLeft !== Infinity) {
        if (softLeft === 0) break;
        softLeft--;
      }
      words++;
      if (!lex.connectors.has(word)) ends.push(t.end);
    }
    return ends;
  }

  /** Word index where a title starts after a cue, skipping opening quotes. */
  titleStartAfter(position: number): number | undefined {
    let k = this.tokenIndexAt(position);
    while (this.tokens[k] !== undefined && OPENING_QUOTES.has(this.tokens[k]?.text ?? '')) k++;
    return this.tokens[k]?.isWord === true ? k : undefined;
  }
}

function addCues(ctx: Context): void {
  const { text, source } = ctx.input;
  for (const cue of ctx.lex.cues) {
    for (const m of text.matchAll(cue.re)) {
      if (cue.author) {
        const names = (m.groups?.['author'] ?? '').split(/\s+/u);
        const plausible =
          source === 'asr'
            ? names.every((n) => !ctx.lex.hardStops.has(n.toLowerCase()))
            : names.every((n) => isCapitalized(n));
        if (!plausible) continue;
      }
      const k = ctx.titleStartAfter(m.index + m[0].length);
      if (k === undefined) continue;
      const ends = ctx.window(k);
      const start = ctx.tokens[k]?.start;
      if (ends.length === 0 || start === undefined) continue;
      const d = ctx.draft(start);
      for (const e of ends) d.ends.add(e);
      d.signals.add('cue');
      if (cue.author) d.signals.add('author');
      const type = cue.typed ? CUE_NOUN_TYPES[(m[1] ?? '').toLowerCase()] : undefined;
      if (d.typeHint === undefined && type !== undefined) d.typeHint = type;
    }
  }
}

/** An exact span (quotes, italics), trimmed of spaces and closing punctuation. */
function addExact(ctx: Context, start: number, end: number, signal: Signal): void {
  const raw = ctx.input.text.slice(start, end);
  const lead = raw.length - raw.trimStart().length;
  const trimmed = raw.trimStart().replace(TRAILING_PUNCTUATION, '');
  if (trimmed === '') return;
  const s = start + lead;
  const k = ctx.tokenIndexAt(s);
  const token = ctx.tokens[k];
  if (token?.start !== s || !token.isWord) return;
  const d = ctx.draft(s);
  d.exactEnds.add(s + trimmed.length);
  d.signals.add(signal);
}

function addQuotes(ctx: Context): void {
  for (const m of ctx.input.text.matchAll(QUOTES)) {
    const span = m.indices?.slice(1).find((g) => g !== undefined);
    if (span !== undefined) addExact(ctx, span[0], span[1], 'quotes');
  }
}

function addEmphasis(ctx: Context): void {
  for (const { start, end } of ctx.input.emphasis ?? []) {
    if (start >= 0 && end <= ctx.input.text.length && start < end)
      addExact(ctx, start, end, 'italic');
  }
}

/** Runs of capitalized words, with lowercase connectors inside ("The Name of the Rose"). */
function addCapitalizedRuns(ctx: Context): void {
  const { tokens, lex } = ctx;
  let k = 0;
  while (k < tokens.length) {
    const t = tokens[k];
    if (
      t === undefined ||
      !t.isWord ||
      !isCapitalized(t.text) ||
      lex.notNames.has(t.text) ||
      (lex.possessive && POSSESSIVE.test(t.text))
    ) {
      k++;
      continue;
    }
    const ends: number[] = [];
    let j = k;
    for (; j < tokens.length && j - k < MAX_WORDS; j++) {
      const w = tokens[j];
      if (!w?.isWord) break;
      const word = ctx.lower(w);
      if (j > k && lex.possessive && POSSESSIVE.test(w.text)) break;
      if (isCapitalized(w.text)) {
        if (!lex.connectors.has(word)) ends.push(w.end);
      } else if (!(lex.connectors.has(word) && ctx.titleCaseContinues(j))) {
        break;
      }
    }
    if (ends.length > 0) {
      const d = ctx.draft(t.start);
      for (const e of ends) d.ends.add(e);
      d.signals.add('capitalized');
    }
    k = Math.max(j, k + 1);
  }
}

/** "di Eco", "by Harari" right after the title, or "Lynch's" right before it. */
function hasAuthor(ctx: Context, d: Draft, end: number): boolean {
  if (d.signals.has('author')) return true;
  const { tokens, lex } = ctx;
  let j = ctx.tokenIndexAt(end);
  while (tokens[j] !== undefined && CLOSING_QUOTES.has(tokens[j]?.text ?? '')) j++;
  if (lex.authorMarkers.has(ctx.lower(tokens[j])) && ctx.nextWordIsName(j)) return true;
  const before = tokens[ctx.tokenIndexAt(d.start) - 1];
  return lex.possessive && before !== undefined && POSSESSIVE.test(before.text);
}

/**
 * The candidate is the author, not a title: it follows "by"/"di" which itself
 * follows the end of another candidate or a closing quote ("Dune by David
 * Lynch", "Sapiens di Harari"). Without that second condition the Italian
 * "parlato di Sapiens" (di = about) would be penalized too.
 */
function afterAuthorMarker(ctx: Context, d: Draft, allEnds: ReadonlySet<number>): boolean {
  const i = ctx.tokenIndexAt(d.start);
  const marker = ctx.tokens[i - 1];
  const before = ctx.tokens[i - 2];
  return (
    marker !== undefined &&
    before !== undefined &&
    ctx.lex.authorMarkers.has(ctx.lower(marker)) &&
    (allEnds.has(before.end) || CLOSING_QUOTES.has(before.text))
  );
}

function features(
  ctx: Context,
  d: Draft,
  ends: readonly number[],
  repeated: number,
  allEnds: ReadonlySet<number>,
): FeatureVector {
  const { text, source } = ctx.input;
  const lex = ctx.lex;
  const eMax = ends.at(-1) ?? d.start;
  const words = ctx.tokens.filter((t) => t.isWord && t.start >= d.start && t.end <= eMax);
  const isEn = lex === lexiconFor('en');
  const isIt = lex === lexiconFor('it');
  const cap = words[0] !== undefined && isCapitalized(words[0].text) ? 1 : 0;
  const content = words.filter(
    (w) => !lex.connectors.has(w.text.toLowerCase()) && !lex.softStops.has(w.text.toLowerCase()),
  );
  const f = emptyFeatures();
  f.cue = d.signals.has('cue') ? 1 : 0;
  f.author = hasAuthor(ctx, d, eMax) ? 1 : 0;
  f.afterAuthorMarker = afterAuthorMarker(ctx, d, allEnds) ? 1 : 0;
  f.quoted = d.signals.has('quotes') ? 1 : 0;
  f.italic = d.signals.has('italic') ? 1 : 0;
  f.capStart = cap;
  f.capStartIt = isIt ? cap : 0;
  f.capStartSubtitles = source === 'subtitles' ? cap : 0;
  f.capStartAsr = source === 'asr' ? cap : 0;
  f.titleCaseEn =
    isEn && content.length >= 2 && content.every((w) => isCapitalized(w.text)) ? 1 : 0;
  f.sentenceInitial = isSentenceInitial(text, d.start) ? 1 : 0;
  f.singleWord = words.length === 1 ? 1 : 0;
  f.longSpan = words.length > LONG_SPAN ? 1 : 0;
  f.repeated = repeated;
  return f;
}

/**
 * Finds mention candidates in a text: titles (with p_m from the logistic
 * model) and explicit identifiers (with a fixed p), ordered by position.
 */
export function detectMentions(
  input: DetectInput,
  options: DetectOptions = {},
): MentionCandidate[] {
  const { minP = DEFAULT_MIN_P, weights = PRIOR_WEIGHTS } = options;
  const ctx = new Context(input);
  const identifiers = findIdentifiers(input.text);

  addCues(ctx);
  addQuotes(ctx);
  addEmphasis(ctx);
  addCapitalizedRuns(ctx);

  const insideIdentifier = (pos: number): boolean =>
    identifiers.some((m) => pos >= m.start && pos < m.end);

  const resolved = ctx
    .allDrafts()
    .map((d) => {
      const source = d.exactEnds.size > 0 ? d.exactEnds : d.ends;
      return { d, ends: [...source].sort((a, b) => a - b) };
    })
    .filter(({ d, ends }) => ends.length > 0 && !insideIdentifier(d.start));

  // Repetition: how many candidates share the same shortest normalized surface.
  const keyOf = (start: number, ends: readonly number[]): string =>
    normalizeTitle(input.text.slice(start, ends[0]), input.lang);
  const counts = new Map<string, number>();
  for (const { d, ends } of resolved) {
    const key = keyOf(d.start, ends);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const allEnds = new Set(resolved.flatMap(({ ends }) => ends));
  const titles: TitleCandidate[] = [];
  for (const { d, ends } of resolved) {
    const repeated = Math.log(counts.get(keyOf(d.start, ends)) ?? 1);
    const f = features(ctx, d, ends, repeated, allEnds);
    const pMention = mentionProbability(f, weights);
    if (pMention < minP) continue;
    titles.push({
      kind: 'title',
      start: d.start,
      ends,
      ...(d.typeHint === undefined ? {} : { typeHint: d.typeHint }),
      signals: [...d.signals].sort(),
      features: f,
      pMention,
    });
  }

  const ids: IdentifierCandidate[] = identifiers.map((m) => ({
    ...m,
    kind: 'identifier',
    pMention: IDENTIFIER_P[m.scheme],
  }));

  return [...titles, ...ids].sort((a, b) => a.start - b.start);
}
