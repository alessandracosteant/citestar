/**
 * Builds a package entry point for a "neutral" platform: neither browser nor
 * Node.js. Any import of a Node built-in module (`node:fs`, `path`, ...) cannot
 * be resolved and fails the build. Used for packages that must run anywhere,
 * starting with @citestar/core.
 *
 * CLI: node tools/neutral-build.ts <entry> <outfile>
 */
import { build } from 'esbuild';
import type { BuildOptions, BuildResult } from 'esbuild';

export const NEUTRAL_BUILD_OPTIONS = {
  platform: 'neutral',
  bundle: true,
  format: 'esm',
  target: 'es2023',
  // With platform "neutral" esbuild uses no main fields by default; these let
  // allowlisted dependencies be bundled while built-ins still fail to resolve.
  mainFields: ['module', 'main'],
  metafile: true,
  logLevel: 'silent',
} as const satisfies BuildOptions;

export type NeutralBuildResult = BuildResult<{ metafile: true }>;

export async function neutralBuild(
  options: Omit<BuildOptions, keyof typeof NEUTRAL_BUILD_OPTIONS>,
): Promise<NeutralBuildResult> {
  return build({ ...options, ...NEUTRAL_BUILD_OPTIONS });
}

if (import.meta.main) {
  const [entry, outfile] = process.argv.slice(2);
  if (entry === undefined || outfile === undefined) {
    console.error('Usage: node tools/neutral-build.ts <entry> <outfile>');
    process.exit(2);
  }
  try {
    await neutralBuild({ entryPoints: [entry], outfile });
  } catch (error) {
    const errors = (error as { errors?: { text: string }[] }).errors ?? [];
    for (const e of errors) console.error(`neutral build: ${e.text}`);
    if (errors.length === 0) console.error(error);
    process.exit(1);
  }
}
