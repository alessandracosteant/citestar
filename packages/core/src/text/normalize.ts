/**
 * Title normalization for matching mentions against catalog titles.
 *
 * Both sides of a comparison must go through the same function, so the exact
 * choices matter less than their consistency. The steps, in order:
 *
 * 1. Unicode NFKD: splits accented letters into base + combining mark
 *    ("é" → "e" + U+0301) and expands compatibility forms (ligature "ﬁ" → "fi").
 * 2. Drop combining marks (\p{M}): "é" → "e", "İ" → "i".
 * 3. Lowercase (locale-independent).
 * 4. Unify apostrophes (’ ‘ ʼ → ') and drop a leading elided article ("l'", "un'").
 * 5. Replace punctuation and symbols with spaces, collapse whitespace.
 * 6. Drop one leading article of the given language ("the", "il", ...), unless
 *    it is the whole title.
 *
 * Not handled on purpose: "ß" stays "ß" (NFKD does not decompose it), articles
 * in the middle of a title stay ("name of the rose").
 */

const LEADING_ARTICLES: Readonly<Record<string, ReadonlySet<string>>> = {
  en: new Set(['the', 'a', 'an']),
  it: new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una']),
};

const ELIDED_ARTICLE: Readonly<Record<string, RegExp>> = {
  it: /^(?:l|un|gl)'\s*/u,
};

const COMBINING_MARKS = /\p{M}+/gu;
const APOSTROPHES = /[’‘ʼ]/gu;
const PUNCTUATION_AND_SYMBOLS = /[\p{P}\p{S}]+/gu;
const WHITESPACE = /\s+/gu;

/** Primary language subtag, lowercased: "it-IT" → "it". */
function primaryLanguage(lang: string): string {
  return lang.split('-')[0]?.toLowerCase() ?? '';
}

/**
 * Normalizes a title for matching.
 *
 * @param lang BCP 47 language tag of the title ("it", "en-GB", ...). Articles
 *   are removed only for languages with a known article list; for others only
 *   the language-independent steps apply.
 */
export function normalizeTitle(title: string, lang: string): string {
  const language = primaryLanguage(lang);

  let text = title
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(APOSTROPHES, "'");

  const elided = ELIDED_ARTICLE[language];
  if (elided !== undefined) text = text.trimStart().replace(elided, '');

  const tokens = text
    .replace(PUNCTUATION_AND_SYMBOLS, ' ')
    .replace(WHITESPACE, ' ')
    .trim()
    .split(' ');

  const articles = LEADING_ARTICLES[language];
  const first = tokens[0];
  if (articles !== undefined && first !== undefined && tokens.length > 1 && articles.has(first)) {
    tokens.shift();
  }

  return tokens.join(' ');
}
