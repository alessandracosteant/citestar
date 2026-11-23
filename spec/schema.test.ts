import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { SPEC_VERSION, WORK_TYPES, validateTrack } from '@citestar/core';
import type { CitationTrack } from '@citestar/core';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { beforeAll, describe, expect, it } from 'vitest';

const SPEC_DIR = import.meta.dirname;

interface Schema {
  $id: string;
  $defs: { workType: { enum: string[] } };
}

const readJson = async (path: string): Promise<unknown> =>
  JSON.parse(await readFile(resolve(SPEC_DIR, path), 'utf8')) as unknown;

let schema: Schema;
let validate: ReturnType<Ajv2020['compile']>;

beforeAll(async () => {
  schema = (await readJson('citation-track.schema.json')) as Schema;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats.default(ajv);
  validate = ajv.compile(schema);
});

const examples = (await readdir(resolve(SPEC_DIR, 'examples'))).filter((f) => f.endsWith('.json'));

describe('citation-track.schema.json', () => {
  it('has examples to check', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples)('accepts example %s, which is also semantically valid', async (file) => {
    const track = await readJson(`examples/${file}`);
    expect(validate(track), JSON.stringify(validate.errors)).toBe(true);
    expect(validateTrack(track as CitationTrack)).toEqual([]);
  });

  it('stays in sync with the TypeScript model', () => {
    expect(schema.$defs.workType.enum).toEqual([...WORK_TYPES]);
    expect(schema.$id).toBe(`urn:citestar:citation-track:${SPEC_VERSION}`);
  });

  const minimal = {
    specVersion: '0.1.0',
    content: {},
    works: [],
    mentions: [
      {
        id: 'm1',
        surface: 'Dune',
        anchor: { kind: 'time', start: 1, end: 2 },
        workId: null,
        p: 0.5,
        source: 'auto',
      },
    ],
  };

  it('accepts a minimal track', () => {
    expect(validate(minimal), JSON.stringify(validate.errors)).toBe(true);
  });

  const mutate = (path: string[], value: unknown): unknown => {
    const copy = structuredClone(minimal) as Record<string, unknown>;
    let target: Record<string, unknown> = copy;
    for (const key of path.slice(0, -1)) target = target[key] as Record<string, unknown>;
    const last = path.at(-1) ?? '';
    if (value === undefined) Reflect.deleteProperty(target, last);
    else target[last] = value;
    return copy;
  };

  it.each([
    ['p above 1', ['mentions', '0', 'p'], 1.2],
    ['negative start', ['mentions', '0', 'anchor', 'start'], -1],
    ['unknown anchor kind', ['mentions', '0', 'anchor', 'kind'], 'page'],
    ['workId without namespace', ['mentions', '0', 'workId'], 'Q42'],
    ['unknown source', ['mentions', '0', 'source'], 'guess'],
    ['missing surface', ['mentions', '0', 'surface'], undefined],
    ['malformed hash', ['content', 'hash'], 'md5:abc'],
    ['relative content url', ['content', 'url'], 'not a url'],
    ['malformed specVersion', ['specVersion'], '1.0'],
    ['unknown top-level field', ['author'], 'me'],
  ])('rejects %s', (_name, path, value) => {
    expect(validate(mutate(path, value))).toBe(false);
  });

  it('allows extension fields prefixed with x-', () => {
    expect(validate(mutate(['x-generator'], 'citestar 0.0.0'))).toBe(true);
  });
});
