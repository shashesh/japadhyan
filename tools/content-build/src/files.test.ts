import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

import { CONTENT_ROOT, readContentTree } from './files';
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
