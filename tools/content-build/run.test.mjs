import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { after, afterEach, before, describe, test } from 'node:test';

import {
  BUNDLE,
  bundle,
  launch,
  linksInWritable,
  linksOutside,
  permissionFlags,
  REPO_ROOT,
  WRITABLE,
} from './run.mjs';

const flagValues = (flags, name) =>
  flags.filter((f) => f.startsWith(`${name}=`)).map((f) => f.slice(name.length + 1));

describe('permissionFlags', () => {
  const flags = permissionFlags(REPO_ROOT);

  test('the permission flags read only the repo and write only dist/content and content-snapshot', () => {
    const inRepo = (relative) => resolve(REPO_ROOT, relative);

    assert.deepEqual(flagValues(flags, '--allow-fs-read'), [REPO_ROOT]);
    assert.deepEqual(flagValues(flags, '--allow-fs-write'), [
      inRepo('dist/content'),
      inRepo('content-snapshot'),
    ]);
    assert.deepEqual(WRITABLE, ['dist/content', 'content-snapshot']);
  });

  test('no child process, worker, addon or WASI is allowed', () => {
    assert.equal(flags[0], '--permission');
    for (const flag of [
      '--allow-child-process',
      '--allow-worker',
      '--allow-addons',
      '--allow-wasi',
    ]) {
      assert.ok(!flags.some((f) => f.startsWith(flag)), flag);
    }
    assert.deepEqual(
      flags.filter((f) => !f.startsWith('--allow-fs-')),
      ['--permission'],
    );
  });
});

describe('the bundle', () => {
  let outside;

  before(async () => {
    await bundle(REPO_ROOT);
    outside = mkdtempSync(join(tmpdir(), 'outside-'));
    writeFileSync(join(outside, 'key.pem'), 'secret');
  });
  after(() => rmSync(outside, { recursive: true, force: true }));

  /** Runs `code` under the build's flags, from the repo. */
  const probe = (code) =>
    spawnSync(process.execPath, [...permissionFlags(REPO_ROOT), '-e', code], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

  test('the bundle cannot read a file outside the repo', () => {
    const file = JSON.stringify(join(outside, 'key.pem'));
    const code = `try { require('fs').readFileSync(${file}); console.log('read') } catch (e) { console.log(e.code) }`;

    assert.equal(probe(code).stdout.trim(), 'ERR_ACCESS_DENIED');
  });

  test('nor write outside dist/content and content-snapshot', () => {
    const file = JSON.stringify(join(REPO_ROOT, 'content', 'probe.yaml'));
    const code = `try { require('fs').writeFileSync(${file}, ''); console.log('wrote') } catch (e) { console.log(e.code) }`;

    assert.equal(probe(code).stdout.trim(), 'ERR_ACCESS_DENIED');
  });

  test('the launcher checks, bundles and starts the build under the flags', async () => {
    // A bad channel stops the build before it reads or writes anything.
    const code = await launch({ argv: ['--channel', 'nowhere'], log: () => {} });

    assert.equal(code, 2);
  });

  test('loads and runs under the flags', () => {
    const result = spawnSync(
      process.execPath,
      [...permissionFlags(REPO_ROOT), BUNDLE, '--channel', 'nowhere'],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );

    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /--channel must be development or production/);
  });
});

