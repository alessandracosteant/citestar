# Open Citation Track

An open format for the works mentioned in a piece of content (an article, a PDF, a video, a podcast) and for
**where** each mention occurs: a time range in media, or a quote in text. Creators and publishers can use it to
publish verified citations; tools like Citestar read it, and prefer it to automatic detection.

**Status: draft, version 0.1.0.** Expect changes until 1.0.0.

## Files

| File                                                       | What it is                                      |
| ---------------------------------------------------------- | ----------------------------------------------- |
| [`citation-track.schema.json`](citation-track.schema.json) | JSON Schema (draft 2020-12) of a citation track |
| [`examples/`](examples/)                                   | Valid example tracks                            |

## Shape

```json
{
  "specVersion": "0.1.0",
  "content": { "url": "https://example.org/episode-42.mp3", "durationSec": 3120 },
  "works": [
    {
      "id": "wikidata:Q190192",
      "type": "book",
      "title": "Dune",
      "authors": ["Frank Herbert"],
      "year": 1965,
      "identifiers": { "wikidata": "Q190192" },
      "links": []
    }
  ],
  "mentions": [
    {
      "id": "m1",
      "surface": "the novel Dune",
      "anchor": { "kind": "time", "start": 312.4, "end": 313.6 },
      "workId": "wikidata:Q190192",
      "p": 0.94,
      "source": "creator"
    }
  ]
}
```

- **Work ids** are namespaced. `wikidata:Q…` is canonical; `doi:…`, `isbn:…`, `tmdb:…` are fallbacks.
- **Anchors** are either `time` (seconds) or `text`, a [W3C Web Annotation TextQuoteSelector][tqs] (`exact`,
  `prefix`, `suffix`) with an optional character offset `startHint`.
- **`workId: null`** marks a mention that could not be linked to a known work (NIL).
- **`p`** is a calibrated confidence in [0, 1]; `source` is `creator` (published by the author) or `auto`.

## Rules beyond the schema

JSON Schema cannot express cross-references. A valid track also satisfies:

1. every non-null `workId` is the `id` of a work in `works`;
2. work ids and mention ids are unique;
3. for time anchors, `start ≤ end`, and `end ≤ content.durationSec` when the duration is known;
4. `specVersion` has the same major version as the reader supports.

The reference implementation is `validateTrack` in `@citestar/core`.

## Versioning and extensions

The format follows [semantic versioning](https://semver.org): minor versions only add optional fields, so a
reader accepts any track with the same major version. Unknown fields are rejected, except **extension fields**
whose name starts with `x-` (e.g. `"x-reviewed": true`), allowed on the track, `content`, works and mentions.

## Coming later

Transport as a WebVTT `kind="metadata"` track with JSON cues, the `*.citations.json` sidecar convention, and the
mapping to the schema.org `citation` property are specified in milestone M5.

[tqs]: https://www.w3.org/TR/annotation-model/#text-quote-selector
