/**
 * The content build: validate → generate → version rules → packs → manifest,
 * then write the packs, the manifest and the reviewed snapshot. Nothing is
 * written unless every check passes. `build-cli.ts` runs it; `run.mjs` runs
 * that under Node's permission model.
 * See docs/architecture/content-pipeline.md#build.
 */

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  isReviewed,
  manifestSchema,
  packSchemas,
  type Channel,
  type Manifest,
  type Pack,
  type Practice,
} from '@japadhyan/shared';

import { canonicalJson } from './canonical';
import { readContentTree } from './files';
import { generatePractice } from './generate';
import { practicePath } from './layout';
import { manifestOf, packFiles, type PackFile } from './manifest';
import { buildPacks, type BuiltCatalog } from './packs';
import type { ContentIssue } from './parse';
import { readSnapshot, versionIssues, writeSnapshot } from './snapshot';
import { validateContent } from './validate';

export interface BuildOptions {
  channel: Channel;
  release: number;
  contentRoot: string;
  snapshotRoot: string;
  /** The channel's folder, e.g. `dist/content/development`. Emptied first. */
  outDir: string;
}

export interface BuildResult {
  /** Files are relative to the repo: `content/…` or `content-snapshot/…`. */
  issues: readonly ContentIssue[];
  /** What was written, or `null` when there were issues. */
  manifest: Manifest | null;
}

export function build(options: BuildOptions): BuildResult {
  const checked = check(options);
  if (!checked.ok) return { issues: checked.issues, manifest: null };

  const packs = buildPacks(checked.built);
  packs.forEach(assertExportable);
  const files = packFiles(packs);
  const manifest = manifestSchema.parse(
    manifestOf(files, options.channel, options.release),
  ) as Manifest;

  writeOutput(options.outDir, files, manifest);
  writeSnapshot(options.snapshotRoot, checked.built.practices);
  return { issues: [], manifest };
}

type Checked = { ok: true; built: BuiltCatalog } | { ok: false; issues: ContentIssue[] };

/** Every check, in order; the first that finds issues stops the build. */
function check({ channel, contentRoot, snapshotRoot }: BuildOptions): Checked {
  const { catalog, issues } = validateContent(readContentTree(contentRoot));
  if (issues.length > 0) return { ok: false, issues: under('content', issues) };

  const practices = catalog.practices.map((p) => generatePractice(p).practice);

  const read = readSnapshot(snapshotRoot);
  if (read.issues.length > 0) return { ok: false, issues: under('content-snapshot', read.issues) };

  const versions = versionIssues(practices, read.snapshot);
  if (versions.length > 0) return { ok: false, issues: under('content', versions) };

  if (channel === 'production') {
    const unreviewed = practices.filter((p) => !isReviewed(p)).map(unreviewedIssue);
    if (unreviewed.length > 0) return { ok: false, issues: under('content', unreviewed) };
  }
  return { ok: true, built: { catalog, practices } };
}

function unreviewedIssue(practice: Practice): ContentIssue {
  return {
    file: practicePath(practice),
    path: ['review'],
    message: `Not reviewed at version ${practice.version}: production packs carry only reviewed practices`,
  };
}

const under = (folder: string, issues: readonly ContentIssue[]) =>
  [...issues]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map((issue) => ({ ...issue, file: `${folder}/${issue.file}` }));

/** Every pack parses with the schema the app reads it with; anything else is a build bug. */
function assertExportable(pack: Pack): void {
  const result = packSchemas.any.safeParse(pack);
  if (!result.success) {
    const [issue] = result.error.issues;
    throw new Error(
      `Pack \`${pack.id}\` fails its export schema at ${issue!.path.join('.')}: ${issue!.message}`,
    );
  }
}

function writeOutput(outDir: string, files: readonly PackFile[], manifest: Manifest): void {
  rmSync(outDir, { recursive: true, force: true });
  for (const { path, bytes } of files) {
    mkdirSync(dirname(join(outDir, path)), { recursive: true });
    writeFileSync(join(outDir, path), bytes);
  }
  writeFileSync(join(outDir, 'manifest.json'), canonicalJson(manifest));
}

export type BuildArgs =
  { ok: true; channel: Channel; release: number } | { ok: false; message: string };

const USAGE = 'Usage: content:build --channel development|production [--release <number>]';

/** `--channel` and `--release`. Production needs a release; development defaults to 0. */
export function parseBuildArgs(argv: readonly string[]): BuildArgs {
  let values: { channel?: string; release?: string };
  try {
    ({ values } = parseArgs({
      args: [...argv],
      options: { channel: { type: 'string' }, release: { type: 'string' } },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    return { ok: false, message: `${(error as Error).message}\n${USAGE}` };
  }

  const { channel, release } = values;
  if (channel !== 'development' && channel !== 'production') {
    return { ok: false, message: `--channel must be development or production\n${USAGE}` };
  }
  if (release === undefined) {
    return channel === 'production'
      ? {
          ok: false,
          message: 'A production build needs --release <number>, above the last one published',
        }
      : { ok: true, channel, release: 0 };
  }
  if (!/^\d+$/.test(release) || !Number.isSafeInteger(Number(release))) {
    return {
      ok: false,
      message: `--release must be a whole number, zero or more, not "${release}"`,
    };
  }
  return { ok: true, channel, release: Number(release) };
}