describe('symbolic links', () => {
  let repo;
  let outside;

  const link = (target, path) => {
    // A junction needs no special rights on Windows; elsewhere it is a plain link.
    symlinkSync(target, path, process.platform === 'win32' ? 'junction' : 'dir');
  };

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  const setup = () => {
    repo = mkdtempSync(join(tmpdir(), 'repo-'));
    outside = mkdtempSync(join(tmpdir(), 'outside-'));
    mkdirSync(join(repo, 'content', 'deities'), { recursive: true });
    mkdirSync(join(repo, 'node_modules', '@japadhyan'), { recursive: true });
  };

  test('a link inside the repo is fine, as npm makes for workspaces', () => {
    setup();
    link(join(repo, 'content'), join(repo, 'node_modules', '@japadhyan', 'content'));

    assert.deepEqual(linksOutside(repo), []);
  });

  test('a link anywhere in the repo that resolves outside it is reported', () => {
    setup();
    link(outside, join(repo, 'content', 'deities', 'escape'));
    link(outside, join(repo, 'node_modules', 'escape'));

    assert.deepEqual(
      linksOutside(repo),
      [join('content', 'deities', 'escape'), join('node_modules', 'escape')].sort(),
    );
  });

  test('a link that doesn’t resolve is reported', () => {
    setup();
    const gone = mkdtempSync(join(repo, 'gone-'));
    link(gone, join(repo, 'content', 'dangling'));
    rmSync(gone, { recursive: true });

    assert.deepEqual(linksOutside(repo), [join('content', 'dangling')]);
  });

  // A write through a link lands where the link points, even under the
  // permission model, so a link in a writable folder could redirect the
  // build's writes anywhere in the repo, such as to the signing script.
  test('any link in a writable folder is reported, even one inside the repo', () => {
    setup();
    mkdirSync(join(repo, 'scripts'));
    mkdirSync(join(repo, 'content-snapshot'), { recursive: true });
    link(join(repo, 'scripts'), join(repo, 'content-snapshot', 'practices'));
    mkdirSync(join(repo, 'dist', 'content', 'development'), { recursive: true });
    link(join(repo, 'content'), join(repo, 'dist', 'content', 'development', 'packs'));

    assert.deepEqual(
      linksInWritable(repo),
      [
        join('content-snapshot', 'practices'),
        join('dist', 'content', 'development', 'packs'),
      ].sort(),
    );
  });

  test('a writable folder reached through a link is reported', () => {
    setup();
    mkdirSync(join(repo, 'build-output', 'content'), { recursive: true });
    link(join(repo, 'build-output'), join(repo, 'dist'));

    assert.deepEqual(linksInWritable(repo), ['dist']);
  });

  test('a link on the way to a writable folder that doesn’t exist yet is reported', () => {
    setup();
    mkdirSync(join(repo, 'build-output'));
    link(join(repo, 'build-output'), join(repo, 'dist'));

    assert.deepEqual(linksInWritable(repo), ['dist']);
  });

  test('the bundle folder is protected like the writable ones', () => {
    setup();
    mkdirSync(join(repo, 'scripts'));
    mkdirSync(join(repo, 'tools', 'content-build'), { recursive: true });
    link(join(repo, 'scripts'), join(repo, 'tools', 'content-build', 'dist'));

    assert.deepEqual(linksInWritable(repo), [join('tools', 'content-build', 'dist')]);
  });

  test('a link inside the bundle folder is reported', () => {
    setup();
    mkdirSync(join(repo, 'tools', 'content-build', 'dist'), { recursive: true });
    link(join(repo, 'content'), join(repo, 'tools', 'content-build', 'dist', 'packs'));

    assert.deepEqual(linksInWritable(repo), [join('tools', 'content-build', 'dist', 'packs')]);
  });

  test('the launcher creates nothing through a link before refusing', async () => {
    setup();
    link(outside, join(repo, 'dist'));

    const code = await launch({ repoRoot: repo, argv: [], log: () => {} });

    assert.equal(code, 1);
    assert.deepEqual(readdirSync(outside), []);
  });

  test('plain writable folders, or none yet, are fine', () => {
    setup();
    assert.deepEqual(linksInWritable(repo), []);

    mkdirSync(join(repo, 'content-snapshot', 'practices'), { recursive: true });
    mkdirSync(join(repo, 'dist', 'content', 'development'), { recursive: true });
    assert.deepEqual(linksInWritable(repo), []);
  });

  test('the launcher refuses to run while a writable folder holds a link', async () => {
    setup();
    mkdirSync(join(repo, 'content-snapshot'), { recursive: true });
    link(join(repo, 'content'), join(repo, 'content-snapshot', 'practices'));
    const errors = [];

    const code = await launch({
      repoRoot: repo,
      argv: ['--channel', 'development'],
      log: (m) => errors.push(m),
    });

    assert.equal(code, 1);
    assert.match(errors.join('\n'), /content-snapshot[\\/]practices/);
  });

  test('the launcher refuses to run if a symbolic link in the repo resolves outside it', async () => {
    setup();
    link(outside, join(repo, 'content', 'escape'));
    const errors = [];

    const code = await launch({
      repoRoot: repo,
      argv: ['--channel', 'development'],
      log: (m) => errors.push(m),
    });

    assert.equal(code, 1);
    assert.match(errors.join('\n'), /content[\\/]escape/);
    assert.match(errors.join('\n'), /outside the repo/);
  });
});
