/**
 * Data model of the Open Citation Track. The JSON Schema in
 * `spec/citation-track.schema.json` describes the same shapes for other
 * languages; `spec/schema.test.ts` checks that the two stay in sync.
 */

/** Version of the Open Citation Track format implemented by this package. */
export const SPEC_VERSION = '0.1.0';

export const WORK_TYPES = [
  'book',
  'paper',
  'article',
  'video',
  'film',
  'series',
  'podcast',
  'talk',
  'song',
  'other',
] as const;

export type WorkType = (typeof WORK_TYPES)[number];

export interface Link {
  readonly label: string;
  readonly url: string;
}

export interface Work {
  /** Canonical id: "wikidata:Q…", or fallbacks such as "doi:…", "isbn:…", "tmdb:…". */
  readonly id: string;
  readonly type: WorkType;
  readonly title: string;
  readonly authors: readonly string[];
  readonly year?: number;
  readonly identifiers: Readonly<Record<string, string>>;
  readonly links: readonly Link[];
  readonly coverUrl?: string;
}

/** A position in time, in seconds from the start of the media. */
export interface TimeAnchor {
  readonly kind: 'time';
  readonly start: number;
  readonly end: number;
}

/**
 * A position in text, as a W3C Web Annotation TextQuoteSelector: the exact
 * quote plus some context before and after it, which survives DOM changes
 * better than offsets. `startHint` is an optional character offset used to
 * find the quote faster.
 */
export interface TextAnchor {
  readonly kind: 'text';
  readonly exact: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly startHint?: number;
}

export type Anchor = TimeAnchor | TextAnchor;

export interface Mention {
  readonly id: string;
  /** The exact words spoken or written. */
  readonly surface: string;
  readonly anchor: Anchor;
  /** Id of the linked work, or null when the mention is not linked (NIL). */
  readonly workId: string | null;
  /** Calibrated confidence in [0, 1]. */
  readonly p: number;
  readonly source: 'creator' | 'auto';
}

export interface CitationTrack {
  /** Semantic version of the format this track follows. */
  readonly specVersion: string;
  readonly content: {
    readonly url?: string;
    /** "sha256:" followed by 64 lowercase hex digits. */
    readonly hash?: string;
    readonly durationSec?: number;
  };
  readonly works: readonly Work[];
  readonly mentions: readonly Mention[];
}
