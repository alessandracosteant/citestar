# The math behind Citestar

Every formula used in the code is derived here, with the intuition behind it. Sections are added as the code
that uses them lands. Notation: σ(x) = 1 / (1 + e⁻ˣ) is the logistic function, log is the natural logarithm
unless written log₂.

Contents:

1. [k-anonymous lookup in the shared cache](#1-k-anonymous-lookup-in-the-shared-cache)
2. [Expected Calibration Error and its noise floor](#2-expected-calibration-error-and-its-noise-floor)
3. [Wilson interval for precision targets](#3-wilson-interval-for-precision-targets)
4. [Platt scaling with a shared slope](#4-platt-scaling-with-a-shared-slope)
5. [Decomposing linking accuracy](#5-decomposing-linking-accuracy)
6. [Title normalization and Jaro–Winkler similarity](#6-title-normalization-and-jarowinkler-similarity)
7. [Softmax with temperature, computed safely](#7-softmax-with-temperature-computed-safely)

---

## 1. k-anonymous lookup in the shared cache

**Problem.** The opt-in shared cache maps `SHA-256(canonical URL)` to a citation track. If the client sent the
full hash, the server would learn exactly which page the user is about to open. We want the server to learn only
that the user is looking at _one of at least k_ pages it knows about.

**Protocol** (same idea as the "range" API of Have I Been Pwned and as hash-prefix lookups in Safe Browsing):

1. The client computes h = SHA-256(canonical URL), a 256-bit string.
2. It sends only the first b bits of h, the prefix.
3. The server returns the summaries of **all** entries whose hash starts with that prefix.
4. The client compares the full hash locally and keeps the match, if any.

**Choosing b.** SHA-256 output behaves like a uniform random string, so each of the M cached entries falls in any
given prefix bucket with probability 2⁻ᵇ, independently. The number of entries in a bucket is

N ~ Binomial(M, 2⁻ᵇ) ≈ Poisson(λ), with λ = M / 2ᵇ.

We want buckets of at least k entries, while keeping b as large as possible (larger b means smaller responses).
Asking for the expected size to be at least k gives

M / 2ᵇ ≥ k ⇔ 2ᵇ ≤ M / k ⇔ b ≤ log₂(M / k), so b = ⌊log₂(M / k)⌋.

The floor makes λ = M / 2ᵇ fall in [k, 2k): one bit less would double the bucket size. With k = 50 and
M = 1,000,000: b = ⌊log₂ 20,000⌋ = 14 and λ ≈ 61. A response then carries about 61 summaries, a few tens of KB.
The server recomputes b as the cache grows and tells the client which b to use.

**Caveat: "on average" is not "every bucket".** λ ≥ k bounds the _mean_ bucket size. Bucket sizes fluctuate
around λ with standard deviation √λ, and with 2ᵇ buckets some fall well below the mean. For Poisson(λ):

| λ (mean bucket size) | P(a given bucket has fewer than 50 entries) |
| -------------------- | ------------------------------------------- |
| 50                   | 0.48                                        |
| 61                   | 0.067                                       |
| 69.4                 | 0.006                                       |
| 100                  | < 0.001                                     |

A simulation with M = 10⁶ uniform hashes and b = 14 gave 7% of buckets below 50 and a smallest bucket of 32.

**Strict variant (adopted, D8).** The server knows every hash, so it can check the real minimum instead of the
expected one: start from b = ⌊log₂(M / k)⌋ and decrease b while some bucket has fewer than k entries. In the same
simulation this gives b = 13 (λ ≈ 122, smallest bucket 83). The cost is an occasional doubling of the response
size; the counting is O(M). The server recomputes b at **every cache snapshot**, deletions included: removing
entries can shrink a bucket below k, so b must be able to go down as well as up.

**Popularity-aware anonymity (planned for M5).** Counting entries treats them as equally likely, but the server
knows that some pages are requested far more often than others. If entry i in a bucket has popularity wᵢ, the
server's best guess of which entry was requested has probability πᵢ = wᵢ / Σ_bucket w_j. The effective size of
the anonymity set is

k_eff(bucket) = 1 / maxᵢ πᵢ = 2^(H_∞), where H_∞ = −log₂ maxᵢ πᵢ is the min-entropy.

With equal weights k_eff equals the bucket size; one dominant entry drives it towards 1. In M5 we simulate
Zipf-distributed weights (w ∝ rank^(−s)) and report the distribution of k_eff here. We also evaluate a
**head/tail** scheme: the summaries of the N most popular entries ship in bulk with the daily update and are
matched locally, and only the tail goes through buckets. N is chosen from the simulation, trading downloaded
bytes against the minimum k_eff.

**What this does not protect.** k-anonymity is relative to the entries the server holds; it does not hide
timing or network metadata. That is why the server keeps no IP logs. Querying the same URL later with a larger b
reveals more bits; the anonymity set is then the bucket at the larger b, which still has at least k entries.

---

## 2. Expected Calibration Error and its noise floor

**Definition.** Sort the n predictions by confidence and split them into bins B₁…B_m. For each bin let
conf(B) be the mean predicted probability and acc(B) the fraction that was actually correct. Then

ECE = Σ_b (|B_b| / n) · |acc(B_b) − conf(B_b)|.

A perfectly calibrated model has acc = conf in every bin, so ECE = 0.

**Equal-mass bins.** We use m = 5 bins with the same number of predictions each (quantiles of the confidence),
not fixed-width bins. With fixed-width bins and a model that is usually confident, most predictions land in the
last bin and the others are nearly empty, which makes their terms pure noise.

**Noise floor.** Even a perfectly calibrated model shows ECE > 0 on a finite sample. Take a bin with n_b
predictions, all with true probability p. The number of correct ones is Binomial(n_b, p), so

acc − p has mean 0 and variance p(1 − p) / n_b.

For large n_b it is approximately normal, X ~ N(0, s²) with s = √(p(1 − p) / n_b). The expected absolute value of
a centered normal is

E|X| = 2 ∫₀^∞ x · (1 / (s√(2π))) e^(−x²/(2s²)) dx = 2 · s / √(2π) = s · √(2/π).

So each bin contributes about √(2/π) · √(p(1 − p) / n_b) ≈ 0.8 · √(p(1 − p) / n_b), even with perfect
calibration. Exact binomial values versus this approximation:

| n_b | p    | exact E\|acc − p\| | normal approximation |
| --- | ---- | ------------------ | -------------------- |
| 10  | 0.50 | 0.123              | 0.126                |
| 10  | 0.85 | 0.094              | 0.090                |
| 10  | 0.95 | 0.060              | 0.055                |
| 100 | 0.50 | 0.040              | 0.040                |
| 100 | 0.85 | 0.028              | 0.028                |
| 100 | 0.95 | 0.017              | 0.017                |

**Consequence for our target.** With 500 mentions and 5 bins, n_b = 100 and the floor is about 0.02–0.04. A
target of ECE ≤ 0.05 is only slightly above that floor, so a single number is not enough: we report a 95%
**bootstrap** confidence interval. We resample the n predictions with replacement 2,000 times, recompute the ECE
each time, and take the 2.5th and 97.5th percentiles.

**Why the bootstrap works.** We do not know the distribution the predictions come from, but the sample is our
best estimate of it (the empirical distribution, which puts mass 1/n on each observed point). Drawing n points
with replacement from the sample simulates "collecting another dataset of the same size". The spread of the
statistic across these simulated datasets estimates its sampling variability. Resamples come from a seeded
pseudo-random generator (Mulberry32), so the interval is identical on every CI run.

**Percentiles by interpolation.** With B sorted bootstrap values x₀ ≤ … ≤ x_{B−1}, the q-quantile is taken at
position h = (B − 1)·q and interpolated linearly: x_⌊h⌋ + (h − ⌊h⌋)·(x\_⌊h⌋₊₁ − x_⌊h⌋). This is the definition
used by default in R ("type 7") and NumPy, so our numbers can be reproduced there. Example: for [1, 2, 3, 4] and
q = 0.25, h = 0.75 and the quantile is 1 + 0.75·(2 − 1) = 1.75.

### 2.1 Stratification: explicit identifiers dilute the ECE

Mentions with an explicit identifier (DOI, ISBN, arXiv) get p ≈ 1 and are almost always right, so their
contribution |acc − conf| is ≈ 0. Pooling them with the other mentions hides miscalibration. Let w be the share
of explicit mentions. Sorted by confidence, they fill the top bins; if the bins separate the two groups,

ECE_pooled = Σ_{bins of rest} (n_b/n)·|acc − conf| + Σ_{bins of explicit} (n_b/n)·0 ≈ (1 − w)·ECE_rest.

Example: w = 0.4 and ECE_rest = 0.08 give ECE_pooled ≈ 0.048, which would pass a 0.05 target while the mentions
that matter are miscalibrated. (Pooling also changes the binning of the rest: it gets about (1 − w)·5 bins instead
of 5.) The test `calibrationByStratum` reproduces this exactly: 300 mentions at confidence 0.8 with accuracy 0.72
plus 200 certain identifiers give a pooled ECE of 0.048.

**Rule (D14):** the ECE is computed per stratum, each with its own 5 equal-mass bins: "explicit" and "rest". The
target applies to "rest".

### 2.2 Separating miscalibration from noise: consistency resampling

The noise floor above is an approximation. Bröcker and Smith (2007) compute it exactly for the data at hand, by
simulation.

**Null hypothesis H₀:** the model is perfectly calibrated, i.e. the outcome of prediction i is a coin flip with
probability pᵢ (its own confidence). Then:

1. Draw yᵢ\* ~ Bernoulli(pᵢ) for every prediction, keeping the same confidences and therefore the same bins.
2. Compute ECE\* on the simulated outcomes.
3. Repeat B = 2000 times with the seeded generator.

From the B values:

- **expected noise** E[ECE\*]: the ECE that a perfect model shows on these confidences and this sample size;
- **excess** = ECE_obs − E[ECE\*]: the miscalibration beyond what noise explains;
- **p-value** = (1 + #{ECE\* ≥ ECE_obs}) / (B + 1): how often a perfect model looks at least as bad as ours.
  The +1 in numerator and denominator counts the observed data as one more draw under H₀. This keeps the test
  valid (the false-rejection rate is at most the threshold) and the p-value never 0.

**Target (D14):** excess ≤ 0.05 on the "rest" stratum.

**Cross-check with the formula.** For a bin of n_b predictions, the simulated accuracy is a mean of independent
Bernoulli(pᵢ), with variance Σᵢ pᵢ(1 − pᵢ) / n_b². Writing p̄ for the mean confidence of the bin and s² for the
spread of the confidences inside it,

Σᵢ pᵢ(1 − pᵢ) / n_b = p̄(1 − p̄) − s².

So when the confidences inside each bin are equal (s² = 0) and the bins are large (normal approximation),

E[ECE\*] ≈ √(2/π) · Σ_b (n_b / n) · √(p̄_b(1 − p̄_b) / n_b),

and when they differ the formula is an upper bound. The test suite checks the simulation against the formula on
5 bins of 400 predictions at constant confidences 0.55…0.95: the formula gives 0.01582 (the exact binomial value
is 0.01580), and the simulation agrees within 3%.

---

## 3. Wilson interval for precision targets

**Problem.** Precision is a proportion: p̂ = TP / (TP + FP) over the n mentions we chose to show. A point estimate
of 0.93 on 100 mentions does not prove that the true precision is at least 0.90. We verify each target on the
**lower bound** of a 95% confidence interval.

**Why Wilson and not p̂ ± 1.96·√(p̂(1−p̂)/n).** That textbook (Wald) interval breaks down exactly where we work,
near 1: for p̂ = 1 it has zero width. Wilson's interval inverts the score test instead. It contains every p for
which the observed p̂ is not surprising:

|p̂ − p| ≤ z · √(p(1 − p) / n).

Squaring gives a quadratic inequality in p. Its two roots are the interval:

center = (p̂ + z²/(2n)) / (1 + z²/n)

half-width = (z / (1 + z²/n)) · √(p̂(1 − p̂)/n + z²/(4n²))

with z = 1.96 for 95%. The center is pulled from p̂ towards 1/2, and the width stays positive even at p̂ = 1.

**What it means in practice** (target: lower bound ≥ 0.90):

| n shown | observed precision needed |
| ------- | ------------------------- |
| 100     | ≥ 0.959                   |
| 300     | ≥ 0.934                   |
| 500     | ≥ 0.926                   |
| 1000    | ≥ 0.919                   |

Small groups cannot pass the test: 25 out of 25 correct gives a lower bound of only 0.867. For this reason the
precision target is checked on all mentions together (micro-average).

**Per-type guardrail with the upper bound (D9).** For a single work type we cannot prove that it is good, but we
can detect evidence that it is **bad**: the CI fails when the **upper** bound of the 95% Wilson interval is below
0.85. If even the most optimistic plausible precision is under 0.85, the type is worse than acceptable. For
n = 25:

| correct / 25 | errors | Wilson 95% interval | guardrail |
| ------------ | ------ | ------------------- | --------- |
| 19           | 6      | [0.566, 0.885]      | passes    |
| 18           | 7      | [0.524, 0.857]      | passes    |
| 17           | 8      | [0.484, 0.828]      | **fails** |
| 16           | 9      | [0.445, 0.798]      | **fails** |

So with 25 mentions the guardrail fires from 8 errors upwards. All per-type intervals are reported, gated or not.

---

## 4. Platt scaling with a shared slope

**Problem.** The scorer outputs a raw score s for each mention. We need a probability P(correct | s) that is
calibrated. The relation between s and correctness also depends on the **condition** c, the pair (capability
level, text source):

- levels: Lite (no models) and Plus (models);
- sources: written text, subtitles, ASR.

That is 2 × 3 = 6 conditions. ASR introduces transcription errors and Lite lacks the embedding term, so the same s
does not mean the same thing everywhere.

**Model.**

P(correct | s, c) = σ(a · s + b_c)

with one slope a shared by all conditions and one offset b_c per condition: 1 + 6 = 7 parameters. Fitting a
separate Platt model (a_c, b_c) per condition would need 12.

**Why a shared slope.** The slope says how fast confidence grows with the score; the offset says how trustworthy
a condition is overall. The first is mostly a property of the scorer; the second is a property of the condition.
Sharing a pools the evidence of all conditions to estimate it, which matters when some conditions (e.g. Plus +
ASR) have few annotated mentions. Fewer parameters means lower variance, at the price of a small bias if the
slopes really differ. We check this on the dev set by comparing the log-loss of the 7- and 12-parameter models.

**Fitting.** Maximum likelihood on the dev set, i.e. minimizing the log-loss

L(a, b) = − Σᵢ [ yᵢ log pᵢ + (1 − yᵢ) log(1 − pᵢ) ], with pᵢ = σ(a·sᵢ + b_{cᵢ}).

L is convex in (a, b), so plain gradient descent or Newton's method finds the unique minimum. The gradients are
simple because σ'(x) = σ(x)(1 − σ(x)):

∂L/∂a = Σᵢ (pᵢ − yᵢ) · sᵢ, ∂L/∂b_c = Σ\_{i: cᵢ = c} (pᵢ − yᵢ).

Following Platt, the targets are smoothed to y₊ = (N₊ + 1)/(N₊ + 2) and y₋ = 1/(N₋ + 2), where N₊ and N₋ are the
numbers of positive and negative examples. This avoids overconfident probabilities on small sets.

---

## 5. Decomposing linking accuracy

Linking has two stages: **candidate generation** (catalog searches return up to K = 20 candidates) and
**ranking** (our score picks the first). Acc@1 alone does not say which stage fails.

For a mention whose correct work is e\*, the top-ranked candidate can be e\* only if e\* was generated at all.
By the law of total probability:

P(top-1 = e\*) = P(e\* ∈ top-K) · P(top-1 = e\* | e\* ∈ top-K) + P(e\* ∉ top-K) · 0

so

**Acc@1 = Recall@K · P(first | correct among the K)**.

- **Recall@K** measures the resolvers and the queries we send them. If it is low, no ranking can help: we need
  better queries, more QIDs per type ([DECISIONS D7](DECISIONS.md)) or another catalog.
- **P(first | correct among the K)** measures the scorer s(m, e). If it is low, we need better features or weights.

Both are reported separately. They are computed on mentions whose gold work exists (non-NIL); for NIL mentions
the right outcome is abstaining, which is measured separately as NIL accuracy.

---

## 6. Title normalization and Jaro–Winkler similarity

**Normalization** (`normalizeTitle`) removes differences of form before comparing titles. "Il Nome della Rosa!"
and "il nome della rosa" both become "nome della rosa". It does not translate: "Il nome della rosa" ≡ "The Name of
the Rose" comes from Wikidata labels. It is the composition f = A ∘ T of two steps.

- **T (fold and tokenize):** Unicode NFKD splits "é" into "e" + a combining accent and expands compatibility
  characters (the ligature "ﬁ" becomes "fi"); combining marks and invisible format characters are dropped; the
  text is lowercased; punctuation, symbols and controls become separators; the result is the list of tokens.
  The apostrophe is punctuation, so "l'isola" gives the tokens "l", "isola".
- **A (article rule):** with the article set 𝒜_L **of the title's language** L (English: the, a, an; Italian:
  il, lo, la, i, gli, le, un, uno, una, l, gl), drop the first token t₁ if and only if t₁ ∈ 𝒜_L, there is a
  second token t₂, and t₂ ∉ 𝒜_L.

The language comes from the document for a mention and from the label's language tag for a Wikidata candidate.
Using the union of all languages would be wrong: "I, Robot" in English stays "i robot", while "I promessi sposi" in
Italian becomes "promessi sposi".

**Why the condition t₂ ∉ 𝒜_L.** Take "La La Land" in Italian. Dropping the article once gives "la land", and
normalizing that again gives "land": the function would not be idempotent. Dropping articles until none is left
is idempotent but makes different titles collide ("La La Land" and "Land" would both become "land"). The
condition keeps "la la land" whole.

**Theorem: f(f(s)) = f(s) for every string s.** Write the output as the tokens joined by single spaces.

_Lemma 1 (T is stable on its own output)._ Each token produced by T is a fixed point of the character folding:
folding a folded character changes nothing. This was checked exhaustively on all 1,112,064 Unicode code points,
and the property-based tests check it on random strings. Tokens contain no separators. Hence re-tokenizing tokens
joined by single spaces gives back exactly the same list: T(join(L)) = L for every list L that T can produce,
and for every **suffix** of such a list.

_Lemma 2 (A is idempotent)._ Let L = A(K) for some token list K. Two cases.

- A dropped the first token of K. Then the first token of L is the old t₂, which is not an article, so A leaves L
  unchanged: A(L) = L.
- A dropped nothing. Then K = L and one of the conditions failed on L itself (t₁ ∉ 𝒜_L, or there is no t₂, or
  t₂ ∈ 𝒜_L). The same condition still fails, so A(L) = L.

_Proof._ f(s) = join(A(T(s))). A(T(s)) is a suffix of T(s), so by Lemma 1 T(f(s)) = A(T(s)). Then
f(f(s)) = join(A(T(f(s)))) = join(A(A(T(s)))) = join(A(T(s))) = f(s) by Lemma 2. ∎

The same argument shows that every token of a normalized title is itself normalized: a single token never loses
an article. `normalizedTokens` relies on this.

**Type-level guarantee.** `normalizeTitle` returns the branded type
`Normalized = string & { readonly __brand: "Normalized" }`, and the comparison functions (`jaro`, `jaroWinkler`)
accept only that type. Passing a raw string is a compile-time error, so a comparison can never mix normalized and
raw text. The brand exists only for the type checker: at run time it is a plain string.

**Variants.** Before punctuation is removed, `titleVariants` produces the full title and, if present, the main
title before the first ":" or spaced dash: "Dune: Part Two" → {"Dune: Part Two", "Dune"}. Hyphens inside words
("Spider-Man") do not split. Linking (M1e) scores a mention against every variant.

**Jaro similarity.** For strings a and b, two characters _match_ if they are equal and at most

w = ⌊max(|a|, |b|) / 2⌋ − 1

positions apart. Let m be the number of matches and t the number of transpositions, i.e. half the number of
matched characters that appear in a different order in the two strings. Then

J = (m/|a| + m/|b| + (m − t)/m) / 3, and J = 0 if m = 0.

It averages three ratios: the share of a that matched, the share of b that matched, and the share of matches in
the right order.

Example, MARTHA vs MARHTA: w = 2, all 6 letters match, "TH" against "HT" puts 2 matched letters out of order, so
t = 1 and J = (1 + 1 + 5/6)/3 = 17/18 ≈ 0.944.

**Winkler's prefix bonus.** People make fewer mistakes at the start of a word, so a common prefix of length
ℓ ≤ 4 raises the score:

JW = J + ℓ · p · (1 − J), with p = 0.1.

The bonus takes a fraction ℓ·p of the distance left to 1, so JW never exceeds 1 as long as ℓ·p ≤ 1 (hence ℓ ≤ 4
with p = 0.1). It is applied only when J ≥ 0.7: otherwise "abcxyz" and "abcdef" (J = 2/3) would look similar just
because they start the same way. For MARTHA: ℓ = 3, JW = 17/18 + 0.3·(1/18) ≈ 0.961.

Why Jaro–Winkler for titles rather than edit distance: it is normalized to [0, 1] regardless of length, tolerant
of small typos and ASR errors, and rewards matching beginnings, which is how people shorten titles ("Dune" for
"Dune: Part Two" scores 0.86).

---

## 7. Softmax with temperature, computed safely

**Softmax** turns candidate scores s₁…s_n into probabilities:

P(i) = e^(sᵢ/T) / Σⱼ e^(sⱼ/T).

Exponentials make every value positive and preserve order; dividing by the sum makes them add up to 1. The
**temperature** T controls how decisive the distribution is. Two candidates with a score gap Δ have probability
ratio e^(Δ/T): T → 0 gives all the mass to the best one, T → ∞ makes them equally likely. In linking, T is fitted
on the dev set so that the probabilities are calibrated (§4).

**Numerical safety (log-sum-exp).** e^1000 overflows a double. Softmax does not change if the same constant c is
subtracted from every score, because e^(sᵢ − c) / Σⱼ e^(sⱼ − c) = e^(−c)·e^(sᵢ) / (e^(−c)·Σⱼ e^(sⱼ)). Choosing
c = max sⱼ makes every exponent ≤ 0, so no term overflows, and the largest term equals 1, so the sum cannot
underflow to 0. In log space:

log Σⱼ e^(sⱼ) = M + log Σⱼ e^(sⱼ − M), with M = maxⱼ sⱼ,

and P(i) = e^(sᵢ − logΣexp). A score of −∞ gets probability exactly 0, which lets us mask a candidate.
