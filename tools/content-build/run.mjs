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
 * resolves outside it would open that file to the build, and a link in a
 * folder the build writes would redirect its writes elsewhere in the repo:
 * the launcher refuses to run while there is either.
 *
 * The sandbox is an extra layer, not what keeps the signing key safe: see
 * docs/architecture/content-pipeline.md#signing. Imports nothing third-party
 * but esbuild, and that only to bundle.
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, lstatSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(import.meta.dirname, '../..');

/** What the build may write, relative to the repo. */
export const WRITABLE = ['dist/content', 'content-snapshot'];

/** Where the launcher writes the bundle, outside the sandbox. */
const BUNDLE_DIR = 'tools/content-build/dist';
/** Folders written to, by the build or by the launcher: no link may be in or on the way to one. */
const OUTPUTS = [...WRITABLE, BUNDLE_DIR];

const ENTRY = 'tools/content-build/src/build-cli.ts';
const bundleOf = (repoRoot) => resolve(repoRoot, BUNDLE_DIR, 'build.mjs');
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

/**
 * Links in the folders written to (by the build, or by the launcher when it
 * bundles), or on the way to them from the repo root, relative to the repo
 * and sorted. A write through a link lands where the link points, permission
 * model or not, so any link here could redirect a write elsewhere, such as
 * onto the signing script. Output is only ever plain files and folders.
 */
export function linksInWritable(repoRoot) {
  const found = [];
  for (const folder of OUTPUTS) {
    const { link, exists } = walk(repoRoot, folder);
    if (link !== null) {
      found.push(link);
    } else if (exists) {
      const path = resolve(repoRoot, folder);
      for (const entry of readdirSync(path, { recursive: true, withFileTypes: true })) {
        if (entry.isSymbolicLink()) found.push(join(entry.parentPath, entry.name));
      }
    }
  }
  return found.map((path) => relative(repoRoot, path)).sort();
}

/**
 * Follows `folder` from the repo root one name at a time: the first link on
 * the way, and whether the whole path exists. A missing folder can still
 * have a link on the way to it, which creating it would follow.
 */
function walk(repoRoot, folder) {
  let path = resolve(repoRoot);
  for (const name of folder.split('/')) {
    path = join(path, name);
    let stat;
    try {
      stat = lstatSync(path);
    } catch (error) {
      if (error.code === 'ENOENT') return { link: null, exists: false };
      throw error;
    }
    if (stat.isSymbolicLink()) return { link: path, exists: true };
  }
  return { link: null, exists: true };
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
  const refuse = (paths, why) => {
    log(`Refusing to build: ${why}:\n${paths.map((path) => `  ${path}`).join('\n')}`);
    return 1;
  };
  const outside = linksOutside(repoRoot);
  if (outside.length > 0) {
    return refuse(outside, 'these resolve outside the repo, which would let the build read there');
  }
  const redirected = linksInWritable(repoRoot);
  if (redirected.length > 0) {
    return refuse(redirected, 'these links could redirect what the build writes; remove them');
  }

  // Created only once no link can redirect them, and before the sandbox
  // starts: creating a folder needs its parent writable.
  for (const folder of OUTPUTS) mkdirSync(resolve(repoRoot, folder), { recursive: true });

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
