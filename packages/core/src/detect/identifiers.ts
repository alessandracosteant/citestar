/**
 * Explicit identifiers in text: ISBN-10, ISBN-13, ISSN, DOI and arXiv.
 *
 * A valid identifier names exactly one work, so it skips the probabilistic
 * detector and gets a fixed confidence (IDENTIFIER_P). To keep false positives
 * rare, the schemes whose check digit lets 1 random number in 11 through
 * (ISBN-10, ISSN) and arXiv numbers (which look like decimals) are recognized
 * only with an explicit prefix ("ISBN", "ISSN", "arXiv:" or a URL). A bare
 * ISBN-13 is accepted: it must start with 978 or 979 and pass its check digit.
 *
 * The arithmetic of the check digits is derived in docs/MATH.md §8.
 */

export type IdentifierScheme = 'isbn' | 'issn' | 'doi' | 'arxiv';

export interface IdentifierMatch {
  readonly scheme: IdentifierScheme;
  /** Canonical id: "isbn:<13 digits>", "issn:NNNN-NNNC", "doi:<lowercase>", "arxiv:<id without version>". */
  readonly id: string;
  /** UTF-16 offsets of the whole match in the text, prefix included. */
  readonly start: number;
  readonly end: number;
}

/**
 * Fixed confidence of a validated identifier. Below 1 because a well-formed
 * identifier may still not exist (a typo that keeps the check digit valid, an
 * unregistered DOI); the catalog lookup confirms it. DOI and arXiv have no
 * check digit, hence the slightly lower value.
 */
export const IDENTIFIER_P: Readonly<Record<IdentifierScheme, number>> = {
  isbn: 0.99,
  issn: 0.99,
  doi: 0.98,
  arxiv: 0.98,
};

const digitValue = (ch: string): number => (ch === 'X' || ch === 'x' ? 10 : Number(ch));

/** ISBN-10: Σᵢ₌₁¹⁰ (11 − i)·dᵢ ≡ 0 (mod 11), with X = 10 allowed only as the last character. */
export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dXx]$/u.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (10 - i) * digitValue(isbn[i] ?? '');
  return sum % 11 === 0;
}

/** ISBN-13: weights 1, 3, 1, 3, …, sum ≡ 0 (mod 10), prefix 978 or 979. */
export function isValidIsbn13(isbn: string): boolean {
  if (!/^97[89]\d{10}$/u.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 13; i++) sum += (i % 2 === 0 ? 1 : 3) * Number(isbn[i]);
  return sum % 10 === 0;
}

