/**
 * Tokens with their UTF-16 offsets in the original text, so that every
 * candidate maps back to an exact slice (and later to a DOM Range or a time).
 *
 * A word is a run of letters, digits and combining marks, possibly joined by
 * an apostrophe or hyphen ("Cent'anni", "Spider-Man", "dell'isola"). Every
 * other non-space character is a punctuation token of its own.
 */
export interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly isWord: boolean;
}

const TOKEN = /[\p{L}\p{N}\p{M}]+(?:['’-][\p{L}\p{N}\p{M}]+)*|[^\s\p{L}\p{N}\p{M}]/gu;
const WORD_START = /^[\p{L}\p{N}]/u;
const CAPITAL_START = /^[\p{Lu}\p{Lt}]/u;

export function tokenize(text: string): Token[] {
  return Array.from(text.matchAll(TOKEN), (m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
    isWord: WORD_START.test(m[0]),
  }));
}

/** First letter is uppercase or titlecase ("Dune", "ǅemal"). */
export function isCapitalized(word: string): boolean {
  return CAPITAL_START.test(word);
}

const SENTENCE_END = /[.!?…\n]/u;
const OPENERS = /[\s"“„«‘([]/u;

/**
 * Whether a position starts a sentence: only spaces and opening quotes or
 * brackets separate it from the start of the text or from . ! ? … or a newline.
 */
export function isSentenceInitial(text: string, start: number): boolean {
  for (let i = start - 1; i >= 0; i--) {
    const ch = text[i] ?? '';
    if (SENTENCE_END.test(ch)) return true;
    if (!OPENERS.test(ch)) return false;
  }
  return true;
}
