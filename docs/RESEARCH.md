# Phase 0 research notes

_Verified on 2026-11-23. Limits and terms change often (several did during 2025–2026): re-check before each
milestone that depends on them. "Unverified" marks a fact we could not confirm from an official page._

## 1. External APIs

### 1.1 Catalogs that work with no key (zero-config tier)

| API              | Endpoint we plan to use                                                                                                                                                                                     | Limits                                                                                                                                                                                                                                          | Terms / data license                                                                                                                 | Notes for our design                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wikidata**     | Action API (`https://www.wikidata.org/w/api.php`): CirrusSearch `generator=search` with `haswbstatement` for typed search (§1.4), `wbsearchentities` for untyped prefix search, `wbgetentities` for details | Since March 2026, global per-minute limits: 200/min for unauthenticated browser requests or bots with a compliant User-Agent, 10/min for requests with no identification. Keep concurrency ≤ 3 (robot policy says 1 for unauthenticated).       | Data CC0.                                                                                                                            | Browsers cannot set `User-Agent`: send `Api-User-Agent`. Avoid SPARQL in the hot path: since 9 May 2025 the query service is split (`query.wikidata.org` = main graph, `query-scholarly.wikidata.org` = scholarly articles). Wikidata is our ID hub: items carry ISBN, DOI, IMDb, TMDB (P4947 movie, P4983 TV), MusicBrainz and Open Library IDs. |
| **Open Library** | `/search.json` with `fields=`, covers via `covers.openlibrary.org/b/id/{cover_i}-M.jpg`                                                                                                                     | 1 req/s anonymous, 3 req/s with an identifying User-Agent and contact. Covers by ISBN/OCLC/LCCN: 100 req per 5 min per IP; by cover ID or OLID: no such limit.                                                                                  | Asks to cache, to make requests on behalf of human users, and **not** to use it as the backend of a high-traffic commercial service. | Use `cover_i` from search results, never ISBN-based cover URLs. The shared server cache must not proxy Open Library at scale.                                                                                                                                                                                                                     |
| **Crossref**     | `https://api.crossref.org/works`                                                                                                                                                                            | From 1 Dec 2025: public pool 5 req/s, concurrency 1; polite pool (with `mailto`) 10 req/s, concurrency 3 per docs (5 per forum). Reports of 1 req/s (public) / 3 req/s (polite) for list/search calls since mid-2026 (unconfirmed by Crossref). | Metadata reusable; check per-field.                                                                                                  | Read `x-rate-limit-*`, `x-concurrency-limit` headers dynamically and honour `Retry-After`. Budget search calls at ≤ 1 req/s per client. `mailto` must be the user's choice or a project address, never collected silently.                                                                                                                        |
| **OpenAlex**     | `https://api.openalex.org/works?search=`                                                                                                                                                                    | Usage-based since Feb 2026: no key = $0.10/day budget, free key = $1/day. Singleton lookups free; list/search $0.10 per 1,000 calls (≈ 1,000 searches/day without a key). 10 req/s without key.                                                 | Data CC0.                                                                                                                            | Fine for a single user without a key. The self-hosted server should take an optional key. Docs pages contradict each other: use help.openalex.org as the reference.                                                                                                                                                                               |
| **arXiv**        | `http://export.arxiv.org/api/query`                                                                                                                                                                         | 1 request every 3 s, one connection at a time.                                                                                                                                                                                                  | Metadata CC0; e-prints not freely redistributable.                                                                                   | Only for explicit arXiv IDs or strong "paper" hints.                                                                                                                                                                                                                                                                                              |
| **MusicBrainz**  | `/ws/2/recording`, `/ws/2/release-group` with `fmt=json`                                                                                                                                                    | 1 req/s per IP; IP may be blocked if exceeded (503).                                                                                                                                                                                            | Core data CC0. Requires a meaningful User-Agent with contact.                                                                        | Per-client token bucket with r = 1 s⁻¹.                                                                                                                                                                                                                                                                                                           |

### 1.2 Catalogs that need a key (bring-your-own-key tier)

A key embedded in a public extension or script is public. Keyed resolvers are therefore **off by default**: enabled
with a user-provided key in settings, or through the self-hosted server's key.

