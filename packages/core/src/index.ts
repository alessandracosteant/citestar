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

export { normalizeTitle } from './text/normalize.ts';
export { jaro, jaroWinkler } from './text/jaro-winkler.ts';
export type { JaroWinklerOptions } from './text/jaro-winkler.ts';

export { logSumExp, softmax } from './math/softmax.ts';

export { wilsonInterval, Z_95 } from './stats/wilson.ts';
export type { Interval } from './stats/wilson.ts';
export { equalMassBins, expectedCalibrationError } from './stats/ece.ts';
export type { Prediction } from './stats/ece.ts';
export { bootstrapInterval, quantile } from './stats/bootstrap.ts';
export type { BootstrapOptions } from './stats/bootstrap.ts';
export { mulberry32 } from './stats/random.ts';
export type { Random } from './stats/random.ts';
