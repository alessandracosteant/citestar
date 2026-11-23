import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { CORE_VERSION } from '@citestar/core';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');

describe('repository consistency', () => {
  it('CORE_VERSION matches the version in packages/core/package.json', async () => {
    const pkg = JSON.parse(await readFile(resolve(ROOT, 'packages/core/package.json'), 'utf8')) as {
      version: string;
    };
    expect(CORE_VERSION).toBe(pkg.version);
  });
});
