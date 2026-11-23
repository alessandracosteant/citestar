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
 * Checks the rules of a citation track that JSON Schema cannot express:
 * cross-references between works and mentions, uniqueness of ids, ordering of
 * time anchors and version compatibility. Run it after schema validation:
 * it assumes the shapes are already correct.
 *
 * @returns the list of problems found; empty when the track is valid.
 */
export function validateTrack(track: CitationTrack): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const major = SEMVER.exec(track.specVersion)?.[1];
  if (major === undefined) {
    issues.push({
      path: '/specVersion',
      message: `not a semantic version: "${track.specVersion}"`,
    });
  } else if (major !== SEMVER.exec(SPEC_VERSION)?.[1]) {
    issues.push({
      path: '/specVersion',
      message: `major version ${major} is not supported (expected ${SPEC_VERSION})`,
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
