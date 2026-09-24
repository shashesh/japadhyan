import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { CONTENT_ROOT, readContentTree, SNAPSHOT_ROOT } from './files';
import { generatePractice } from './generate';
import { readSnapshot, snapshotPath, snapshotYaml, versionIssues } from './snapshot';
import { validateContent } from './validate';

describe('readContentTree', () => {
  let root: string;

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('reads every file below the root, with sorted forward-slash paths', () => {
    root = mkdtempSync(join(tmpdir(), 'content-'));
    const write = (path: string, text: string) => {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), text);
    };
    write('traditions/hindu.yaml', 'id: hindu\n');
    write('deities/hindu/shiva.yaml', 'id: shiva\n');

    expect(readContentTree(root)).toEqual([
      { path: 'deities/hindu/shiva.yaml', text: 'id: shiva\n' },
      { path: 'traditions/hindu.yaml', text: 'id: hindu\n' },
    ]);
  });

  test('a missing root is an error, not an empty catalog', () => {
    root = join(tmpdir(), 'content-that-does-not-exist');

    expect(() => readContentTree(root)).toThrow(/content-that-does-not-exist/);
  });
});

// The repo's own catalog: this is what runs content validation in `npm test`.
test('content/ is valid', () => {
  const { issues } = validateContent(readContentTree(CONTENT_ROOT));

  expect(issues).toEqual([]);
});

// Fails when content/ changed and the build wasn't run, or when the chanted
// text changed without a version bump.
test('the committed snapshot matches content/', () => {
  const RUN = 'run `npm run content:build -- --channel development` and commit content-snapshot/';
  const { catalog } = validateContent(readContentTree(CONTENT_ROOT));
  const practices = catalog.practices.map((p) => generatePractice(p).practice);
  const { snapshot, issues } = readSnapshot(SNAPSHOT_ROOT);

  expect(issues, 'content-snapshot/ has broken files').toEqual([]);
  expect(versionIssues(practices, snapshot), 'the version rules').toEqual([]);
  for (const practice of practices) {
    const file = join(SNAPSHOT_ROOT, snapshotPath(practice));
    const committed = existsSync(file) ? readFileSync(file, 'utf8') : null;

    expect(committed, `content-snapshot/${snapshotPath(practice)} is out of date: ${RUN}`).toBe(
      snapshotYaml(practice),
    );
  }
});
