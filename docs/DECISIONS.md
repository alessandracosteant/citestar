# Decisions

Decisions taken after Phase 0. Where a decision differs from [SPEC.md](../SPEC.md), **this file wins**.
Each entry has a date and its rationale; superseded entries are kept and marked.

## D1 — Name: Citestar (2026-11-23)

"Glint" is taken on npm (`@glint/*` is an active TypeScript tool) and GitHub. The project is **Citestar**, npm
scope `@citestar`. The maintainer reserves the npm and GitHub organizations. Trademark search (EUIPO, USPTO)
before M6. Details: [RESEARCH.md §3](RESEARCH.md#3-name-availability).

## D2 — YouTube captions: read the track the player already loaded (2026-11-23)

Only for the video open in the tab, only the track the player already loaded, no extra request. Isolated source
plugin `source-youtube-player`, which can be disabled in settings and by enterprise policy and removed without
touching the core. The transcript never leaves the device and is never stored; only the derived citation track
may go to the opt-in shared cache. One-click on-device ASR remains available as fallback. Risk analysis:
[RESEARCH.md §2.1](RESEARCH.md#21-decision-on-youtube-captions-2026-11-23-and-accepted-risk).

## D3 — Pre-click summaries (2026-11-23)

- A link is analyzed only after a **300 ms hover** (explicit intent), never on mere visibility. Requests are made
  **without cookies** (`credentials: 'omit'`).
- For YouTube videos that are not open, the description comes **only from the YouTube Data API** (the user's key
  or the self-hosted server's key), never by downloading the video page.
- The shared cache is queried with a **k-anonymous hash prefix**: the client sends the first b bits of
  SHA-256(canonical URL), the server returns every entry with that prefix, the match happens locally.
  b = ⌊log₂(M/k)⌋ with k = 50, computed by the server and sent to the client. **No IP logs.** Derivation:
  [MATH.md §1](MATH.md#1-k-anonymous-lookup-in-the-shared-cache).
- Hover is an explicit gesture: the card may fill progressively (stars lighting up), but **no spinner**.

## D4 — Lite and Plus capability levels (2026-11-23)

- **Lite** (default, zero-config): rules, patterns, explicit identifiers, catalog lookups, calibration. No models.
- **Plus** (on request): NER, embeddings, ASR models. Before the download, the UI shows the size and the gain
  measured on the gold set (ΔF₀.₅ between Lite and Plus).
- Calibration per condition c = (level × source: text, subtitles, ASR) with a single Platt model with shared slope
  and per-condition offset, P = σ(a·s + b_c): 7 parameters instead of 12. See
  [MATH.md §4](MATH.md#4-platt-scaling-with-a-shared-slope).

## D5 — Evaluation (amends SPEC "Valutazione", 2026-11-23)

- The gold set is measured in **mentions**: at least **500 annotated mentions** in M1f.
- **ECE** with **5 equal-mass bins** and a **95% bootstrap confidence interval**. A perfectly calibrated model
  still shows ECE ≈ √(2/π)·√(p(1−p)/n_b) per bin. See [MATH.md §2](MATH.md#2-expected-calibration-error-and-its-noise-floor).
- **Precision targets are verified on the lower bound of the 95% Wilson interval**, not on the point estimate.
  See [MATH.md §3](MATH.md#3-wilson-interval-for-precision-targets).
- **Dev/test split.** Rules are written looking only at dev. The test set comes from real sources (CC-BY or public
  domain), never from texts we wrote, to avoid data leakage.

## D6 — Toolchain (2026-11-23)

Node 26 LTS. Corepack is installed with `npm install --global corepack` (not bundled since Node 25), in CI and in
the setup docs. `pnpm-workspace.yaml` sets `minimumReleaseAge: 20160` (14 days) with `minimumReleaseAgeExclude`
only for `@citestar/*`. TypeScript 6 instead of 7, because typescript-eslint does not support 7. See
[RESEARCH.md §4.1](RESEARCH.md#41-toolchain-decisions-for-m1a-2026-11-23).

## D7 — Wikidata typed search through CirrusSearch (2026-11-23)

`wbsearchentities` cannot filter by type. When a `typeHint` is present, the Wikidata resolver uses CirrusSearch
(`generator=search`) with `haswbstatement:P31=…|P31=…` over a small curated set of QIDs per `WorkType`, and
gets labels, descriptions and sitelink counts in the same request. Verified live:
[RESEARCH.md §1.4](RESEARCH.md#14-wikidata-filtering-candidates-by-work-type).

## Open questions

- **Q1 — Strict k-anonymity.** b = ⌊log₂(M/k)⌋ guarantees k entries per bucket _on average_ only: with
  M = 10⁶, 7% of buckets fall below 50 (smallest: 32). Proposal: the server decreases b until the smallest bucket
  has at least k entries ([MATH.md §1](MATH.md#1-k-anonymous-lookup-in-the-shared-cache)). Needed by M5.
- **Q2 — Per-type precision.** With about 25 test mentions per work type, even 25/25 correct gives a Wilson lower
  bound of 0.867. Proposal: gate the precision target on the micro-average only and report per-type intervals
  without gating.
- **Q3 — Wikipedia in the test set.** Wikipedia text is CC BY-SA, not CC-BY. Should it count as an allowed real
  source (with share-alike attribution in `eval/`), or stay out?
