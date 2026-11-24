import type { WorkType } from '../model.ts';

/**
 * A phrase that announces a title: "nel romanzo", "the film", "come scrive
 * Harari in", "I've read". The title starts where the match ends.
 */
export interface CuePattern {
  /** Matched case-insensitively against the text (flags giu). */
  readonly re: RegExp;
  /** Work type suggested by the noun in capture group 1, if any. */
  readonly typed: boolean;
  /** The pattern names the author in the named group "author". */
  readonly author: boolean;
}

export interface Lexicon {
  readonly cues: readonly CuePattern[];
  /** Words that close the title window, unless a Title Case title continues. */
  readonly hardStops: ReadonlySet<string>;
  /** Words after which the window may continue for a few words (titles like "Guerra e pace"). */
  readonly softStops: ReadonlySet<string>;
  /** "di Eco", "by Harari": close the window when followed by a capitalized name. */
  readonly authorMarkers: ReadonlySet<string>;
  /** Articles and short function words: allowed inside a title, never its last word. */
  readonly connectors: ReadonlySet<string>;
  /** Words that cannot start a title (possessives, demonstratives). */
  readonly startBlockers: ReadonlySet<string>;
  /** Single capitalized words that are not names (the English pronoun "I"). */
  readonly notNames: ReadonlySet<string>;
  /** English possessive "Lynch's": marks an author right before a title. */
  readonly possessive: boolean;
  /**
   * Titles are written in Title Case (English): once a title starts with a
   * capital, a lowercase content word ends it. Italian uses sentence case.
   */
  readonly titleCase: boolean;
}

/** Nouns of the cue phrases and the work type each one suggests. */
export const CUE_NOUN_TYPES: Readonly<Record<string, WorkType>> = {
  book: 'book',
  novel: 'book',
  memoir: 'book',
  essay: 'book',
  paper: 'paper',
  study: 'paper',
  article: 'article',
  film: 'film',
  movie: 'film',
  documentary: 'film',
  series: 'series',
  show: 'series',
  podcast: 'podcast',
  episode: 'podcast',
  talk: 'talk',
  lecture: 'talk',
  song: 'song',
  track: 'song',
  album: 'other',
  libro: 'book',
  romanzo: 'book',
  saggio: 'book',
  raccolta: 'book',
  studio: 'paper',
  articolo: 'article',
  intervista: 'article',
  documentario: 'film',
  serie: 'series',
  episodio: 'podcast',
  puntata: 'podcast',
  conferenza: 'talk',
  lezione: 'talk',
  canzone: 'song',
  brano: 'song',
  disco: 'other',
};

const words = (list: string): ReadonlySet<string> => new Set(list.trim().split(/\s+/u));
const AUTHOR = String.raw`(?<author>\p{L}[\p{L}'’.\-]*(?:\s+\p{L}[\p{L}'’.\-]*){0,2})`;

const EN: Lexicon = {
  cues: [
    {
      re: /\b(?:the|this|that|a|an)\s+(book|novel|memoir|essay|paper|article|study|film|movie|documentary|series|show|podcast|episode|talk|lecture|song|track|album)\s+(?:called\s+|titled\s+|entitled\s+)?/giu,
      typed: true,
      author: false,
    },
    {
      re: new RegExp(
        String.raw`\bas\s+${AUTHOR}\s+(?:argues|argued|writes|wrote|says|said|shows|showed|explains|explained|notes|claims|puts\s+it)\s+in\s+`,
        'giu',
      ),
      typed: false,
      author: true,
    },
    {
      re: /\b(?:I|we|I've|we've|I\s+have|we\s+have)\s+(?:just\s+|recently\s+)?(?:read|reread|watched|seen|saw|listened\s+to|heard)\s+/giu,
      typed: false,
      author: false,
    },
  ],
  hardStops: words(`
    which that who whom whose because when while where so if then than since after before during
    is was are were has had have will would can could should as last yesterday today tonight again too also
    in on at for with from to into about this these those it he she they we you i`),
  softStops: words('and or nor'),
  authorMarkers: words('by'),
  connectors: words('the a an of and or in on at to for with from'),
  startBlockers: words('his her their its my our your this that these those'),
  notNames: words('I'),
  possessive: true,
  titleCase: true,
};

const IT: Lexicon = {
  cues: [
    {
      re: /\b(?:il|nel|del|al|dal|sul|un|quel|questo)\s+(libro|romanzo|saggio|paper|articolo|studio|film|documentario|podcast|talk|brano|disco|album|episodio)\s+(?:intitolato\s+|chiamato\s+)?/giu,
      typed: true,
      author: false,
    },
    {
      re: /\b(?:la|nella|della|alla|dalla|sulla|una|quella|questa)\s+(serie|canzone|puntata|conferenza|lezione|raccolta|intervista)\s+(?:intitolata\s+|chiamata\s+)?/giu,
      typed: true,
      author: false,
    },
    {
      re: /\b(?:l|nell|dell|all|dall|sull|un|quell)['’](articolo|album|episodio|intervista)\s+/giu,
      typed: true,
      author: false,
    },
    {
      re: new RegExp(
        String.raw`\bcome\s+(?:scrive|scriveva|sostiene|dice|diceva|racconta|raccontava|spiega|mostra|nota)\s+${AUTHOR}\s+(?:in|nel|nella|nei|negli|nelle|ne)\s+`,
        'giu',
      ),
      typed: false,
      author: true,
    },
    {
      re: /\b(?:ho|abbiamo|hai|avevo)\s+(?:appena\s+)?(?:letto|riletto|visto|rivisto|guardato|ascoltato)\s+|\bsto\s+(?:leggendo|guardando|ascoltando)\s+/giu,
      typed: false,
      author: false,
    },
  ],
  hardStops: words(`
    ma però che chi cui perché quando mentre dove se poi è era sono erano ha aveva hanno avevano sarà
    come anche già ancora ieri oggi stasera domani lui lei noi voi io`),
  softStops: words(`
    e ed o oppure in a da con su per tra fra al allo alla ai agli alle dal dallo dalla dai dagli dalle
    nel nello nella nei negli nelle sul sullo sulla sui sugli sulle`),
  authorMarkers: words('di'),
  connectors: words(`
    il lo la i gli le l un uno una gl di del dello della dei degli delle d dell
    a al allo alla ai agli alle all da dal dallo dalla dall in nel nello nella nell su sul sulla sull
    con per tra fra e ed o`),
  startBlockers: words(
    'suo sua suoi sue mio mia tuo tua loro nostro nostra questo questa quel quella',
  ),
  notNames: words(''),
  possessive: false,
  titleCase: false,
};

/** Language-independent fallback: no cues, punctuation still closes windows. */
const NONE: Lexicon = {
  cues: [],
  hardStops: new Set(),
  softStops: new Set(),
  authorMarkers: new Set(),
  connectors: new Set(),
  startBlockers: new Set(),
  notNames: new Set(),
  possessive: false,
  titleCase: false,
};

export function lexiconFor(lang: string): Lexicon {
  const primary = lang.trim().split(/[-_]/u)[0]?.toLowerCase();
  if (primary === 'en') return EN;
  if (primary === 'it') return IT;
  return NONE;
}
