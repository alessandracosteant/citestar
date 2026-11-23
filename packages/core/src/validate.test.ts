import { describe, expect, it } from 'vitest';

import type { CitationTrack, Mention } from './model.ts';
import { validateTrack } from './validate.ts';

const mention = (overrides: Partial<Mention> = {}): Mention => ({
  id: 'm1',
  surface: 'Sapiens',
  anchor: { kind: 'time', start: 10, end: 11.5 },
  workId: 'wikidata:Q12411055',
  p: 0.93,
  source: 'auto',
  ...overrides,
});

const track = (overrides: Partial<CitationTrack> = {}): CitationTrack => ({
  specVersion: '0.1.0',
  content: { durationSec: 600 },
  works: [
    {
      id: 'wikidata:Q12411055',
      type: 'book',
      title: 'Sapiens: A Brief History of Humankind',
      authors: ['Yuval Noah Harari'],
      year: 2011,
      identifiers: { wikidata: 'Q12411055' },
      links: [],
    },
  ],
  mentions: [mention()],
  ...overrides,
});

describe('validateTrack', () => {
  it('accepts a consistent track', () => {
    expect(validateTrack(track())).toEqual([]);
  });

  it('accepts NIL mentions (workId null)', () => {
    expect(validateTrack(track({ mentions: [mention({ workId: null })] }))).toEqual([]);
  });

  it('accepts any minor or patch version of the same major', () => {
    expect(validateTrack(track({ specVersion: '0.7.3-beta.1' }))).toEqual([]);
  });

  it('rejects an unsupported major version and malformed versions', () => {
    expect(validateTrack(track({ specVersion: '1.0.0' }))[0]?.path).toBe('/specVersion');
    expect(validateTrack(track({ specVersion: 'v0.1' }))[0]?.message).toMatch(
      /not a semantic version/,
    );
  });

  it('rejects mentions that point to unknown works', () => {
    const issues = validateTrack(track({ mentions: [mention({ workId: 'wikidata:Q1' })] }));
    expect(issues).toEqual([{ path: '/mentions/0/workId', message: 'unknown work "wikidata:Q1"' }]);
  });

  it('rejects duplicate ids', () => {
    const t = track();
    const issues = validateTrack({
      ...t,
      works: [...t.works, ...t.works],
      mentions: [mention(), mention()],
    });
    expect(issues.map((i) => i.path)).toEqual(['/works/1/id', '/mentions/1/id']);
  });

  it('rejects time anchors that end before they start or after the content', () => {
    const issues = validateTrack(
      track({
        mentions: [
          mention({ id: 'a', anchor: { kind: 'time', start: 12, end: 11 } }),
          mention({ id: 'b', anchor: { kind: 'time', start: 599, end: 601 } }),
        ],
      }),
    );
    expect(issues.map((i) => i.path)).toEqual(['/mentions/0/anchor', '/mentions/1/anchor/end']);
  });

  it('does not check time ranges against an unknown duration, nor text anchors', () => {
    const issues = validateTrack(
      track({
        content: {},
        mentions: [
          mention({ id: 'a', anchor: { kind: 'time', start: 5000, end: 5001 } }),
          mention({
            id: 'b',
            anchor: { kind: 'text', exact: 'Sapiens', prefix: 'read ', suffix: ' last' },
          }),
        ],
      }),
    );
    expect(issues).toEqual([]);
  });
});
