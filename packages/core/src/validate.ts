import { SPEC_VERSION } from './model.ts';
import type { CitationTrack } from './model.ts';

export interface ValidationIssue {
  /** JSON-Pointer-like path to the offending value, e.g. "/mentions/2/workId". */
  readonly path: string;
  readonly message: string;
}

const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Same rule as npm's caret range (^): the major version must match and, while
 * the major is 0, the minor too, because semantic versioning lets 0.y releases
 * break compatibility at any minor bump. So a 0.1.0 reader accepts 0.1.x but
 * not 0.2.0, and a 1.0.0 reader accepts any 1.y.z.
 */
function isCompatible(track: RegExpExecArray, reader: RegExpExecArray | null): boolean {
  const [, major, minor] = track;
  const [, readerMajor, readerMinor] = reader ?? [];
  return major === readerMajor && (major !== '0' || minor === readerMinor);
}

/**
 * Checks the rules of a citation track that JSON Schema cannot express:
 * cross-references between works and mentions, uniqueness of ids, ordering of
 * time anchors and version compatibility. Run it after schema validation:
 * it assumes the shapes are already correct.
 *
 * @returns the list of problems found; empty when the track is valid.
 */
export function validateTrack(track: CitationTrack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const version = SEMVER.exec(track.specVersion);
  if (version === null) {
    issues.push({
      path: '/specVersion',
      message: `not a semantic version: "${track.specVersion}"`,
    });
  } else if (!isCompatible(version, SEMVER.exec(SPEC_VERSION))) {
    issues.push({
      path: '/specVersion',
      message: `version ${track.specVersion} is not compatible with ${SPEC_VERSION}`,
    });
  }

  const workIds = new Set<string>();
  track.works.forEach((work, i) => {
    if (workIds.has(work.id)) {
      issues.push({ path: `/works/${String(i)}/id`, message: `duplicate work id "${work.id}"` });
    }
    workIds.add(work.id);
  });

  const mentionIds = new Set<string>();
  const duration = track.content.durationSec;
  track.mentions.forEach((mention, i) => {
    const at = `/mentions/${String(i)}`;
    if (mentionIds.has(mention.id)) {
      issues.push({ path: `${at}/id`, message: `duplicate mention id "${mention.id}"` });
    }
    mentionIds.add(mention.id);

    if (mention.workId !== null && !workIds.has(mention.workId)) {
      issues.push({ path: `${at}/workId`, message: `unknown work "${mention.workId}"` });
    }

    if (mention.anchor.kind === 'time') {
      const { start, end } = mention.anchor;
      if (start > end) {
        issues.push({
          path: `${at}/anchor`,
          message: `start ${String(start)} is after end ${String(end)}`,
        });
      }
      if (duration !== undefined && end > duration) {
        issues.push({
          path: `${at}/anchor/end`,
          message: `end ${String(end)} is after the content duration ${String(duration)}`,
        });
      }
    }
  });

  return issues;
}
