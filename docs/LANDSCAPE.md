# Landscape

_Last reviewed: 2026-11-23._

This document maps existing products and projects that overlap with what we are building, what they do well,
what they leave out, and where our project fits. Claims about third-party products come from their public pages
on the date above; links are at the bottom.

## 1. The problem in one sentence

People constantly encounter references to other works (a book named in a podcast, a paper cited in a talk, a film
mentioned in a Short, a novel quoted in an article), and today those references evaporate: nobody writes them down,
and the ones that are written down live in a video description, cut off from the moment they were spoken.

## 2. Existing products and projects

### 2.1 Mention extraction from audio and video

| Product                                                                     | What it does                                                                                                                                                                                                                                                                            | Limits relative to our goal                                                                                                                                                                          |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Snipd** (podcast app)                                                     | Since Nov 2024, automatically lists the books mentioned in podcast episodes, with cover, description, purchase links and the context of the recommendation. Also publishes a public "most mentioned books" ranking. Its CEO has described the pipeline as an LLM plus Perplexity's API. | Books only. Only inside Snipd's own player. Cloud processing. Free tier limited to a few episodes per week. No open format, no API for others.                                                       |
| **PodBooks** (Chrome extension)                                             | Analyzes a YouTube video's transcript and lists the books mentioned, with cover, author and buy links.                                                                                                                                                                                  | Books only. YouTube only. Freemium (5 extractions/month). No statement about timestamps or where processing happens. On demand: nothing shows up while you watch.                                    |
| **AI summarizers** (YouTube's Gemini "Ask" button, Glasp, Eightify, …)      | Chat with or summarize a video; you can _ask_ "which books are mentioned?".                                                                                                                                                                                                             | Generic summarizers built on cloud LLMs: no catalog linking, no persistent IDs, unreliable for exact titles (hallucination risk), require a prompt each time, rarely free beyond a few uses per day. |
| **Creator-written lists** ("Books mentioned in this video" in descriptions) | Manual, accurate when done.                                                                                                                                                                                                                                                             | Rare, often affiliate links, not machine-readable, not tied to timestamps.                                                                                                                           |
| **Amazon X-Ray** (Prime Video / Kindle)                                     | In-context "who/what is this" overlay.                                                                                                                                                                                                                                                  | Closed ecosystem, curated data, no mentions of external works, not available outside Amazon's players.                                                                                               |

### 2.2 Citations in scholarly reading

| Product                     | What it does                                                                                                            | Limits                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| **scite** (extension)       | Badges on paper listings (Google Scholar, PubMed, journals) with counts of supporting/contrasting/mentioning citations. | Scholarly papers only; proprietary index; about formal citations between papers, not mentions in general media. |
| **Semantic Reader** (Ai2)   | "Citation cards" inline in a PDF: details and TLDR of a cited paper where you are reading.                              | arXiv papers only; formal reference lists only.                                                                 |
| **Zotero Connector**        | Saves the page/paper you are on to your library.                                                                        | Saves _the page_, not the works mentioned _inside_ it.                                                          |
| **LibKey Nomad, Unpaywall** | Turn DOIs into access links.                                                                                            | Need an explicit DOI; no detection of informal mentions.                                                        |

### 2.3 Annotation, previews and standards

| Project / standard                                            | Relevance                                                                                                                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **W3C Web Annotation** (Hypothesis implements it)             | Defines `TextQuoteSelector` (exact + prefix + suffix), which we reuse for text anchors. Hypothesis is about human annotations, not automatic detection.                                                     |
| **Wikipedia Page Previews**                                   | Proves that hover cards with an intent delay are accepted by a mass audience; a model for our pre-click card.                                                                                               |
| **YouTube Timestamps** (open-source extension)                | Shows timestamps from comments as markers on the progress bar; a precedent for our mini-timeline.                                                                                                           |
| **schema.org `citation`**                                     | Exists on every `CreativeWork` (including `VideoObject` and `PodcastEpisode`), but is rarely used for media. We map our format to it.                                                                       |
| **Podcasting 2.0** (`podcast:chapters`, `podcast:transcript`) | Chapters and transcripts are standardized; there is **no citation tag** yet. Discussion #469 in the namespace repo asks for richer chapters with citations. This is an opening for our Open Citation Track. |

## 3. What is missing everywhere

| Capability                                                            | Snipd | PodBooks | AI summarizers | scite / Semantic Reader | **Citestar** |
| --------------------------------------------------------------------- | :---: | :------: | :------------: | :---------------------: | :----------: |
| All work types (books, papers, films, series, songs, podcasts, talks) |   ✗   |    ✗     |       ~        |       ✗ (papers)        |      ✓       |
| Shown **at the moment** of the mention (timestamp / text position)    |   ✗   |    ✗     |       ✗        |         ~ (PDF)         |      ✓       |
| **Before clicking** summary on links and thumbnails                   |   ✗   |    ✗     |       ✗        |       ✓ (papers)        |      ✓       |
| Text **and** video **and** audio in one tool                          |   ✗   |    ✗     |       ~        |            ✗            |      ✓       |
| Linked to stable IDs (Wikidata QID, DOI, ISBN)                        |   ?   |    ?     |       ✗        |         ✓ (DOI)         |      ✓       |
| Calibrated confidence: abstains when unsure                           |   ✗   |    ✗     |       ✗        |            ✗            |      ✓       |
| On-device processing, no account                                      |   ✗   |    ?     |       ✗        |            ✗            |      ✓       |
| Open format that creators can publish                                 |   ✗   |    ✗     |       ✗        |            ✗            |      ✓       |
| Open source, embeddable in any site / LMS / intranet                  |   ✗   |    ✗     |       ✗        |            ✗            |      ✓       |

## 4. Why Citestar is different

1. **Ambient, not on demand.** Nothing to ask: references appear where and when they happen, then collect into a
   session "constellation". Competitors produce a list _after_ you request it.
2. **Precision over recall, by design.** A decision-theoretic threshold (show only if expected value > 0) and
   calibrated probabilities. An LLM summarizer has no notion of "I'm not sure, so I'll stay quiet".
3. **Local-first and keyless.** Detection and transcription run on the device; only the mention string goes to open
   catalogs (Wikidata, Open Library, Crossref, OpenAlex, MusicBrainz, arXiv). No account, no per-use paywall.
4. **An open standard, not a silo.** The Open Citation Track lets creators publish verified citations once, readable
   by any HTML5 player (WebVTT metadata track) and by search engines (schema.org `citation`). It fills a gap that
   Podcasting 2.0 has discussed but not closed.
5. **One engine, many surfaces.** The same pure-TypeScript core runs in the extension, the embed script, the
   self-hosted server and future plugins (Jellyfin, Obsidian, WordPress).

## 5. Honest risks

- **Platforms can ship it natively.** YouTube already has Gemini "Ask" and could add a "works mentioned" shelf.
  Our answer is cross-platform reach, text + media, openness and privacy, not a feature race on YouTube alone.
- **Snipd has data and a network effect** in podcasts. We do not compete as a podcast app; we compete as a layer.
- **Platform terms limit automatic access** (YouTube, TikTok, Instagram). Several features must be user-initiated
  or creator-provided; see [RESEARCH.md §2](RESEARCH.md#2-platform-terms-conflicts-with-the-spec).
- **Entity linking is hard** for short, ambiguous titles ("Dune": novel, 1984 film, 2021 film). Abstention and
  context features are core, not polish.

## Sources

- Snipd, "Books Mentioned in Podcasts, Automatically Captured": https://www.snipd.com/blog/mentioned-books-release
- Snipd, most mentioned books: https://share.snipd.com/podbooks
- Latent Space interview with Snipd's CEO: https://latentspace.podhood.com/6d36e129-b07b-47ca-8bde-40f4a5cf75f7
- PodBooks: https://www.podbooks.app/
- Glasp YouTube Summary: https://glasp.co/youtube-summary
- Glasp, ways to summarize YouTube videos (incl. YouTube "Ask"): https://glasp.co/articles/how-to-summarize-youtube-videos
- scite browser extension: https://addons.mozilla.org/en-US/firefox/addon/scite/
- Semantic Reader: https://www.semanticscholar.org/product/semantic-reader and FAQ https://www.semanticscholar.org/faq
- YouTube Timestamps: https://ris58h.github.io/youtube-timestamps/
- schema.org `citation`: https://schema.org/citation
- Podcasting 2.0, "Proposal: Extend chapter capabilities": https://github.com/Podcastindex-org/podcast-namespace/discussions/469
- W3C Web Annotation Data Model: https://www.w3.org/TR/annotation-model/
