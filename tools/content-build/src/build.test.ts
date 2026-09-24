import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { manifestSchema, packSchemas, type IndexPack } from '@japadhyan/shared';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { stringify } from 'yaml';

import { build, parseBuildArgs, type BuildOptions } from './build';
import { readContentTree } from './files';

const hindu = {
  id: 'hindu',
  deity_label: { en: 'Deity' },
  offering_label: { en: 'Offer at the lotus feet' },
  default_round_size: 108,
  show_images_by_default: true,
};

const deity = (id: string) => ({
  id,
  tradition_id: 'hindu',
  parent_id: null,
  names: { en: { latin: id } },
  summary: {},
  image: null,
  suggested_mala: null,
  featured_practice_id: null,
  sort_order: 0,
});

const reviewedAt = (version: number) => ({
  advisor: 'Advisor',
  reviewed_on: '2026-09-24',
  version,
});

const mantra = (
  id: string,
  deityId: string,
  [devanagari, iast]: [string, string],
  extra: Record<string, unknown> = {},
) => ({
  id,
  version: 1,
  tradition_id: 'hindu',
  kind: 'mantra',
  deity_ids: [deityId],
  title: { en: id },
  subtitle: {},
  source_script: 'devanagari',
  steps: [
    {
      text: { devanagari, iast },
      words: null,
      name: null,
      meaning: null,
      audio_start_ms: null,
      audio_end_ms: null,
    },
  ],
  default_round: 108,
  repetition_word: { en: 'japa' },
  intro: {},
  audio: null,
  source: 'Traditional',
  licence: 'Public domain',
  review: reviewedAt(1),
  ...extra,
});

const SHIVA = 'practices/hindu/shiva/om-namah-shivaya.yaml';
const GANESH = 'practices/hindu/ganesh/om-gam-ganapataye.yaml';
const shivaMantra = (extra: Record<string, unknown> = {}) =>
  mantra('om-namah-shivaya', 'shiva', ['ॐ नमः शिवाय', 'oṃ namaḥ śivāya'], extra);
const ganeshMantra = (extra: Record<string, unknown> = {}) =>
  mantra('om-gam-ganapataye', 'ganesh', ['ॐ गं गणपतये नमः', 'oṃ gaṃ gaṇapataye namaḥ'], extra);

let root: string;
let options: BuildOptions;

const write = (path: string, data: unknown) => {
  const full = join(options.contentRoot, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, typeof data === 'string' ? data : stringify(data));
};

/** Every file below `dir`, as path → text. Empty when `dir` doesn't exist. */
const filesIn = (dir: string) =>
  existsSync(dir)
    ? Object.fromEntries(readContentTree(dir).map(({ path, text }) => [path, text]))
    : {};

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(join(options.outDir, path), 'utf8'));

