import { sigmoid } from '../math/logistic.ts';

/**
 * Features of a title candidate. p_m = σ(b + Σ wᵢ·fᵢ).
 *
 * Capitalization is split into interaction features (D17): what a capital
 * letter means depends on the language (Italian titles use sentence case) and
 * on the source (in ASR transcripts the model decides capitalization).
 */
export const FEATURE_NAMES = [
  'cue',
  'author',
  'afterAuthorMarker',
  'quoted',
  'italic',
  'capStart',
  'capStartIt',
  'capStartSubtitles',
  'capStartAsr',
  'titleCaseEn',
  'sentenceInitial',
  'singleWord',
  'longSpan',
  'repeated',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];
export type FeatureVector = Readonly<Record<FeatureName, number>>;

export interface DetectionWeights {
  readonly bias: number;
  readonly w: FeatureVector;
}

/**
 * Hand-written priors, in log-odds (docs/MATH.md §9 gives the reasoning for
 * each). A weight w multiplies the odds by eʷ: +2.4 ≈ ×11, −0.5 ≈ ×0.61.
 * M1f replaces them with an L2-regularized logistic regression on the gold set.
 */
export const PRIOR_WEIGHTS: DetectionWeights = {
  bias: -2.2,
  w: {
    cue: 2.4,
    author: 1.2,
    afterAuthorMarker: -2.0,
    quoted: 1.8,
    italic: 1.6,
    capStart: 0.9,
    capStartIt: -0.4,
    capStartSubtitles: -0.3,
    capStartAsr: -1.0,
    titleCaseEn: 0.8,
    sentenceInitial: -0.9,
    singleWord: -0.5,
    longSpan: -0.8,
    repeated: 0.3,
  },
};

export function emptyFeatures(): Record<FeatureName, number> {
  return Object.fromEntries(FEATURE_NAMES.map((name) => [name, 0])) as Record<FeatureName, number>;
}

/** The linear score b + Σ wᵢ·fᵢ, in log-odds. */
export function linearScore(
  features: FeatureVector,
  weights: DetectionWeights = PRIOR_WEIGHTS,
): number {
  let score = weights.bias;
  for (const name of FEATURE_NAMES) score += weights.w[name] * features[name];
  return score;
}

/** p_m = σ(b + Σ wᵢ·fᵢ). */
export function mentionProbability(
  features: FeatureVector,
  weights: DetectionWeights = PRIOR_WEIGHTS,
): number {
  return sigmoid(linearScore(features, weights));
}
