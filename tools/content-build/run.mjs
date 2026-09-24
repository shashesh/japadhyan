/**
 * `npm run content:build`: bundles the build with esbuild, then runs the
 * bundle under Node's permission model. It can read only the repo, write
 * only `dist/content/` and `content-snapshot/`, and start no child process,
 * worker, addon or WASI. `tsx` can't run under the permission model, which
 * is why the build is bundled first.
 *
 * Reads are granted on the whole repo, not just the folders the build reads:
 * in Node 24.13, granting both `content` and `content-snapshot` denies
 * listing `content` itself, as if one name being a prefix of the other
 * confused the grant.
 *
 * Node's permission model follows symbolic links, so a link in the repo that
 * resolves outside it would open that file to the build: the launcher
 * refuses to run while there is one.
 *
 * The sandbox is an extra layer, not what keeps the signing key safe: see
 * docs/architecture/content-pipeline.md#signing. Imports nothing third-party
 * but esbuild, and that only to bundle.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

/** What the build may write, relative to the repo. */
export const WRITABLE = ['dist/content', 'content-snapshot'];

const ENTRY = 'tools/content-build/src/build-cli.ts';
const bundleOf = (repoRoot) => resolve(repoRoot, 'tools/content-build/dist/build.mjs');
export const BUNDLE = bundleOf(REPO_ROOT);

/** The flags the bundle runs under. Anything not granted here is denied. */
export function permissionFlags(repoRoot) {
  return [
    '--permission',
    `--allow-fs-read=${resolve(repoRoot)}`,
    ...WRITABLE.map((folder) => `--allow-fs-write=${resolve(repoRoot, folder)}`),
  ];
}

/**
 * Links anywhere in the repo whose real path is outside it, relative to the
 * repo and sorted. A link that doesn't resolve counts: its target could
 * appear later.
 */
export function linksOutside(repoRoot) {
  const root = realpathSync.native(repoRoot);
  const escapes = (path) => {
    try {
      const rel = relative(root, realpathSync.native(path));
      return rel.startsWith('..') || isAbsolute(rel);
    } catch {
      return true;
    }
  };

  return readdirSync(repoRoot, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isSymbolicLink())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter(escapes)
    .map((path) => relative(repoRoot, path))
    .sort();
}

/** Bundles the build, with the transliterator's WebAssembly beside it. */
export async function bundle(repoRoot) {
  const { build } = await import('esbuild');
  const outfile = bundleOf(repoRoot);
  await build({
    entryPoints: [resolve(repoRoot, ENTRY)],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    // `yaml` calls `require('process')`, which an ES module doesn't have.
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'warning',
  });
  // The transliterator loads its WebAssembly from beside the importing file.
  const wasm = join(
    dirname(fileURLToPath(import.meta.resolve('@siva-sh/vidyut/wasm-url'))),
    'vidyut_bg.wasm',
  );
  copyFileSync(wasm, join(dirname(outfile), 'vidyut_bg.wasm'));
  return outfile;
}

/** Checks, bundles and runs the build. Resolves to its exit code. */
export async function launch({ repoRoot = REPO_ROOT, argv, log = console.error }) {
  // Created first, so the check sees where they really are. A folder can't
  // be created from inside the sandbox: that needs its parent writable.
  for (const folder of WRITABLE) mkdirSync(resolve(repoRoot, folder), { recursive: true });

  const outside = linksOutside(repoRoot);
  if (outside.length > 0) {
    log(
      `Refusing to build: these resolve outside the repo, which would let the build read there:\n` +
        outside.map((path) => `  ${path}`).join('\n'),
    );
    return 1;
  }

  const bundled = await bundle(repoRoot);
  const child = spawnSync(process.execPath, [...permissionFlags(repoRoot), bundled, ...argv], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (child.error) throw child.error;
  return child.status ?? 1;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await launch({ argv: process.argv.slice(2) });
}