function indexOf(): IndexPack {
  const manifest = manifestSchema.parse(readJson('manifest.json'));
  const entry = manifest.packs.find((p) => p.id === 'index')!;
  return packSchemas.index.parse(readJson(entry.path)) as IndexPack;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'build-'));
  options = {
    channel: 'development',
    release: 0,
    contentRoot: join(root, 'content'),
    snapshotRoot: join(root, 'content-snapshot'),
    outDir: join(root, 'dist'),
  };
  write('traditions/hindu.yaml', hindu);
  write('deities/hindu/shiva.yaml', deity('shiva'));
  write('deities/hindu/ganesh.yaml', deity('ganesh'));
  write(SHIVA, shivaMantra());
  write(GANESH, ganeshMantra());
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('build', () => {
  test('writes the manifest, every pack it lists, and the snapshot', () => {
    const { issues } = build(options);

    expect(issues).toEqual([]);
    const manifest = manifestSchema.parse(readJson('manifest.json'));
    const written = Object.keys(filesIn(options.outDir)).sort();
    expect(written).toEqual(['manifest.json', ...manifest.packs.map((p) => p.path)].sort());
    for (const entry of manifest.packs) {
      expect(packSchemas.any.safeParse(readJson(entry.path)).success, entry.id).toBe(true);
    }
    expect(Object.keys(filesIn(options.snapshotRoot)).sort()).toEqual([
      'practices/om-gam-ganapataye.yaml',
      'practices/om-namah-shivaya.yaml',
    ]);
  });

  test('building twice writes identical files', () => {
    build(options);
    const first = { out: filesIn(options.outDir), snapshot: filesIn(options.snapshotRoot) };
    build(options);

    expect({ out: filesIn(options.outDir), snapshot: filesIn(options.snapshotRoot) }).toEqual(
      first,
    );
  });

  test('a production build with an unreviewed practice writes nothing and lists every one', () => {
    write(SHIVA, shivaMantra({ review: null }));
    write(GANESH, ganeshMantra({ review: null }));

    const { issues } = build({ ...options, channel: 'production', release: 1 });

    expect(issues).toEqual([
      {
        file: `content/${GANESH}`,
        path: ['review'],
        message: 'Not reviewed at version 1: production packs carry only reviewed practices',
      },
      {
        file: `content/${SHIVA}`,
        path: ['review'],
        message: 'Not reviewed at version 1: production packs carry only reviewed practices',
      },
    ]);
    expect(filesIn(options.outDir)).toEqual({});
    expect(filesIn(options.snapshotRoot)).toEqual({});
  });

  test('a production build of reviewed content writes a production manifest at its release', () => {
    const { issues } = build({ ...options, channel: 'production', release: 12 });

    expect(issues).toEqual([]);
    expect(readJson('manifest.json')).toMatchObject({ channel: 'production', release: 12 });
  });

  test('a development build includes unreviewed practices, marked reviewed: false', () => {
    write(GANESH, ganeshMantra({ review: null }));

    expect(build(options).issues).toEqual([]);
    expect(indexOf().practices.map((p) => [p.id, p.reviewed])).toEqual([
      ['om-gam-ganapataye', false],
      ['om-namah-shivaya', true],
    ]);
  });

  test('a practice reviewed at an earlier version counts as unreviewed', () => {
    write(GANESH, ganeshMantra({ version: 2, review: reviewedAt(1) }));

    expect(build({ ...options, channel: 'production', release: 1 }).issues).toEqual([
      {
        file: `content/${GANESH}`,
        path: ['review'],
        message: 'Not reviewed at version 2: production packs carry only reviewed practices',
      },
    ]);
    expect(build(options).issues).toEqual([]);
    expect(indexOf().practices.find((p) => p.id === 'om-gam-ganapataye')!.reviewed).toBe(false);
  });

  test('a build with content issues writes no snapshot and no packs', () => {
    write(GANESH, ganeshMantra({ title: { hi: 'ॐ गं गणपतये नमः' } }));

    const { issues } = build(options);

    expect(issues.map((i) => [i.file, i.message])).toEqual([
      [`content/${GANESH}`, 'Needs `en`: base packs are English'],
    ]);
    expect(filesIn(options.outDir)).toEqual({});
    expect(filesIn(options.snapshotRoot)).toEqual({});
  });

  test('a build with version issues writes no snapshot and no packs', () => {
    expect(build(options).issues).toEqual([]);
    const snapshot = filesIn(options.snapshotRoot);
    rmSync(options.outDir, { recursive: true });
    write(
      SHIVA,
      shivaMantra({
        steps: [{ ...shivaMantra().steps[0]!, text: { devanagari: 'ॐ शिवाय', iast: 'oṃ śivāya' } }],
      }),
    );

    const { issues } = build(options);

    expect(issues).toEqual([
      {
        file: `content/${SHIVA}`,
        path: ['version'],
        message: 'The chanted text differs from the snapshot of version 1: make it version 2',
      },
    ]);
    expect(filesIn(options.outDir)).toEqual({});
    expect(filesIn(options.snapshotRoot)).toEqual(snapshot);
  });

  test('a broken snapshot file is an issue under content-snapshot/', () => {
    mkdirSync(join(options.snapshotRoot, 'practices'), { recursive: true });
    writeFileSync(join(options.snapshotRoot, 'practices/om-namah-shivaya.yaml'), 'id: x\n');

    const { issues } = build(options);

    expect(issues.map((i) => i.file)).toEqual(['content-snapshot/practices/om-namah-shivaya.yaml']);
    expect(filesIn(options.outDir)).toEqual({});
  });

  test('a practice removed from content/ keeps its snapshot and is not packed', () => {
    build(options);
    rmSync(join(options.contentRoot, GANESH));

    expect(build(options).issues).toEqual([]);
    expect(Object.keys(filesIn(options.snapshotRoot))).toContain(
      'practices/om-gam-ganapataye.yaml',
    );
    expect(indexOf().practices.map((p) => p.id)).toEqual(['om-namah-shivaya']);
  });

  test('the output folder is emptied first, so no stale pack survives', () => {
    mkdirSync(join(options.outDir, 'packs'), { recursive: true });
    writeFileSync(join(options.outDir, 'packs/stale.0000000000000000.json'), '{}');
    writeFileSync(join(options.outDir, 'manifest.sig.json'), '{}');

    build(options);

    expect(Object.keys(filesIn(options.outDir))).not.toContain('packs/stale.0000000000000000.json');
    expect(Object.keys(filesIn(options.outDir))).not.toContain('manifest.sig.json');
  });
});

describe('parseBuildArgs', () => {
  test('development defaults to release 0', () => {
    expect(parseBuildArgs(['--channel', 'development'])).toEqual({
      ok: true,
      channel: 'development',
      release: 0,
    });
  });

  test('production needs --release', () => {
    expect(parseBuildArgs(['--channel', 'production'])).toEqual({
      ok: false,
      message: 'A production build needs --release <number>, above the last one published',
    });
    expect(parseBuildArgs(['--channel=production', '--release=4'])).toEqual({
      ok: true,
      channel: 'production',
      release: 4,
    });
  });

  test('the channel is required and must be known', () => {
    expect(parseBuildArgs([])).toMatchObject({
      ok: false,
      message: expect.stringMatching(/--channel/),
    });
    expect(parseBuildArgs(['--channel', 'staging'])).toMatchObject({ ok: false });
  });

  test('a release is a whole number, zero or more', () => {
    for (const release of ['-1', '1.5', 'one', '']) {
      expect(
        parseBuildArgs(['--channel', 'development', '--release', release]),
        release,
      ).toMatchObject({
        ok: false,
      });
    }
  });

  test('an unknown option is an error, not ignored', () => {
    expect(parseBuildArgs(['--channel', 'development', '--relase', '3'])).toMatchObject({
      ok: false,
    });
  });
});