/** Converts a valid ISBN-10 to its ISBN-13 (prefix 978, new check digit). */
export function isbn10To13(isbn10: string): string {
  if (!isValidIsbn10(isbn10)) throw new RangeError(`not a valid ISBN-10: ${isbn10}`);
  const body = `978${isbn10.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 === 0 ? 1 : 3) * Number(body[i]);
  return `${body}${String((10 - (sum % 10)) % 10)}`;
}

/** ISSN: Σᵢ₌₁⁸ (9 − i)·dᵢ ≡ 0 (mod 11), with X = 10 allowed only as the last character. */
export function isValidIssn(issn: string): boolean {
  const compact = issn.replace('-', '');
  if (!/^\d{7}[\dXx]$/u.test(compact)) return false;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += (8 - i) * digitValue(compact[i] ?? '');
  return sum % 11 === 0;
}

/**
 * Removes punctuation that ends a sentence rather than the DOI: trailing
 * ".", "," and ";", and a trailing ")" only when the DOI has more ")" than
 * "(" (so "10.1016/0002-9149(87)90136-1" keeps its balanced parentheses).
 */
export function trimDoi(doi: string): string {
  let out = doi;
  for (;;) {
    if (/[.,;]$/u.test(out)) {
      out = out.slice(0, -1);
      continue;
    }
    if (out.endsWith(')') && out.split(')').length > out.split('(').length) {
      out = out.slice(0, -1);
      continue;
    }
    return out;
  }
}

/** Old-style arXiv archives (identifiers before April 2007, e.g. hep-th/9901001). */
const ARXIV_ARCHIVES = new Set([
  'acc-phys',
  'adap-org',
  'alg-geom',
  'ao-sci',
  'astro-ph',
  'atom-ph',
  'bayes-an',
  'chao-dyn',
  'chem-ph',
  'cmp-lg',
  'comp-gas',
  'cond-mat',
  'cs',
  'dg-ga',
  'funct-an',
  'gr-qc',
  'hep-ex',
  'hep-lat',
  'hep-ph',
  'hep-th',
  'math',
  'math-ph',
  'mtrl-th',
  'nlin',
  'nucl-ex',
  'nucl-th',
  'patt-sol',
  'physics',
  'plasm-ph',
  'q-alg',
  'q-bio',
  'quant-ph',
  'solv-int',
  'supr-con',
]);

/**
 * New-style arXiv number YYMM.NNNN or YYMM.NNNNN: month 01–12, from 0704 (when
 * the scheme started); 4 digits after the dot until 1412, 5 from 1501.
 */
export function isValidArxivNew(yymm: string, number: string): boolean {
  const month = Number(yymm.slice(2));
  const value = Number(yymm);
  if (month < 1 || month > 12 || value < 704) return false;
  return number.length === (value <= 1412 ? 4 : 5);
}

/** Old-style arXiv: a known archive and YYMMNNN from 9108 to 0703. */
export function isValidArxivOld(archive: string, yymm: string): boolean {
  if (!ARXIV_ARCHIVES.has(archive)) return false;
  const year = Number(yymm.slice(0, 2));
  const month = Number(yymm.slice(2));
  if (month < 1 || month > 12) return false;
  const full = (year >= 91 ? 1900 : 2000) + year;
  const stamp = full * 100 + month;
  return stamp >= 199108 && stamp <= 200703;
}

const ISBN_PREFIXED =
  /\bISBN(?:-1[03])?:?\s*(97[89](?:[- ]?\d){10}|\d(?:[- ]?\d){8}[- ]?[\dXx])(?![\dXx])/giu;
const ISBN13_BARE = /(?<![\d-])(97[89](?:-?\d){10})(?![\d-])/gu;
const ISSN = /\bISSN:?\s*(\d{4}-?\d{3}[\dXx])(?![\dXx])/giu;
// Crossref's recommended pattern for modern DOIs: /^10.\d{4,9}\/[-._;()/:A-Z0-9]+$/i
const DOI = /(?:\bdoi:\s*|\bhttps?:\/\/(?:dx\.)?doi\.org\/)?\b(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/giu;
const ARXIV_NEW =
  /(?:\barXiv:\s*|\bhttps?:\/\/arxiv\.org\/(?:abs|pdf)\/)(\d{4})\.(\d{4,5})(?:v\d+)?(?!\d)/giu;
const ARXIV_OLD =
  /(?:\barXiv:\s*|\bhttps?:\/\/arxiv\.org\/(?:abs|pdf)\/)?\b([a-z]+(?:-[a-z]+)?)(?:\.[A-Z]{2})?\/(\d{4})(\d{3})(?:v\d+)?(?!\d)/gu;

/**
 * Finds valid explicit identifiers in a text, ordered by position. When two
 * matches overlap, the one that starts first (then the longer one) wins.
 */
export function findIdentifiers(text: string): IdentifierMatch[] {
  const found: IdentifierMatch[] = [];
  const add = (scheme: IdentifierScheme, id: string, start: number, end: number): void => {
    found.push({ scheme, id, start, end });
  };

  for (const m of text.matchAll(ISBN_PREFIXED)) {
    const digits = (m[1] ?? '').replace(/[- ]/gu, '').toUpperCase();
    const start = m.index;
    if (digits.length === 13 && isValidIsbn13(digits))
      add('isbn', `isbn:${digits}`, start, start + m[0].length);
    if (digits.length === 10 && isValidIsbn10(digits)) {
      add('isbn', `isbn:${isbn10To13(digits)}`, start, start + m[0].length);
    }
  }
  for (const m of text.matchAll(ISBN13_BARE)) {
    const digits = (m[1] ?? '').replace(/-/gu, '');
    if (isValidIsbn13(digits)) add('isbn', `isbn:${digits}`, m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(ISSN)) {
    const raw = (m[1] ?? '').replace('-', '').toUpperCase();
    if (isValidIssn(raw))
      add('issn', `issn:${raw.slice(0, 4)}-${raw.slice(4)}`, m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(DOI)) {
    const raw = m[1] ?? '';
    const doi = trimDoi(raw);
    const end = m.index + m[0].length - (raw.length - doi.length);
    add('doi', `doi:${doi.toLowerCase()}`, m.index, end);
  }
  for (const m of text.matchAll(ARXIV_NEW)) {
    const yymm = m[1] ?? '';
    const number = m[2] ?? '';
    if (isValidArxivNew(yymm, number))
      add('arxiv', `arxiv:${yymm}.${number}`, m.index, m.index + m[0].length);
  }
  for (const m of text.matchAll(ARXIV_OLD)) {
    const archive = m[1] ?? '';
    const yymm = m[2] ?? '';
    if (isValidArxivOld(archive, yymm)) {
      add('arxiv', `arxiv:${archive}/${yymm}${m[3] ?? ''}`, m.index, m.index + m[0].length);
    }
  }

  found.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: IdentifierMatch[] = [];
  for (const match of found) {
    const last = kept.at(-1);
    if (last === undefined || match.start >= last.end) kept.push(match);
  }
  return kept;
}
