/**
 * A consumer of the published @citestar/core. tools/check-pack.ts installs the
 * packed tarball next to this file and type-checks it with a strict NodeNext
 * configuration that has none of our special compiler options.
 */
import { jaroWinkler, normalizeTitle, validateTrack } from '@citestar/core';
import type { CitationTrack, Normalized } from '@citestar/core';

const title: Normalized = normalizeTitle('Il nome della rosa', 'it');
const track: CitationTrack = { specVersion: '0.1.0', content: {}, works: [], mentions: [] };

// @ts-expect-error: raw strings are rejected by the Normalized brand.
jaroWinkler('raw', title);

export const score: number = jaroWinkler(title, normalizeTitle('Nome della rosa', 'it'));
export const issues: number = validateTrack(track).length;
