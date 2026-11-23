/**
 * Guards for packages that must run on any platform (browser, worker, server).
 *
 * Three layers, because each one alone has a hole:
 * 1. tsconfig `lib`/`types` (no DOM, no Node): a dependency's `.d.ts` with
 *    `/// <reference types="node" />` can bring Node globals back.
 * 2. Neutral esbuild build (tested here): catches imports of Node built-ins,
 *    but not the use of globals such as `process`.
 * 3. ESLint `no-restricted-globals` on the pure packages: catches the globals.
 */
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { neutralBuild } from './neutral-build.ts';

const ROOT = resolve(import.meta.dirname, '..');

/** Pure packages and the runtime dependencies each one is allowed to have. */
const PURE_PACKAGES: Record<string, readonly string[]> = {
  core: [],
};

interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

async function readPackageJson(dir: string): Promise<PackageJson> {
  return JSON.parse(
    await readFile(resolve(ROOT, 'packages', dir, 'package.json'), 'utf8'),
  ) as PackageJson;
}

describe('neutral build', () => {
  it('rejects imports of Node built-in modules', async () => {
    for (const specifier of ['node:fs', 'path', 'node:crypto']) {
      await expect(
        neutralBuild({
          stdin: { contents: `import x from '${specifier}'; export default x;`, loader: 'ts' },
          write: false,
        }),
        specifier,
      ).rejects.toThrow(/Could not resolve/);
    }
  });

  it('accepts platform-independent code', async () => {
    const result = await neutralBuild({
      stdin: { contents: 'export const x: number = Math.max(1, 2);', loader: 'ts' },
      write: false,
    });
    expect(result.errors).toHaveLength(0);
  });
});

describe.each(Object.entries(PURE_PACKAGES))('pure package %s', (dir, allowlist) => {
  it('declares no runtime dependencies outside its allowlist', async () => {
    const pkg = await readPackageJson(dir);
    const declared = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ];
    expect(declared.filter((name) => !allowlist.includes(name))).toEqual([]);
  });

  it('bundles for the neutral platform using only its own sources', async () => {
    const srcDir = resolve(ROOT, 'packages', dir, 'src');
    const result = await neutralBuild({
      entryPoints: [resolve(srcDir, 'index.ts')],
      absWorkingDir: ROOT,
      write: false,
      outfile: 'out.js',
    });
    const foreign = Object.keys(result.metafile.inputs).filter((input) => {
      const rel = relative(srcDir, resolve(ROOT, input));
      return rel.startsWith('..');
    });
    expect(foreign).toEqual([]);
  });
});
