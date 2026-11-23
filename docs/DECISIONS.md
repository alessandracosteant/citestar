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
  _The ECE target is replaced by D14._
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

Verified on 2026-11-23 that `|` is a true OR (union): for "Dune", literary works 64 hits, films 71, both 0, OR
135 = 64 + 71 − 0. One request covers a whole set of QIDs.

## D8 — Strict k-anonymity (resolves Q1, 2026-11-23)

The server decreases b until the smallest bucket has at least k entries, and recomputes b at every cache
snapshot, deletions included. For M5: measure the popularity-aware anonymity k_eff = 1 / maxᵢ πᵢ with
Zipf-distributed weights (proxy for popularity: sitelinks or number of cache contributions), report its
distribution in MATH.md, and evaluate the "head locally, tail in buckets" scheme, choosing N from the simulation
(downloaded bytes against minimum k_eff). See [MATH.md §1](MATH.md#1-k-anonymous-lookup-in-the-shared-cache).

## D9 — Precision targets (resolves Q2, 2026-11-23)

The precision target gates only the total (micro-average), on the lower bound of the 95% Wilson interval.
Per-type guardrail: CI fails if, for any work type, the **upper** bound of the 95% Wilson interval is below 0.85
(evidence that the type is worse). With n = 25 this fires from 8 errors upwards. All per-type intervals are
reported. See [MATH.md §3](MATH.md#3-wilson-interval-for-precision-targets).

## D10 — Wikipedia as an evaluation source (resolves Q3, 2026-11-23)

- `eval/` stores **only annotations**: the revision `oldid` and the selectors. A script downloads the texts and
  caches them (in CI with `actions/cache`).
- `eval/` has its own `LICENSE` (**CC BY-SA 4.0**) and an `ATTRIBUTION` file with article and revision link. The
  code stays Apache-2.0. `eval/` never enters an npm package (each package whitelists its `files`).
- Wikilinks to works are **silver labels** (link target → QID), reviewed by hand. Usually only the first
  occurrence is linked, so later mentions must be annotated too. The detector receives the text **without** links.
- Wikipedia covers only the "documents" condition. Subtitles and ASR need spoken sources with a compatible license.

## D11 — Linking evaluation split in two (2026-11-23)

Report separately **Recall@K** of candidate generation (K = 20) and the precision of ranking, since
Acc@1 = Recall@K · P(first | correct among the K). See [MATH.md §5](MATH.md#5-decomposing-linking-accuracy).

## D12 — Purity guards for platform-independent packages (2026-11-23)

`"types": []` only stops automatic inclusion: a dependency's `.d.ts` with `/// <reference types="node" />` can
bring Node globals back. Pure packages (today `@citestar/core`) are therefore guarded three ways:

1. tsconfig without DOM and Node types;
2. an esbuild build with `platform: "neutral"` (`tools/neutral-build.ts`), which fails on imports of Node
   built-ins, plus a test that the package's runtime dependencies are within an allowlist (empty today) and that
   the bundle contains only the package's own sources;
3. ESLint `no-restricted-globals` / `no-restricted-imports` on the package sources, for globals such as `process`
   or `Buffer`, which are not imports and so escape the build check.

## D13 — Git workflow (2026-11-23)

The first push goes to `main`. From M1b on, every change lands through a feature branch and a pull request, so
that CI gates the merge.

## D14 — Calibration target: stratified, beyond noise (supersedes the ECE part of D5, 2026-11-23)

- The ECE is computed **per stratum**, each with its own 5 equal-mass bins: "explicit" (mentions with a DOI,
  ISBN or arXiv identifier) and "rest". Pooled, explicit identifiers (p ≈ 1, almost always right) dilute it:
  ECE_pooled ≈ (1 − w)·ECE_rest, so w = 0.4 and ECE_rest = 0.08 would read 0.048 and pass.
- Noise is measured by **consistency resampling** (Bröcker & Smith 2007): under H₀ of perfect calibration,
  simulate yᵢ\* ~ Bernoulli(pᵢ) from the same confidences, B = 2000 times with the seeded generator. Report the
  expected noise E[ECE\*], the excess ECE_obs − E[ECE\*] and the p-value (1 + #{ECE\* ≥ ECE_obs})/(B + 1).
- **Target: excess ≤ 0.05 on the "rest" stratum.** The bootstrap interval is still reported.

See [MATH.md §2.1–2.2](MATH.md#21-stratification-explicit-identifiers-dilute-the-ece).

## D15 — Title normalization rules (2026-11-23)

- `normalizeTitle` is **idempotent**; proof in [MATH.md §6](MATH.md#6-title-normalization-and-jarowinkler-similarity),
  property-based tests with fast-check.
- A leading article is dropped only if what remains does not itself start with an article ("La La Land").
- Articles are **per language**, never the union: the mention's language comes from the document, the label's
  from its Wikidata language tag.
- `Normalized` is a branded type, produced only by `normalizeTitle` and required by comparison functions.
- Title variants (full title, main title before ":" or a spaced dash) are generated before punctuation removal,
  for use in M1e.

## Planned for later milestones (from the M1b review, 2026-11-23)

### D16 — Explicit identifiers (M1c)

Validated identifiers take a **separate path with a fixed p**, bypassing the logistic model.

- **ISBN-10:** Σᵢ₌₁¹⁰ (11 − i)·dᵢ ≡ 0 (mod 11), with X = 10.
- **ISBN-13:** weights 1, 3, 1, 3, …, sum ≡ 0 (mod 10), prefix 978 or 979.
- **ISSN:** mod 11 check digit.
- **DOI:** Crossref's recommended regex, then strip trailing punctuation (. , ;) and a trailing ")" only if
  unbalanced.
- **arXiv:** new format YYMM.NNNN or YYMM.NNNNN with optional vN and month 01–12; old format archive/YYMMNNN.
- Property tests: ISBN-10 detects every single-digit error and every transposition; ISBN-13 does **not** detect
  adjacent transpositions of digits that differ by 5 (document why).

### D17 — Capitalization features depend on language and source (M1c)

Italian titles use sentence case and, mid-sentence, often have no capitals; in ASR transcripts the model decides
capitalization. Use interaction features capitalization × language and capitalization × source.

### D18 — Late right boundary (M1c, M1e)

The detector emits the start of a mention and a range of possible ends [e_min, e_max], closed by stops such as
"di <Name>", punctuation or conjunctions. In M1e, one catalog query per window, and
ê = argmax_e max_c s(m_{start..e}, c), aligning candidate labels as prefixes of the normalized window.

### D19 — Initial weights are documented priors (M1c, M1f)

The initial weights w are hand-written priors, documented in MATH.md with their reasoning. In M1f they are
estimated by logistic regression with **L2 regularization**, because the features are correlated and the data
are few.

### D20 — Monge–Elkan for partial titles (M1e)

Jaro–Winkler works on short strings, badly on partial titles or different word order ("la pietra filosofale" vs
"Harry Potter e la pietra filosofale"). Add the Monge–Elkan feature
ME(A, B) = (1/|A|)·Σ_{a∈A} max_{b∈B} JW(a, b), with A the tokens of the mention, besides the maximum of JW over
the title variants.