| API                     | Limits                                                                                                                                               | Terms                                                                                                                                                                                                                                                                                                                         | Notes                                                                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TMDB**                | ≈ 40 req/s per IP (old 40/10 s limit removed in 2019).                                                                                               | Free for non-commercial use with attribution: approved TMDB logo in the About/Credits area, less prominent than our own mark, plus the notice "This product uses the TMDB API but is not endorsed or certified by TMDB." Commercial use needs a written agreement. Cache ≤ 6 months (per a third-party reading of the terms). | Most film/series links can come from Wikidata (P4947/P4983) without calling TMDB. TMDB adds posters and better recall when a key is present. Companies using it commercially need their own TMDB agreement. |
| **Google Books**        | No published quota table; ≈ 1,000 req/day per project reported; keyless requests now get quota 0 in practice.                                        | Google APIs ToS + Books API ToS (2012): caching only as allowed by cache headers.                                                                                                                                                                                                                                             | Optional. Open Library covers the zero-config case.                                                                                                                                                         |
| **Semantic Scholar**    | Keyless shared pool of 1,000 req/s for all users (throttled under load); key = 1 req/s to start.                                                     | Ai2 API license agreement; attribution required in publications.                                                                                                                                                                                                                                                              | Optional; OpenAlex + Crossref cover papers without a key.                                                                                                                                                   |
| **Podcast Index**       | Free key + secret; `Authorization` = SHA-1(key + secret + unix time), ±3 min window.                                                                 | Free registration.                                                                                                                                                                                                                                                                                                            | Optional, server-side preferred (the secret must stay secret).                                                                                                                                              |
| **YouTube Data API v3** | 10,000 units/day per project; `search.list` ≈ 100 units (possibly a separate bucket since late 2026, unconfirmed). Quota increases require an audit. | Developer Policies: non-authorized data cached ≤ 30 days, then refreshed or deleted. **`captions.download` only works for videos the caller can edit.**                                                                                                                                                                       | Useful only for video metadata (title, channel). It cannot give us captions of other people's videos.                                                                                                       |

### 1.3 Optional LLM for ambiguous cases

| Option                                               | Status                                 | Notes                                                                                                                                                    |
| ---------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ollama** (local)                                   | Works over `http://localhost:11434`.   | The user must allow the extension origin (`OLLAMA_ORIGINS`). Opt-in only.                                                                                |
| **Chrome Prompt API** (Gemini Nano, `LanguageModel`) | Stable in extensions since Chrome 138. | Input languages: en, ja, es, de, fr. **No Italian**, so it can only help English content. Needs a large one-time model download and plenty of free disk. |
| **Cloud APIs**                                       | Pluggable adapter.                     | Opt-in, user's own key; only the mention and a short context window are sent.                                                                            |

### 1.4 Wikidata: filtering candidates by work type

`wbsearchentities` cannot filter by type: "Dune" returns the novel, the films and the desert. CirrusSearch
(`action=query&list=search` or `generator=search`) supports the `haswbstatement` keyword. Tested live on
2026-11-23:

