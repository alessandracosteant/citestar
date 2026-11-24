/**
 * @citestar/core — DOM-free pipeline: extract → detect → link → score → track.
 */
export const CORE_VERSION = '0.0.0';

export { SPEC_VERSION, WORK_TYPES } from './model.ts';
export type {
  Anchor,
  CitationTrack,
  Link,
  Mention,
  TextAnchor,
  TimeAnchor,
  Work,
  WorkType,
} from './model.ts';
export { validateTrack } from './validate.ts';
export type { ValidationIssue } from './validate.ts';

export {
  normalizedTokens,
  normalizeTitle,
  normalizeTitleVariants,
  titleVariants,
} from './text/normalize.ts';
export type { Normalized } from './text/normalize.ts';
export { jaro, jaroWinkler } from './text/jaro-winkler.ts';
export type { JaroWinklerOptions } from './text/jaro-winkler.ts';

export { logSumExp, softmax } from './math/softmax.ts';
export { logit, sigmoid } from './math/logistic.ts';

export { DEFAULT_MIN_P, detectMentions } from './detect/detect.ts';
export type {
  DetectInput,
  DetectOptions,
  IdentifierCandidate,
  MentionCandidate,
  Signal,
  Span,
  TextSource,
  TitleCandidate,
} from './detect/detect.ts';
export {
  FEATURE_NAMES,
  linearScore,
  mentionProbability,
  PRIOR_WEIGHTS,
} from './detect/features.ts';
export type { DetectionWeights, FeatureName, FeatureVector } from './detect/features.ts';
export {
  findIdentifiers,
  IDENTIFIER_P,
  isbn10To13,
  isValidArxivNew,
  isValidArxivOld,
  isValidIsbn10,
  isValidIsbn13,
  isValidIssn,
  trimDoi,
} from './detect/identifiers.ts';
export type { IdentifierMatch, IdentifierScheme } from './detect/identifiers.ts';
export { isCapitalized, isSentenceInitial, tokenize } from './detect/tokens.ts';
export type { Token } from './detect/tokens.ts';

export { wilsonInterval, Z_95 } from './stats/wilson.ts';
export type { Interval } from './stats/wilson.ts';
export {
  calibrationByStratum,
  calibrationTest,
  equalMassBins,
  expectedCalibrationError,
} from './stats/ece.ts';
export type {
  CalibrationTest,
  CalibrationTestOptions,
  Prediction,
  StratifiedPrediction,
} from './stats/ece.ts';
export { bootstrapInterval, quantile } from './stats/bootstrap.ts';
export type { BootstrapOptions } from './stats/bootstrap.ts';
export { mulberry32 } from './stats/random.ts';
export type { Random } from './stats/random.ts';
