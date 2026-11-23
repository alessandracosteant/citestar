/**
 * Title normalization for matching mentions against catalog titles.
 *
 * normalizeTitle = stripArticle ∘ tokenize ∘ fold, and it is idempotent:
 * normalizeTitle(normalizeTitle(s)) = normalizeTitle(s) for every s (proof in
 * docs/MATH.md §6).
 *
 * 1. fold: Unicode NFKD (splits "é" into "e" + accent, expands compatibility
 *    forms like "ﬁ" → "fi"), drop combining marks (\p{M}) and invisible format
 *    characters (\p{Cf}, e.g. soft hyphen), then lowercase.
 * 2. tokenize: punctuation, symbols and control characters become spaces;
 *    split on whitespace. Apostrophes are punctuation, so the Italian elision
 *    "l'isola" becomes the tokens "l", "isola".
 * 3. stripArticle: drop the first token if it is an article **of the title's
 *    language**, the title has more tokens, and the next token is not itself an
 *    article. The last condition keeps "La La Land" whole: stripping once would
 *    break idempotence, stripping repeatedly would make titles collide.
 *
 * Not handled on purpose: "ß" stays "ß" (NFKD does not decompose it), articles
 * in the middle of a title stay ("name of the rose").
 */

/** A string produced by normalizeTitle. Comparison functions require it. */
export type Normalized = string & { readonly __brand: 'Normalized' };

const ARTICLES: Readonly<Record<string, ReadonlySet<string>>> = {
  en: new Set(['the', 'a', 'an']),
  // "l" and "gl" come from elided forms (l', gl'); "un'" gives "un".
  it: new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'uno', 'una', 'l', 'gl']),
};

const MARKS_AND_FORMAT = /[\p{M}\p{Cf}]+/gu;
const SEPARATORS = /[\p{P}\p{S}\p{Cc}\s]+/gu;

/**
 * Primary language subtag, lowercased: "it-IT" → "it". Also accepts the POSIX
 * locale form with an underscore ("it_IT"), common in system settings.
 */
function primaryLanguage(lang: string): string {
  return lang.trim().split(/[-_]/u)[0]?.toLowerCase() ?? '';
}

function fold(text: string): string {
  return text.normalize('NFKD').replace(MARKS_AND_FORMAT, '').toLowerCase();
}

function tokenize(folded: string): string[] {
  return folded.split(SEPARATORS).filter((token) => token !== '');
}

function stripArticle(
  tokens: readonly string[],
  articles: ReadonlySet<string> | undefined,
): string[] {
  const [first, second] = tokens;
  if (
    articles !== undefined &&
    first !== undefined &&
    second !== undefined &&
    articles.has(first) &&
    !articles.has(second)
  ) {
    return tokens.slice(1);
  }
  return [...tokens];
}

/**
 * Normalizes a title for matching.
 *
 * @param lang BCP 47 tag of the title's language: the document's language for a
 *   mention, the Wikidata label's language tag for a candidate. Articles are
 *   removed only for languages with a known list ("en", "it"); use "und" for an
 *   unknown language.
 */
export function normalizeTitle(title: string, lang: string): Normalized {
  const articles = ARTICLES[primaryLanguage(lang)];
  return stripArticle(tokenize(fold(title)), articles).join(' ') as Normalized;
}

/**
 * Tokens of a normalized title. Each token is itself a normalized string: it is
 * folded, has no separators, and a single token never loses an article.
 */
export function normalizedTokens(text: Normalized): Normalized[] {
  return text === '' ? [] : (text.split(' ') as Normalized[]);
}

const MAIN_TITLE_SEPARATOR = /[:：]|\s[-–—]\s/u;

/**
 * Variants of a raw title, computed before punctuation is removed: the full
 * title and, when there is a subtitle, the main title before the first colon
 * (also the full-width "：" of CJK titles) or spaced dash (" - ", " – ",
 * " — "). "Dune: Part Two" → ["Dune: Part Two", "Dune"]. Hyphens inside words
 * ("Spider-Man") do not split.
 */
export function titleVariants(title: string): string[] {
  const full = title.trim();
  const match = MAIN_TITLE_SEPARATOR.exec(full);
  const main = match === null ? '' : full.slice(0, match.index).trim();
  return main === '' ? [full] : [full, main];
}

/** Normalized variants of a title, without duplicates or empty strings. */
export function normalizeTitleVariants(title: string, lang: string): Normalized[] {
  const variants = titleVariants(title).map((variant) => normalizeTitle(variant, lang));
  return [...new Set(variants)].filter((variant) => variant !== '');
}