| Query (`srsearch`)                                                        | Top results                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Dune` (no filter)                                                        | 12,605 hits; mixed types                                                       |
| `Dune haswbstatement:P31=Q7725634` (literary work)                        | 64 hits; #1 Q190192, the 1965 novel                                            |
| `Dune haswbstatement:P31=Q11424` (film)                                   | 71 hits; #1 Q114819 (1984 film); the 2021 film Q60834962 is only #7            |
| `Il nome della rosa haswbstatement:P31=Q7725634\|P31=Q571\|P31=Q47461344` | #1 Q172850, the novel (Italian title matched through Italian labels)           |
| `Sapiens haswbstatement:P31=Q571\|P31=Q7725634\|P31=Q47461344`            | #1 Q12411055, Harari's book                                                    |
| `Bohemian Rhapsody haswbstatement:P31=Q7366\|P31=Q134556`                 | only singles: the song itself is typed "musical work/composition" (Q105543609) |
| `Bohemian Rhapsody haswbstatement:P31=Q105543609\|P31=Q7366\|P31=Q134556` | #1 Q187745, the song                                                           |
| `Dune haswbstatement:` + 20 OR'ed P31 values                              | works (#1 novel, #2 1984 film, #3 _Dune: Prophecy_ series)                     |

What we learned:

- **Syntax** (official help page): `|` is OR inside one `haswbstatement`; two separate keywords are AND.
  Verified by inclusion–exclusion on "Dune": literary work 64 hits, film 71, both (AND) 0, OR 135 = 64 + 71 − 0.
  One request therefore covers a whole set of QIDs. Matching is on the **direct** P31 value only: subclasses are
  not followed. Each `WorkType` therefore needs a small,
  curated set of QIDs (e.g. `song` = Q7366, Q134556, Q105543609), measured for coverage on the gold set.
- **One request gives everything the scorer needs**: `generator=search` + `prop=entityterms|pageprops` with
  `wbetterms=label|description` and `ppprop=wb-sitelinks` returns label, description and the number of
  sitelinks. The sitelink count is a good, free popularity signal `pop_e` for the δ term.
- **Ranking is lexical**, not by popularity: fetch about 20 candidates and rerank with our score (the 2021
  _Dune_ film, 71 sitelinks, ranked #7 among films).
- `entityterms` returns terms in one language without fallback: request the content language, then fill
  gaps with a `wbgetentities` call (`languages=it|en`, `languagefallback`).
- `inlabel:"…@it"` restricts matching to labels and aliases in a language; useful for exact-title lookups.
- **Limits:** no documented limit on query length or number of OR clauses (40 clauses tested without error);
  the general Action API limits of §1.1 apply. Wildcards in `haswbstatement` can be expensive: we never use them.

## 2. Platform terms: conflicts with the spec

The spec asks us to stop when a requirement conflicts with a platform's terms. These are the conflicts found.

1. **YouTube captions of other people's videos.** The official API cannot download them (`captions.download` needs
   edit rights). The YouTube Terms forbid access "using any automated means" without permission (the current
   wording reportedly adds "as permitted by applicable law"). Reading the caption track that the player already
   loads for the video the user is watching is common practice among extensions, but it is a gray area.
   Fetching captions of **videos the user has not opened** (needed for pre-click badges on thumbnails) is clearly
   automated bulk access.
2. **Pre-click badges on YouTube thumbnails** therefore cannot come from analyzing unwatched videos. Lawful sources:
   creator-published citation tracks, an opt-in shared cache built from videos that users actually watched, and
   the creator's own description text.
3. **TikTok and Instagram** forbid automated collection of information, logged in or not. Automatic detection on
   those sites is out. A user-initiated "analyze this video" that transcribes the tab audio locally does not
   request anything from their servers. That still deserves a careful review before we ship it.
4. **Tab audio capture for ASR** (Chrome: `tabCapture.getMediaStreamId` + offscreen document with `USER_MEDIA`)
   requires a user gesture on the extension. ASR is therefore one click, not zero-config. Firefox has neither
   `tabCapture` nor the offscreen API.
5. **DRM streaming services**: we only consume subtitles already exposed to the page, and only where the terms
   allow it. No capture of protected media.

### 2.1 Decision on YouTube captions (2026-11-23) and accepted risk

**Decision:** option A, reading the caption track that the YouTube player has already loaded, under these
constraints:

1. **Only the video open in the tab, only the track the player already loaded.** No second request to YouTube,
   nothing for videos that are not open.
2. **Isolated source plugin** (`source-youtube-player`): it can be turned off in the settings and by enterprise
   policy, and it can be removed without touching the core.
3. **The transcript never leaves the device and is never stored.** Only the derived citation track can go to the
   shared cache (opt-in).
4. **Option B stays available as a fallback**: one-click on-device ASR of the tab audio.

**Residual risk.** The YouTube Terms of Service prohibit accessing the service "using any automated means"
without permission. Our position is that reusing data the player already delivered to the user, for the video
the user chose to watch, processed locally, is not automated access to the service: there is no additional
request, no crawling, no bulk collection. This is an engineering judgment, not legal advice. Consequences if
YouTube disagrees:

| Risk                                                          | Likelihood      | Impact                  | Mitigation                                                                                                  |
| ------------------------------------------------------------- | --------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Chrome Web Store / AMO reviewer flags the YouTube integration | low–medium      | delisting until fixed   | Plugin is removable; a build without it ships in hours. Clear privacy disclosure in listing.                |
| YouTube changes the player and the track is no longer exposed | high, over time | feature stops working   | Fallback to option B (ASR) and creator tracks; no silent breakage (feature detection).                      |
| YouTube sends a takedown or objection                         | low             | must disable the plugin | No remote kill switch (no phoning home): the next release ships the plugin off; policy key for enterprises. |

**Pre-click on YouTube thumbnails** (decided the same day): never by fetching the video page. Sources are
creator tracks, the opt-in shared cache (k-anonymous prefix lookup, see `docs/MATH.md`) and the video description
from the YouTube Data API only, with the user's key or the self-hosted server's key (30-day storage limit
applies).

## 3. Name availability

Checked on 2026-11-23 against the npm registry, GitHub accounts and a web search for products with the same name.

**"Glint" is not available**: `glint` exists on npm, the `@glint/*` scope belongs to typed-ember's Glint (an active
TypeScript tool, last published 2026-11-16, same ecosystem), the `github.com/glint` account exists and over 2,600
repositories use the name.

| Candidate                                                | npm   | github.com/&lt;name&gt; | Web search                                                                 | Verdict           |
| -------------------------------------------------------- | ----- | ----------------------- | -------------------------------------------------------------------------- | ----------------- |
| **Citestar**                                             | free  | free                    | no product found                                                           | ✓                 |
| **Glintmark**                                            | free  | free                    | only a spell in a small game                                               | ✓ (keeps "Glint") |
| **Citelume**                                             | free  | free                    | no product found                                                           | ✓                 |
| **Refcue**                                               | free  | free                    | no product found                                                           | ✓                 |
| **Lucciola**                                             | free  | free                    | a few small unrelated GitHub repos (desktop OS image, wellbeing app, game) | ✓, weaker         |
| Citelight                                                | free  | free                    | citelight.ai (AI visibility for real-estate agents)                        | ✗                 |
| Lumencite                                                | free  | free                    | LumenCite, a reference manager (lumencite.com)                             | ✗                 |
| Citesight                                                | free  | free                    | two citation-checking tools                                                | ✗                 |
| Citeglow                                                 | free  | free                    | GitHub project + PyPI package                                              | ✗                 |
| Asterism, Scintilla, Constella, Inkling, Quoth, Namedrop | taken | taken                   | —                                                                          | ✗                 |

npm organization scopes could not be checked anonymously (the page returns 403); we check when creating the org.
A formal trademark search (EUIPO, USPTO, WIPO) is still needed before launch (M6).

**Decision (2026-11-23): Citestar**, npm scope `@citestar`. The maintainer reserves the npm org and the GitHub
organization. Trademark search (EUIPO, USPTO) before M6.

## 4. Libraries and models

Versions from the npm registry on 2026-11-23. Policy: pin exact versions at least two weeks old.

| Package                   | Latest  | Released   | License      | Notes                                                                                                                                                                  |
| ------------------------- | ------- | ---------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typescript                | 7.0.2   | 2026-07-08 | Apache-2.0   | The native compiler.                                                                                                                                                   |
| pnpm                      | 12.23.0 | 2026-11-22 | MIT          | Too new: pin an earlier 12.x.                                                                                                                                          |
| vite                      | 8.3.8   | 2026-11-11 | MIT          | Too new: pin an earlier 8.x.                                                                                                                                           |
| vitest                    | 5.1.1   | 2026-11-18 | MIT          | Too new: pin an earlier 5.x.                                                                                                                                           |
| @playwright/test          | 1.65.1  | 2026-11-13 | Apache-2.0   |                                                                                                                                                                        |
| lit                       | 3.3.3   | 2026-05-14 | BSD-3-Clause | ≈ 5–6 KB gzip, compatible with the 30 KB UI budget.                                                                                                                    |
| wxt                       | 0.21.5  | 2026-10-26 | MIT          | Actively maintained (Plasmo: no release for over a year). Still 0.x.                                                                                                   |
| @huggingface/transformers | 4.3.2   | 2026-10-27 | Apache-2.0   | v4: word-level Whisper timestamps work on WebGPU. Known issue: GPU memory growth on long audio (#1739), so keep the fp32 encoder + q4 decoder setup and watch the fix. |
| onnxruntime-web           | 1.31.1  | 2026-10-26 | MIT          |                                                                                                                                                                        |
| pdfjs-dist                | 6.5.438 | 2026-11-01 | Apache-2.0   |                                                                                                                                                                        |
| tesseract.js              | 7.0.0   | 2025-12-15 | Apache-2.0   |                                                                                                                                                                        |
| mammoth (DOCX)            | 1.13.0  | 2026-09-26 | BSD-2-Clause |                                                                                                                                                                        |
| hono                      | 4.13.21 | 2026-11-23 | MIT          | Pin an earlier 4.13.x.                                                                                                                                                 |
| ajv (JSON Schema)         | 8.20.0  | 2026-04-24 | MIT          |                                                                                                                                                                        |
| idb-keyval                | 6.3.0   | 2026-07-08 | Apache-2.0   |                                                                                                                                                                        |

| Model                                                                   | License                      | Size                                    | Use                                                                                                                             |
| ----------------------------------------------------------------------- | ---------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Whisper (onnx-community `*_timestamped`)                                | MIT (weights)                | tiny ≈ 40 MB … small ≈ 250 MB quantized | ASR with word timestamps.                                                                                                       |
| Moonshine (onnx-community)                                              | check before use             | small                                   | Faster ASR alternative used by other caption extensions. Check language coverage (Italian) before use.                          |
| GLiNER multi v2.1 (`urchade/gliner_multi-v2.1`, ONNX at onnx-community) | Apache-2.0 (base model card) | mDeBERTa-v3-base                        | Zero-shot NER: labels such as "book title", "film title". Training data generated with an LLM on the Pile. Note in MODEL_CARDS. |
| multilingual-e5-small (`Xenova/multilingual-e5-small`)                  | MIT                          | int8 ≈ 113 MB, 384-dim                  | Context embeddings φ for the γ term. Needs `query: ` prefix.                                                                    |

### 4.1 Toolchain decisions for M1a (2026-11-23)

- **TypeScript 6, not 7.** `typescript-eslint` 8.74 (latest) declares `typescript >=4.8.4 <6.1.0` as peer
  dependency: TypeScript 7 (the native compiler) is not supported by the linter, which uses the compiler API.
  We pin `typescript@6.0.3`. Re-check when typescript-eslint widens the range.
- **Node 26 LTS** (26.13.1, "Lithium"). Corepack is not bundled since Node 25: install it with
  `npm install --global corepack@0.36.0`, then `corepack enable`. CI does the same.
- **pnpm 12.18.0**: the newest 12.x that is at least 14 days old, consistent with `minimumReleaseAge: 20160`
  (minutes). `minimumReleaseAgeExclude` accepts patterns (`'@citestar/*'`). When `minimumReleaseAge` is set
  explicitly, `minimumReleaseAgeStrict` defaults to true.
- Pinned dev tools (all ≥ 14 days old): vite 8.3.6, vitest 5.1.0, eslint 10.14.0, typescript-eslint 8.72.1,
  prettier 3.9.10, @types/node 26.6.6.
- GitHub Actions pinned by commit SHA: checkout v7.0.1, setup-node v7.1.0, cache v6.1.0. `setup-node`'s automatic
  cache only covers npm, so the pnpm store is cached explicitly.

**Consequence:** the models total hundreds of MB. Detection must work well with **zero models** (rules +
catalog + calibration), and the models are an on-demand download, not part of zero-config.

## 5. Sources

- Wikidata graph split: https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service/WDQS_graph_split
- Wikimedia API rate limits: https://www.mediawiki.org/wiki/Wikimedia_APIs/Rate_limits
- Wikimedia robot policy: https://wikitech.wikimedia.org/wiki/Robot_policy
- Open Library APIs: https://openlibrary.org/developers/api — Covers: https://openlibrary.org/dev/docs/api/covers
- Crossref rate limits: https://www.crossref.org/blog/announcing-changes-to-rest-api-rate-limits/ and https://community.crossref.org/t/updates-to-rest-api-rate-limits/14872 — Access docs: https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/
- OpenAlex pricing: https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/ and https://help.openalex.org/api/authentication/
- arXiv API terms: https://info.arxiv.org/help/api/tou.html
- MusicBrainz rate limiting: https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
- TMDB terms discussion: https://www.themoviedb.org/talk/592c8779c3a3680fc20012d5 — official pages to re-read: https://www.themoviedb.org/api-terms-of-use, https://developer.themoviedb.org/docs/rate-limiting
- Semantic Scholar API: https://semanticscholar.org/product/api and license https://semanticscholar.org/product/api/license
- Podcast Index API: https://podcastindex-org.github.io/docs-api/
- YouTube captions.download: https://developers.google.com/youtube/v3/docs/captions/download
- YouTube API Developer Policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube Terms of Service: https://www.youtube.com/t/terms
- TikTok on scraping: https://www.tiktok.com/privacy/blog/how-we-combat-scraping/en
- Chrome Prompt API: https://developer.chrome.com/docs/ai/prompt-api
- MV3 tab capture in an offscreen document: https://mv3-extension.com/manifest-v3-architecture-extension-lifecycle/offscreen-documents-dom-access/capturing-audio-and-video-in-an-offscreen-document/
- transformers.js issues: https://github.com/huggingface/transformers.js/issues/1739, https://github.com/huggingface/transformers.js/issues/1590
- GLiNER multi v2.1: https://huggingface.co/urchade/gliner_multi-v2.1 — ONNX: https://huggingface.co/onnx-community/gliner_multi-v2.1
- multilingual-e5-small (ONNX): https://huggingface.co/Xenova/multilingual-e5-small
- WXT vs Plasmo (2026): https://merginit.com/blog/23082026-plasmo-vs-wxt-vs-crxjs-extension-js
