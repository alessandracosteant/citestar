/**
 * Checks that the packages work as published, not only inside the workspace:
 * in the workspace "exports" points to the TypeScript sources, while the
 * published package.json (publishConfig) points to dist/.
 *
 * For each package: `pnpm pack`, extract the tarball into a temporary
 * node_modules, type-check tools/pack-consumer/use.ts against it with a strict
 * NodeNext configuration, and import it at run time. Run after `pnpm build`.
 *
 * CLI: node tools/check-pack.ts
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const PACKAGES = ['core'] as const;

const dir = mkdtempSync(join(tmpdir(), 'citestar-pack-'));
try {
  for (const name of PACKAGES) {
    execFileSync('pnpm', ['pack', '--pack-destination', dir], {
      cwd: join(ROOT, 'packages', name),
      stdio: 'pipe',
    });
    const tarball = readdirSync(dir).find(
      (f) => f.startsWith(`citestar-${name}-`) && f.endsWith('.tgz'),
    );
    if (tarball === undefined) throw new Error(`no tarball for @citestar/${name}`);
    const target = join(dir, 'node_modules', '@citestar', name);
    mkdirSync(target, { recursive: true });
    execFileSync('tar', ['-xzf', join(dir, tarball), '-C', target, '--strip-components=1']);
  }

  writeFileSync(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        target: 'ES2023',
        strict: true,
        noEmit: true,
        types: [],
      },
      files: ['use.ts'],
    }),
  );
  copyFileSync(join(ROOT, 'tools', 'pack-consumer', 'use.ts'), join(dir, 'use.ts'));

  const tsc = createRequire(join(ROOT, 'package.json')).resolve('typescript/bin/tsc');
  execFileSync(process.execPath, [tsc, '--project', 'tsconfig.json'], {
    cwd: dir,
    stdio: 'inherit',
  });

  for (const name of PACKAGES) {
    execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', `await import('@citestar/${name}');`],
      {
        cwd: dir,
        stdio: 'inherit',
      },
    );
  }
  console.log(`check-pack: ${PACKAGES.map((p) => `@citestar/${p}`).join(', ')} OK as published`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
