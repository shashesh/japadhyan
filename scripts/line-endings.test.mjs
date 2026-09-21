// Prettier writes LF. On Windows, Git's default core.autocrlf=true would check files out with
// CRLF, so every file would fail `prettier --check` and the pre-commit hook would block commits.
// .gitattributes must force LF in the working tree on every platform.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = join(import.meta.dirname, '..');
const SAMPLE_FILES = [
  'README.md',
  'docs/INDEX.md',
  'package.json',
  'packages/shared/src/index.ts',
  '.githooks/pre-commit',
];

function eolOf(path) {
  const out = execFileSync('git', ['check-attr', 'eol', '--', path], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.trim().split(': ').at(-1);
}

for (const path of SAMPLE_FILES) {
  test(`${path} is checked out with LF line endings`, () => {
    assert.equal(eolOf(path), 'lf');
  });
}
