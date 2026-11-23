# The math behind Citestar

Every formula used in the code is derived here, with the intuition behind it. Sections are added as the code
that uses them lands. Notation: σ(x) = 1 / (1 + e⁻ˣ) is the logistic function, log is the natural logarithm
unless written log₂.

Contents:

1. [k-anonymous lookup in the shared cache](#1-k-anonymous-lookup-in-the-shared-cache)
2. [Expected Calibration Error and its noise floor](#2-expected-calibration-error-and-its-noise-floor)
3. [Wilson interval for precision targets](#3-wilson-interval-for-precision-targets)
4. [Platt scaling with a shared slope](#4-platt-scaling-with-a-shared-slope)

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

**Strict variant (proposed).** The server knows every hash, so it can check the real minimum instead of the
expected one: start from b = ⌊log₂(M / k)⌋ and decrease b while some bucket has fewer than k entries. In the same
simulation this gives b = 13 (λ ≈ 122, smallest bucket 83). The cost is an occasional doubling of the response
size; the counting is O(M) and runs only when the cache changes. Whether to adopt it is an open decision
(see [DECISIONS.md](DECISIONS.md)).

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
precision target is checked on all mentions together (micro-average). Per work type we report the interval but
do not gate on it, until each type has enough mentions.

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
